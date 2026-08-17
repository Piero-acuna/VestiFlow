// ─────────────────────────────────────────────────────────────────────────────
// src/components/inventory/GarmentFormModal.jsx
// Alta y edición de una prenda: identificación, fotos, precios y la matriz
// de variantes (talla × color). Mismo layout en 4 secciones que ya usaba el
// formulario de producto genérico, para que se sienta como el mismo sistema.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo } from "react";
import { X, Plus, Edit3, Loader2, Save, Store, Warehouse } from "lucide-react";
import { addGarment, updateGarment } from "../../services/supabase/garmentsStore";
import { getNextSku } from "../../services/supabase/companyStore";
import { addWarehouseMovement } from "../../services/supabase/warehouseStore";
import { useWarehouseData } from "../../hooks/useWarehouseData";
import { logAndGetErrorMessage } from "../../utils/errors";
import { calcProfit, calcMarginPercent } from "../../utils/finance";
import { formatMoney } from "../../utils/currency";
import { CATEGORIES, getSizesForCategory } from "../../config/clothingConfig";
import ImageUploader from "./ImageUploader";
import VariantMatrix from "./VariantMatrix";

const emptyForm = {
  name: "", brand: "", sku: "", category: CATEGORIES[0].label, description: "",
  price: "", cost: "", minStock: "2", images: [],
};

export default function GarmentFormModal({ companyId, userName, garment, garments = [], currencySymbol, canViewFinance, onClose }) {
  const isEdit = !!garment;
  const [form, setForm] = useState(() => isEdit ? {
    name: garment.name, brand: garment.brand || "", sku: garment.sku, category: garment.category,
    description: garment.description || "", price: garment.price ?? "", cost: garment.cost ?? "",
    minStock: garment.variants?.[0]?.minStock ?? 2, images: garment.images || [],
  } : emptyForm);
  const [variants, setVariants] = useState(garment?.variants || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingSku, setLoadingSku] = useState(!isEdit);

  // Destino del stock inicial — solo aplica al crear una prenda nueva. "venta"
  // (default) deja el stock cargado en la matriz directamente vendible, como
  // siempre. "almacen" lo manda a una ubicación de Almacén en vez de al piso
  // de venta — la prenda queda "Agotada" hasta que la envíes desde ahí.
  const { locations } = useWarehouseData(isEdit ? null : companyId);
  const [stockDestination, setStockDestination] = useState("venta");
  const [locationId, setLocationId] = useState("");

  // SKU automático — 001, 002, 003… por empresa (ver next_sku() en
  // supabase/schema.sql). Ya no se escribe a mano: se pide apenas se abre
  // el formulario de una prenda NUEVA, y al editar se muestra el que ya
  // tenía (nunca cambia, porque las variantes ya están armadas sobre él).
  useEffect(() => {
    if (isEdit) return;
    let active = true;
    getNextSku(companyId).then(sku => { if (active) { setForm(f => ({ ...f, sku })); setLoadingSku(false); } })
      .catch(err => { if (active) { setError(logAndGetErrorMessage(err, "Error al generar SKU:")); setLoadingSku(false); } });
    return () => { active = false; };
  }, [isEdit, companyId]);

  // Sugerencias de categoría: las predefinidas + las que ya usaste en otras
  // prendas (para que categorías que agregaste a mano aparezcan también).
  const categorySuggestions = useMemo(() => {
    const set = new Set(CATEGORIES.map(c => c.label));
    garments.forEach(g => { if (g.category) set.add(g.category); });
    return [...set];
  }, [garments]);

  const sizes = getSizesForCategory(form.category);
  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }));

  async function handleSave() {
    if (loadingSku) { setError("Espera a que se genere el SKU."); return; }
    if (!form.name || !form.sku || variants.length === 0) {
      setError(variants.length === 0 ? "Agrega al menos una talla y un color." : "Completa el nombre de la prenda.");
      return;
    }
    const toWarehouse = !isEdit && stockDestination === "almacen";
    if (toWarehouse && !locationId) { setError("Elige a qué ubicación de almacén va el stock."); return; }

    setSaving(true); setError("");
    const payload = {
      name: form.name, brand: form.brand, sku: form.sku, category: form.category,
      description: form.description,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      images: form.images,
      // Si el stock va a almacén, la prenda arranca con 0 vendible en cada
      // variante — recién queda disponible para vender cuando se envíe desde
      // Almacén (mismo flujo que "Enviar a Venta").
      variants: variants.map(v => ({ ...v, stock: toWarehouse ? 0 : v.stock, minStock: Number(form.minStock) || 0 })),
    };
    try {
      let garmentId;
      if (isEdit) {
        await updateGarment(companyId, garment.id, payload);
        garmentId = garment.id;
      } else {
        garmentId = await addGarment(companyId, { ...payload, createdBy: userName });
      }

      if (toWarehouse) {
        const location = locations.find(l => l.id === locationId);
        const withStock = variants.filter(v => (Number(v.stock) || 0) > 0);
        for (const v of withStock) {
          await addWarehouseMovement(companyId, {
            type: "entrada", variantSku: v.sku, garmentId, garmentName: form.name,
            talla: v.talla, color: v.color, qty: Number(v.stock),
            toLocationId: locationId, toLocationName: location?.name || "",
            reason: "Alta de prenda nueva", userName,
          });
        }
      }

      onClose();
    } catch (err) {
      setError(logAndGetErrorMessage(err, "Error al guardar prenda:"));
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-700 flex-shrink-0">
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              {isEdit ? <Edit3 size={16} className="text-amber-400" /> : <Plus size={16} className="text-amber-400" />}
              {isEdit ? "Editar Prenda" : "Nueva Prenda"}
            </h3>
            {isEdit && <p className="text-xs text-slate-500 font-mono mt-0.5">{garment.sku}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Identificación */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Identificación</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Nombre de la prenda *</label>
                <input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Ej: Polo Oversize Algodón"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
                <input list="category-suggestions" value={form.category} onChange={e => set("category")(e.target.value)}
                  placeholder="Ej: Camisas, o la tuya…"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
                <datalist id="category-suggestions">
                  {categorySuggestions.map(c => <option key={c} value={c} />)}
                </datalist>
                <p className="text-[10px] text-slate-500 mt-1">Elige una o escribe la tuya propia</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Marca</label>
                <input value={form.brand} onChange={e => set("brand")(e.target.value)} placeholder="Ej: Basics Co."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">SKU</label>
                <p className="text-[10px] text-slate-500 mb-1">Automático — el de cada talla/color se arma a partir de este</p>
                <div className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm font-mono flex items-center gap-2">
                  {loadingSku
                    ? <><Loader2 size={12} className="animate-spin text-slate-500" /><span className="text-slate-500">Generando…</span></>
                    : <span className="text-slate-300">{form.sku}</span>}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 mb-1 block">Descripción</label>
                <textarea value={form.description} onChange={e => set("description")(e.target.value)} rows={2}
                  placeholder="Tela, corte, cuidados…"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none" />
              </div>
            </div>
          </div>

          {/* Fotos */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Fotos</p>
            <ImageUploader images={form.images} onChange={set("images")} companyId={companyId} />
          </div>

          {/* Precios */}
          {canViewFinance ? (
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Precios</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-emerald-400 mb-0.5 block">Precio de venta ({currencySymbol})</label>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={e => set("price")(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-900 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-sky-400 mb-0.5 block">Costo ({currencySymbol})</label>
                  <input type="number" min="0" step="0.01" value={form.cost} onChange={e => set("cost")(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-900 border border-sky-500/30 rounded-lg text-sm text-sky-300 font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors" />
                </div>
              </div>
              {form.price > 0 && form.cost > 0 && (() => {
                const profit = calcProfit(form.price, form.cost);
                const margin = calcMarginPercent(form.price, form.cost);
                return (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${margin >= 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                    <span className="text-slate-400">Ganancia por unidad</span>
                    <div className="text-right">
                      <span className={`font-mono font-bold ${margin >= 0 ? "text-amber-400" : "text-red-400"}`}>{formatMoney(profit, currencySymbol)}</span>
                      <span className={`ml-2 ${margin >= 0 ? "text-amber-400" : "text-red-400"}`}>({margin.toFixed(1)}% margen)</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-emerald-400 mb-0.5 block">Precio de venta ({currencySymbol})</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => set("price")(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-800 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>
          )}

          {/* Variantes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Variantes</p>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                Stock mínimo (alerta)
                <input type="number" min="0" value={form.minStock} onChange={e => set("minStock")(e.target.value)}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500" />
              </label>
            </div>
            <VariantMatrix availableSizes={sizes} baseSku={form.sku || "SKU"} initialVariants={variants} onChange={setVariants} />
          </div>

          {/* Destino del stock inicial (solo al crear) */}
          {!isEdit && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">¿Dónde va este stock?</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStockDestination("venta")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                    stockDestination === "venta" ? "bg-amber-500 border-amber-500 text-slate-900" : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  <Store size={14} /> Piso de venta
                </button>
                <button type="button" onClick={() => setStockDestination("almacen")} disabled={locations.length === 0}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    stockDestination === "almacen" ? "bg-amber-500 border-amber-500 text-slate-900" : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}>
                  <Warehouse size={14} /> Almacén
                </button>
              </div>
              {locations.length === 0 && (
                <p className="text-[11px] text-slate-500 mt-1.5">Todavía no tienes ubicaciones de almacén — créalas primero en el módulo Almacén si quieres usar esta opción.</p>
              )}
              {stockDestination === "venta" && (
                <p className="text-[11px] text-slate-500 mt-1.5">El stock que cargaste arriba queda disponible para vender de inmediato.</p>
              )}
              {stockDestination === "almacen" && (
                <div className="mt-2">
                  <select value={locationId} onChange={e => setLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                    <option value="">Elegir ubicación…</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1.5">La prenda queda "Agotada" en el catálogo hasta que envíes stock desde Almacén al piso de venta.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-700 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-600 text-slate-400 rounded-xl text-sm hover:border-slate-500 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving || loadingSku}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}<Save size={14} />{isEdit ? "Guardar Cambios" : "Guardar Prenda"}
          </button>
        </div>
      </div>
    </div>
  );
}
