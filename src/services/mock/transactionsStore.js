// ─────────────────────────────────────────────────────────────────────────────
// src/services/mock/transactionsStore.js
//
// Log de transacciones (companies/{id}/transactions) — reemplazo local de
// services/firestore/transactions.js MIENTRAS no hay backend. A propósito
// guarda cada registro con las mismas claves que ya espera
// components/TransactionHistory.jsx (type, date, product, sku, qty,
// unitPrice, total, client, note, createdBy…) para poder reusar ese
// componente tal cual, sin tocarlo.
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_PREFIX = "invenxio_mock_transactions_";
const INVOICE_COUNTER_PREFIX = "invenxio_mock_invoice_counter_";
const listeners = new Map();

function storageKey(companyId) {
  return `${STORAGE_PREFIX}${companyId}`;
}

function readAll(companyId) {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(companyId, txs) {
  localStorage.setItem(storageKey(companyId), JSON.stringify(txs));
  const subs = listeners.get(companyId);
  if (!subs) return;
  const sorted = [...txs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  subs.forEach(cb => cb(sorted));
}

/** companies/{id}/transactions — mismo contrato que subscribeToCollection. */
export function subscribeToTransactions(companyId, onData) {
  if (!companyId) return () => {};
  if (!listeners.has(companyId)) listeners.set(companyId, new Set());
  listeners.get(companyId).add(onData);
  onData([...readAll(companyId)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  return () => listeners.get(companyId)?.delete(onData);
}

/** Agrega una transacción ya armada (recordGarmentSale en garmentsStore.js construye el payload). */
export function addTransaction(companyId, data) {
  const txs = readAll(companyId);
  const now = new Date().toISOString();
  const tx = { id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...data, createdAt: now };
  writeAll(companyId, [...txs, tx]);
  return tx;
}

/**
 * Correlativo de comprobante local — equivalente mock de
 * getNextInvoiceNumber() en services/firestore/companies.js, que en la
 * versión real vive en companies/{id}.invoiceCounter. Se mantiene aparte
 * del contador de Firestore para no mezclar numeración de ventas de prueba
 * con la numeración real una vez se conecte el backend.
 */
export function getNextInvoiceNumberMock(companyId) {
  const key = `${INVOICE_COUNTER_PREFIX}${companyId}`;
  const next = (parseInt(localStorage.getItem(key), 10) || 0) + 1;
  localStorage.setItem(key, String(next));
  return next;
}
