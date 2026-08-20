// ─────────────────────────────────────────────────────────────────────────────
// src/components/suppliers/SupplierPurchaseTab.jsx
// Dos formas de comprar:
//   1. "Prenda conocida" — como antes: eliges la variante exacta (talla +
//      color) y entra directo a Almacén.
//   2. "Lote surtido" — para cuando compras a granel y todavía no sabes el
//      detalle (viene "surtido", hay que abrir las cajas para ver qué trajo).
//      Se registra la compra completa (cantidad + costo, ya sale en el
//      Historial) SIN tocar ninguna variante — y más abajo, la lista de
//      "Lotes pendientes de clasificar" deja ir asignando esas unidades a
//      prendas concretas a medida que las vas desempacando.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Package, PackageOpen, ChevronDown } from "lucide-react";
import { classifyBatchUnits } from "../../services/supabase/suppliersStore";
import { logAndGetErrorMessage } from "../../utils/errors";
import VariantPicker from "../warehouse/VariantPicker";
import { formatMoney } from "../../utils/currency";
import { flattenAllVariants } from "../../utils/variants";

const PAYMENT_METHODS = [{ id: "efectivo", label: "💵 Efectivo" }, { id: "transferencia", label: "🏦 Transferencia" }];

export default function SupplierPurchaseTab({
  suppliers, garments, locations, companyId, userName,
  form, setForm, saving, success, error, msg, onSubmit, currencySymbol, purchases,
  batchForm, setBatchForm, batchSaving, batchSuccess, batchError, onSubmitBatch, batches,
}) {
  const [mode, setMode] = useState("conocida"); // 'conocida' | 'surtido'
  const allVariants = flattenAllVariants(garments);
  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));
  const setB = (key) => (value) => setBatchForm(f => ({ ...f, [key]: value }));
  const total = (Number(form.qty) || 0) * (Number(form.unitCost) || 0);
  const batchTotal = (Number(batchForm.qty) || 0) * (Number(batchForm.unitCost) || 0);
  const pendingBatches = batches.filter(b => b.remainingQty > 0);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("conocida")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${mode === "conocida" ? "bg-amber-500 border-amber-500 text-slate-900" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
            <Package size={13} /> Prenda conocida
          </button>
          <button type="button" onClick={() => setMode("surtido")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${mode === "surtido" ? "bg-amber-500 border-amber-500 text-slate-900" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
            <PackageOpen size={13} /> Lote surtido
          </button>
        </div>

        {mode === "conocida" ? (
          <>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Proveedor *</label>
              <select value={form.supplierId} onChange={e => set("supplierId")(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                <option value="">Elegir…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <VariantPicker variants={allVariants} selected={form.variant} onSelect={v => set("variant")(v)} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Ubicación destino *</label>
                <select value={form.locationId} onChange={e => set("locationId")(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                  <option value="">Elegir…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Cantidad *</label>
                <input type="number" min="1" value={form.qty} onChange={e => set("qty")(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Costo unitario ({currencySymbol}) *</label>
              <input type="number" min="0" step="0.01" value={form.unitCost} onChange={e => set("unitCost")(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-sky-500/30 rounded-lg text-sm text-sky-300 font-mono focus:outline-none focus:border-sky-500 transition-colors" />
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Método de pago</label>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.id} type="button" onClick={() => set("paymentMethod")(m.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${form.paymentMethod === m.id ? "bg-amber-500 border-amber-500 text-slate-900" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Nota (opcional)</label>
              <input value={form.note} onChange={e => set("note")(e.target.value)} placeholder="N° de guía, observaciones…"
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
            </div>

            {total > 0 && (
              <div className="flex justify-between items-center px-3 py-2 bg-slate-900/60 rounded-lg border border-slate-700/50">
                <span className="text-xs text-slate-400">Total de la compra</span>
                <span className="font-mono font-bold text-sky-400">{formatMoney(total, currencySymbol)}</span>
              </div>
            )}

            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><AlertTriangle size={13} className="flex-shrink-0" />{error}</p>}
            {success && (
              <div className="space-y-1">
                <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><CheckCircle size={13} className="flex-shrink-0" />Compra registrada — el stock ya está en el almacén.</p>
                {msg && <p className="text-xs text-amber-300">{msg}</p>}
              </div>
            )}

            <button onClick={onSubmit} disabled={saving}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />}Registrar Compra
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500 -mt-1">Para cuando compras a granel y todavía no sabes qué talla, color o prenda exacta trae — regístrala así, y clasifícala de a poco más abajo a medida que la desempacas.</p>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Proveedor *</label>
              <select value={batchForm.supplierId} onChange={e => setB("supplierId")(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                <option value="">Elegir…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">¿Qué es? *</label>
              <input value={batchForm.description} onChange={e => setB("description")(e.target.value)} placeholder="Ej: Fardo de polos surtido, 3 tallas"
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Cantidad total *</label>
                <input type="number" min="1" value={batchForm.qty} onChange={e => setB("qty")(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Costo unitario ({currencySymbol}) *</label>
                <input type="number" min="0" step="0.01" value={batchForm.unitCost} onChange={e => setB("unitCost")(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-sky-500/30 rounded-lg text-sm text-sky-300 font-mono focus:outline-none focus:border-sky-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Método de pago</label>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.id} type="button" onClick={() => setB("paymentMethod")(m.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${batchForm.paymentMethod === m.id ? "bg-amber-500 border-amber-500 text-slate-900" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Nota (opcional)</label>
              <input value={batchForm.note} onChange={e => setB("note")(e.target.value)} placeholder="N° de guía, observaciones…"
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
            </div>

            {batchTotal > 0 && (
              <div className="flex justify-between items-center px-3 py-2 bg-slate-900/60 rounded-lg border border-slate-700/50">
                <span className="text-xs text-slate-400">Total del lote</span>
                <span className="font-mono font-bold text-sky-400">{formatMoney(batchTotal, currencySymbol)}</span>
              </div>
            )}

            {batchError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><AlertTriangle size={13} className="flex-shrink-0" />{batchError}</p>}
            {batchSuccess && <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><CheckCircle size={13} className="flex-shrink-0" />Lote registrado — clasifícalo abajo a medida que lo desempacas.</p>}

            <button onClick={onSubmitBatch} disabled={batchSaving}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {batchSaving && <Loader2 size={15} className="animate-spin" />}Registrar Lote
            </button>
          </>
        )}
      </div>

      <div className="space-y-5">
        {pendingBatches.length > 0 && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2"><PackageOpen size={14} className="text-amber-400" />Lotes pendientes de clasificar</h3>
            <p className="text-[11px] text-slate-500 mb-3">Asigna estas unidades a prendas concretas a medida que las vas desempacando.</p>
            <div className="space-y-2">
              {pendingBatches.map(b => (
                <BatchRow key={b.id} batch={b} garments={garments} locations={locations} companyId={companyId} userName={userName} currencySymbol={currencySymbol} />
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Últimas compras</h3>
          <div className="space-y-1.5 max-h-[24rem] overflow-y-auto">
            {purchases.length === 0 && <p className="text-xs text-slate-600 text-center py-6">Sin compras registradas todavía.</p>}
            {purchases.slice(0, 30).map(p => (
              <div key={p.id} className="flex items-center gap-2.5 p-2.5 bg-slate-900/40 rounded-lg border border-slate-700/40">
                <span className="p-1.5 bg-sky-500/15 text-sky-400 rounded-lg flex-shrink-0"><Package size={12} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate">{p.garmentName} <span className="text-slate-500">· {p.talla}</span></p>
                  <p className="text-[11px] text-slate-500">{p.supplierName} · {p.date} · {p.qty} und</p>
                </div>
                <span className="text-xs font-mono text-sky-400 flex-shrink-0">{formatMoney(p.total, currencySymbol)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchRow({ batch, garments, locations, companyId, userName, currencySymbol }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState(null);
  const [qty, setQty] = useState("");
  const [destination, setDestination] = useState("almacen");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const allVariants = flattenAllVariants(garments);

  async function handleClassify() {
    const n = Number(qty);
    setError("");
    if (!variant) return setError("Elige a qué prenda/variante va.");
    if (!n || n <= 0) return setError("Cantidad inválida.");
    if (destination === "almacen" && !locationId) return setError("Elige la ubicación de almacén.");

    setBusy(true);
    try {
      const location = locations.find(l => l.id === locationId);
      await classifyBatchUnits(companyId, {
        batchId: batch.id, variantSku: variant.variantSku, garmentId: variant.garmentId, garmentName: variant.name,
        talla: variant.talla, color: variant.color, qty: n,
        destination, locationId: destination === "almacen" ? locationId : null,
        locationName: destination === "almacen" ? (location?.name || "") : null,
        userName,
      });
      setSuccess(true);
      setVariant(null); setQty("");
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(logAndGetErrorMessage(err, "Error al clasificar:"));
    }
    setBusy(false);
  }

  const pct = Math.round(((batch.totalQty - batch.remainingQty) / batch.totalQty) * 100);

  return (
    <div className="bg-slate-900/40 rounded-lg border border-slate-700/40">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 p-2.5 text-left">
        <span className="p-1.5 bg-amber-500/15 text-amber-400 rounded-lg flex-shrink-0"><PackageOpen size={12} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 truncate">{batch.description}</p>
          <p className="text-[11px] text-slate-500">{batch.supplierName} · {batch.remainingQty} de {batch.totalQty} sin clasificar</p>
          <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden mt-1">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ChevronDown size={14} className={`text-slate-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="p-2.5 pt-0 space-y-2 border-t border-slate-700/50">
          <VariantPicker variants={allVariants} selected={variant} onSelect={setVariant} label="Asignar a…" />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="1" max={batch.remainingQty} value={qty} onChange={e => setQty(e.target.value)} placeholder={`Máx. ${batch.remainingQty}`}
              className="px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
            <select value={destination} onChange={e => setDestination(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500">
              <option value="almacen">A Almacén</option>
              <option value="venta">Directo a venta</option>
            </select>
          </div>
          {destination === "almacen" && (
            <select value={locationId} onChange={e => setLocationId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500">
              <option value="">Elegir ubicación…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          {success && <p className="text-[11px] text-emerald-400">Clasificado.</p>}
          <button onClick={handleClassify} disabled={busy}
            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5">
            {busy && <Loader2 size={11} className="animate-spin" />}Clasificar
          </button>
        </div>
      )}
    </div>
  );
}
