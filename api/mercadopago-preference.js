// ─────────────────────────────────────────────────────────────────────────────
// api/mercadopago-preference.js
// Función serverless de Vercel — POST /api/mercadopago-preference.
//
// Crea una "preferencia" de pago de Mercado Pago Checkout Pro y devuelve la
// URL (`init_point`) a la que se redirige al Dueño para pagar. Este
// endpoint NO marca ninguna empresa como pagada — eso solo pasa en
// api/mercadopago-webhook.js, cuando Mercado Pago confirma el pago.
//
// VARIABLES DE ENTORNO (Vercel → Settings → Environment Variables):
//   MP_ACCESS_TOKEN             → Access Token de tu cuenta Mercado Pago
//   VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY → ver api/_lib/supabaseAdmin.js
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { verifyOwner } from "./_lib/verifyOwner.js";

const PLAN_AMOUNT_USD = 14.99; // $ 14.99 — debe coincidir con PLAN_AMOUNT_USD de PaywallScreen.jsx

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido" });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("mercadopago-preference config error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    const { user, profile } = await verifyOwner(req, admin);
    const companyId = profile.company_id;

    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ ok: false, error: "MP_ACCESS_TOKEN no está configurada en el servidor." });
    }

    const { returnUrl } = req.body || {};
    let backUrl;
    try {
      backUrl = new URL(returnUrl).toString();
    } catch {
      backUrl = `${req.headers.origin || ""}/`;
    }

    // El monto y la moneda los define el servidor, nunca el cliente.
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      body: JSON.stringify({
        items: [{ title: "Suscripción mensual VestiFlow", quantity: 1, currency_id: "USD", unit_price: PLAN_AMOUNT_USD }],
        payer: { email: user.email || undefined },
        external_reference: companyId,
        back_urls: { success: backUrl, failure: backUrl, pending: backUrl },
        auto_return: "approved",
        notification_url: `${req.headers.origin || ""}/api/mercadopago-webhook`,
        metadata: { companyId },
      }),
    });
    const preference = await mpRes.json();

    if (!mpRes.ok) {
      return res.status(502).json({ ok: false, error: preference.message || "No se pudo crear la preferencia de pago." });
    }

    return res.status(200).json({ ok: true, initPoint: preference.init_point });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ ok: false, error: err.message });
    console.error("mercadopago-preference error:", err);
    return res.status(500).json({ ok: false, error: "Error interno al iniciar el pago." });
  }
}
