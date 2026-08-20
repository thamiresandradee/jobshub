"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { FiltersBar } from "@/components/FiltersBar";
import { JobGrid } from "@/components/JobGrid";
import { Pagination } from "@/components/Pagination";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useCityScope } from "@/lib/useCityScope";
import type { Job, JobFilters } from "@/lib/types";

type Meta = { cities: string[]; categories: string[] };
type ViewMode = "grid" | "list";

export default function HomePage() {
  const [filters, setFilters] = useState<JobFilters>({});
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewMode>("grid");
  const [meta, setMeta] = useState<Meta>({ cities: [], categories: [] });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(true);

  const debouncedFilters = useDebouncedValue(filters, 400);
  const prevFiltersRef = useRef(debouncedFilters);
  const cityScope = useCityScope();
  const scoped = cityScope !== undefined && cityScope.length > 0;

  useEffect(() => {
    const savedView = localStorage.getItem("vagashub_view");
    if (savedView === "grid" || savedView === "list") setView(savedView);
  }, []);

  useEffect(() => {
    if (cityScope === undefined) return; // ainda não checou o escopo salvo
    const params = new URLSearchParams();
    if (scoped) params.set("cities", cityScope.join(","));
    if (debouncedFilters.abroad) params.set("abroad", "true");
    fetch(`/api/meta?${params.toString()}`)
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, [cityScope, scoped, debouncedFilters.abroad]);

  useEffect(() => {
    if (cityScope === undefined) return; // ainda não checou o escopo salvo

    // Se os filtros mudaram desde a última busca, volta pra página 1 antes
    // de buscar — evita disparar uma busca com a página antiga (que gerava
    // uma condição de corrida: o resultado desatualizado podia chegar
    // depois do novo e sobrescrever a lista com dados errados).
    const filtersChanged = prevFiltersRef.current !== debouncedFilters;
    if (filtersChanged) {
      prevFiltersRef.current = debouncedFilters;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);

    // Sem escolha explícita da pessoa, o padrão é o escopo do link (se
    // houver) — assim quem abre um link com cidades restritas nunca vê
    // nada fora delas, mesmo sem mexer no filtro.
    const effectiveCities = debouncedFilters.city?.length ? debouncedFilters.city : scoped ? cityScope : undefined;

    const params = new URLSearchParams();
    if (debouncedFilters.q) params.set("q", debouncedFilters.q);
    if (debouncedFilters.abroad) params.set("abroad", "true");
    if (effectiveCities?.length) params.set("city", effectiveCities.join(","));
    if (debouncedFilters.workType) params.set("workType", debouncedFilters.workType);
    if (debouncedFilters.seniority) params.set("seniority", debouncedFilters.seniority);
    if (debouncedFilters.contractType) params.set("contractType", debouncedFilters.contractType);
    if (debouncedFilters.category?.length) params.set("category", debouncedFilters.category.join(","));
    if (debouncedFilters.minSalary) params.set("minSalary", String(debouncedFilters.minSalary));
    if (debouncedFilters.maxSalary) params.set("maxSalary", String(debouncedFilters.maxSalary));
    params.set("page", String(page));

    fetch(`/api/jobs?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs ?? []);
        setTotalPages(data.pagination?.totalPages ?? 1);
        setTotal(data.pagination?.total ?? 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedFilters, page, cityScope, scoped]);

  function updateView(v: ViewMode) {
    setView(v);
    localStorage.setItem("vagashub_view", v);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vagas disponíveis</h1>
          <p className="text-sm text-slate-500">{total} vaga(s) encontrada(s)</p>
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Filtros
          <ChevronDown size={16} className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {filtersOpen && (
        <FiltersBar filters={filters} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} meta={meta} view={view} onViewChange={updateView} />
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400">Carregando vagas...</div>
      ) : (
        <>
          <JobGrid jobs={jobs} view={view} />
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </main>
  );
}
