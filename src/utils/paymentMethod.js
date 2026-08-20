// src/utils/paymentMethod.js
// Centraliza cómo se ve cada método de pago (efectivo / transferencia /
// yape) en el Historial, la exportación a Excel y el comprobante PDF — un
// solo lugar para agregar un método nuevo el día de mañana.
export const PAYMENT_METHODS_DISPLAY = {
  efectivo:     { label: "Efectivo",     short: "💵 Efectivo",  badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  transferencia:{ label: "Transferencia",short: "🏦 Transf.",   badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  yape:         { label: "Yape",         short: "📲 Yape",      badgeClass: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
};

export function getPaymentMethodDisplay(method) {
  return PAYMENT_METHODS_DISPLAY[method] || null;
}
