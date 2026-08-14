// ─────────────────────────────────────────────────────────────────────────────
// api/grant-access.js
// Endpoint administrativo para conceder días de cortesía a una empresa.
// Protegido por un secreto compartido (ADMIN_SECRET) — no requiere sesión
// de usuario porque lo usas tú mismo, a mano, no la app.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método no permitido." });
  }

  const authHeader = req.headers.authorization || "";
  const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!process.env.ADMIN_SECRET) {
    console.error("ADMIN_SECRET no está configurada.");
    return res.status(500).json({ ok: false, error: "ADMIN_SECRET no está configurada en Vercel." });
  }
  if (providedSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: "No autorizado." });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("grant-access config error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: "El cuerpo enviado no contiene un JSON válido." }); }
    }

    const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
    const dias = Number(body?.dias);

    if (!companyId) return res.status(400).json({ ok: false, error: "companyId es obligatorio." });
    if (!Number.isInteger(dias) || dias <= 0) return res.status(400).json({ ok: false, error: "dias debe ser un número entero positivo." });

    const { data: existing, error: readErr } = await admin
      .from("subscriptions").select("company_id").eq("company_id", companyId).maybeSingle();
    if (readErr) throw readErr;
    if (!existing) return res.status(404).json({ ok: false, error: `No existe una suscripción para la empresa ${companyId}.` });

    const paidUntil = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
    const { error: updErr } = await admin.from("subscriptions").update({
      status: "active", plan: "cortesia",
      paid_until: paidUntil.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("company_id", companyId);
    if (updErr) throw updErr;

    return res.status(200).json({ ok: true, companyId, dias, paidUntil: paidUntil.toISOString() });
  } catch (err) {
    console.error("grant-access error:", err);
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Error interno al otorgar el acceso." });
  }
}
