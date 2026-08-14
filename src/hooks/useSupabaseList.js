// src/hooks/useSupabaseList.js
// Hook genérico: recibe cualquier subscribeToX(companyId, onData) de los
// stores de services/supabase/*.js y devuelve [items, loading] — mismo
// contrato que useGarments/useTransactions, para no repetir el mismo
// useState+useEffect en cada store nuevo (suppliers, purchases, returns…).
import { useState, useEffect } from "react";

export function useSupabaseList(subscribeFn, companyId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const unsub = subscribeFn(companyId, (data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, [subscribeFn, companyId]);
  return [items, loading];
}
