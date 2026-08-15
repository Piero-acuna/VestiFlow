// ─────────────────────────────────────────────────────────────────────────────
// src/services/supabase/garmentsStore.js
//
// Reemplazo real (ya no mock) de services/mock/garmentsStore.js — mismos
// nombres de función, así que useGarments.js y todos los componentes que ya
// existían no necesitaron cambiar cómo llaman a este store, solo de dónde
// se importa.
//
// La validación de stock antes de vender, el ajuste de una variante puntual,
// y el recálculo del status agregado de la prenda YA NO viven acá: corren
// en Postgres como funciones transaccionales (ver supabase/schema.sql,
// sección 6) — este archivo es una capa delgada que arma los parámetros y
// llama a `supabase.rpc(...)`.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, uniqueChannel } from "../../lib/supabaseClient";
import { garmentStatus } from "../../utils/variants";

function mapGarment(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    sku: row.sku,
    category: row.category,
    description: row.description,
    price: Number(row.price) || 0,
    cost: Number(row.cost) || 0,
    images: row.images || [],
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    variants: (row.garment_variants || []).map(v => ({
      talla: v.talla, color: v.color, sku: v.sku, stock: v.stock, minStock: v.min_stock,
    })),
  };
}

/** companies/{id}/garments — ahora garments + garment_variants con RLS. */
export function subscribeToGarments(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("garments")
      .select("*, garment_variants(*)")
      .eq("company_id", companyId)
      .order("name");
    if (error) { console.error("Error cargando catálogo:", error); return; }
    onData(data.map(mapGarment));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`garments-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "garments", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .on("postgres_changes", { event: "*", schema: "public", table: "garment_variants", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function addGarment(companyId, data) {
  const { variants, createdBy, ...fields } = data;
  const { data: inserted, error } = await supabase
    .from("garments")
    .insert({
      company_id: companyId, name: fields.name, brand: fields.brand, sku: fields.sku,
      category: fields.category, description: fields.description,
      price: fields.price, cost: fields.cost, images: fields.images,
      status: garmentStatus(variants), created_by: createdBy,
    })
    .select("id").single();
  if (error) throw error;

  if (variants?.length) {
    const { error: vErr } = await supabase.from("garment_variants").insert(
      variants.map(v => ({
        company_id: companyId, garment_id: inserted.id,
        talla: v.talla, color: v.color, sku: v.sku, stock: v.stock, min_stock: v.minStock,
      }))
    );
    if (vErr) throw vErr;
  }
  return inserted.id;
}

/**
 * Actualiza los campos de la prenda y, si vienen `variants`, sincroniza la
 * matriz completa: upsert por (company_id, sku) para las combinaciones que
 * siguen existiendo (crea las nuevas, actualiza el stock de las que ya
 * estaban) y borra las que el usuario quitó del formulario.
 */
export async function updateGarment(companyId, garmentId, data) {
  const { variants, ...fields } = data;
  const payload = { updated_at: new Date().toISOString() };
  for (const key of ["name", "brand", "sku", "category", "description", "price", "cost", "images"]) {
    if (fields[key] !== undefined) payload[key] = fields[key];
  }
  if (variants) payload.status = garmentStatus(variants);

  const { error } = await supabase.from("garments").update(payload).eq("id", garmentId).eq("company_id", companyId);
  if (error) throw error;

  if (variants) {
    const { data: existing, error: exErr } = await supabase
      .from("garment_variants").select("id, sku").eq("garment_id", garmentId);
    if (exErr) throw exErr;

    const newSkus = new Set(variants.map(v => v.sku));
    const toDelete = existing.filter(v => !newSkus.has(v.sku)).map(v => v.id);
    if (toDelete.length) {
      const { error: dErr } = await supabase.from("garment_variants").delete().in("id", toDelete);
      if (dErr) throw dErr;
    }

    const { error: upErr } = await supabase.from("garment_variants").upsert(
      variants.map(v => ({
        company_id: companyId, garment_id: garmentId,
        talla: v.talla, color: v.color, sku: v.sku, stock: v.stock, min_stock: v.minStock,
      })),
      { onConflict: "company_id,sku" }
    );
    if (upErr) throw upErr;
  }
}

export async function deleteGarment(companyId, garmentId) {
  const { error } = await supabase.from("garments").delete().eq("id", garmentId).eq("company_id", companyId);
  if (error) throw error;
}

/** Ajuste manual de stock de una variante puntual — corre en Postgres (adjust_variant_stock). */
export async function adjustVariantStock(companyId, garmentId, variantSku, { type, qty, user, action, note }) {
  const { error } = await supabase.rpc("adjust_variant_stock", {
    p_variant_sku: variantSku, p_type: type, p_qty: qty, p_user_name: user,
    p_action: action || null, p_note: note || null,
  });
  if (error) throw error;
}

/** Venta completa del carrito — transacción atómica en Postgres (record_garment_sale). */
export async function recordGarmentSale(companyId, { cartItems, userName, clientName = "Cliente" }) {
  const { error } = await supabase.rpc("record_garment_sale", {
    p_items: cartItems.map(i => ({ sku: i.variantSku || i.sku, qty: i.qty })),
    p_user_name: userName, p_client_name: clientName || "Cliente",
  });
  if (error) throw error;
}

/** Historial de una prenda — tabla propia (ya no embebido), se pide aparte al abrir el detalle. */
export function subscribeToGarmentHistory(companyId, garmentId, onData) {
  if (!companyId || !garmentId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("garment_history").select("*")
      .eq("garment_id", garmentId)
      .order("created_at", { ascending: false });
    if (error) { console.error("Error cargando historial:", error); return; }
    onData(data.map(h => ({
      date: h.created_at?.slice(0, 10), action: h.action, type: h.type,
      qty: h.qty, user: h.user_name, detail: h.detail, createdAt: h.created_at,
    })));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`garment_history-${garmentId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "garment_history", filter: `garment_id=eq.${garmentId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}