// ─────────────────────────────────────────────────────────────────────────────
// api/invite-employee.js
// Función serverless de Vercel — POST /api/invite-employee.
//
// Por qué esto no puede vivir en el navegador: crear un usuario de Supabase
// Auth "en nombre de otra empresa" requiere la service_role key (que se
// salta RLS), la misma razón por la que culqi-charge.js usa Firebase Admin
// SDK en vez del SDK normal. Además, a diferencia de Firebase (que permitía
// una app secundaria de Auth para no afectar la sesión del Dueño), con
// Supabase la única forma limpia de crear un usuario sin tocar la sesión de
// quien hace el pedido es que lo haga el servidor.
//
// Flujo:
//   1. El Dueño manda su access_token (sesión actual) + los datos del nuevo
//      empleado.
//   2. Este endpoint verifica ese token con la service_role key y confirma
//      que la cuenta es de verdad `role = 'owner'` de una empresa.
//   3. Crea el usuario con auth.admin.createUser(), incluyendo company_id +
//      permisos en `user_metadata` — el trigger handle_new_user() (ver
//      supabase/schema.sql) se encarga de crear su fila en `profiles`.
//
// VARIABLES DE ENTORNO QUE NECESITA (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL           → la misma URL que usa el cliente
//   SUPABASE_SERVICE_ROLE_KEY   → Project Settings → API → service_role (secreta)
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido." });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error("invite-employee config error:", err);
    return res.status(500).json({ error: err.message });
  }

  // 1. Verificar quién llama
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Falta el token de sesión." });

  const { data: { user: caller }, error: tokenError } = await admin.auth.getUser(token);
  if (tokenError || !caller) {
    return res.status(401).json({ error: "Sesión inválida o expirada." });
  }

  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role, company_id, active")
    .eq("id", caller.id)
    .maybeSingle();

  if (profileError || !callerProfile) {
    return res.status(403).json({ error: "No se encontró tu perfil." });
  }
  if (callerProfile.role !== "owner" || callerProfile.active === false) {
    return res.status(403).json({ error: "Solo el Dueño puede registrar empleados." });
  }

  // 2. Validar body
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "JSON inválido." }); }
  }
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const permissions = typeof body?.permissions === "object" && body.permissions ? body.permissions : {};

  if (!email || !name) return res.status(400).json({ error: "Nombre y correo son obligatorios." });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });

  // 3. Crear la cuenta — el trigger handle_new_user() crea el perfil solo,
  //    apuntando a la empresa del Dueño que llamó a este endpoint (nunca a
  //    una empresa elegida por el cliente, para que nadie pueda registrarse
  //    a sí mismo en una empresa ajena mandando otro company_id).
  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      company_id: callerProfile.company_id,
      name,
      role: "empleado",
      permissions,
    },
  });

  if (createError) {
    const msg = createError.message?.includes("already been registered")
      ? "Ese correo ya está registrado."
      : createError.message || "No se pudo crear la cuenta del empleado.";
    return res.status(400).json({ error: msg });
  }

  return res.status(200).json({ ok: true, userId: data.user.id });
}
