// ─────────────────────────────────────────────────────────────────────────────
// src/services/mock/warehouseStore.js
//
// Almacén — reemplazo local de services/firestore/warehouse.js MIENTRAS no
// hay backend (ver conversación: Supabase, no Firebase, cuando se conecte).
//
// CAMBIO DE FONDO respecto a la versión anterior: ya NO existe un catálogo
// de "productos de almacén" separado del catálogo de la tienda. El almacén
// ahora guarda stock de las MISMAS variantes (talla+color, por SKU) que ya
// existen en el Catálogo — una caja de "Polo Oversize M Negro" en el
// almacén central es, literalmente, más unidades de la misma variante que
// se vende en el POS, solo que todavía no están en el piso de venta. Eso
// elimina la necesidad de mantener dos catálogos sincronizados a mano (el
// motivo original de "Mis Productos" como pestaña aparte) y de convertir
// entre "empaques" y "unidades" — acá todo se cuenta en unidades directas.
//
// Colecciones (equivalente a como se verían como tablas en Supabase):
//   warehouseLocations → ubicaciones físicas
//   warehouseStock     → { variantSku, locationId, qty }, id = `${variantSku}__${locationId}`
//   warehouseMovements → entrada | salida | traslado | envio_venta
// ─────────────────────────────────────────────────────────────────────────────
import { adjustVariantStock } from "./garmentsStore";

const LOC_PREFIX   = "invenxio_mock_wh_locations_";
const STOCK_PREFIX = "invenxio_mock_wh_stock_";
const MOV_PREFIX    = "invenxio_mock_wh_movements_";
const locListeners   = new Map();
const stockListeners = new Map();
const movListeners   = new Map();

function read(prefix, companyId, fallback = []) {
  try {
    const raw = localStorage.getItem(`${prefix}${companyId}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(prefix, companyId, data) {
  localStorage.setItem(`${prefix}${companyId}`, JSON.stringify(data));
}
function notify(map, companyId, data) {
  map.get(companyId)?.forEach(cb => cb(data));
}
function genId(p) {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Ubicaciones ──────────────────────────────────────────────────────────────
export function subscribeToLocations(companyId, onData) {
  if (!companyId) return () => {};
  if (!locListeners.has(companyId)) locListeners.set(companyId, new Set());
  locListeners.get(companyId).add(onData);
  const sorted = [...read(LOC_PREFIX, companyId, seedLocations(companyId))].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  onData(sorted);
  return () => locListeners.get(companyId)?.delete(onData);
}

export async function addLocation(companyId, data) {
  const locs = read(LOC_PREFIX, companyId);
  const loc = { id: genId("loc"), ...data, createdAt: new Date().toISOString() };
  const next = [...locs, loc];
  write(LOC_PREFIX, companyId, next);
  notify(locListeners, companyId, next);
  return loc.id;
}
export async function updateLocation(companyId, locationId, data) {
  const next = read(LOC_PREFIX, companyId).map(l => l.id === locationId ? { ...l, ...data } : l);
  write(LOC_PREFIX, companyId, next);
  notify(locListeners, companyId, next);
}
export async function deleteLocation(companyId, locationId) {
  const next = read(LOC_PREFIX, companyId).filter(l => l.id !== locationId);
  write(LOC_PREFIX, companyId, next);
  notify(locListeners, companyId, next);
  // El stock que hubiera en esa ubicación queda huérfano — mismo comportamiento
  // que tenía la versión Firestore (se advierte al usuario antes de borrar).
}

// ── Stock por variante × ubicación ────────────────────────────────────────────
export function subscribeToWarehouseStock(companyId, onData) {
  if (!companyId) return () => {};
  if (!stockListeners.has(companyId)) stockListeners.set(companyId, new Set());
  stockListeners.get(companyId).add(onData);
  onData(read(STOCK_PREFIX, companyId));
  return () => stockListeners.get(companyId)?.delete(onData);
}

/** Ajusta el stock de UNA variante en UNA ubicación (delta +/-, nunca baja de 0). */
function adjustWarehouseStock(companyId, { variantSku, garmentId, garmentName, talla, color, locationId, locationName, delta }) {
  const id = `${variantSku}__${locationId}`;
  const stock = read(STOCK_PREFIX, companyId);
  const idx = stock.findIndex(s => s.id === id);
  const current = idx >= 0 ? stock[idx].qty : 0;
  const next = Math.max(0, current + delta);
  const entry = { id, variantSku, garmentId, garmentName, talla, color, locationId, locationName, qty: next, updatedAt: new Date().toISOString() };
  const nextStock = idx >= 0 ? stock.map((s, i) => i === idx ? entry : s) : [...stock, entry];
  write(STOCK_PREFIX, companyId, nextStock);
  notify(stockListeners, companyId, nextStock);
  return next;
}

// ── Movimientos ───────────────────────────────────────────────────────────────
export function subscribeToWarehouseMovements(companyId, onData) {
  if (!companyId) return () => {};
  if (!movListeners.has(companyId)) movListeners.set(companyId, new Set());
  movListeners.get(companyId).add(onData);
  const sorted = [...read(MOV_PREFIX, companyId)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  onData(sorted);
  return () => movListeners.get(companyId)?.delete(onData);
}

function logMovement(companyId, data) {
  const movs = read(MOV_PREFIX, companyId);
  const now = new Date();
  const mov = {
    id: genId("mov"), ...data,
    date: now.toISOString().slice(0, 10),
    time: now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
    createdAt: now.toISOString(),
  };
  const next = [...movs, mov];
  write(MOV_PREFIX, companyId, next);
  notify(movListeners, companyId, [...next].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
}

/**
 * Registra un movimiento de almacén (entrada/salida/traslado) y ajusta el
 * stock de la(s) ubicación(es) afectada(s) — mismo criterio que
 * addWarehouseMovement() en services/firestore/warehouse.js.
 */
export async function addWarehouseMovement(companyId, {
  type, variantSku, garmentId, garmentName, talla, color, qty,
  fromLocationId, fromLocationName, toLocationId, toLocationName,
  reason, userName,
}) {
  if (type === "entrada" || type === "traslado") {
    adjustWarehouseStock(companyId, { variantSku, garmentId, garmentName, talla, color, locationId: toLocationId, locationName: toLocationName, delta: +qty });
  }
  if (type === "salida" || type === "traslado") {
    adjustWarehouseStock(companyId, { variantSku, garmentId, garmentName, talla, color, locationId: fromLocationId, locationName: fromLocationName, delta: -qty });
  }
  logMovement(companyId, {
    type, variantSku, garmentId, garmentName, talla, color, qty,
    fromLocationId: fromLocationId || null, fromLocationName: fromLocationName || null,
    toLocationId: toLocationId || null, toLocationName: toLocationName || null,
    reason: reason || "", userName,
  });
}

/**
 * "Enviar a Venta" — descuenta unidades de una variante en una ubicación de
 * almacén y las suma al stock VENDIBLE de esa misma variante (el que ve el
 * POS en Movimientos). Equivalente mock de sendWarehouseToInventory(), pero
 * mucho más simple: como almacén y tienda comparten la misma variante, no
 * hace falta elegir un "producto de tienda destino" ni convertir empaques a
 * unidades — es la misma prenda, el mismo SKU, moviéndose de sitio.
 */
export async function sendToSalesFloor(companyId, { variantSku, garmentId, garmentName, talla, color, locationId, locationName, qty, userName, reason }) {
  const stock = read(STOCK_PREFIX, companyId);
  const current = stock.find(s => s.id === `${variantSku}__${locationId}`)?.qty || 0;
  if (qty > current) {
    throw new Error(`Solo hay ${current} unidades de "${garmentName}" (talla ${talla}) en esa ubicación.`);
  }

  adjustWarehouseStock(companyId, { variantSku, garmentId, garmentName, talla, color, locationId, locationName, delta: -qty });
  await adjustVariantStock(companyId, garmentId, variantSku, {
    type: "add", qty, user: userName,
    action: "Recibido de Almacén",
    note: `Desde ${locationName}${reason ? " · " + reason : ""}`,
  });
  logMovement(companyId, {
    type: "envio_venta", variantSku, garmentId, garmentName, talla, color, qty,
    fromLocationId: locationId, fromLocationName: locationName,
    toLocationId: null, toLocationName: null,
    reason: reason || "", userName,
  });
}

// ── Datos de ejemplo ─────────────────────────────────────────────────────────
function seedLocations(companyId) {
  const now = new Date().toISOString();
  const demo = [
    { id: genId("loc"), name: "Almacén Central", type: "Bodega", code: "AC", description: "Depósito principal", createdAt: now },
    { id: genId("loc"), name: "Tienda Miraflores", type: "Zona", code: "TM", description: "Piso de venta", createdAt: now },
  ];
  write(LOC_PREFIX, companyId, demo);
  return demo;
}
