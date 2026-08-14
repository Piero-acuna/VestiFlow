// src/components/suppliers/SupplierFormModal.jsx
import { X, Loader2, Save } from "lucide-react";
import { SUPPLIER_CATEGORIES } from "../../config/clothingConfig";

export default function SupplierFormModal({ show, onClose, editSupplier, form, setForm, saveError, saving, onSave }) {
  if (!show) return null;
  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-700 flex-shrink-0">
          <h3 className="font-bold text-white">{editSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nombre / Razón social *</label>
            <input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Ej: Textiles Lima SAC"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">RUC</label>
              <input value={form.ruc} onChange={e => set("ruc")(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
              <select value={form.category} onChange={e => set("category")(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                {SUPPLIER_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Contacto *</label>
            <input value={form.contact} onChange={e => set("contact")(e.target.value)} placeholder="Nombre de la persona de contacto"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Teléfono</label>
            <input value={form.phone} onChange={e => set("phone")(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Dirección</label>
            <input value={form.address} onChange={e => set("address")(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors" />
          </div>
          {editSupplier && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Estado</label>
              <select value={form.status} onChange={e => set("status")(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                <option>Activo</option><option>Inactivo</option>
              </select>
            </div>
          )}
          {saveError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{saveError}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-700 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-600 text-slate-400 rounded-xl text-sm hover:border-slate-500 transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}<Save size={14} />Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
