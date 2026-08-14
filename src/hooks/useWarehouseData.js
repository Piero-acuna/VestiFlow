// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useWarehouseData.js
// Suscribe a las 3 fuentes del módulo de Almacén (ubicaciones, stock,
// movimientos) y avisa cuando las 3 primeras cargas ya llegaron
// (loading=false). Misma idea que la versión anterior — la diferencia es
// que ESTA sí está conectada a WarehouseModule.jsx (la anterior vivía sin
// que nada la importara; ver el análisis del código al inicio de esta
// conversación). Ya no incluye `warehouseProducts`: el almacén ahora
// referencia directamente las variantes del catálogo (ver warehouseStore.js).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import {
  subscribeToLocations, subscribeToWarehouseStock, subscribeToWarehouseMovements,
} from "../services/supabase/warehouseStore";

export function useWarehouseData(companyId) {
  const [locations, setLocations] = useState([]);
  const [stock,     setStock]     = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let done = 0;
    const check = () => { if (++done >= 3) setLoading(false); };
    const u1 = subscribeToLocations(companyId, d => { setLocations(d); check(); });
    const u2 = subscribeToWarehouseStock(companyId, d => { setStock(d); check(); });
    const u3 = subscribeToWarehouseMovements(companyId, d => { setMovements(d); check(); });
    return () => { u1(); u2(); u3(); };
  }, [companyId]);

  return { locations, stock, movements, loading };
}
