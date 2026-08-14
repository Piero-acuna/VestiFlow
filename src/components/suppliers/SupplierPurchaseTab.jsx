// src/components/suppliers/SupplierPurchaseTab.jsx
import { AlertTriangle, CheckCircle, Loader2, Package } from "lucide-react";
import VariantPicker from "../warehouse/VariantPicker";
import { formatMoney } from "../../utils/currency";
import { flattenAllVariants } from "../../utils/variants";

export default function SupplierPurchaseTab({
  suppliers, garments, locations, form, setForm, saving, success, error, msg, onSubmit, currencySymbol, purchases,
}) {
  const allVariants = flattenAllVariants(garments);
  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));
  const total = (Number(form.qty) || 0) * (Number(form.unitCost) || 0);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-base font-bold text-white">Registrar Compra a Proveedor</h3>

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
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Últimas compras</h3>
        <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
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
  );
}
