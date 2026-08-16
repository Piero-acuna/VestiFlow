// ─────────────────────────────────────────────────────────────────────────────
// src/services/supabase/companyStore.js
//
// Primer store con Supabase DE VERDAD (no mock) — reemplaza las funciones de
// equipo/facturación/país/suscripción que antes vivían en
// services/firestore/employees.js y companies.js. Mismos nombres de función
// que usaba InventorySystem.jsx, así que solo cambian los imports, no cómo
// se llaman.
//
// Patrón de "suscripción" con Supabase Realtime: en vez de parchear el
// cambio puntual que llega por el canal (como hacía onSnapshot de
// Firestore), simplemente volvemos a pedir la lista/fila completa cada vez
// que algo cambia — para el tamaño de datos de este módulo (un puñado de
// empleados, una fila de empresa) es más simple y sigue siendo instantáneo.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase, uniqueChannel } from "../../lib/supabaseClient";
import { getCountryConfig } from "../../config/countryConfig";

// ── Equipo (profiles) ────────────────────────────────────────────────────────
export function subscribeToEmployees(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("profiles").select("*")
      .eq("company_id", companyId)
      .order("name");
    if (error) { console.error("Error cargando equipo:", error); return; }
    onData(data.map(p => ({
      uid: p.id, id: p.id, name: p.name, email: p.email,
      role: p.role, permissions: p.permissions, active: p.active,
    })));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`profiles-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function updateUserPermissions(uid, permissions) {
  const { error } = await supabase.from("profiles").update({ permissions }).eq("id", uid);
  if (error) throw error;
}

export async function setEmployeeActive(uid, active) {
  const { error } = await supabase.from("profiles").update({ active }).eq("id", uid);
  if (error) throw error;
}

// ── Empresa — facturación y país/moneda ──────────────────────────────────────
export function subscribeToCompany(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();
    if (error) { console.error("Error cargando empresa:", error); return; }
    onData(data ? {
      id: data.id, name: data.name, country: data.country,
      currencySymbol: data.currency_symbol, billing: data.billing,
    } : null);
  }

  fetchAndNotify();
  const channel = uniqueChannel(`companies-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "companies", filter: `id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function updateCompanyBilling(companyId, billing) {
  const { error } = await supabase.from("companies").update({ billing }).eq("id", companyId);
  if (error) throw error;
}

/** Cambia país → recalcula moneda/pasarela a partir de countryConfig.js, igual que la versión Firestore. */
export async function updateCompanyCountry(companyId, country) {
  const config = getCountryConfig(country);
  const { error } = await supabase.from("companies")
    .update({ country, currency_symbol: config.currencySymbol })
    .eq("id", companyId);
  if (error) throw error;
}

// ── Suscripción — SOLO lectura del lado del cliente (ver RLS en schema.sql) ──
export function subscribeToSubscription(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase.from("subscriptions").select("*").eq("company_id", companyId).maybeSingle();
    if (error) { console.error("Error cargando suscripción:", error); return; }
    onData(data ? {
      status: data.status, plan: data.plan,
      trialEndsAt: data.trial_ends_at, paidUntil: data.paid_until,
    } : null);
  }

  fetchAndNotify();
  const channel = uniqueChannel(`subscriptions-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/**
 * Correlativo de comprobante — llama a la función next_invoice_number() de
 * supabase/schema.sql, que ya sabe a qué empresa pertenece por la sesión
 * activa (no hace falta mandarle companyId; se mantiene como parámetro acá
 * solo para no cambiar la firma que ya usan los módulos que la llaman).
 */
export async function getNextInvoiceNumber(_companyId) {
  const { data, error } = await supabase.rpc("next_invoice_number");
  if (error) throw error;
  return data;
}

/** SKU automático para una prenda nueva: "001", "002"… por empresa (ver next_sku() en schema.sql). */
export async function getNextSku(_companyId) {
  const { data, error } = await supabase.rpc("next_sku");
  if (error) throw error;
  return data;
}
