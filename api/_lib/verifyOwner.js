// ─────────────────────────────────────────────────────────────────────────────
// api/_lib/verifyOwner.js
// Repite la misma verificación que necesitan culqi-charge.js,
// mercadopago-preference.js e invite-employee.js: "¿este token de sesión es
// de verdad el Dueño de una empresa, y de cuál?". Nunca se confía en un
// companyId que venga del body — siempre se deriva del propio token.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @returns {Promise<{ user: object, profile: { company_id: string, role: string, active: boolean } }>}
 * @throws {{ status: number, message: string }}
 */
export async function verifyOwner(req, admin) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) throw { status: 401, message: "Falta autenticación." };

  const { data: { user }, error: tokenError } = await admin.auth.getUser(token);
  if (tokenError || !user) throw { status: 401, message: "Sesión inválida o expirada." };

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("company_id, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) throw { status: 403, message: "No se encontró tu perfil." };
  if (profile.role !== "owner" || profile.active === false) {
    throw { status: 403, message: "Solo el Dueño de la empresa puede hacer esto." };
  }

  return { user, profile };
}
