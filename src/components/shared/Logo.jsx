// ─────────────────────────────────────────────────────────────────────────────
// src/components/shared/Logo.jsx
//
// Marca de VestiFlow: una percha cuya base, en vez de ser recta, es una
// curva que fluye — la lectura es inmediata (percha = ropa) y la curva le
// suma el "Flow" del nombre sin volverse un ícono abstracto irreconocible.
//
// Dibujado con las MISMAS convenciones que ya usa cada ícono de lucide-react
// en toda la app (fill="none", stroke="currentColor", strokeWidth 2,
// linecap/linejoin "round", viewBox 24×24) — así <LogoMark size={18} /> cae
// en cualquier lugar donde hoy hay un ícono de lucide sin desentonar ni
// necesitar props especiales.
// ─────────────────────────────────────────────────────────────────────────────

export function LogoMark({ size = 24, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      className={className} aria-hidden="true">
      <circle cx="12" cy="4.2" r="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 5.8 V8 C7.3 10.7 3.2 14.3 2.3 18.5 C5.9 17 9 18.7 12 17.1 C15 18.7 18.1 17 21.7 18.5 C20.8 14.3 16.7 10.7 12 8"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Ícono + nombre. `tone="light"` (default) para fondos oscuros (sidebar,
 * pantalla de login); `tone="dark"` para los pocos lugares con fondo claro.
 */
export default function Logo({ size = 22, textSize = "text-lg", tone = "light", className = "" }) {
  const textColor = tone === "light" ? "text-white" : "text-slate-900";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} className="text-amber-400 flex-shrink-0" />
      <span className={`font-bold tracking-tight ${textSize} ${textColor}`}>
        Vesti<span className="text-amber-400">Flow</span>
      </span>
    </div>
  );
}
