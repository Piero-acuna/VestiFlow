// ─────────────────────────────────────────────────────────────────────────────
// src/services/supabase/warehouseStore.js
// Reemplazo real de services/mock/warehouseStore.js. Los movimientos y el
// puente "enviar a venta" corren como funciones transaccionales en Postgres
// (ver supabase/schema.sql, sección 6) — acá solo se arman los parámetros.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "../../lib/supabaseClient";

// ── Ubicaciones ──────────────────────────────────────────────────────────────
export function subscribeToLocations(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("warehouse_locations").select("*")
      .eq("company_id", companyId).order("name");
    if (error) { console.error("Error cargando ubicaciones:", error); return; }
    onData(data.map(l => ({ id: l.id, name: l.name, type: l.type, code: l.code, description: l.description, createdAt: l.created_at })));
  }

  fetchAndNotify();
  const channel = supabase
    .channel(`wh_locations-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_locations", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function addLocation(companyId, data) {
  const { error } = await supabase.from("warehouse_locations")
    .insert({ company_id: companyId, name: data.name, type: data.type, code: data.code, description: data.description });
  if (error) throw error;
}
export async function updateLocation(companyId, locationId, data) {
  const { error } = await supabase.from("warehouse_locations")
    .update({ name: data.name, type: data.type, code: data.code, description: data.description })
    .eq("id", locationId).eq("company_id", companyId);
  if (error) throw error;
}
export async function deleteLocation(companyId, locationId) {
  const { error } = await supabase.from("warehouse_locations").delete().eq("id", locationId).eq("company_id", companyId);
  if (error) throw error;
}

// ── Stock por variante × ubicación ────────────────────────────────────────────
export function subscribeToWarehouseStock(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("warehouse_stock").select("*, warehouse_locations(name)")
      .eq("company_id", companyId);
    if (error) { console.error("Error cargando stock de almacén:", error); return; }
    onData(data.map(s => ({
      id: s.id, variantSku: s.variant_sku, garmentId: s.garment_id, garmentName: s.garment_name,
      talla: s.talla, color: s.color, locationId: s.location_id,
      locationName: s.warehouse_locations?.name || "", qty: s.qty,
    })));
  }

  fetchAndNotify();
  const channel = supabase
    .channel(`wh_stock-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_stock", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Movimientos ───────────────────────────────────────────────────────────────
export function subscribeToWarehouseMovements(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("warehouse_movements").select("*")
      .eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) { console.error("Error cargando movimientos:", error); return; }
    onData(data.map(m => ({
      id: m.id, type: m.type, variantSku: m.variant_sku, garmentId: m.garment_id, garmentName: m.garment_name,
      talla: m.talla, color: m.color, qty: m.qty,
      fromLocationId: m.from_location_id, fromLocationName: m.from_location_name,
      toLocationId: m.to_location_id, toLocationName: m.to_location_name,
      reason: m.reason, userName: m.user_name, date: m.date, time: m.time, createdAt: m.created_at,
    })));
  }

  fetchAndNotify();
  const channel = supabase
    .channel(`wh_movements-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "warehouse_movements", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function addWarehouseMovement(companyId, payload) {
  const { error } = await supabase.rpc("add_warehouse_movement", {
    p_type: payload.type, p_variant_sku: payload.variantSku, p_garment_id: payload.garmentId,
    p_garment_name: payload.garmentName, p_talla: payload.talla, p_color: payload.color, p_qty: payload.qty,
    p_from_location_id: payload.fromLocationId || null, p_from_location_name: payload.fromLocationName || null,
    p_to_location_id: payload.toLocationId || null, p_to_location_name: payload.toLocationName || null,
    p_reason: payload.reason || null, p_user_name: payload.userName,
  });
  if (error) throw error;
}

export async function sendToSalesFloor(companyId, payload) {
  const { error } = await supabase.rpc("send_to_sales_floor", {
    p_variant_sku: payload.variantSku, p_garment_id: payload.garmentId, p_garment_name: payload.garmentName,
    p_talla: payload.talla, p_color: payload.color,
    p_location_id: payload.locationId, p_location_name: payload.locationName,
    p_qty: payload.qty, p_user_name: payload.userName, p_reason: payload.reason || null,
  });
  if (error) throw error;
}
