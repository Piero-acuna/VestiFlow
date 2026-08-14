// src/components/suppliers/SupplierReturnTab.jsx
import { AlertTriangle, CheckCircle, Loader2, RotateCcw, Check, X as XIcon } from "lucide-react";
import VariantPicker from "../warehouse/VariantPicker";
import { formatMoney } from "../../utils/currency";
import { flattenAllVariants } from "../../utils/variants";

const STATUS_CLS = {
  Pendiente: "bg-amber-500/15 text-amber-400",
  Confirmado: "bg-emerald-500/15 text-emerald-400",
  Cancelado: "bg-slate-700 text-slate-400",
};

export default function SupplierReturnTab({
  suppliers, garments, locations, form, setForm, saving, success, error, onSubmit,
  currencySymbol, returns, canManage, onConfirm, onCancel,
}) {
  const allVariants = flattenAllVariants(garments);
  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));
  const total = (Number(form.qty) || 0) * (Number(form.unitPrice) || 0);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
        <h3 className="text-base font-bold text-white">Registrar Devolución a Proveedor</h3>
        <p className="text-xs text-slate-500">El stock se descuenta recién cuando confirmes que el proveedor se llevó la mercadería.</p>

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
            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Ubicación origen *</label>
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
          <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Precio unitario acordado ({currencySymbol}) *</label>
          <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => set("unitPrice")(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Motivo (opcional)</label>
          <input value={form.note} onChange={e => set("note")(e.target.value)} placeholder="Defectuoso, sobrestock de temporada…"
            className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>

        {total > 0 && (
          <div className="flex justify-between items-center px-3 py-2 bg-slate-900/60 rounded-lg border border-slate-700/50">
            <span className="text-xs text-slate-400">Total</span>
            <span className="font-mono font-bold text-slate-200">{formatMoney(total, currencySymbol)}</span>
          </div>
        )}

        {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><AlertTriangle size={13} className="flex-shrink-0" />{error}</p>}
        {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><CheckCircle size={13} className="flex-shrink-0" />Devolución registrada como pendiente.</p>}

        <button onClick={onSubmit} disabled={saving}
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
          {saving && <Loader2 size={15} className="animate-spin" />}Registrar Devolución
        </button>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Devoluciones</h3>
        <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
          {returns.length === 0 && <p className="text-xs text-slate-600 text-center py-6">Sin devoluciones registradas.</p>}
          {returns.map(r => (
            <div key={r.id} className="p-2.5 bg-slate-900/40 rounded-lg border border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 bg-slate-700 text-slate-400 rounded-lg flex-shrink-0"><RotateCcw size={12} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate">{r.garmentName} <span className="text-slate-500">· {r.talla}</span></p>
                  <p className="text-[11px] text-slate-500">{r.supplierName} · {r.date} · {r.qty} und</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CLS[r.status]}`}>{r.status}</span>
              </div>
              {canManage && r.status === "Pendiente" && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onConfirm(r)} className="flex-1 py-1.5 text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded-lg flex items-center justify-center gap-1"><Check size={11} />Confirmar</button>
                  <button onClick={() => onCancel(r)} className="flex-1 py-1.5 text-[11px] font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 rounded-lg flex items-center justify-center gap-1"><XIcon size={11} />Cancelar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
