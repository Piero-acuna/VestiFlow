// ─────────────────────────────────────────────────────────────────────────────
// src/components/warehouse/VariantPicker.jsx
// Buscador de variante (talla+color de una prenda) para el formulario de
// movimiento de almacén. A diferencia del buscador del POS, aquí se listan
// TODAS las variantes del catálogo (incluso con stock vendible en 0), porque
// en almacén tiene sentido registrar la entrada de una variante que todavía
// no tiene nada en el piso de venta.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Package, X } from "lucide-react";
import ColorSwatch from "../inventory/ColorSwatch";
import { getColorConfig } from "../../config/clothingConfig";

export default function VariantPicker({ variants, selected, onSelect, label = "Prenda / variante *" }) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filtered = search
    ? variants.filter(v =>
        v.name?.toLowerCase().includes(q) || v.sku?.toLowerCase().includes(q) ||
        v.talla?.toLowerCase().includes(q) || getColorConfig(v.color).label.toLowerCase().includes(q))
      .slice(0, 6)
    : [];

  return (
    <div>
      <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="relative">
        <input value={selected ? "" : search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU, talla o color…"
          disabled={!!selected}
          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors disabled:opacity-40" />

        {selected && (
          <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
            <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-700 flex-shrink-0 flex items-center justify-center">
              {selected.image ? <img src={selected.image} alt="" className="w-full h-full object-cover" /> : <Package size={13} className="text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-amber-400 font-medium truncate">{selected.name}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <ColorSwatch colorId={selected.color} size={9} />{selected.talla} · {getColorConfig(selected.color).label}
                <span className="font-mono">· {selected.sku}</span>
              </p>
            </div>
            <button onClick={() => { onSelect(null); setSearch(""); }} className="flex-shrink-0"><X size={14} className="text-slate-500 hover:text-slate-300" /></button>
          </div>
        )}

        {filtered.length > 0 && !selected && (
          <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            {filtered.map(v => (
              <button key={v.id} onClick={() => { onSelect(v); setSearch(""); }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-700 flex items-center gap-2.5 border-b border-slate-700/50 last:border-0">
                <div className="w-8 h-8 rounded-md overflow-hidden bg-slate-700 flex-shrink-0 flex items-center justify-center">
                  {v.image ? <img src={v.image} alt="" className="w-full h-full object-cover" /> : <Package size={13} className="text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200 truncate">{v.name}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5"><ColorSwatch colorId={v.color} size={9} />{v.talla} · {getColorConfig(v.color).label}</p>
                </div>
                <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">Venta: {v.sellableStock}</span>
              </button>
            ))}
          </div>
        )}
        {search && !selected && filtered.length === 0 && (
          <p className="text-[11px] text-slate-500 mt-1.5">Sin resultados. Crea la prenda primero en Inventario.</p>
        )}
      </div>
    </div>
  );
}
