// ─────────────────────────────────────────────────────────────────────────────
// api/_lib/supabaseAdmin.js
// Cliente de Supabase con la service_role key — SOLO se importa desde
// funciones serverless de /api, nunca desde src/ (código que corre en el
// navegador). Esta key se salta TODA la Row Level Security a propósito: es
// el equivalente exacto a por qué culqi-charge.js usa Firebase Admin SDK en
// vez del SDK normal de Firestore.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

let client = null;

export function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del servidor.");
  }

  client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
