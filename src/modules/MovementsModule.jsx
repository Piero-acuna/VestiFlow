// ─────────────────────────────────────────────────────────────────────────────
// src/modules/MovementsModule.jsx
// Módulo 2 — Movimientos: punto de venta (POS) con carrito a nivel de
// VARIANTE (cada talla+color es su propia línea vendible), escaneo de SKU,
// emisión de comprobante PDF, e Historial general.
//
// Fuente de datos: garmentsStore + transactionsStore (mock, ver conversación
// — el Almacén y Proveedores todavía no se migraron, así que esas dos
// fuentes del Historial general siguen vacías hasta la siguiente pasada).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Search, Plus, ShoppingCart, Package, AlertTriangle, CheckCircle,
  Minus, Trash2, Zap, Clock, BookOpen, Loader2, ScanBarcode,
} from "lucide-react";
import { recordGarmentSale } from "../services/supabase/garmentsStore";
import { getNextInvoiceNumber } from "../services/supabase/companyStore";
import { generateInvoicePDF } from "../utils/generateInvoicePDF";
import { logAndGetErrorMessage } from "../utils/errors";
import { useGarments } from "../hooks/useGarments";
import { useTransactions } from "../hooks/useTransactions";
import { useSupabaseList } from "../hooks/useSupabaseList";
import { subscribeToSupplierReturns } from "../services/supabase/suppliersStore";
import { useWarehouseData } from "../hooks/useWarehouseData";
import { Spinner } from "../components/shared/StatusUI";
import TransactionHistory from "../components/TransactionHistory";
import { BarcodeScanner } from "../components/BarcodeUI";
import ColorSwatch from "../components/inventory/ColorSwatch";
import { useAuth } from "../contexts/AuthContext";
import { formatMoney } from "../utils/currency";
import { getColorConfig } from "../config/clothingConfig";
import { flattenSellableVariants } from "../utils/variants";

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — MOVEMENTS
// ══════════════════════════════════════════════════════════════════════════════
const MovementsModule = ({ companyId, userName, canPurchase, canSell, canViewFinance, billing }) => {
  const { companyCurrency } = useAuth();
  const currencySymbol = companyCurrency.currencySymbol;
  const [garments,     loadingG] = useGarments(companyId);
  const [transactions, loadingT] = useTransactions(companyId);
  const [supplierReturns] = useSupabaseList(subscribeToSupplierReturns, companyId);
  const { movements: warehouseMovements } = useWarehouseData(companyId);

  // TransactionHistory espera la forma vieja de "supplierSales" (product,
  // sku, packName…) — se traduce acá en vez de tocar ese componente
  // compartido, que ya sirve bien para Inventario/Almacén tal cual está.
  const supplierSales = useMemo(() => supplierReturns.map(r => ({
    id: r.id, date: r.date, time: r.time,
    product: r.garmentName, sku: r.variantSku,
    description: `Talla ${r.talla} · ${r.color}`,
    qty: r.qty, packName: "", total: r.total,
    supplier: r.supplierName, status: r.status, note: r.note,
  })), [supplierReturns]);

  const sellable = useMemo(() => flattenSellableVariants(garments), [garments]);

  const innerTabs = [
    canSell     && { id: "sale",     label: "🛒 Registrar Venta" },
    (canPurchase || canSell) && { id: "history", label: "📋 Historial" },
  ].filter(Boolean);
  const [mvTab, setMvTab] = useState(innerTabs[0]?.id || "history");
  useEffect(() => {
    if (innerTabs.length && !innerTabs.some(t => t.id === mvTab)) setMvTab(innerTabs[0].id);
  }, [canPurchase, canSell]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SALE / POS ─────────────────────────────────────────────────────────────
  const [sSearch,      setSSearch]      = useState("");
  const [cart,         setCart]         = useState([]);
  const [sSaving,      setSSaving]      = useState(false);
  const [sSuccess,     setSSuccess]     = useState(false);
  const [clientName,   setClientName]   = useState("");
  const [invoiceMsg,   setInvoiceMsg]   = useState("");
  const [saleError,    setSaleError]    = useState("");
  const [showScanner,  setShowScanner]  = useState(false);
  const [scanFeedback, setScanFeedback] = useState(""); // mensaje tras escanear

  const recentItems = useMemo(() => sellable.slice(0, 6), [sellable]);
  const q = sSearch.toLowerCase();
  const sFiltered = sSearch ? sellable.filter(i =>
    i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q) ||
    i.talla?.toLowerCase().includes(q) || getColorConfig(i.color).label.toLowerCase().includes(q)
  ) : [];
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const addToCart = useCallback((item) => {
    setSSearch("");
    setCart(prev => {
      const ex = prev.find(i => i.id === item.id);
      return ex
        ? prev.map(i => i.id === item.id ? { ...i, qty: Math.min(i.qty + 1, item.stock) } : i)
        : [...prev, { ...item, qty: 1 }];
    });
  }, []);

  const handleBarcodeScan = useCallback((code) => {
    setShowScanner(false);
    const found = sellable.find(i => i.sku === code);
    if (found) {
      addToCart(found);
      setScanFeedback(`✅ "${found.name}" (talla ${found.talla}) agregado al carrito`);
    } else {
      setScanFeedback(`❌ No se encontró ninguna variante con código: ${code}`);
    }
    setTimeout(() => setScanFeedback(""), 3500);
  }, [sellable, addToCart]);

  const handleSale = async () => {
    if (cart.length === 0) return;
    setSSaving(true);
    setInvoiceMsg("");
    setSaleError("");
    try {
      await recordGarmentSale(companyId, { cartItems: cart, userName, clientName: clientName.trim() || "Cliente" });
      setSSuccess(true);

      // ── Emitir comprobante de venta en PDF (sin terceros) ──
      if (!billing?.razonSocial) {
        setInvoiceMsg("Venta guardada, pero no se generó comprobante: completa tus Datos de Facturación en el Panel.");
      } else {
        try {
          const invoiceNumber = await getNextInvoiceNumber(companyId);
          generateInvoicePDF({
            billing,
            docType: "VENTA",
            partyLabel: "Cliente",
            partyName: clientName.trim() || "Cliente varios",
            items: cart.map(i => ({
              name: i.name,
              description: `Talla ${i.talla} · ${getColorConfig(i.color).label}`,
              qty: i.qty, unitPrice: i.price, total: i.price * i.qty,
            })),
            total: cartTotal,
            currencySymbol,
            invoiceNumber,
          });
        } catch (invErr) {
          console.error("Error generando comprobante:", invErr);
          setInvoiceMsg("Venta guardada, pero hubo un error al generar el comprobante PDF.");
        }
      }

      setTimeout(() => { setSSuccess(false); setCart([]); setClientName(""); setInvoiceMsg(""); }, 3500);
    } catch (err) {
      setSaleError(logAndGetErrorMessage(err, "Error al registrar la venta:", "No se pudo registrar la venta. Intenta de nuevo."));
    }
    setSSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* Tabs internos */}
      <div className="flex flex-wrap gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50 w-full sm:w-fit">
        {innerTabs.map(t => (
          <button key={t.id} onClick={() => setMvTab(t.id)}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${mvTab === t.id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SALE / POS ── */}
      {mvTab === "sale" && (
        <div className="grid md:grid-cols-5 gap-5">
          <div className="md:col-span-3 space-y-4">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2"><Search size={16} className="text-amber-400" />Buscar Prenda</h3>
                <button onClick={() => setShowScanner(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-lg text-xs font-semibold transition-colors">
                  <ScanBarcode size={14} /> Escanear
                </button>
              </div>

              {scanFeedback && (
                <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium border ${scanFeedback.startsWith("✅") ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                  {scanFeedback}
                </div>
              )}

              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={sSearch} onChange={e => setSSearch(e.target.value)} placeholder="Nombre, SKU, talla o color…"
                  className="w-full pl-9 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
              </div>

              {sSearch ? (
                <div className="mt-3 space-y-2">
                  {sFiltered.length === 0 && <p className="text-slate-500 text-sm text-center py-4">Sin resultados</p>}
                  {sFiltered.slice(0, 8).map(item => (
                    <button key={item.id} onClick={() => addToCart(item)}
                      className="w-full text-left p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 hover:border-amber-500/40 rounded-xl transition-all flex items-center gap-3 group">
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-600 flex items-center justify-center flex-shrink-0">
                        {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <Package size={15} className="text-slate-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 group-hover:text-amber-400 transition-colors truncate">{item.name}</p>
                        <p className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                          <ColorSwatch colorId={item.color} size={9} />{item.talla} · {getColorConfig(item.color).label} · Stock: {item.stock}
                        </p>
                      </div>
                      <p className="text-sm font-bold font-mono text-amber-400 mr-2">{formatMoney(item.price, currencySymbol)}</p>
                      <Plus size={16} className="text-slate-500 group-hover:text-amber-400 flex-shrink-0 transition-colors" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Clock size={11} className="text-amber-400" />Variantes disponibles — toca para agregar
                  </p>
                  {loadingG ? <Spinner /> : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {recentItems.map(item => (
                        <button key={item.id} onClick={() => addToCart(item)}
                          className="p-3 bg-slate-700/40 hover:bg-slate-700 border border-slate-600/40 hover:border-amber-500/40 rounded-xl transition-all text-left group">
                          <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-600 mb-2">
                            {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : (
                              <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-slate-400" /></div>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-slate-200 leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors">{item.name}</p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5"><ColorSwatch colorId={item.color} size={9} />{item.talla} · {getColorConfig(item.color).label}</p>
                          <p className="text-xs font-bold font-mono text-amber-400 mt-1.5">{formatMoney(item.price, currencySymbol)}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-slate-500 font-mono">x{item.stock}</span>
                            <Plus size={12} className="text-slate-500 group-hover:text-amber-400 transition-colors" />
                          </div>
                        </button>
                      ))}
                      {recentItems.length === 0 && (
                        <p className="col-span-full text-slate-500 text-sm text-center py-6">No hay variantes con stock. Agrega prendas en Inventario.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div className="md:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 flex flex-col">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <ShoppingCart size={16} className="text-amber-400" />Lista de Venta
              {cart.length > 0 && <span className="ml-auto text-xs bg-amber-500 text-slate-900 font-bold px-2 py-0.5 rounded-full">{cart.length}</span>}
            </h3>
            <div className="flex-1 space-y-2 overflow-y-auto max-h-72">
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-8 text-slate-600">
                  <ShoppingCart size={28} className="mb-2 opacity-30" />
                  <p className="text-xs text-center">Busca, toca o escanea una prenda</p>
                </div>
              )}
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2.5 bg-slate-700/50 rounded-lg border border-slate-600/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500 font-mono flex items-center gap-1"><ColorSwatch colorId={item.color} size={8} />{item.talla} · {getColorConfig(item.color).label}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i))} className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded flex items-center justify-center transition-colors"><Minus size={10} className="text-slate-300" /></button>
                    <span className="text-sm font-mono font-bold text-white w-5 text-center">{item.qty}</span>
                    <button onClick={() => setCart(prev => prev.map(i => i.id === item.id && i.qty < i.stock ? { ...i, qty: i.qty + 1 } : i))} className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded flex items-center justify-center transition-colors"><Plus size={10} className="text-slate-300" /></button>
                    <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} className="w-6 h-6 text-red-500 hover:bg-red-500/20 rounded flex items-center justify-center transition-colors ml-1"><Trash2 size={10} /></button>
                  </div>
                  <span className="text-xs font-mono text-amber-400 w-16 text-right flex-shrink-0">{formatMoney((item.price || 0) * item.qty, currencySymbol)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="mb-3">
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">Cliente (opcional)</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Cliente varios"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors" />
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-slate-400 text-sm">Total</span>
                <span className="text-2xl font-bold font-mono text-amber-400">{formatMoney(cartTotal, currencySymbol)}</span>
              </div>
              {sSuccess ? (
                <div className="space-y-2">
                  <div className="py-3 px-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center text-emerald-400 font-semibold flex items-center justify-center gap-2"><CheckCircle size={16} />¡Venta guardada!</div>
                  {invoiceMsg && (
                    <div className="py-2 px-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />{invoiceMsg}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {saleError && (
                    <div className="py-2 px-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-start gap-2">
                      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />{saleError}
                    </div>
                  )}
                  <button onClick={handleSale} disabled={cart.length === 0 || sSaving}
                    className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                    {sSaving && <Loader2 size={16} className="animate-spin" />}<Zap size={16} />Confirmar Venta y Emitir Comprobante
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {mvTab === "history" && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
            <BookOpen size={16} className="text-amber-400" />Historial General
            <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full font-mono">Inventario · Almacén · Proveedores</span>
          </h3>
          <TransactionHistory transactions={transactions} warehouseMovements={warehouseMovements} supplierSales={supplierSales} loading={loadingT} canViewFinance={canViewFinance} canPurchase={canPurchase} canSell={canSell} billing={billing} companyId={companyId} />
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
};

export default MovementsModule;
