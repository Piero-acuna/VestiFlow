// ─────────────────────────────────────────────────────────────────────────────
// src/WarehouseModule.jsx
// Módulo 3 — Almacén: ubicaciones físicas + stock por variante, registro de
// movimientos (entrada/salida/traslado) y su historial. Ya no mantiene un
// catálogo de "productos de almacén" separado — todo referencia las mismas
// variantes (SKU talla+color) del Catálogo (ver components/warehouse/*.jsx
// y services/supabase/warehouseStore.js para el porqué).
//
// Fuente de datos: Supabase real. useWarehouseData() no cambia si algún día
// cambia lo de adentro de warehouseStore.js.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { MapPin, ArrowLeftRight, History as HistoryIcon } from "lucide-react";
import { useWarehouseData } from "./hooks/useWarehouseData";
import { useGarments } from "./hooks/useGarments";
import { Spinner } from "./components/shared/StatusUI";
import LocationsTab from "./components/warehouse/LocationsTab";
import MovementForm from "./components/warehouse/MovementForm";
import WarehouseHistoryTab from "./components/warehouse/WarehouseHistoryTab";

const TABS = [
  { id: "locations", label: "Ubicaciones y Stock", icon: <MapPin size={14} /> },
  { id: "movement",  label: "Movimiento",           icon: <ArrowLeftRight size={14} /> },
  { id: "history",   label: "Historial",            icon: <HistoryIcon size={14} /> },
];

export default function WarehouseModule({ companyId, userName, canManage }) {
  const { locations, stock, movements, loading } = useWarehouseData(companyId);
  const [garments, loadingGarments] = useGarments(companyId);
  const [tab, setTab] = useState("locations");

  if (loading || loadingGarments) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50 w-full sm:w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "locations" && (
        <LocationsTab locations={locations} stock={stock} companyId={companyId} userName={userName} canManage={canManage} />
      )}
      {tab === "movement" && (
        canManage ? (
          <MovementForm garments={garments} locations={locations} stock={stock} companyId={companyId} userName={userName} />
        ) : (
          <p className="text-sm text-slate-500 text-center py-8">No tienes permiso para registrar movimientos de almacén.</p>
        )
      )}
      {tab === "history" && <WarehouseHistoryTab movements={movements} />}
    </div>
  );
}
