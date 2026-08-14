// src/hooks/useTransactions.js
// Igual forma que useCollection.js, contra el store real de transacciones
// de Supabase (reemplaza a useMockTransactions.js).
import { useState, useEffect } from "react";
import { subscribeToTransactions } from "../services/supabase/transactionsStore";

export function useTransactions(companyId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const unsub = subscribeToTransactions(companyId, (data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, [companyId]);
  return [items, loading];
}
