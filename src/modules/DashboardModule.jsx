// ─────────────────────────────────────────────────────────────────────────────
// src/modules/DashboardModule.jsx
// Módulo 0 — Inicio: resumen de un vistazo de los 4 módulos (Inventario,
// Movimientos, Almacén, Proveedores). No tiene datos propios: solo agrega y
// muestra en un solo lugar lo que ya vive en cada módulo.
//
// Inventario, Movimientos y Almacén ahora leen del mismo store mock (ver
// conversación — Supabase, no Firebase, cuando se conecte el backend).
// Proveedores sigue en Firestore porque ese módulo todavía no se migró.
//
// Cada sección respeta los MISMOS permisos que su módulo original — un
// empleado que no puede ver Almacén tampoco ve la sección de Almacén aquí,
// y los montos en soles (S/) solo se muestran si tiene "ver_metricas_financieras".
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import {
  LayoutDashboard, Package, Warehouse, Truck, BarChart2, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, Clock, ArrowRight, Wallet,
  Boxes, ShoppingCart, PackageX, Loader2, Trophy, ArrowDownCircle,
} from "lucide-react";
import { useSupabaseList } from "../hooks/useSupabaseList";
import { subscribeToSuppliers, subscribeToSupplierReturns } from "../services/supabase/suppliersStore";
import { useGarments } from "../hooks/useGarments";
import { useTransactions } from "../hooks/useTransactions";
import { useWarehouseData } from "../hooks/useWarehouseData";
import { useAuth } from "../contexts/AuthContext";
import { formatMoney } from "../utils/currency";
import { sumTotals } from "../utils/finance";
import { totalStock } from "../utils/variants";

const todayStr = () => new Date().toISOString().split("T")[0];

export default function DashboardModule({ companyId, userName, companyName, perms, onNavigate }) {
  // Símbolo de moneda de la empresa (S/ para Perú, $ para el resto — ver
  // countryConfig.js). `money` reemplaza al viejo `S/ ${...}` fijo.
  const { companyCurrency } = useAuth();
  const money = (n) => formatMoney(n, companyCurrency.currencySymbol);

  // ── Datos de Inventario (Catálogo) y Movimientos ────────────────────────────
  const [garments,     loadingProd] = useGarments(companyId);
  const [transactions, loadingTx]   = useTransactions(companyId);

  // ── Datos de Proveedores (todavía en Firestore, sin migrar) ─────────────────
  const [suppliers, loadingSup] = useSupabaseList(subscribeToSuppliers, companyId);
  const [supplierReturns, loadingSR] = useSupabaseList(subscribeToSupplierReturns, companyId);

  // ── Datos de Almacén ─────────────────────────────────────────────────────────
  const { locations, stock: warehouseStock, loading: loadingWh } = useWarehouseData(perms.verAlmacen ? companyId : null);

  // ── Inventario (Catálogo) ────────────────────────────────────────────────────
  const inv = useMemo(() => {
    const lowStock = garments.filter(g => g.status === "Stock Bajo").length;
    const outStock = garments.filter(g => g.status === "Agotado").length;
    const value = garments.reduce((sum, g) => sum + (Number(g.cost) || 0) * totalStock(g.variants), 0);
    return { total: garments.length, lowStock, outStock, value };
  }, [garments]);

  // ── Almacén — ya no hay un catálogo de "productos de almacén" separado, el
  //    stock referencia directo las variantes del Catálogo (ver warehouseStore.js).
  const priceByGarment = useMemo(() => Object.fromEntries(garments.map(g => [g.id, g.price])), [garments]);
  const wh = useMemo(() => {
    const totalUnits = warehouseStock.reduce((s, i) => s + (i.qty || 0), 0);
    const value = warehouseStock.reduce((s, i) => s + (i.qty || 0) * (Number(priceByGarment[i.garmentId]) || 0), 0);
    const variantsInStock = new Set(warehouseStock.filter(i => i.qty > 0).map(i => i.variantSku)).size;
    const stockByLocation = {};
    warehouseStock.forEach(s => { stockByLocation[s.locationId] = (stockByLocation[s.locationId] || 0) + (s.qty || 0); });
    const emptyLocations = locations.filter(l => !stockByLocation[l.id]).length;
    return { locationsCount: locations.length, totalUnits, value, variantsInStock, emptyLocations };
  }, [warehouseStock, locations, priceByGarment]);

  // ── Ranking de prendas más y menos vendidas (histórico, todas las ventas) ───
  // Se agrupa por SKU de VARIANTE (talla+color), no por nombre de prenda —
  // así "Polo M Negro" y "Polo L Blanco" rankean por separado. El ranking de
  // "menos vendidos" solo toma variantes que SÍ tuvieron alguna venta, y
  // nunca repite una que ya salió en "más vendidos".
  const topProducts = useMemo(() => {
    const bySku = {};
    transactions.forEach(t => {
      if (t.type !== "venta") return;
      const key = t.sku || t.product;
      if (!bySku[key]) bySku[key] = { name: t.description ? `${t.product} · ${t.description}` : t.product, qty: 0 };
      bySku[key].qty += t.qty || 0;
    });
    const ranked = Object.values(bySku).sort((a, b) => b.qty - a.qty);
    const n = ranked.length;
    const mostList = ranked.slice(0, Math.min(7, n));
    const leastCount = Math.min(7, Math.max(0, n - mostList.length));
    const leastList = leastCount > 0 ? ranked.slice(n - leastCount).reverse() : [];
    return { mostList, leastList };
  }, [transactions]);

  // ── Movimientos (ventas / compras de hoy) ───────────────────────────────────
  const mv = useMemo(() => {
    const today = todayStr();
    const salesToday     = transactions.filter(t => t.type === "venta"  && t.date === today);
    const purchasesToday = transactions.filter(t => t.type === "compra" && t.date === today);
    return {
      salesCount:     salesToday.length,
      salesTotal:     sumTotals(salesToday),
      purchasesCount: purchasesToday.length,
      purchasesTotal: sumTotals(purchasesToday),
      recent: transactions.filter(t => t.type === "venta" || t.type === "compra").slice(0, 5),
    };
  }, [transactions]);

  // ── Proveedores ──────────────────────────────────────────────────────────────
  const sup = useMemo(() => ({
    total:    suppliers.length,
    active:   suppliers.filter(s => s.status === "Activo").length,
    pending:  supplierReturns.filter(r => r.status === "Pendiente").length,
  }), [suppliers, supplierReturns]);

  const loading =
    (perms.verInventario || perms.registrarVentas || perms.registrarCompras) && (loadingProd || loadingTx) ||
    perms.verAlmacen && loadingWh ||
    perms.verProveedores && (loadingSup || loadingSR);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-amber-400" />
      </div>
    );
  }

  // ── Alertas agregadas de los 3 lados (tienda / almacén / proveedores) ──────
  const alerts = [
    perms.verInventario && inv.outStock > 0 && {
      icon: <PackageX size={14} />, label: `${inv.outStock} prenda${inv.outStock === 1 ? "" : "s"} agotada${inv.outStock === 1 ? "" : "s"} en tienda`,
      tone: "red", nav: "inventory",
    },
    perms.verInventario && inv.lowStock > 0 && {
      icon: <AlertTriangle size={14} />, label: `${inv.lowStock} prenda${inv.lowStock === 1 ? "" : "s"} con stock bajo en tienda`,
      tone: "amber", nav: "inventory",
    },
    perms.verAlmacen && wh.emptyLocations > 0 && {
      icon: <Boxes size={14} />, label: `${wh.emptyLocations} ubicación${wh.emptyLocations === 1 ? "" : "es"} de almacén sin stock`,
      tone: "amber", nav: "warehouse",
    },
    perms.verProveedores && sup.pending > 0 && {
      icon: <Clock size={14} />, label: `${sup.pending} devolución${sup.pending === 1 ? "" : "es"} a proveedor pendiente${sup.pending === 1 ? "" : "s"}`,
      tone: "sky", nav: "suppliers",
    },
  ].filter(Boolean);

  const toneCls = {
    red:   "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20",
    sky:   "bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20",
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="space-y-5">
      {/* Saludo */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
          <LayoutDashboard size={16} className="text-amber-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-white truncate">{greeting}, {userName.split(" ")[0]}</h2>
          <p className="text-xs text-slate-500">{companyName} · {new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
      </div>

      {/* ── KPIs del día ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {(perms.registrarVentas) && (
          <KpiCard icon={<TrendingUp size={16} />} color="emerald" label="Ventas de hoy"
            value={perms.verMetricas ? money(mv.salesTotal) : String(mv.salesCount)}
            sub={perms.verMetricas ? `${mv.salesCount} venta${mv.salesCount === 1 ? "" : "s"}` : "registradas hoy"} />
        )}
        {(perms.registrarCompras) && (
          <KpiCard icon={<TrendingDown size={16} />} color="sky" label="Compras de hoy"
            value={perms.verMetricas ? money(mv.purchasesTotal) : String(mv.purchasesCount)}
            sub={perms.verMetricas ? `${mv.purchasesCount} compra${mv.purchasesCount === 1 ? "" : "s"}` : "registradas hoy"} />
        )}
        {perms.verInventario && perms.verMetricas && (
          <KpiCard icon={<Wallet size={16} />} color="amber" label="Valor de inventario" value={money(inv.value)} sub={`${inv.total} prendas en tienda`} />
        )}
        {perms.verAlmacen && perms.verMetricas && (
          <KpiCard icon={<Warehouse size={16} />} color="blue" label="Valor de almacén" value={money(wh.value)} sub={`${wh.totalUnits} unidades en stock`} />
        )}
      </div>

      {/* ── Alertas ── */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />Alertas
        </h3>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 size={16} />Todo en orden — sin alertas pendientes.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <button key={i} onClick={() => onNavigate(a.nav)}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors text-left ${toneCls[a.tone]}`}>
                <span className="flex items-center gap-2">{a.icon}{a.label}</span>
                <ArrowRight size={14} className="flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Resumen por módulo ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {perms.verInventario && (
          <ModuleCard title="Inventario" icon={<Package size={16} />} onOpen={() => onNavigate("inventory")}>
            <MiniStat label="Prendas" value={inv.total} />
            <MiniStat label="Stock bajo" value={inv.lowStock} color={inv.lowStock > 0 ? "text-amber-400" : undefined} />
            <MiniStat label="Agotadas" value={inv.outStock} color={inv.outStock > 0 ? "text-red-400" : undefined} />
          </ModuleCard>
        )}
        {(perms.registrarVentas || perms.registrarCompras) && (
          <ModuleCard title="Movimientos" icon={<BarChart2 size={16} />} onOpen={() => onNavigate("movements")}>
            <MiniStat label="Ventas hoy" value={mv.salesCount} />
            <MiniStat label="Compras hoy" value={mv.purchasesCount} />
            {perms.verMetricas && <MiniStat label="Ingresos hoy" value={money(mv.salesTotal)} small />}
          </ModuleCard>
        )}
        {perms.verAlmacen && (
          <ModuleCard title="Almacén" icon={<Warehouse size={16} />} onOpen={() => onNavigate("warehouse")}>
            <MiniStat label="Ubicaciones" value={wh.locationsCount} />
            <MiniStat label="Variantes" value={wh.variantsInStock} />
            <MiniStat label="Unidades" value={wh.totalUnits} />
          </ModuleCard>
        )}
        {perms.verProveedores && (
          <ModuleCard title="Proveedores" icon={<Truck size={16} />} onOpen={() => onNavigate("suppliers")}>
            <MiniStat label="Activos" value={sup.active} />
            <MiniStat label="Total" value={sup.total} />
            <MiniStat label="Pendientes" value={sup.pending} color={sup.pending > 0 ? "text-sky-400" : undefined} />
          </ModuleCard>
        )}
      </div>

      {/* ── Ranking de prendas más y menos vendidas ── */}
      {perms.registrarVentas && topProducts.mostList.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <RankList
            title="Más vendidas" icon={<Trophy size={14} />} tone="emerald"
            items={topProducts.mostList} maxQty={topProducts.mostList[0]?.qty || 1}
          />
          {topProducts.leastList.length > 0 && (
            <RankList
              title="Menos vendidas" icon={<ArrowDownCircle size={14} />} tone="slate"
              items={topProducts.leastList} maxQty={topProducts.mostList[0]?.qty || 1}
            />
          )}
        </div>
      )}

      {/* ── Últimos movimientos ── */}
      {(perms.registrarVentas || perms.registrarCompras) && mv.recent.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><ShoppingCart size={14} className="text-amber-400" />Últimos movimientos</h3>
            <button onClick={() => onNavigate("movements")} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">Ver todo<ArrowRight size={12} /></button>
          </div>
          <div className="space-y-1.5">
            {mv.recent.map((t, i) => {
              const isSale = t.type === "venta";
              if (isSale && !perms.registrarVentas) return null;
              if (!isSale && !perms.registrarCompras) return null;
              return (
                <div key={t.id || i} className="flex items-center justify-between gap-3 py-2 px-1 border-b border-slate-700/40 last:border-0 text-xs sm:text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSale ? "bg-emerald-400" : "bg-sky-400"}`} />
                    <span className="text-slate-300 truncate">{t.product}{t.description ? ` · ${t.description}` : ""}</span>
                    <span className="text-slate-600 hidden sm:inline">·</span>
                    <span className="text-slate-500 hidden sm:inline">{isSale ? "Venta" : "Compra"}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {perms.verMetricas && <span className={`font-mono font-semibold ${isSale ? "text-emerald-400" : "text-sky-400"}`}>{money(t.total)}</span>}
                    <span className="text-slate-600 font-mono text-[11px]">{t.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Piezas reutilizables ──────────────────────────────────────────────────────
const COLOR_CLS = {
  emerald: "text-emerald-400 bg-emerald-500/10",
  sky:     "text-sky-400 bg-sky-500/10",
  amber:   "text-amber-400 bg-amber-500/10",
  blue:    "text-blue-400 bg-blue-500/10",
};

function KpiCard({ icon, color, label, value, sub }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 sm:p-4">
      <div className={`inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg mb-2 ${COLOR_CLS[color]}`}>{icon}</div>
      <div className="text-lg sm:text-xl font-bold text-white font-mono truncate">{value}</div>
      <div className="text-[11px] sm:text-xs text-slate-400">{label}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

function ModuleCard({ title, icon, onOpen, children }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-white flex items-center gap-2"><span className="text-amber-400">{icon}</span>{title}</h4>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-2 mb-3">
        {children}
      </div>
      <button onClick={onOpen}
        className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition-colors">
        Ver módulo <ArrowRight size={12} />
      </button>
    </div>
  );
}

function MiniStat({ label, value, color, small }) {
  return (
    <div className="text-center">
      <div className={`font-bold font-mono ${small ? "text-xs" : "text-base"} ${color || "text-slate-200"}`}>{value}</div>
      <div className="text-[10px] text-slate-500 truncate">{label}</div>
    </div>
  );
}

const RANK_TONE = {
  emerald: { icon: "text-emerald-400", bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400" },
  slate:   { icon: "text-slate-400",   bar: "bg-slate-500",   badge: "bg-slate-700 text-slate-300" },
};

// Lista tipo "leaderboard": hasta 7 variantes con una barra proporcional a
// sus unidades vendidas, todas escaladas contra la MISMA referencia
// (maxQty = la variante #1 de "más vendidas"), para que al comparar ambas
// listas lado a lado se note visualmente qué tan chica es la diferencia.
function RankList({ title, icon, tone, items, maxQty }) {
  const t = RANK_TONE[tone];
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span className={t.icon}>{icon}</span>{title}
      </h3>
      <div className="space-y-2.5">
        {items.map((p, i) => (
          <div key={p.name + i} className="flex items-center gap-2.5">
            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${t.badge}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-slate-300 truncate">{p.name}</span>
                <span className="text-xs font-mono font-semibold text-slate-200 flex-shrink-0">{p.qty}</span>
              </div>
              <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(4, (p.qty / maxQty) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
