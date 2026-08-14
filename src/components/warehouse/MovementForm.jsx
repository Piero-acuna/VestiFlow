// ─────────────────────────────────────────────────────────────────────────────
// src/components/warehouse/MovementForm.jsx
// Pestaña "Movimiento": registra entrada, salida o traslado de una variante
// entre ubicaciones de almacén. "Enviar a Venta" vive en la pestaña
// Ubicaciones (ver LocationsTab.jsx) porque ahí ya se parte de una fila de
// stock concreta — acá se arma un movimiento desde cero.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { addWarehouseMovement } from "../../services/supabase/warehouseStore";
import { logAndGetErrorMessage } from "../../utils/errors";
import { flattenAllVariants } from "../../utils/variants";
import VariantPicker from "./VariantPicker";

const TYPES = [
  { id: "entrada",  label: "Entrada",  icon: <ArrowDownCircle size={14} />, cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" },
  { id: "salida",   label: "Salida",   icon: <ArrowUpCircle size={14} />,   cls: "border-red-500/50 bg-red-500/10 text-red-400" },
  { id: "traslado", label: "Traslado", icon: <ArrowLeftRight size={14} />,  cls: "border-sky-500/50 bg-sky-500/10 text-sky-400" },
];

export default function MovementForm({ garments, locations, stock, companyId, userName }) {
  const [type, setType] = useState("entrada");
  const [variant, setVariant] = useState(null);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const allVariants = useMemo(() => flattenAllVariants(garments), [garments]);

  const stockAtFrom = useMemo(() => {
    if (!variant || !fromLocationId) return null;
    return stock.find(s => s.variantSku === variant.variantSku && s.locationId === fromLocationId)?.qty ?? 0;
  }, [variant, fromLocationId, stock]);

  function reset() {
    setVariant(null); setFromLocationId(""); setToLocationId(""); setQty(""); setReason("");
  }

  async function handleSubmit() {
    setError("");
    const n = Number(qty);
    if (!variant) return setError("Elige una prenda / variante.");
    if (!n || n <= 0) return setError("La cantidad debe ser mayor a 0.");
    if ((type === "entrada" || type === "traslado") && !toLocationId) return setError("Elige la ubicación de destino.");
    if ((type === "salida" || type === "traslado") && !fromLocationId) return setError("Elige la ubicación de origen.");
    if (type === "traslado" && fromLocationId === toLocationId) return setError("Origen y destino no pueden ser la misma ubicación.");
    if ((type === "salida" || type === "traslado") && stockAtFrom !== null && n > stockAtFrom) {
      return setError(`Solo hay ${stockAtFrom} unidades en esa ubicación.`);
    }

    setSaving(true);
    try {
      const fromLoc = locations.find(l => l.id === fromLocationId);
      const toLoc = locations.find(l => l.id === toLocationId);
      await addWarehouseMovement(companyId, {
        type, variantSku: variant.variantSku, garmentId: variant.garmentId, garmentName: variant.name,
        talla: variant.talla, color: variant.color, qty: n,
        fromLocationId: fromLocationId || null, fromLocationName: fromLoc?.name || null,
        toLocationId: toLocationId || null, toLocationName: toLoc?.name || null,
        reason, userName,
      });
      setSuccess(true);
      reset();
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(logAndGetErrorMessage(err, "Error al registrar movimiento:"));
    }
    setSaving(false);
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex gap-2">
        {TYPES.map(t => (
          <button key={t.id} onClick={() => { setType(t.id); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${type === t.id ? t.cls : "border-slate-700 text-slate-500 hover:border-slate-600"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <VariantPicker variants={allVariants} selected={variant} onSelect={setVariant} />

      <div className="grid grid-cols-2 gap-3">
        {(type === "salida" || type === "traslado") && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Desde *</label>
            <select value={fromLocationId} onChange={e => setFromLocationId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
              <option value="">Elegir…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {stockAtFrom !== null && <p className="text-[11px] text-slate-500 mt-1">Stock ahí: {stockAtFrom} und</p>}
          </div>
        )}
        {(type === "entrada" || type === "traslado") && (
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Hacia *</label>
            <select value={toLocationId} onChange={e => setToLocationId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
              <option value="">Elegir…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div className={type === "traslado" ? "col-span-2" : ""}>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Cantidad *</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
            className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">Motivo (opcional)</label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: compra a proveedor, merma, reubicación…"
          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
      </div>

      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><AlertTriangle size={13} className="flex-shrink-0" />{error}</p>}
      {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg flex items-center gap-2"><CheckCircle size={13} className="flex-shrink-0" />Movimiento registrado.</p>}

      <button onClick={handleSubmit} disabled={saving}
        className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
        {saving && <Loader2 size={15} className="animate-spin" />}Registrar {TYPES.find(t => t.id === type)?.label}
      </button>
    </div>
  );
}
