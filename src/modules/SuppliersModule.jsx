// ─────────────────────────────────────────────────────────────────────────────
// src/modules/SuppliersModule.jsx
// Módulo 4 — Proveedores: catálogo de proveedores, compras (entran stock a
// almacén) y devoluciones (salen de almacén, con estado pendiente/confirmado).
// Ya no existe un catálogo de "productos de almacén" separado — las compras
// y devoluciones referencian directo las variantes del Catálogo, igual que
// ya hace el resto de Almacén (ver conversación).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  subscribeToSuppliers, addSupplier, updateSupplier, deleteSupplier,
  subscribeToSupplierPurchases, recordSupplierPurchase,
  subscribeToSupplierReturns, recordSupplierReturn, confirmSupplierReturn, cancelSupplierReturn,
} from "../services/supabase/suppliersStore";
import { getNextInvoiceNumber } from "../services/supabase/companyStore";
import { generateInvoicePDF } from "../utils/generateInvoicePDF";
import { logAndGetErrorMessage } from "../utils/errors";
import { useGarments } from "../hooks/useGarments";
import { useWarehouseData } from "../hooks/useWarehouseData";
import { useSupabaseList } from "../hooks/useSupabaseList";
import SupplierListTab from "../components/suppliers/SupplierListTab";
import SupplierPurchaseTab from "../components/suppliers/SupplierPurchaseTab";
import SupplierReturnTab from "../components/suppliers/SupplierReturnTab";
import SupplierDetailModal from "../components/suppliers/SupplierDetailModal";
import SupplierFormModal from "../components/suppliers/SupplierFormModal";
import { useAuth } from "../contexts/AuthContext";

const EMPTY_SUPPLIER = { name: "", ruc: "", category: "Telas", contact: "", phone: "", address: "", status: "Activo" };
const EMPTY_PURCHASE = { supplierId: "", variant: null, locationId: "", qty: "", unitCost: "", note: "" };
const EMPTY_RETURN   = { supplierId: "", variant: null, locationId: "", qty: "", unitPrice: "", note: "" };

const SuppliersModule = ({ companyId, userName, canManageSuppliers, canDelete, canViewFinance, billing }) => {
  const { companyCurrency } = useAuth();
  const currencySymbol = companyCurrency.currencySymbol;

  const [garments] = useGarments(companyId);
  const { locations } = useWarehouseData(companyId);
  const [suppliers, loadingSup] = useSupabaseList(subscribeToSuppliers, companyId);
  const [purchases] = useSupabaseList(subscribeToSupplierPurchases, companyId);
  const [returns]   = useSupabaseList(subscribeToSupplierReturns, companyId);

  const [tab, setTab] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selSupplier, setSelSupplier] = useState(null);

  const [pForm, setPForm] = useState(EMPTY_PURCHASE);
  const [pSaving, setPSaving] = useState(false);
  const [pSuccess, setPSuccess] = useState(false);
  const [pError, setPError] = useState("");
  const [pMsg, setPMsg] = useState("");

  const [rForm, setRForm] = useState(EMPTY_RETURN);
  const [rSaving, setRSaving] = useState(false);
  const [rSuccess, setRSuccess] = useState(false);
  const [rError, setRError] = useState("");

  function openNew() { setEditSupplier(null); setForm(EMPTY_SUPPLIER); setSaveError(""); setShowForm(true); }
  function openEdit(s) { setEditSupplier(s); setForm({ ...s }); setSaveError(""); setShowForm(true); }

  async function handleSaveSupplier() {
    if (!form.name || !form.contact) { setSaveError("Nombre y contacto son obligatorios."); return; }
    setSaving(true); setSaveError("");
    try {
      if (editSupplier) await updateSupplier(companyId, editSupplier.id, form);
      else await addSupplier(companyId, form);
      setShowForm(false);
    } catch (err) {
      setSaveError(logAndGetErrorMessage(err, "Error al guardar proveedor:"));
    }
    setSaving(false);
  }

  async function handleToggleStatus(s) {
    try { await updateSupplier(companyId, s.id, { status: s.status === "Activo" ? "Inactivo" : "Activo" }); }
    catch (err) { alert(logAndGetErrorMessage(err, "Error al cambiar estado:")); }
  }

  async function handleDeleteSupplier(s) {
    if (!window.confirm(`¿Eliminar a "${s.name}"? Esta acción no se puede deshacer.`)) return;
    try { await deleteSupplier(companyId, s.id); }
    catch (err) { alert(logAndGetErrorMessage(err, "Error al eliminar proveedor:")); }
  }

  async function emitInvoice({ partyName, items, total, note }) {
    if (!billing?.razonSocial) return;
    try {
      const invoiceNumber = await getNextInvoiceNumber(companyId);
      generateInvoicePDF({ billing, docType: "PROVEEDOR", partyLabel: "Proveedor", partyName, items, total, note: note || "", invoiceNumber, currencySymbol });
    } catch (err) {
      console.error("Error generando comprobante:", err);
    }
  }

  async function handlePurchaseSubmit() {
    setPError(""); setPMsg("");
    const { supplierId, variant, locationId, qty, unitCost, note } = pForm;
    if (!supplierId || !variant || !locationId || !qty || !unitCost) { setPError("Completa todos los campos obligatorios."); return; }
    setPSaving(true);
    try {
      const supplier = suppliers.find(s => s.id === supplierId);
      const location = locations.find(l => l.id === locationId);
      const n = Number(qty), cost = Number(unitCost);
      await recordSupplierPurchase(companyId, {
        supplierId, supplierName: supplier?.name || "",
        variantSku: variant.variantSku, garmentId: variant.garmentId, garmentName: variant.name,
        talla: variant.talla, color: variant.color,
        locationId, locationName: location?.name || "",
        qty: n, unitCost: cost, note, userName,
      });
      setPSuccess(true);
      await emitInvoice({ partyName: supplier?.name, items: [{ name: variant.name, description: `Talla ${variant.talla}`, qty: n, unitPrice: cost, total: n * cost }], total: n * cost, note });
      setTimeout(() => { setPSuccess(false); setPForm(EMPTY_PURCHASE); }, 3000);
    } catch (err) {
      setPError(logAndGetErrorMessage(err, "Error al registrar compra:"));
    }
    setPSaving(false);
  }

  async function handleReturnSubmit() {
    setRError("");
    const { supplierId, variant, locationId, qty, unitPrice, note } = rForm;
    if (!supplierId || !variant || !locationId || !qty || !unitPrice) { setRError("Completa todos los campos obligatorios."); return; }
    setRSaving(true);
    try {
      const supplier = suppliers.find(s => s.id === supplierId);
      const location = locations.find(l => l.id === locationId);
      await recordSupplierReturn(companyId, {
        supplierId, supplierName: supplier?.name || "",
        variantSku: variant.variantSku, garmentId: variant.garmentId, garmentName: variant.name,
        talla: variant.talla, color: variant.color,
        locationId, locationName: location?.name || "",
        qty: Number(qty), unitPrice: Number(unitPrice), note, userName,
      });
      setRSuccess(true);
      setTimeout(() => { setRSuccess(false); setRForm(EMPTY_RETURN); }, 3000);
    } catch (err) {
      setRError(logAndGetErrorMessage(err, "Error al registrar devolución:"));
    }
    setRSaving(false);
  }

  async function handleConfirmReturn(r) {
    try { await confirmSupplierReturn(companyId, r.id); }
    catch (err) { alert(logAndGetErrorMessage(err, "Error al confirmar devolución:")); }
  }
  async function handleCancelReturn(r) {
    if (!window.confirm("¿Cancelar esta devolución pendiente?")) return;
    try { await cancelSupplierReturn(companyId, r.id); }
    catch (err) { alert(logAndGetErrorMessage(err, "Error al cancelar devolución:")); }
  }

  const TABS = [
    { id: "list", label: "📋 Proveedores" },
    { id: "purchase", label: "📥 Compra" },
    { id: "return", label: "📤 Devolución" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Proveedores</h2>
          <p className="text-sm text-slate-400">{suppliers.length} registrados</p>
        </div>
        {canManageSuppliers && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-sm rounded-xl transition-colors">
            <Plus size={16} /> Nuevo Proveedor
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-amber-500 text-slate-900" : "text-slate-400 hover:text-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <SupplierListTab suppliers={suppliers} loading={loadingSup} canManage={canManageSuppliers} canDelete={canDelete}
          onSelect={setSelSupplier} onToggleStatus={handleToggleStatus} onEdit={openEdit} onDelete={handleDeleteSupplier} />
      )}
      {tab === "purchase" && (
        <SupplierPurchaseTab suppliers={suppliers} garments={garments} locations={locations}
          form={pForm} setForm={setPForm} saving={pSaving} success={pSuccess} error={pError} msg={pMsg}
          onSubmit={handlePurchaseSubmit} currencySymbol={currencySymbol} purchases={purchases} />
      )}
      {tab === "return" && (
        <SupplierReturnTab suppliers={suppliers} garments={garments} locations={locations}
          form={rForm} setForm={setRForm} saving={rSaving} success={rSuccess} error={rError}
          onSubmit={handleReturnSubmit} currencySymbol={currencySymbol} returns={returns}
          canManage={canManageSuppliers} onConfirm={handleConfirmReturn} onCancel={handleCancelReturn} />
      )}

      <SupplierDetailModal supplier={selSupplier} onClose={() => setSelSupplier(null)}
        purchases={purchases} returns={returns} currencySymbol={currencySymbol} canViewFinance={canViewFinance} />

      <SupplierFormModal show={showForm} onClose={() => setShowForm(false)} editSupplier={editSupplier}
        form={form} setForm={setForm} saveError={saveError} saving={saving} onSave={handleSaveSupplier} />
    </div>
  );
};

export default SuppliersModule;
