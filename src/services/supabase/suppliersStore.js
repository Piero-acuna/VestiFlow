// ─────────────────────────────────────────────────────────────────────────────
// src/services/supabase/suppliersStore.js
// Proveedores — reemplaza a services/firestore/suppliers.js (y a las
// funciones de compra/devolución que antes vivían sueltas en
// firestoreService.js). Compras y devoluciones corren como funciones
// transaccionales en Postgres (ver supabase/schema.sql, sección 6).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, uniqueChannel } from "../../lib/supabaseClient";

// ── Proveedores ──────────────────────────────────────────────────────────────
export function subscribeToSuppliers(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase.from("suppliers").select("*").eq("company_id", companyId).order("name");
    if (error) { console.error("Error cargando proveedores:", error); return; }
    onData(data.map(s => ({
      id: s.id, name: s.name, ruc: s.ruc, category: s.category,
      contact: s.contact, phone: s.phone, address: s.address, status: s.status,
    })));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`suppliers-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function addSupplier(companyId, data) {
  const { error } = await supabase.from("suppliers").insert({
    company_id: companyId, name: data.name, ruc: data.ruc, category: data.category,
    contact: data.contact, phone: data.phone, address: data.address, status: data.status || "Activo",
  });
  if (error) throw error;
}
export async function updateSupplier(companyId, supplierId, data) {
  const { error } = await supabase.from("suppliers").update(data).eq("id", supplierId).eq("company_id", companyId);
  if (error) throw error;
}
export async function deleteSupplier(companyId, supplierId) {
  const { error } = await supabase.from("suppliers").delete().eq("id", supplierId).eq("company_id", companyId);
  if (error) throw error;
}

// ── Compras ──────────────────────────────────────────────────────────────────
export function subscribeToSupplierPurchases(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("supplier_purchases").select("*")
      .eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) { console.error("Error cargando compras a proveedor:", error); return; }
    onData(data.map(mapPurchaseOrReturn));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`supplier_purchases-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "supplier_purchases", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function recordSupplierPurchase(companyId, payload) {
  const { error } = await supabase.rpc("record_supplier_purchase", {
    p_supplier_id: payload.supplierId || null, p_supplier_name: payload.supplierName,
    p_variant_sku: payload.variantSku, p_garment_id: payload.garmentId, p_garment_name: payload.garmentName,
    p_talla: payload.talla, p_color: payload.color,
    p_location_id: payload.locationId, p_location_name: payload.locationName,
    p_qty: payload.qty, p_unit_cost: payload.unitCost, p_note: payload.note || null, p_user_name: payload.userName,
    p_payment_method: payload.paymentMethod || "efectivo",
  });
  if (error) throw error;
}

// ── Devoluciones ─────────────────────────────────────────────────────────────
export function subscribeToSupplierReturns(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("supplier_returns").select("*")
      .eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) { console.error("Error cargando devoluciones a proveedor:", error); return; }
    onData(data.map(mapPurchaseOrReturn));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`supplier_returns-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "supplier_returns", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function recordSupplierReturn(companyId, payload) {
  const { error } = await supabase.rpc("record_supplier_return", {
    p_supplier_id: payload.supplierId || null, p_supplier_name: payload.supplierName,
    p_variant_sku: payload.variantSku, p_garment_id: payload.garmentId, p_garment_name: payload.garmentName,
    p_talla: payload.talla, p_color: payload.color,
    p_location_id: payload.locationId, p_location_name: payload.locationName,
    p_qty: payload.qty, p_unit_price: payload.unitPrice, p_note: payload.note || null, p_user_name: payload.userName,
  });
  if (error) throw error;
}

export async function confirmSupplierReturn(companyId, returnId) {
  const { error } = await supabase.rpc("confirm_supplier_return", { p_return_id: returnId });
  if (error) throw error;
}

export async function cancelSupplierReturn(companyId, returnId) {
  const { error } = await supabase.rpc("cancel_supplier_return", { p_return_id: returnId });
  if (error) throw error;
}

function mapPurchaseOrReturn(row) {
  return {
    id: row.id, supplierId: row.supplier_id, supplierName: row.supplier_name,
    variantSku: row.variant_sku, garmentId: row.garment_id, garmentName: row.garment_name,
    talla: row.talla, color: row.color,
    locationId: row.location_id, locationName: row.location_name,
    qty: row.qty, unitCost: Number(row.unit_cost) || 0, unitPrice: Number(row.unit_price) || 0,
    total: Number(row.total) || 0, status: row.status, note: row.note, paymentMethod: row.payment_method,
    userName: row.user_name, date: row.date, time: row.time, createdAt: row.created_at,
  };
}
