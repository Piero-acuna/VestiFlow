// ─────────────────────────────────────────────────────────────────────────────
// src/components/inventory/GarmentDetailPanel.jsx
// Slide-over de detalle de una prenda: galería de fotos, info, tabla de
// variantes con ajuste de stock por talla/color, historial y baja.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import {
  X, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle, Loader2,
  AlertTriangle, History, Package,
} from "lucide-react";
import { adjustVariantStock, deleteGarment, subscribeToGarmentHistory } from "../../services/supabase/garmentsStore";
import { logAndGetErrorMessage } from "../../utils/errors";
import { StatusBadge } from "../shared/StatusUI";
import { BarcodeDisplay } from "../BarcodeUI";
import ColorSwatch from "./ColorSwatch";
import { formatMoney } from "../../utils/currency";
import { getCategoryConfig, getColorConfig } from "../../config/clothingConfig";
import { variantStatus, totalStock } from "../../utils/variants";

export default function GarmentDetailPanel({ garment, companyId, userName, currencySymbol, canEdit, canDelete, canViewFinance, onEdit, onClose }) {
  const [activePhoto, setActivePhoto] = useState(0);
  const [adjustingSku, setAdjustingSku] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState("add");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  const images = garment.images || [];
  const [history, setHistory] = useState([]);
  useEffect(() => {
    const unsub = subscribeToGarmentHistory(companyId, garment.id, setHistory);
    return unsub;
  }, [companyId, garment.id]);

  async function handleAdjust(variant) {
    const qty = Number(adjustQty);
    if (!qty || qty <= 0) return;
    setAdjusting(true); setAdjustError("");
    try {
      await adjustVariantStock(companyId, garment.id, variant.sku, { type: adjustType, qty, user: userName });
      setAdjustQty(""); setAdjustingSku(null);
    } catch (err) {
      setAdjustError(logAndGetErrorMessage(err, "Error al ajustar stock:"));
    }
    setAdjusting(false);
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar "${garment.name}" y todas sus variantes? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteGarment(companyId, garment.id);
      onClose();
    } catch (err) {
      alert(logAndGetErrorMessage(err, "Error al eliminar prenda:", "Hubo un error al eliminar la prenda."));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="hidden sm:block flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full sm:max-w-lg bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono text-amber-400">{garment.sku}</p>
            <h3 className="text-base sm:text-lg font-bold text-white truncate">{garment.name}</h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && (
              <button onClick={onEdit} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-amber-400 transition-colors"><Edit3 size={16} /></button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Galería */}
          {images.length > 0 ? (
            <div className="space-y-2">
              <div className="aspect-[4/5] w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-700/50">
                <img src={images[activePhoto]?.url} alt={garment.name} className="w-full h-full object-cover" />
              </div>
              {images.length > 1 && (
                <div className="flex gap-2">
                  {images.map((img, i) => (
                    <button key={img.id} onClick={() => setActivePhoto(i)}
                      className={`w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors ${i === activePhoto ? "border-amber-500" : "border-transparent opacity-60 hover:opacity-100"}`}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[4/5] w-full rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-700">
              <Package size={40} />
            </div>
          )}

          {/* Info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg">{getCategoryConfig(garment.category).label}</span>
            {garment.brand && <span className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg">{garment.brand}</span>}
            <StatusBadge status={garment.status} />
          </div>

          {garment.description && (
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">Descripción</p>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{garment.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">Stock total</p>
              <p className="font-mono font-semibold text-emerald-400">{totalStock(garment.variants)} und</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-1">Precio de venta</p>
              <p className="font-mono font-semibold text-slate-200">{formatMoney(garment.price, currencySymbol)}</p>
            </div>
            {canViewFinance && (
              <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50 col-span-2">
                <p className="text-xs text-slate-400 mb-1">Costo</p>
                <p className="font-mono font-semibold text-slate-200">{formatMoney(garment.cost, currencySymbol)}</p>
              </div>
            )}
          </div>

          {/* Variantes */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">Variantes ({garment.variants?.length || 0})</h4>
            <div className="space-y-1.5">
              {(garment.variants || []).map(v => {
                const st = variantStatus(v);
                const stColor = st === "Agotado" ? "text-red-400" : st === "Stock Bajo" ? "text-amber-400" : "text-emerald-400";
                const isAdjusting = adjustingSku === v.sku;
                return (
                  <div key={v.sku} className="bg-slate-800/60 rounded-lg border border-slate-700/50 overflow-hidden">
                    <button onClick={() => { setAdjustingSku(isAdjusting ? null : v.sku); setAdjustError(""); setAdjustQty(""); }}
                      className="w-full flex items-center justify-between p-2.5 hover:bg-slate-800 transition-colors">
                      <span className="flex items-center gap-2 text-sm text-slate-200">
                        <ColorSwatch colorId={v.color} size={12} />
                        <span className="font-semibold">{v.talla}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{getColorConfig(v.color).label}</span>
                      </span>
                      <span className={`font-mono text-sm font-bold ${stColor}`}>{v.stock} und</span>
                    </button>
                    {isAdjusting && canEdit && (
                      <div className="p-2.5 pt-0 border-t border-slate-700/50 bg-slate-900/40">
                        <p className="text-[10px] font-mono text-slate-500 mb-2">{v.sku}</p>
                        <div className="flex gap-2 mb-2">
                          {[{ t: "add", l: "Entrada", cls: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" },
                            { t: "remove", l: "Salida", cls: "bg-red-500/20 border-red-500/50 text-red-400" }].map(b => (
                            <button key={b.t} onClick={() => setAdjustType(b.t)}
                              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${adjustType === b.t ? b.cls : "border-slate-600 text-slate-400"}`}>
                              {b.l}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input type="number" min="0" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="Cantidad"
                            className="flex-1 px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
                          <button onClick={() => handleAdjust(v)} disabled={adjusting}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 font-semibold text-xs rounded-lg flex items-center gap-1">
                            {adjusting && <Loader2 size={12} className="animate-spin" />}Aplicar
                          </button>
                        </div>
                        {adjustError && <p className="text-[11px] text-red-400 mt-1.5">{adjustError}</p>}
                        <div className="mt-2 pt-2 border-t border-slate-800">
                          <BarcodeDisplay value={v.sku} height={40} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historial */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><History size={14} className="text-amber-400" />Historial</h4>
            <div className="space-y-2">
              {history.map((h, i) => {
                const isIncrease = h.type ? h.type === "add" : (h.action?.includes("Alta") || h.action?.includes("+"));
                return (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
                    <div className={`p-1.5 rounded-lg ${isIncrease ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {isIncrease ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-300">
                        {h.action}{h.qty > 0 && <span className={`font-mono font-bold ml-1 ${isIncrease ? "text-emerald-400" : "text-red-400"}`}>{isIncrease ? "+" : "-"}{h.qty}</span>}
                        {h.detail && <span className="text-slate-500"> · {h.detail}</span>}
                      </p>
                      <p className="text-xs text-slate-500">{h.date} · {h.user}</p>
                    </div>
                  </div>
                );
              })}
              {history.length === 0 && <p className="text-xs text-slate-600 text-center py-4">Sin historial</p>}
            </div>
          </div>

          {/* Zona de peligro */}
          {canDelete && (
            <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-4">
              <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2"><AlertTriangle size={14} />Zona de Peligro</h4>
              <button onClick={handleDelete}
                className="w-full text-center py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5">
                <Trash2 size={12} />Eliminar Prenda Permanentemente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
