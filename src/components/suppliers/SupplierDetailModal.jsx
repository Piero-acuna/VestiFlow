// src/components/suppliers/SupplierDetailModal.jsx
import { X, Package, RotateCcw } from "lucide-react";
import { formatMoney } from "../../utils/currency";
import { sumTotals } from "../../utils/finance";

export default function SupplierDetailModal({ supplier, onClose, purchases, returns, currencySymbol, canViewFinance }) {
  if (!supplier) return null;
  const supplierPurchases = purchases.filter(p => p.supplierId === supplier.id);
  const supplierReturns = returns.filter(r => r.supplierId === supplier.id);
  const totalPurchased = sumTotals(supplierPurchases);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="hidden sm:block flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full sm:max-w-lg bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">{supplier.name}</h3>
            <p className="text-xs text-slate-500">{supplier.category} · {supplier.contact || "sin contacto"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {canViewFinance && (
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">Total comprado histórico</p>
              <p className="font-mono font-semibold text-sky-400 text-lg">{formatMoney(totalPurchased, currencySymbol)}</p>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Package size={14} className="text-sky-400" />Compras ({supplierPurchases.length})</h4>
            <div className="space-y-1.5">
              {supplierPurchases.length === 0 && <p className="text-xs text-slate-600 text-center py-4">Sin compras a este proveedor.</p>}
              {supplierPurchases.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/30 text-xs">
                  <span className="text-slate-300">{p.garmentName} · {p.talla} · {p.qty} und</span>
                  <span className="font-mono text-sky-400">{formatMoney(p.total, currencySymbol)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><RotateCcw size={14} className="text-slate-400" />Devoluciones ({supplierReturns.length})</h4>
            <div className="space-y-1.5">
              {supplierReturns.length === 0 && <p className="text-xs text-slate-600 text-center py-4">Sin devoluciones a este proveedor.</p>}
              {supplierReturns.map(r => (
                <div key={r.id} className="flex items-center justify-between p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/30 text-xs">
                  <span className="text-slate-300">{r.garmentName} · {r.talla} · {r.qty} und</span>
                  <span className="text-slate-500">{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
