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

/**
 * Crea un canal de Realtime con un nombre SIEMPRE único. Supabase reutiliza
 * el canal ya existente si dos llamadas usan el mismo nombre — así que si
 * dos componentes distintos (ej. Dashboard e Inventario) suscriben a
 * `garments` al mismo tiempo con el nombre fijo `garments-{companyId}`, la
 * segunda suscripción intenta agregar más `.on(...)` a un canal que el
 * primero ya dejó en estado `subscribed`, y eso tira exactamente el error
 * "cannot add postgres_changes callbacks... after subscribe()". Agregar un
 * sufijo aleatorio a cada llamada le da a cada suscriptor su propio canal
 * independiente, sin tocar cómo se usa `supabase.channel(...)` en el resto
 * del código (mismo `.on(...).subscribe()` de siempre).
 */
export function uniqueChannel(name) {
  return supabase.channel(`${name}-${Math.random().toString(36).slice(2, 10)}`);
}