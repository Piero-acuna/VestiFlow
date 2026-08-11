// ─────────────────────────────────────────────────────────────────────────────
// src/services/mock/garmentsStore.js
//
// Store LOCAL del catálogo de prendas — reemplaza a companies/{id}/products
// de Firestore MIENTRAS NO está conectado Supabase todavía (ver la
// conversación: "el frontend primero, el backend después"). Vive en
// localStorage para que los datos de prueba sobrevivan un refresh de página.
//
// A PROPÓSITO expone las mismas formas que ya usa el resto de la app para
// datos de Firestore (`subscribeToX(companyId, onData) → unsubscribe`,
// funciones async para escribir) — así, cuando se conecte Supabase, este
// archivo es el ÚNICO que se reemplaza: ningún componente que lo consume
// tiene que cambiar su forma de llamarlo. Los candidatos a volverse:
//   - subscribeToGarments()  → supabase.channel(...).on('postgres_changes', …)
//   - addGarment/updateGarment/deleteGarment → supabase.from('garments')...
//   - las fotos (garment.images[].url) → Supabase Storage (ver imageFile.js)
//
// Simplificaciones intencionales de esta versión mock (no son bugs, son el
// alcance de esta etapa): el historial de movimientos vive embebido en cada
// prenda en vez de en su propia tabla, y no hay transacciones atómicas —
// ambas cosas si importan de verdad cuando esto sea multiusuario en serio,
// y se resuelven al conectar Supabase (tablas separadas + RPC transaccional,
// el equivalente a lo que products.js ya resolvía con runTransaction).
// ─────────────────────────────────────────────────────────────────────────────
import { buildVariantSku, garmentStatus } from "../../utils/variants";
import { getColorConfig } from "../../config/clothingConfig";
import { addTransaction } from "./transactionsStore";

const STORAGE_PREFIX = "invenxio_mock_garments_";
const listeners = new Map(); // companyId → Set<callback>

function storageKey(companyId) {
  return `${STORAGE_PREFIX}${companyId}`;
}

function readAll(companyId) {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return seedDemoData(companyId);
    return JSON.parse(raw);
  } catch {
    return seedDemoData(companyId);
  }
}

function writeAll(companyId, garments) {
  localStorage.setItem(storageKey(companyId), JSON.stringify(garments));
  notify(companyId, garments);
}

function notify(companyId, garments) {
  const subs = listeners.get(companyId);
  if (!subs) return;
  // Copia ordenada por nombre — igual que el orderField que usaba useCollection.
  const sorted = [...garments].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  subs.forEach(cb => cb(sorted));
}

/** companies/{id}/garments — equivalente mock de useCollection/subscribeToCollection. */
export function subscribeToGarments(companyId, onData) {
  if (!companyId) return () => {};
  if (!listeners.has(companyId)) listeners.set(companyId, new Set());
  listeners.get(companyId).add(onData);
  // Entrega inmediata del estado actual, como hace onSnapshot al suscribirse.
  onData([...readAll(companyId)].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
  return () => listeners.get(companyId)?.delete(onData);
}

function genId() {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Crea una prenda con su matriz de variantes. `data.variants` ya viene armado desde el formulario. */
export async function addGarment(companyId, data) {
  const garments = readAll(companyId);
  const id = genId();
  const now = new Date().toISOString();
  const garment = {
    id,
    ...data,
    status: garmentStatus(data.variants),
    history: [{ date: now.slice(0, 10), action: "Alta de prenda", type: "add", qty: 0, user: data.createdBy || "—", createdAt: now }],
    createdAt: now,
    updatedAt: now,
  };
  writeAll(companyId, [...garments, garment]);
  return id;
}

export async function updateGarment(companyId, garmentId, data) {
  const garments = readAll(companyId);
  const next = garments.map(g => g.id === garmentId
    ? { ...g, ...data, status: garmentStatus(data.variants ?? g.variants), updatedAt: new Date().toISOString() }
    : g);
  writeAll(companyId, next);
}

export async function deleteGarment(companyId, garmentId) {
  const garments = readAll(companyId);
  writeAll(companyId, garments.filter(g => g.id !== garmentId));
}

/**
 * Ajusta el stock de UNA variante puntual (por SKU) dentro de una prenda, y
 * registra la entrada en el historial embebido — el equivalente mock de
 * adjustProductStock() en services/firestore/products.js.
 */
export async function adjustVariantStock(companyId, garmentId, variantSku, { type, qty, user, action, note }) {
  const garments = readAll(companyId);
  const garment = garments.find(g => g.id === garmentId);
  if (!garment) throw new Error("Prenda no encontrada");

  const variants = garment.variants.map(v => {
    if (v.sku !== variantSku) return v;
    const newStock = type === "add" ? (Number(v.stock) || 0) + qty : Math.max(0, (Number(v.stock) || 0) - qty);
    return { ...v, stock: newStock };
  });

  const now = new Date().toISOString();
  const variant = variants.find(v => v.sku === variantSku);
  const history = [
    ...(garment.history || []),
    {
      date: now.slice(0, 10),
      action: action || (type === "add" ? "Ajuste +" : "Ajuste -"),
      type,
      qty,
      user,
      detail: note || `Talla ${variant?.talla} · ${variant?.color}`,
      createdAt: now,
    },
  ];

  const next = garments.map(g => g.id === garmentId
    ? { ...g, variants, status: garmentStatus(variants), history, updatedAt: now }
    : g);
  writeAll(companyId, next);
  return variant?.stock;
}

/**
 * Registra una venta (uno o más ítems del carrito, cada uno una variante
 * puntual talla+color) — equivalente mock de recordSale() en
 * services/firestore/transactions.js. Mismo criterio: SE VALIDA el stock
 * real de cada variante ANTES de escribir nada, así que una venta con un
 * ítem sin stock suficiente no descuenta a medias los demás ítems del
 * carrito. `cartItems` viene de flattenSellableVariants() (ver utils/variants.js).
 */
export async function recordGarmentSale(companyId, { cartItems, userName, clientName = "Cliente" }) {
  const garments = readAll(companyId);

  // 1. Validar todo primero.
  for (const item of cartItems) {
    const garment = garments.find(g => g.id === item.garmentId);
    if (!garment) throw new Error(`La prenda "${item.name}" ya no existe.`);
    const variant = garment.variants.find(v => v.sku === item.variantSku);
    if (!variant) throw new Error(`La variante de "${item.name}" ya no existe.`);
    if ((Number(variant.stock) || 0) < item.qty) {
      throw new Error(`Stock insuficiente para "${item.name}" (talla ${variant.talla}, ${getColorConfig(variant.color).label}): quedan ${variant.stock}, se intentó vender ${item.qty}.`);
    }
  }

  // 2. Aplicar: descontar stock de cada variante + armar las transacciones.
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const time = new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  const txPayloads = [];

  let next = garments;
  cartItems.forEach(item => {
    const colorLabel = getColorConfig(item.color).label;
    next = next.map(g => {
      if (g.id !== item.garmentId) return g;
      const variants = g.variants.map(v => v.sku === item.variantSku ? { ...v, stock: v.stock - item.qty } : v);
      const historyEntry = { date: today, action: "Venta", type: "remove", qty: item.qty, user: userName, detail: `Talla ${item.talla} · ${colorLabel}`, createdAt: now };
      return { ...g, variants, status: garmentStatus(variants), history: [...(g.history || []), historyEntry], updatedAt: now };
    });
    txPayloads.push({
      type: "venta", date: today, time,
      product: item.name, sku: item.variantSku,
      description: `Talla ${item.talla} · ${colorLabel}`,
      qty: item.qty, unitPrice: item.price, total: item.price * item.qty,
      client: clientName || "Cliente", note: "", createdBy: userName,
    });
  });

  writeAll(companyId, next);
  txPayloads.forEach(tx => addTransaction(companyId, tx));
}

// ── Datos de ejemplo ─────────────────────────────────────────────────────────
// Se generan UNA sola vez por empresa (primera vez que se lee el store) para
// que el catálogo no se vea vacío mientras se prueba el diseño nuevo. Usa
// fotos de placeholder (picsum) — reemplázalas subiendo fotos reales desde
// el formulario, o bórralas todas desde el catálogo.
function seedDemoData(companyId) {
  const now = new Date().toISOString();
  const demo = [
    {
      id: genId(), name: "Polo Oversize Algodón", sku: "POLO-001", brand: "Basics Co.",
      category: "polos_camisetas",
      description: "Polo de algodón pima 100%, corte oversize.",
      price: 79.9, cost: 32,
      images: [{ id: "i1", url: "https://picsum.photos/seed/polo1/600/700" }],
      variants: [
        { talla: "S", color: "negro", sku: buildVariantSku("POLO-001", "S", "negro"), stock: 12, minStock: 3 },
        { talla: "M", color: "negro", sku: buildVariantSku("POLO-001", "M", "negro"), stock: 4, minStock: 3 },
        { talla: "L", color: "negro", sku: buildVariantSku("POLO-001", "L", "negro"), stock: 0, minStock: 3 },
        { talla: "S", color: "blanco", sku: buildVariantSku("POLO-001", "S", "blanco"), stock: 8, minStock: 3 },
        { talla: "M", color: "blanco", sku: buildVariantSku("POLO-001", "M", "blanco"), stock: 6, minStock: 3 },
      ],
    },
    {
      id: genId(), name: "Jean Slim Fit Tiro Alto", sku: "JEAN-014", brand: "Denim Co.",
      category: "jeans",
      description: "Jean stretch, tiro alto, corte slim.",
      price: 149.9, cost: 58,
      images: [{ id: "i2", url: "https://picsum.photos/seed/jean1/600/700" }],
      variants: [
        { talla: "28", color: "denim", sku: buildVariantSku("JEAN-014", "28", "denim"), stock: 5, minStock: 2 },
        { talla: "30", color: "denim", sku: buildVariantSku("JEAN-014", "30", "denim"), stock: 9, minStock: 2 },
        { talla: "32", color: "denim", sku: buildVariantSku("JEAN-014", "32", "denim"), stock: 2, minStock: 2 },
        { talla: "34", color: "negro", sku: buildVariantSku("JEAN-014", "34", "negro"), stock: 0, minStock: 2 },
      ],
    },
    {
      id: genId(), name: "Vestido Midi Floral", sku: "VEST-022", brand: "Ana Rosa",
      category: "vestidos",
      description: "Vestido midi estampado floral, manga corta.",
      price: 189.9, cost: 75,
      images: [{ id: "i3", url: "https://picsum.photos/seed/vestido1/600/700" }],
      variants: [
        { talla: "S", color: "rosa", sku: buildVariantSku("VEST-022", "S", "rosa"), stock: 3, minStock: 2 },
        { talla: "M", color: "rosa", sku: buildVariantSku("VEST-022", "M", "rosa"), stock: 6, minStock: 2 },
        { talla: "L", color: "rosa", sku: buildVariantSku("VEST-022", "L", "rosa"), stock: 1, minStock: 2 },
      ],
    },
    {
      id: genId(), name: "Zapatilla Urbana Cuero", sku: "ZAP-009", brand: "Walker",
      category: "calzado",
      description: "Zapatilla de cuero sintético, suela antideslizante.",
      price: 219.9, cost: 95,
      images: [{ id: "i4", url: "https://picsum.photos/seed/zapatilla1/600/700" }],
      variants: [
        { talla: "38", color: "blanco", sku: buildVariantSku("ZAP-009", "38", "blanco"), stock: 4, minStock: 2 },
        { talla: "39", color: "blanco", sku: buildVariantSku("ZAP-009", "39", "blanco"), stock: 7, minStock: 2 },
        { talla: "40", color: "blanco", sku: buildVariantSku("ZAP-009", "40", "blanco"), stock: 5, minStock: 2 },
        { talla: "41", color: "negro", sku: buildVariantSku("ZAP-009", "41", "negro"), stock: 0, minStock: 2 },
      ],
    },
    {
      id: genId(), name: "Cinturón Cuero Clásico", sku: "ACC-005", brand: "Basics Co.",
      category: "accesorios",
      description: "Cinturón de cuero genuino, hebilla metálica.",
      price: 59.9, cost: 22,
      images: [{ id: "i5", url: "https://picsum.photos/seed/cinturon1/600/700" }],
      variants: [
        { talla: "Única", color: "cafe", sku: buildVariantSku("ACC-005", "Unica", "cafe"), stock: 14, minStock: 4 },
        { talla: "Única", color: "negro", sku: buildVariantSku("ACC-005", "Unica", "negro"), stock: 9, minStock: 4 },
      ],
    },
  ].map(g => ({
    ...g,
    status: garmentStatus(g.variants),
    history: [{ date: now.slice(0, 10), action: "Alta de prenda", type: "add", qty: 0, user: "Demo", createdAt: now }],
    createdAt: now, updatedAt: now,
  }));

  localStorage.setItem(storageKey(companyId), JSON.stringify(demo));
  return demo;
}

/** Borra todos los datos de ejemplo/prueba de esta empresa (empezar de cero). */
export function clearGarments(companyId) {
  writeAll(companyId, []);
}
