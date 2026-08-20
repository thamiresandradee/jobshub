"use client";

import { useEffect, useState } from "react";
import { JobGrid } from "@/components/JobGrid";
import { useUuid } from "@/lib/useUuid";
import { useFavorites } from "@/context/FavoritesContext";
import type { Job } from "@/lib/types";

export default function FavoritosPage() {
  const uuid = useUuid();
  const { favoriteIds } = useFavorites();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uuid) return;
    fetch(`/api/favorites?user=${uuid}`)
      .then((r) => r.json())
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [uuid]);

  // Filtra pelo contexto (fonte da verdade em tempo real) sobre os dados já carregados,
  // assim desfavoritar aqui reflete na hora, sem precisar buscar tudo de novo.
  const displayed = jobs.filter((j) => favoriteIds.has(j.id));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Seus favoritos</h1>
        <p className="text-sm text-slate-500">Salvos neste navegador.</p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Carregando...</div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          Você ainda não favoritou nenhuma vaga.
        </div>
      ) : (
        <JobGrid jobs={displayed} view="grid" />
      )}
    </main>
  );
}
