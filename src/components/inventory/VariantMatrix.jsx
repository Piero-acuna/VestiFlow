// ─────────────────────────────────────────────────────────────────────────────
// src/components/inventory/VariantMatrix.jsx
//
// El componente central del catálogo de ropa: matriz TALLA × COLOR donde cada
// celda es el stock de esa combinación exacta. Se arma en dos pasos —
// 1) elegir qué tallas y colores tiene esta prenda (chips)
// 2) llenar el stock de cada combinación resultante (grid)
// — y el SKU de cada variante se genera solo a partir del SKU base + talla +
// color, así nunca hay que escribirlo a mano ni puede quedar duplicado.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { COLOR_PALETTE, getColorConfig } from "../../config/clothingConfig";
import { buildVariantMatrix } from "../../utils/variants";
import ColorSwatch from "./ColorSwatch";

export default function VariantMatrix({ availableSizes, baseSku, initialVariants = [], onChange }) {
  const [selectedSizes, setSelectedSizes] = useState(() =>
    initialVariants.length ? [...new Set(initialVariants.map(v => v.talla))] : []
  );
  const [selectedColors, setSelectedColors] = useState(() =>
    initialVariants.length ? [...new Set(initialVariants.map(v => v.color))] : []
  );
  const [variants, setVariants] = useState(initialVariants);
  const [pickingColor, setPickingColor] = useState(false);

  // Recalcula la matriz cuando cambian las tallas/colores elegidos,
  // preservando el stock ya cargado de las combinaciones que se repiten.
  useEffect(() => {
    const next = buildVariantMatrix(selectedSizes, selectedColors, baseSku, variants);
    setVariants(next);
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSizes, selectedColors, baseSku]);

  function toggleSize(size) {
    setSelectedSizes(s => s.includes(size) ? s.filter(x => x !== size) : [...s, size]);
  }
  function addColor(colorId) {
    if (!selectedColors.includes(colorId)) setSelectedColors(c => [...c, colorId]);
    setPickingColor(false);
  }
  function removeColor(colorId) {
    setSelectedColors(c => c.filter(x => x !== colorId));
  }
  function setStock(talla, color, value) {
    const stock = Math.max(0, Number(value) || 0);
    const next = variants.map(v => (v.talla === talla && v.color === color) ? { ...v, stock } : v);
    setVariants(next);
    onChange(next);
  }

  const totalStock = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);

  return (
    <div className="space-y-4">
      {/* ── Tallas ── */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Tallas disponibles</p>
        <div className="flex flex-wrap gap-1.5">
          {availableSizes.map(size => (
            <button key={size} type="button" onClick={() => toggleSize(size)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                selectedSizes.includes(size)
                  ? "bg-amber-500 border-amber-500 text-slate-900"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}>
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* ── Colores ── */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Colores disponibles</p>
        <div className="flex flex-wrap gap-1.5 items-center">
          {selectedColors.map(colorId => {
            const c = getColorConfig(colorId);
            return (
              <span key={colorId}
                className="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300">
                <ColorSwatch colorId={colorId} size={12} />
                {c.label}
                <button type="button" onClick={() => removeColor(colorId)}
                  className="p-0.5 hover:text-red-400 text-slate-500 transition-colors">
                  <X size={11} />
                </button>
              </span>
            );
          })}
          <div className="relative">
            <button type="button" onClick={() => setPickingColor(p => !p)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-dashed border-slate-600 text-slate-400 hover:border-amber-500 hover:text-amber-400 transition-colors">
              <Plus size={12} /> Color
            </button>
            {pickingColor && (
              <div className="absolute z-20 mt-1.5 p-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl grid grid-cols-6 gap-1.5 w-56">
                {COLOR_PALETTE.filter(c => !selectedColors.includes(c.id)).map(c => (
                  <button key={c.id} type="button" onClick={() => addColor(c.id)} title={c.label}
                    className="p-1 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center">
                    <ColorSwatch colorId={c.id} size={18} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Grid de stock ── */}
      {selectedSizes.length > 0 && selectedColors.length > 0 ? (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Stock por variante</p>
          <div className="overflow-x-auto bg-slate-800/60 border border-slate-700/50 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/80">
                  <th className="text-left py-2 px-3 text-xs text-slate-400 font-medium">Color</th>
                  {selectedSizes.map(size => (
                    <th key={size} className="text-center py-2 px-2 text-xs text-slate-400 font-medium">{size}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedColors.map(colorId => (
                  <tr key={colorId} className="border-b border-slate-700/30 last:border-0">
                    <td className="py-2 px-3">
                      <span className="flex items-center gap-1.5 text-xs text-slate-300">
                        <ColorSwatch colorId={colorId} size={12} />{getColorConfig(colorId).label}
                      </span>
                    </td>
                    {selectedSizes.map(size => {
                      const v = variants.find(x => x.talla === size && x.color === colorId);
                      return (
                        <td key={size} className="py-1.5 px-2 text-center">
                          <input type="number" min="0" value={v?.stock ?? 0}
                            onChange={e => setStock(size, colorId, e.target.value)}
                            className="w-14 text-center px-1 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {variants.length} variante{variants.length !== 1 ? "s" : ""} · {totalStock} unidades en total
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-600 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-3 text-center">
          Elige al menos una talla y un color para armar las variantes.
        </p>
      )}
    </div>
  );
}
