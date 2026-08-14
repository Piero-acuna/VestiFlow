// ─────────────────────────────────────────────────────────────────────────────
// src/contexts/AuthContext.jsx
//
// Métodos disponibles (misma firma que la versión Firebase — nada fuera de
// este archivo tuvo que cambiar):
//   login(email, password)           — correo + contraseña
//   loginWithGoogle()                — Google OAuth (redirección de página completa,
//                                       Supabase no soporta popup como sí hacía Firebase)
//   register(email,password,name,companyName,country)
//   registerEmployee(email,password,name,permissions) — vía /api/invite-employee
//   joinCompany(email,password,name,targetCompanyId)
//   logout() / resetPassword(email) / getIdToken()
//
// La creación del perfil (y de la empresa, si corresponde) ya NO ocurre acá:
// vive en el trigger handle_new_user() de supabase/schema.sql, que corre
// dentro de la MISMA transacción que el alta en auth.users. Eso elimina la
// condición de carrera que existía con Firestore (loadProfile ya no
// necesita reintentar "por si el perfil todavía no se escribió").
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { defaultPermissions } from "../config/permissions";
import { getCountryConfig, LEGACY_DEFAULT_CONFIG } from "../config/countryConfig";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [companyId,   setCompanyId]   = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [companyCurrency, setCompanyCurrency] = useState(LEGACY_DEFAULT_CONFIG);
  const [loading,     setLoading]     = useState(true);
  const [authError,   setAuthError]   = useState("");

  async function loadProfile(user) {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*, companies(name, country, currency_symbol)")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;

      if (!profile) {
        // El trigger crea el perfil en la MISMA transacción que el alta en
        // auth.users, así que a esta altura siempre debería existir. Si no
        // aparece, algo falló del lado del trigger — revisa Database →
        // Functions → handle_new_user en el dashboard de Supabase.
        setAuthError("No se encontró un perfil para esta cuenta. Si el problema persiste, avísame.");
        await supabase.auth.signOut();
        return;
      }

      if (profile.active === false) {
        setAuthError("Tu cuenta fue desactivada. Contacta al dueño de la empresa.");
        await supabase.auth.signOut();
        return;
      }

      setUserProfile({
        id: profile.id, name: profile.name, email: profile.email,
        companyId: profile.company_id, role: profile.role,
        permissions: profile.permissions, active: profile.active,
      });
      setCompanyId(profile.company_id);
      setCompanyName(profile.companies?.name || "Mi Empresa");

      const country = profile.companies?.country;
      setCompanyCurrency(
        country
          ? {
              country,
              paymentGateway: getCountryConfig(country).paymentGateway,
              currencyCode:   getCountryConfig(country).currencyCode,
              currencySymbol: profile.companies?.currency_symbol || getCountryConfig(country).currencySymbol,
            }
          : LEGACY_DEFAULT_CONFIG
      );
    } catch (err) {
      console.error("Error cargando perfil:", err);
      setAuthError("No se pudo cargar tu perfil. Intenta de nuevo.");
      await supabase.auth.signOut().catch(() => {});
    }
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setCurrentUser(session?.user || null);
      if (session?.user) loadProfile(session.user).finally(() => mounted && setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCurrentUser(session?.user || null);
      if (session?.user) {
        loadProfile(session.user);
      } else {
        setUserProfile(null);
        setCompanyId(null);
        setCompanyName("");
        setCompanyCurrency(LEGACY_DEFAULT_CONFIG);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  async function login(email, password) {
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setAuthError(friendlyError(error)); throw error; }
  }

  async function loginWithGoogle() {
    setAuthError("");
    // A diferencia del popup que usaba Firebase, Supabase redirige la
    // página completa a Google y de vuelta — no hay nada más que hacer acá,
    // el listener de arriba (onAuthStateChange) toma la sesión al volver.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) { setAuthError(friendlyError(error)); throw error; }
  }

  async function register(email, password, name, companyNameInput, country = "PE") {
    setAuthError("");
    const config = getCountryConfig(country);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, company_name: companyNameInput, country, currency_symbol: config.currencySymbol } },
    });
    if (error) { setAuthError(friendlyError(error)); throw error; }
  }

  /**
   * El Dueño registra a un nuevo empleado. A diferencia de Firebase (donde
   * una app secundaria de Auth permitía crear la cuenta sin afectar la
   * sesión del Dueño), Supabase no tiene ese truco — cualquier signUp()
   * desde el cliente cambiaría la sesión activa. La única forma correcta de
   * crear un usuario "en nombre de otro" es del lado del servidor con la
   * service_role key, así que esto llama a /api/invite-employee (ver ese
   * archivo) mandando el token de la sesión actual para que el servidor
   * confirme que quien pide esto es de verdad el Dueño de una empresa.
   */
  async function registerEmployee(email, password, name, permissions = defaultPermissions()) {
    setAuthError("");
    if (!companyId) {
      const err = new Error("No hay una empresa activa para registrar empleados.");
      setAuthError(err.message);
      throw err;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/invite-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email, password, name, permissions }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result?.error || "No se pudo registrar al empleado.");
      return result.userId;
    } catch (err) {
      setAuthError(err.message || "No se pudo registrar al empleado.");
      throw err;
    }
  }

  async function joinCompany(email, password, name, targetCompanyId) {
    setAuthError("");
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { company_id: targetCompanyId, name, role: "empleado", permissions: defaultPermissions() } },
    });
    if (error) { setAuthError(friendlyError(error)); throw error; }
  }

  async function logout() { await supabase.auth.signOut(); }

  async function resetPassword(email) {
    setAuthError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) { setAuthError(friendlyError(error)); throw error; }
  }

  /** Token de la sesión activa — lo usa PaywallScreen para autenticar las llamadas a /api/*. */
  async function getIdToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  function friendlyError(error) {
    const msg = error?.message || "";
    const map = {
      "Invalid login credentials":        "Correo o contraseña incorrectos.",
      "User already registered":          "Ese correo ya está registrado.",
      "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres.",
      "Unable to validate email address": "Correo electrónico inválido.",
      "Email not confirmed":              "Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).",
      "For security purposes":            "Espera unos segundos antes de intentar de nuevo.",
      "Network request failed":           "Error de red. Verifica tu conexión.",
    };
    for (const key in map) if (msg.includes(key)) return map[key];
    return msg || "Ocurrió un error. Inténtalo de nuevo.";
  }

  return (
    <AuthContext.Provider value={{
      currentUser, userProfile, companyId, companyName, companyCurrency,
      loading, authError, setAuthError,
      login, loginWithGoogle, register, joinCompany, registerEmployee, logout, resetPassword, getIdToken,
      setCompanyCurrency,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
