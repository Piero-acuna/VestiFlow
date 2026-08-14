// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useGarments.js
// Igual forma que useCollection.js (companyId → [items, loading]), pero contra
// el store mock de prendas en vez de Firestore. El día que garmentsStore.js
// se reemplace por llamadas a Supabase, este hook no cambia.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { subscribeToGarments } from "../services/supabase/garmentsStore";

export function useGarments(companyId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const unsub = subscribeToGarments(companyId, (data) => {
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, [companyId]);
  return [items, loading];
}
