// ─────────────────────────────────────────────────────────────────────────────
// src/lib/supabaseClient.js
// Cliente único de Supabase — el equivalente a src/firebase/config.js. Se
// importa una sola vez y se reusa en toda la app (AuthContext, los stores
// de datos, etc). Las credenciales vienen de variables VITE_* porque, igual
// que las de Firebase, terminan expuestas en el bundle del navegador — eso
// es seguro acá porque la anon key SOLO puede hacer lo que las políticas de
// RLS le permiten (ver supabase/schema.sql). La service_role key (la que
// SÍ puede saltarse RLS) nunca debe tener el prefijo VITE_ ni usarse desde
// el cliente — solo la usan las funciones serverless de /api (ver
// api/culqi-charge.js, api/mercadopago-webhook.js).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env.local. " +
    "Ver supabase/SETUP.md para obtenerlas de tu proyecto de Supabase."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
