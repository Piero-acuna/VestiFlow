// src/components/suppliers/SupplierListTab.jsx
import { Edit3, Trash2, Power, Truck } from "lucide-react";
import { Spinner, EmptyState } from "../shared/StatusUI";

export default function SupplierListTab({ suppliers, loading, canManage, canDelete, onSelect, onToggleStatus, onEdit, onDelete }) {
  if (loading) return <Spinner />;
  if (suppliers.length === 0) {
    return <EmptyState icon={<Truck size={28} />} msg="Sin proveedores todavía" sub={canManage ? "Agrega el primero con el botón de arriba" : undefined} />;
  }

  return (
    <div className="space-y-2">
      {suppliers.map(s => (
        <button key={s.id} onClick={() => onSelect(s)}
          className="w-full flex items-center gap-3 p-3.5 bg-slate-800/60 border border-slate-700/50 hover:border-amber-500/40 rounded-xl transition-colors text-left">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-lg flex-shrink-0"><Truck size={15} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">{s.name}</p>
            <p className="text-xs text-slate-500">{s.category} · {s.contact || "sin contacto"}{s.phone ? ` · ${s.phone}` : ""}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-lg flex-shrink-0 ${s.status === "Activo" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>{s.status}</span>
          {canManage && (
            <span className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => onToggleStatus(s)} title="Activar/Desactivar" className="p-1.5 hover:bg-slate-700 rounded text-slate-500 hover:text-amber-400 transition-colors"><Power size={13} /></button>
              <button onClick={() => onEdit(s)} className="p-1.5 hover:bg-slate-700 rounded text-slate-500 hover:text-amber-400 transition-colors"><Edit3 size={13} /></button>
              {canDelete && <button onClick={() => onDelete(s)} className="p-1.5 hover:bg-slate-700 rounded text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
