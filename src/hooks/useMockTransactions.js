// src/hooks/useMockTransactions.js
// Igual forma que useCollection.js, contra el store mock de transacciones.
import { useState, useEffect } from "react";
import { subscribeToTransactions } from "../services/mock/transactionsStore";

export function useMockTransactions(companyId) {
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
