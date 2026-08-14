// ─────────────────────────────────────────────────────────────────────────────
// src/utils/errors.js
// Manejo de errores centralizado para todo lo que NO es autenticación
// (AuthContext.jsx tiene su propio friendlyError() para los mensajes de
// Supabase Auth — un dominio distinto, con sus propios textos).
//
// Antes, cada módulo repetía el mismo patrón suelto:
//   catch (err) {
//     console.error("Error guardando proveedor:", err);
//     setError(err?.message || "Error al guardar. Revisa la consola.");
//   }
// El problema con `err?.message` a secas es que, cuando el error viene de
// Postgres/PostgREST (violación de una restricción, RLS, etc.), ese mensaje
// es texto técnico en inglés — nada útil para quien está vendiendo en el
// mostrador. Este archivo centraliza la traducción:
//   - Si el error trae un `code` de Postgres (23505, 23503…) o de PostgREST
//     (PGRST301…), se traduce a un mensaje en español.
//   - Si es un error que TIRAMOS nosotros mismos (`throw new Error("Stock
//     insuficiente para...")`, o un `raise exception` de una función SQL,
//     que llega sin `code`), su mensaje ya está en español y se usa tal
//     cual — es información específica que sí vale la pena mostrar.
// ─────────────────────────────────────────────────────────────────────────────

// Códigos SQLSTATE de Postgres (los que realmente pueden aparecer acá, dado
// lo que las tablas de supabase/schema.sql restringen) + los de PostgREST.
const DB_ERROR_MESSAGES = {
  "23505": "Ya existe un registro con esos datos (por ejemplo, un SKU repetido).",
  "23503": "No se puede completar: hay datos relacionados que lo impiden.",
  "23502": "Faltan datos obligatorios.",
  "23514": "Alguno de los datos ingresados no es válido.",
  "42501": "No tienes permiso para hacer esto.",
  "PGRST301": "Tu sesión expiró. Vuelve a iniciar sesión.",
  "PGRST116": "El registro que buscas ya no existe.",
};

const DEFAULT_FALLBACK = "Ocurrió un error. Inténtalo de nuevo.";

/**
 * Traduce cualquier error (de Postgres/Supabase, o uno propio tirado con
 * `throw new Error("...")` / `raise exception` en una función SQL) a un
 * mensaje en español listo para mostrar.
 *
 * - Errores de la base de datos (traen `err.code`): se traducen con el
 *   diccionario de arriba. Un código no mapeado cae al `fallback` en vez de
 *   mostrar texto técnico en inglés.
 * - Errores propios, incluyendo los `raise exception '...'` de las
 *   funciones de supabase/schema.sql (llegan sin `code` reconocido, o con
 *   uno genérico pero con `err.message` ya en español): se muestra
 *   `err.message` tal cual — es información específica y accionable
 *   ("Solo hay 3 unidades disponibles en esa ubicación").
 */
export function getErrorMessage(err, fallback = DEFAULT_FALLBACK) {
  if (!err) return fallback;
  if (err.code && DB_ERROR_MESSAGES[err.code]) return DB_ERROR_MESSAGES[err.code];
  return err.message || fallback;
}

/**
 * Azúcar sintáctico para el patrón más común: loguear el error completo a la
 * consola (para depurar) y devolver el mensaje amigable (para mostrar en la
 * UI), en una sola línea.
 *
 * @param {string} context  Prefijo descriptivo para la consola, ej. "Error guardando proveedor"
 */
export function logAndGetErrorMessage(err, context, fallback = DEFAULT_FALLBACK) {
  console.error(context, err);
  return getErrorMessage(err, fallback);
}

