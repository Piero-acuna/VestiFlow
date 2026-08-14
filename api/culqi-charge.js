// ─────────────────────────────────────────────────────────────────────────────
// api/culqi-charge.js
// Función serverless de Vercel — POST /api/culqi-charge.
//
// ESTE ES EL ÚNICO LUGAR DE TODO EL PROYECTO QUE PUEDE MARCAR UNA EMPRESA
// COMO "PAGADA". Corre en el servidor, nunca en el navegador, por dos
// razones:
//  1. Necesita la CULQI_SECRET_KEY para cobrar de verdad.
//  2. Escribe en `subscriptions`, que las políticas de RLS bloquean para
//     cualquier usuario autenticado normal (ver supabase/schema.sql) — solo
//     la service_role key puede escribir ahí, y esa key SOLO vive acá.
//
// VARIABLES DE ENTORNO (Vercel → Settings → Environment Variables):
//   CULQI_SECRET_KEY            → Llave Secreta de Culqi (sk_live_… o sk_test_…)
//   VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY → ver api/_lib/supabaseAdmin.js
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { verifyOwner } from "./_lib/verifyOwner.js";

const PLAN_AMOUNT_CENTS = 5499; // S/ 54.99 — debe coincidir con PLAN_AMOUNT_CENTS de PaywallScreen.jsx
const PLAN_DAYS = 30;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("culqi-charge config error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    // 1. Verificar identidad — el companyId sale del propio token, nunca
    //    del body, así nadie puede pagar la suscripción de otra empresa.
    const { user, profile } = await verifyOwner(req, admin);
    const companyId = profile.company_id;

    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: "Faltan datos del pago." });

    // 2. Cobrar de verdad con Culqi, usando la llave SECRETA (server-side).
    const culqiRes = await fetch("https://api.culqi.com/v2/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}` },
      body: JSON.stringify({
        amount: PLAN_AMOUNT_CENTS,
        currency_code: "PEN",
        email: user.email || "sin-email@invenxio.app",
        source_id: token,
        description: "Suscripción mensual VestiFlow",
        metadata: { companyId },
      }),
    });
    const charge = await culqiRes.json();

    if (!culqiRes.ok) {
      return res.status(402).json({ ok: false, error: charge.user_message || charge.merchant_message || "El cobro fue rechazado." });
    }

    // 3. Cobro confirmado → recién ACÁ se marca la empresa como pagada.
    const paidUntil = new Date(Date.now() + PLAN_DAYS * 24 * 60 * 60 * 1000);
    const { error: subErr } = await admin.from("subscriptions").update({
      status: "active", plan: "monthly",
      paid_until: paidUntil.toISOString(),
      last_charge_id: String(charge.id),
      updated_at: new Date().toISOString(),
    }).eq("company_id", companyId);
    if (subErr) throw subErr;

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ ok: false, error: err.message });
    console.error("culqi-charge error:", err);
    return res.status(500).json({ ok: false, error: "Error interno al procesar el pago. Si tu tarjeta fue cargada, contáctanos." });
  }
}
