// src/components/inventory/GarmentCard.jsx
// Tarjeta de catálogo: la unidad visual central del módulo. Prioriza la foto
// (lo primero en que se fija cualquiera en una tienda de ropa) y resume la
// prenda con los colores disponibles como swatches — el mismo dato que
// gobierna las variantes, convertido en la señal visual más rápida de leer.
import { Package } from "lucide-react";
import ColorSwatch from "./ColorSwatch";
import { StatusBadge } from "../shared/StatusUI";
import { formatMoney } from "../../utils/currency";
import { getCategoryConfig } from "../../config/clothingConfig";
import { totalStock, uniqueColors, uniqueSizes } from "../../utils/variants";

export default function GarmentCard({ garment, currencySymbol, onClick }) {
  const cover = garment.images?.[0]?.url;
  const colors = uniqueColors(garment.variants);
  const sizes = uniqueSizes(garment.variants);
  const stock = totalStock(garment.variants);

  return (
    <button onClick={onClick}
      className="group text-left bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden hover:border-amber-500/50 transition-colors flex flex-col">
      <div className="aspect-[4/5] bg-slate-900 relative overflow-hidden">
        {cover ? (
          <img src={cover} alt={garment.name} loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700"><Package size={32} /></div>
        )}
        <span className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-sm text-[10px] text-slate-300 px-2 py-1 rounded-md border border-slate-700/50">
          {getCategoryConfig(garment.category).label}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-mono text-slate-500">{garment.sku}</p>
        <h3 className="text-sm font-semibold text-slate-200 group-hover:text-amber-400 transition-colors leading-snug line-clamp-2">{garment.name}</h3>
        <p className="text-sm font-bold text-white font-mono">{formatMoney(garment.price, currencySymbol)}</p>

        <div className="flex items-center gap-1 mt-0.5">
          {colors.slice(0, 5).map(c => <ColorSwatch key={c} colorId={c} size={13} />)}
          {colors.length > 5 && <span className="text-[10px] text-slate-500">+{colors.length - 5}</span>}
        </div>
        <p className="text-[10px] text-slate-500">{sizes.join(" · ")}</p>

        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-xs text-slate-400 font-mono">{stock} und</span>
          <StatusBadge status={garment.status} />
        </div>
      </div>
    </button>
  );
}
