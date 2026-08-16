// ─────────────────────────────────────────────────────────────────────────────
// src/config/clothingConfig.js
//
// Único lugar del proyecto que define el vocabulario de una tienda de ropa:
// categorías de prenda, qué tallas le corresponden a cada una, y la paleta
// de colores que se usa tanto para elegir el color de una variante como para
// pintar los swatches en el catálogo y los filtros.
//
// Igual que countryConfig.js, agregar una categoría o un color nuevo es
// sumar una línea acá — no requiere tocar ningún componente.
// ─────────────────────────────────────────────────────────────────────────────

// ── Conjuntos de talla ──────────────────────────────────────────────────────
// Cada categoría apunta a UNO de estos sets (ver CATEGORIES abajo). Al crear
// una prenda, la matriz de variantes se pre-llena con las tallas de su set.
export const SIZE_SETS = {
  ropa:      { id: "ropa",      label: "Ropa (XS–XXL)",   sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  pantalon:  { id: "pantalon",  label: "Pantalón (cintura)", sizes: ["28", "30", "32", "34", "36", "38", "40", "42"] },
  calzado:   { id: "calzado",   label: "Calzado (35–44)", sizes: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44"] },
  infantil:  { id: "infantil",  label: "Infantil (años)", sizes: ["2", "4", "6", "8", "10", "12", "14"] },
  unica:     { id: "unica",     label: "Talla única",     sizes: ["Única"] },
};

// ── Categorías de prenda ─────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: "camisas_blusas",    label: "Camisas y Blusas",     sizeSet: "ropa"     },
  { id: "polos_camisetas",   label: "Polos y Camisetas",    sizeSet: "ropa"     },
  { id: "pantalones",        label: "Pantalones",           sizeSet: "pantalon" },
  { id: "jeans",             label: "Jeans",                sizeSet: "pantalon" },
  { id: "vestidos",          label: "Vestidos",             sizeSet: "ropa"     },
  { id: "faldas",            label: "Faldas",                sizeSet: "ropa"     },
  { id: "chaquetas_abrigos", label: "Chaquetas y Abrigos",  sizeSet: "ropa"     },
  { id: "ropa_deportiva",    label: "Ropa Deportiva",       sizeSet: "ropa"     },
  { id: "ropa_interior",     label: "Ropa Interior",        sizeSet: "ropa"     },
  { id: "calzado",           label: "Calzado",              sizeSet: "calzado"  },
  { id: "accesorios",        label: "Accesorios",           sizeSet: "unica"    },
  { id: "ropa_infantil",     label: "Ropa Infantil",        sizeSet: "infantil" },
];

/**
 * Busca una categoría por id (formato viejo) o por nombre (formato nuevo,
 * ver conversación: las categorías ahora son texto libre — el usuario puede
 * escribir la suya). Si no coincide con ninguna categoría conocida, se trata
 * el texto tal cual como su propia categoría "custom", con el set de tallas
 * más común (ropa) como default razonable.
 */
export function getCategoryConfig(category) {
  if (!category) return CATEGORIES[0];
  const norm = String(category).trim().toLowerCase();
  const known = CATEGORIES.find(c => c.id === category || c.label.toLowerCase() === norm);
  if (known) return known;
  return { id: category, label: category, sizeSet: "ropa" };
}

export function getSizesForCategory(categoryId) {
  const cat = getCategoryConfig(categoryId);
  return SIZE_SETS[cat.sizeSet]?.sizes || SIZE_SETS.unica.sizes;
}

// ── Paleta de colores ────────────────────────────────────────────────────────
// `hex` pinta el swatch (círculo de color) en catálogo, filtros y la matriz
// de variantes. `border` opcional: para los tonos muy claros (blanco, hueso)
// un swatch sin borde se pierde sobre el fondo oscuro de la app.
export const COLOR_PALETTE = [
  { id: "negro",       label: "Negro",       hex: "#18181b" },
  { id: "blanco",      label: "Blanco",      hex: "#fafafa", border: true },
  { id: "gris",        label: "Gris",        hex: "#71717a" },
  { id: "beige",       label: "Beige",       hex: "#d6cbb0", border: true },
  { id: "camel",       label: "Camel",       hex: "#b08c5c" },
  { id: "azul_marino", label: "Azul Marino", hex: "#1e3a5f" },
  { id: "azul",        label: "Azul",        hex: "#2563eb" },
  { id: "celeste",     label: "Celeste",     hex: "#7dd3fc" },
  { id: "denim",       label: "Denim",       hex: "#3b5c78" },
  { id: "rojo",        label: "Rojo",        hex: "#dc2626" },
  { id: "vino",        label: "Vino",        hex: "#7f1d3a" },
  { id: "rosa",        label: "Rosa",        hex: "#f472b6" },
  { id: "fucsia",      label: "Fucsia",      hex: "#db2777" },
  { id: "verde",       label: "Verde",       hex: "#16a34a" },
  { id: "verde_oliva", label: "Verde Olivo", hex: "#65733f" },
  { id: "amarillo",    label: "Amarillo",    hex: "#eab308" },
  { id: "mostaza",     label: "Mostaza",     hex: "#ca8a04" },
  { id: "naranja",     label: "Naranja",     hex: "#ea580c" },
  { id: "morado",      label: "Morado",      hex: "#7c3aed" },
  { id: "cafe",        label: "Café",        hex: "#6b4423" },
  { id: "dorado",      label: "Dorado",      hex: "#ca9a3f" },
  { id: "plata",       label: "Plata",       hex: "#a8a8a8" },
];

export function getColorConfig(colorId) {
  return COLOR_PALETTE.find(c => c.id === colorId)
    || { id: colorId, label: colorId || "—", hex: "#64748b" };
}

// ── Categorías de proveedor ───────────────────────────────────────────────────
// Deben coincidir exactamente con el check constraint de la tabla `suppliers`
// en supabase/schema.sql.
export const SUPPLIER_CATEGORIES = ["Telas", "Confección/Maquila", "Calzado", "Accesorios", "Insumos y Avíos", "Otro"];
