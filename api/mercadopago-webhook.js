// ─────────────────────────────────────────────────────────────────────────────
// api/mercadopago-webhook.js
// Función serverless de Vercel: POST /api/mercadopago-webhook
//
// Mercado Pago llama a esta URL sola (nunca el navegador del usuario), pero
// AUN ASÍ no confiamos en el contenido de la notificación tal cual llega:
// apenas llega, usamos el ID de pago que trae para volver a preguntarle a
// la propia API de Mercado Pago cuál es el estado REAL de ese pago — solo
// si dice "approved" se marca la empresa como pagada.
//
// IDEMPOTENCIA: Mercado Pago puede reintentar la misma notificación varias
// veces (o el mismo pago puede generar más de un evento). Antes de aplicar
// el pago, se compara `payment.id` contra `subscriptions.last_charge_id` —
// si ya es el mismo, no se vuelve a sumar 30 días de suscripción. (Este es
// el bug que había quedado anotado en el análisis inicial del código: la
// versión Firestore original no tenía esta protección.)
//
// VARIABLES DE ENTORNO (Vercel → Settings → Environment Variables):
//   MP_ACCESS_TOKEN             → mismo Access Token que mercadopago-preference.js
//   VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY → ver api/_lib/supabaseAdmin.js
//
// Configuración en Mercado Pago: Tus integraciones → tu app → Webhooks →
// URL de producción → https://TU-DOMINIO.vercel.app/api/mercadopago-webhook
// → eventos "Pagos".
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";

const PLAN_DAYS = 30;

export default async function handler(req, res) {
  // Mercado Pago también manda pings GET al configurar el webhook —
  // respondemos 200 sin hacer nada para que la validación de la URL pase.
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  try {
    const body = req.body || {};
    const query = req.query || {};
    const topic = query.topic || query.type || body.type;
    const paymentId = query["data.id"] || body?.data?.id || (topic === "payment" ? query.id : null);

    if (topic !== "payment" || !paymentId) {
      return res.status(200).json({ ok: true });
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN no está configurada.");
      return res.status(500).json({ ok: false });
    }

    // 1. Volver a preguntarle a Mercado Pago el estado REAL de este pago.
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    const payment = await mpRes.json();

    if (!mpRes.ok) {
      console.error("mercadopago-webhook: no se pudo leer el pago", payment);
      return res.status(200).json({ ok: false });
    }
    if (payment.status !== "approved") {
      return res.status(200).json({ ok: true });
    }

    const companyId = payment.external_reference || payment.metadata?.company_id || payment.metadata?.companyId;
    if (!companyId) {
      console.error("mercadopago-webhook: pago aprobado sin companyId en external_reference", paymentId);
      return res.status(200).json({ ok: false });
    }

    const admin = getSupabaseAdmin();
    const chargeId = String(payment.id);

    // 2. Idempotencia: si este pago ya fue aplicado antes, no sumar otros
    //    30 días de más por un reintento de la notificación.
    const { data: existing, error: readErr } = await admin
      .from("subscriptions").select("last_charge_id").eq("company_id", companyId).maybeSingle();
    if (readErr) throw readErr;
    if (existing?.last_charge_id === chargeId) {
      return res.status(200).json({ ok: true, note: "Ya procesado." });
    }

    // 3. Pago confirmado y nuevo → recién ACÁ se marca la empresa como pagada.
    const paidUntil = new Date(Date.now() + PLAN_DAYS * 24 * 60 * 60 * 1000);
    const { error: subErr } = await admin.from("subscriptions").update({
      status: "active", plan: "monthly",
      paid_until: paidUntil.toISOString(),
      last_charge_id: chargeId,
      updated_at: new Date().toISOString(),
    }).eq("company_id", companyId);
    if (subErr) throw subErr;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("mercadopago-webhook error:", err);
    // 200 igual: si devolvemos error, Mercado Pago reintenta indefinidamente
    // notificaciones que probablemente van a seguir fallando por lo mismo.
    return res.status(200).json({ ok: false });
  }
}
