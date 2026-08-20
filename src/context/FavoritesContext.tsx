"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useUuid } from "@/lib/useUuid";

type FavoritesContextValue = {
  favoriteIds: Set<string>;
  toggleFavorite: (jobId: string) => void;
  ready: boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const uuid = useUuid();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!uuid) return;
    fetch(`/api/favorites?user=${uuid}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string }[]) => setFavoriteIds(new Set(rows.map((j) => j.id))))
      .finally(() => setReady(true));
  }, [uuid]);

  const toggleFavorite = useCallback(
    (jobId: string) => {
      if (!uuid) return;
      const wasFavorite = favoriteIds.has(jobId);

      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(jobId);
        else next.add(jobId);
        return next;
      });

      fetch("/api/favorites", {
        method: wasFavorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_uuid: uuid, job_id: jobId }),
      }).catch(() => {
        // Reverte em caso de falha de rede, pra não ficar com estado local errado.
        setFavoriteIds((prev) => {
          const reverted = new Set(prev);
          if (wasFavorite) reverted.add(jobId);
          else reverted.delete(jobId);
          return reverted;
        });
      });
    },
    [uuid, favoriteIds]
  );

  return <FavoritesContext.Provider value={{ favoriteIds, toggleFavorite, ready }}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites precisa ser usado dentro de <FavoritesProvider>.");
  return ctx;
}
