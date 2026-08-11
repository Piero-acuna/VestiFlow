// src/components/inventory/ColorSwatch.jsx
// Círculo de color reutilizado en catálogo, filtros y la matriz de variantes.
import { getColorConfig } from "../../config/clothingConfig";

export default function ColorSwatch({ colorId, size = 14, ring = false }) {
  const color = getColorConfig(colorId);
  return (
    <span
      title={color.label}
      className={`inline-block rounded-full flex-shrink-0 ${ring ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900" : ""} ${color.border ? "border border-slate-500" : ""}`}
      style={{ width: size, height: size, backgroundColor: color.hex }}
    />
  );
}
