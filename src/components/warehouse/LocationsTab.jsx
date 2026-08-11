// ─────────────────────────────────────────────────────────────────────────────
// src/components/warehouse/LocationsTab.jsx
// Pestaña "Ubicaciones y Stock": alta/edición/baja de ubicaciones físicas, y
// para cada una, qué variantes (talla+color) tiene guardadas y cuántas.
// Reemplaza a la vieja "Mapa del Almacén" + "Mis Productos" combinadas — ya
// no hace falta una pestaña de catálogo aparte porque el stock referencia
// directo las variantes que ya existen en Inventario.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import {
  Plus, X, Edit3, Trash2, MapPin, Search, CheckCircle,
  ChevronDown, Send, Loader2, Boxes, Package,
} from "lucide-react";
import { addLocation, updateLocation, deleteLocation, sendToSalesFloor } from "../../services/mock/warehouseStore";
import { logAndGetErrorMessage } from "../../utils/errors";
import { EmptyState } from "../shared/StatusUI";
import ColorSwatch from "../inventory/ColorSwatch";
import { getColorConfig } from "../../config/clothingConfig";

const LOCATION_TYPES = ["Bodega", "Zona", "Estante", "Pasillo", "Refrigerador", "Otro"];
const EMPTY_LOC = { name: "", type: "Bodega", code: "", description: "" };

export default function LocationsTab({ locations, stock, companyId, userName, canManage }) {
  const [showForm, setShowForm] = useState(false);
  const [editLoc,  setEditLoc]  = useState(null);
  const [form,     setForm]     = useState(EMPTY_LOC);
  const [saving,   setSaving]   = useState(false);
  const [formError,setFormError]= useState("");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);

  const stockByLocation = useMemo(() => {
    const map = {};
    stock.forEach(s => { (map[s.locationId] ||= []).push(s); });
    return map;
  }, [stock]);

  const totalUnits = stock.reduce((s, i) => s + (i.qty || 0), 0);
  const occupied = locations.filter(l => (stockByLocation[l.id] || []).some(s => s.qty > 0)).length;

  const filtered = locations.filter(l =>
    l.name?.toLowerCase().includes(search.toLowerCase()) || l.code?.toLowerCase().includes(search.toLowerCase()));

  function openNew() { setEditLoc(null); setForm(EMPTY_LOC); setFormError(""); setShowForm(true); }
  function openEdit(loc) { setEditLoc(loc); setForm({ name: loc.name, type: loc.type, code: loc.code || "", description: loc.description || "" }); setFormError(""); setShowForm(true); }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("El nombre es obligatorio."); return; }
    setSaving(true); setFormError("");
    try {
      if (editLoc) await updateLocation(companyId, editLoc.id, form);
      else await addLocation(companyId, form);
      setShowForm(false);
    } catch (err) {
      setFormError(logAndGetErrorMessage(err, "Error al guardar ubicación:"));
    }
    setSaving(false);
  }

  async function handleDelete(loc) {
    if (!window.confirm(`¿Eliminar "${loc.name}"? El stock registrado ahí se perderá.`)) return;
    try { await deleteLocation(companyId, loc.id); } catch (err) { alert(logAndGetErrorMessage(err, "Error al eliminar:")); }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Ubicaciones", value: locations.length, color: "text-amber-400" },
          { label: "Ocupadas",    value: `${occupied}/${locations.length}`, color: "text-sky-400" },
          { label: "Unidades",    value: totalUnits, color: "text-emerald-400" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-lg sm:text-xl font-bold font-mono mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-36">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ubicación…"
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-xs rounded-lg transition-colors">
            <Plus size={13} /> Nueva Ubicación
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && canManage && (
        <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">{editLoc ? "Editar ubicación" : "Nueva ubicación"}</p>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X size={15} /></button>
          </div>
          {formError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Nombre *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Almacén Central"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Código</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="AC"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors">
                {LOCATION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Descripción</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional…"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-xs border border-slate-700 text-slate-400 rounded-lg hover:border-slate-600 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-xs bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-900 disabled:text-slate-500 font-semibold rounded-lg transition-colors flex items-center justify-center gap-1">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {editLoc ? "Guardar cambios" : "Crear ubicación"}
            </button>
          </div>
        </div>
      )}

      {/* Locations */}
      {filtered.length === 0 ? (
        <EmptyState icon={<MapPin size={28} />} msg="Sin ubicaciones" sub={canManage ? "Crea la primera con el botón de arriba" : undefined} />
      ) : (
        <div className="space-y-2">
          {filtered.map(loc => {
            const items = (stockByLocation[loc.id] || []).filter(s => s.qty > 0);
            const isOpen = expanded === loc.id;
            return (
              <div key={loc.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : loc.id)} className="w-full flex items-center gap-3 p-3.5 hover:bg-slate-800 transition-colors">
                  <span className="p-2 bg-amber-500/10 text-amber-400 rounded-lg flex-shrink-0"><Boxes size={15} /></span>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-200 truncate">{loc.name}{loc.code ? <span className="text-slate-500 font-mono text-xs ml-1.5">({loc.code})</span> : ""}</p>
                    <p className="text-xs text-slate-500">{loc.type} · {items.reduce((s, i) => s + i.qty, 0)} unidades · {items.length} variante{items.length !== 1 ? "s" : ""}</p>
                  </div>
                  {canManage && (
                    <span className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(loc)} className="p-1.5 hover:bg-slate-700 rounded text-slate-500 hover:text-amber-400 transition-colors"><Edit3 size={13} /></button>
                      <button onClick={() => handleDelete(loc)} className="p-1.5 hover:bg-slate-700 rounded text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                    </span>
                  )}
                  <ChevronDown size={15} className={`text-slate-500 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-700/50 p-3 space-y-1.5">
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-600 text-center py-3">Sin stock en esta ubicación.</p>
                    ) : items.map(item => (
                      <StockRow key={item.id} item={item} companyId={companyId} userName={userName} canManage={canManage} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockRow({ item, companyId, userName, canManage }) {
  const [sending, setSending] = useState(false);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    const n = Number(qty);
    if (!n || n <= 0) return;
    setBusy(true); setError("");
    try {
      await sendToSalesFloor(companyId, {
        variantSku: item.variantSku, garmentId: item.garmentId, garmentName: item.garmentName,
        talla: item.talla, color: item.color, locationId: item.locationId, locationName: item.locationName,
        qty: n, userName,
      });
      setSending(false); setQty("");
    } catch (err) {
      setError(logAndGetErrorMessage(err, "Error al enviar a venta:"));
    }
    setBusy(false);
  }

  return (
    <div className="bg-slate-900/40 rounded-lg border border-slate-700/40">
      <div className="flex items-center gap-2.5 p-2.5">
        <div className="w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0"><Package size={12} className="text-slate-400" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-200 truncate">{item.garmentName}</p>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><ColorSwatch colorId={item.color} size={8} />{item.talla} · {getColorConfig(item.color).label}</p>
        </div>
        <span className="text-sm font-mono font-bold text-amber-400 flex-shrink-0">{item.qty} und</span>
        {canManage && (
          <button onClick={() => setSending(s => !s)} title="Enviar a venta"
            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg flex-shrink-0 transition-colors"><Send size={12} /></button>
        )}
      </div>
      {sending && (
        <div className="px-2.5 pb-2.5 flex items-center gap-2">
          <input type="number" min="1" max={item.qty} value={qty} onChange={e => setQty(e.target.value)} placeholder={`Máx. ${item.qty}`}
            className="flex-1 px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
          <button onClick={handleSend} disabled={busy} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 text-slate-900 font-semibold text-xs rounded-lg flex items-center gap-1">
            {busy && <Loader2 size={11} className="animate-spin" />}Enviar
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400 px-2.5 pb-2">{error}</p>}
    </div>
  );
}
