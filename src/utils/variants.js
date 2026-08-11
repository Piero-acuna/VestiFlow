// ─────────────────────────────────────────────────────────────────────────────
// src/utils/variants.js
//
// Una PRENDA (garment) tiene un catálogo compartido (nombre, categoría, fotos,
// precio) y una lista de VARIANTES: cada combinación talla+color con su propio
// SKU y stock. Este archivo centraliza las cuentas que se repiten en catálogo,
// dashboard y punto de venta — el mismo motivo por el que existe finance.js.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SKU de una variante a partir del código base de la prenda + talla + color.
 * Ej: base "POLO-001", talla "M", color "negro" → "POLO-001-M-NEGRO"
 */
export function buildVariantSku(baseSku, talla, colorId) {
  const t = String(talla || "").toUpperCase().replace(/\s+/g, "");
  const c = String(colorId || "").toUpperCase().replace(/\s+/g, "-");
  return [baseSku, t, c].filter(Boolean).join("-");
}

/** Stock total de una prenda: suma del stock de todas sus variantes. */
export function totalStock(variants) {
  return (variants || []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

/**
 * Estado de UNA variante, igual criterio que el resto de la app:
 * "Agotado" (0) / "Stock Bajo" (≤ mínimo) / "En Stock".
 */
export function variantStatus(variant) {
  const stock = Number(variant?.stock) || 0;
  const min = Number(variant?.minStock) || 0;
  if (stock === 0) return "Agotado";
  if (stock <= min) return "Stock Bajo";
  return "En Stock";
}

/**
 * Estado AGREGADO de la prenda completa, para la tarjeta de catálogo:
 * - "Agotado" solo si TODAS las variantes están en 0.
 * - "Stock Bajo" si al menos una variante está en 0 o bajo mínimo.
 * - "En Stock" si todas las variantes están saludables.
 * Una prenda sin variantes se considera "Agotado" (no hay nada que vender).
 */
export function garmentStatus(variants) {
  if (!variants || variants.length === 0) return "Agotado";
  const statuses = variants.map(variantStatus);
  if (statuses.every(s => s === "Agotado")) return "Agotado";
  if (statuses.some(s => s === "Agotado" || s === "Stock Bajo")) return "Stock Bajo";
  return "En Stock";
}

/** Colores únicos presentes en las variantes de una prenda (para los swatches de la card). */
export function uniqueColors(variants) {
  const seen = new Set();
  return (variants || []).filter(v => {
    if (!v.color || seen.has(v.color)) return false;
    seen.add(v.color);
    return true;
  }).map(v => v.color);
}

/** Tallas únicas presentes, en el orden en que aparecen en las variantes. */
export function uniqueSizes(variants) {
  const seen = new Set();
  return (variants || []).filter(v => {
    if (!v.talla || seen.has(v.talla)) return false;
    seen.add(v.talla);
    return true;
  }).map(v => v.talla);
}

/**
 * Genera la matriz inicial de variantes (una por cada talla × color elegido)
 * para el formulario de alta de prenda. `existing` (al editar) preserva el
 * stock/SKU ya guardado de las combinaciones que se repiten.
 */
export function buildVariantMatrix(sizes, colorIds, baseSku, existing = []) {
  const matrix = [];
  sizes.forEach(talla => {
    colorIds.forEach(colorId => {
      const prev = existing.find(v => v.talla === talla && v.color === colorId);
      matrix.push(prev || {
        talla,
        color: colorId,
        sku: buildVariantSku(baseSku, talla, colorId),
        stock: 0,
        minStock: 2,
      });
    });
  });
  return matrix;
}

/**
 * Igual que flattenSellableVariants(), pero SIN filtrar por stock — se usa
 * en Almacén, donde hace falta poder elegir una variante aunque su stock
 * vendible hoy sea 0 (por ejemplo, para registrar la entrada de un envío
 * nuevo). Incluye `sellableStock` (el stock actual en el piso de venta,
 * distinto del stock de almacén) solo como referencia visual.
 */
export function flattenAllVariants(garments) {
  const items = [];
  (garments || []).forEach(g => {
    (g.variants || []).forEach(v => {
      items.push({
        id: v.sku,
        garmentId: g.id,
        variantSku: v.sku,
        name: g.name,
        sku: v.sku,
        talla: v.talla,
        color: v.color,
        price: g.price,
        sellableStock: Number(v.stock) || 0,
        image: g.images?.[0]?.url,
      });
    });
  });
  return items;
}

/**
 * Aplana el catálogo de prendas a nivel VARIANTE, para el punto de venta:
 * cada talla/color vendible es su propia tarjeta con su propio stock, en vez
 * de tener que elegir primero la prenda y luego la variante en dos pasos.
 * Solo incluye variantes con stock > 0 (no se puede vender lo que no hay).
 */
export function flattenSellableVariants(garments) {
  const items = [];
  (garments || []).forEach(g => {
    (g.variants || []).forEach(v => {
      if ((Number(v.stock) || 0) <= 0) return;
      items.push({
        id: v.sku,
        garmentId: g.id,
        variantSku: v.sku,
        name: g.name,
        sku: v.sku,
        talla: v.talla,
        color: v.color,
        price: g.price,
        stock: v.stock,
        image: g.images?.[0]?.url,
        description: g.description || "",
      });
    });
  });
  return items;
}
