// src/services/supabase/transactionsStore.js
// Reemplazo real de services/mock/transactionsStore.js. El correlativo de
// comprobante (getNextInvoiceNumber) vive en companyStore.js — es una
// función de la tabla `companies`, no de `transactions`.
import { supabase, uniqueChannel } from "../../lib/supabaseClient";

export function subscribeToTransactions(companyId, onData) {
  if (!companyId) return () => {};

  async function fetchAndNotify() {
    const { data, error } = await supabase
      .from("transactions").select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) { console.error("Error cargando transacciones:", error); return; }
    onData(data.map(t => ({
      id: t.id, type: t.type, date: t.date, time: t.time,
      product: t.product, sku: t.sku, description: t.description,
      qty: t.qty, unitPrice: Number(t.unit_price) || 0, total: Number(t.total) || 0,
      client: t.client, supplier: t.supplier, note: t.note,
      createdBy: t.created_by, createdAt: t.created_at,
    })));
  }

  fetchAndNotify();
  const channel = uniqueChannel(`transactions-${companyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `company_id=eq.${companyId}` }, fetchAndNotify)
    .subscribe();
  return () => supabase.removeChannel(channel);
}