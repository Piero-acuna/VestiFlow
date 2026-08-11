// ─────────────────────────────────────────────────────────────────────────────
// src/modules/InventoryModule.jsx
// Módulo 1 — Catálogo de ropa: grilla de prendas con foto, alta/edición con
// matriz de variantes (talla × color), y detalle con ajuste de stock por
// variante. Reemplaza la tabla de "productos" genérica de la versión anterior
// — misma posición en el shell, mismo tono visual, dominio distinto.
//
// Fuente de datos: src/services/mock/garmentsStore.js (local, sin backend
// todavía — ver conversación). Cuando se conecte Supabase, useGarments() y
// este módulo no cambian; solo cambia lo que hay DENTRO de garmentsStore.js.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { Search, Plus, Shirt, CheckCircle, AlertTriangle, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useGarments } from "../hooks/useGarments";
import { Spinner, StatusBadge, STOCK_STATUS, EmptyState } from "../components/shared/StatusUI";
import { CATEGORIES } from "../config/clothingConfig";
import GarmentCard from "../components/inventory/GarmentCard";
import GarmentFormModal from "../components/inventory/GarmentFormModal";
import GarmentDetailPanel from "../components/inventory/GarmentDetailPanel";

const InventoryModule = ({ companyId, userName, canCreate, canEdit, canDelete, canViewFinance }) => {
  const { companyCurrency } = useAuth();
  const currencySymbol = companyCurrency.currencySymbol;
  const [garments, loading] = useGarments(companyId);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [statusFilter, setStatusFilter] = useState("Todos");

  const [selectedId, setSelectedId] = useState(null);
  const selected = useMemo(() => garments.find(g => g.id === selectedId) ?? null, [garments, selectedId]);

  const [showForm, setShowForm] = useState(false);
  const [editingGarment, setEditingGarment] = useState(null);

  const filtered = useMemo(() => garments.filter(g => {
    const q = search.toLowerCase();
    const matchesSearch = !q || g.name?.toLowerCase().includes(q) || g.sku?.toLowerCase().includes(q) || g.brand?.toLowerCase().includes(q);
    const matchesCategory = categoryFilter === "Todas" || g.category === categoryFilter;
    const matchesStatus = statusFilter === "Todos" || g.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  }), [garments, search, categoryFilter, statusFilter]);

  const stats = [
    { label: "Prendas",    value: garments.length, icon: <Shirt size={18} />, color: "text-blue-400" },
    { label: "En Stock",   value: garments.filter(g => g.status === "En Stock").length, icon: <CheckCircle size={18} />, color: "text-emerald-400" },
    { label: "Stock Bajo", value: garments.filter(g => g.status === "Stock Bajo").length, icon: <AlertTriangle size={18} />, color: "text-amber-400" },
    { label: "Agotadas",   value: garments.filter(g => g.status === "Agotado").length, icon: <X size={18} />, color: "text-red-400" },
  ];

  function openNew() { setEditingGarment(null); setShowForm(true); }
  function openEdit(garment) { setEditingGarment(garment); setShowForm(true); setSelectedId(null); }
  function closeForm() { setShowForm(false); setEditingGarment(null); }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {stats.map((s, i) => (
          <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <span className={`${s.color} bg-slate-700/50 p-1.5 sm:p-2 rounded-lg flex-shrink-0`}>{s.icon}</span>
            <div className="min-w-0">
              <div className="text-xl sm:text-2xl font-bold text-white font-mono">{s.value}</div>
              <div className="text-xs text-slate-400 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, SKU o marca…"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-amber-500 transition-colors">
          <option value="Todas">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
          {["Todos", ...STOCK_STATUS].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${statusFilter === s ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>
              {s}
            </button>
          ))}
        </div>
        {canCreate && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-sm rounded-lg transition-colors">
            <Plus size={15} /> Prenda
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={<Shirt size={40} />} msg="No se encontraron prendas"
          sub={garments.length === 0 ? "Agrega tu primera prenda para empezar" : "Prueba con otra búsqueda o filtro"} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {filtered.map(g => (
            <GarmentCard key={g.id} garment={g} currencySymbol={currencySymbol} onClick={() => setSelectedId(g.id)} />
          ))}
        </div>
      )}

      {selected && (
        <GarmentDetailPanel
          garment={selected}
          companyId={companyId}
          userName={userName}
          currencySymbol={currencySymbol}
          canEdit={canEdit}
          canDelete={canDelete}
          canViewFinance={canViewFinance}
          onEdit={() => openEdit(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showForm && (
        <GarmentFormModal
          companyId={companyId}
          userName={userName}
          garment={editingGarment}
          currencySymbol={currencySymbol}
          canViewFinance={canViewFinance}
          onClose={closeForm}
        />
      )}
    </div>
  );
};

export default InventoryModule;
