// src/components/warehouse/WarehouseHistoryTab.jsx
// Pestaña "Historial": log de todos los movimientos de almacén (entrada,
// salida, traslado, envío a venta), más reciente primero.
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Send, History } from "lucide-react";
import { EmptyState } from "../shared/StatusUI";
import ColorSwatch from "../inventory/ColorSwatch";
import { getColorConfig } from "../../config/clothingConfig";

const TYPE_META = {
  entrada:     { label: "Entrada",       icon: <ArrowDownCircle size={13} />, cls: "bg-emerald-500/20 text-emerald-400" },
  salida:      { label: "Salida",        icon: <ArrowUpCircle size={13} />,   cls: "bg-red-500/20 text-red-400" },
  traslado:    { label: "Traslado",      icon: <ArrowLeftRight size={13} />,  cls: "bg-sky-500/20 text-sky-400" },
  envio_venta: { label: "Enviado a Venta", icon: <Send size={13} />,          cls: "bg-amber-500/20 text-amber-400" },
};

export default function WarehouseHistoryTab({ movements }) {
  if (movements.length === 0) {
    return <EmptyState icon={<History size={28} />} msg="Sin movimientos todavía" sub="Los registros de entrada, salida y traslado aparecerán aquí" />;
  }

  return (
    <div className="space-y-2">
      {movements.map(m => {
        const meta = TYPE_META[m.type] || TYPE_META.entrada;
        return (
          <div key={m.id} className="flex items-center gap-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
            <span className={`p-1.5 rounded-lg flex-shrink-0 ${meta.cls}`}>{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold">{meta.label}</span>
                <span className="font-mono text-amber-400">{m.qty} und</span>
                <span className="text-slate-500">·</span>
                {m.garmentName}
                <ColorSwatch colorId={m.color} size={8} />
                <span className="text-slate-500">{m.talla} · {getColorConfig(m.color).label}</span>
              </p>
              <p className="text-xs text-slate-500">
                {m.fromLocationName && <>Desde <span className="text-slate-400">{m.fromLocationName}</span> </>}
                {m.toLocationName && <>→ <span className="text-slate-400">{m.toLocationName}</span> </>}
                · {m.date} {m.time} · {m.userName}
                {m.reason && <> · {m.reason}</>}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
