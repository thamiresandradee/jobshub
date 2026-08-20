"use client";

import { Briefcase, Eye, MapPin } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import type { Job } from "@/lib/types";

const WORK_TYPE_LABELS: Record<string, string> = {
  remoto: "Remoto",
  hibrido: "Híbrido",
  presencial: "Presencial",
};

const SENIORITY_LABELS: Record<string, string> = {
  estagio: "Estágio",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  especialista: "Especialista",
};

const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estágio",
  freelancer: "Freelancer",
  temporario: "Temporário",
};

function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatSalary(min: number | null, max: number | null): string {
  if (min == null && max == null) return "A combinar";
  if (min != null && max != null && min !== max) return `${currency(min)} - ${currency(max)}`;
  if (min != null && (max == null || max === min)) return max == null ? `A partir de ${currency(min)}` : currency(min);
  return `Até ${currency(max as number)}`;
}

export function JobCard({ job, layout = "grid" }: { job: Job; layout?: "grid" | "list" }) {
  const { favoriteIds, toggleFavorite } = useFavorites();
  const isFavorite = favoriteIds.has(job.id);
  const isList = layout === "list";
  const location = job.state ? `${job.city}/${job.state}` : job.city;
  const companyLabel = job.company ?? job.source_name;

  return (
    <div
      className={`group flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md ${
        isList ? "flex-col sm:flex-row" : "flex-col"
      }`}
    >
      <div className={`relative flex shrink-0 items-start justify-between gap-2 p-4 ${isList ? "sm:w-64 sm:flex-col sm:border-r sm:border-slate-100" : ""}`}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Briefcase size={20} />
        </div>

        <button
          type="button"
          onClick={() => toggleFavorite(job.id)}
          aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-lg shadow-sm transition hover:scale-105 hover:bg-white"
        >
          <span className={isFavorite ? "text-rose-500" : "text-slate-400"}>{isFavorite ? "♥" : "♡"}</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4 pt-0 sm:pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {job.work_type && (
            <span className="rounded-full bg-slate-900/90 px-2 py-1 text-xs font-medium text-white">
              {WORK_TYPE_LABELS[job.work_type] ?? job.work_type}
            </span>
          )}
          {job.seniority && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              {SENIORITY_LABELS[job.seniority] ?? job.seniority}
            </span>
          )}
        </div>

        <h3 className="line-clamp-2 font-semibold text-slate-900">{job.title}</h3>

        {companyLabel && <p className="text-sm font-medium text-slate-600">{companyLabel}</p>}

        {location && (
          <span className="inline-flex w-fit items-center gap-1 text-sm text-slate-400">
            <MapPin size={14} />
            {location}
          </span>
        )}

        <p className="text-lg font-bold text-emerald-700">{formatSalary(job.salary_min, job.salary_max)}</p>

        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {job.contract_type && <span>{CONTRACT_LABELS[job.contract_type] ?? job.contract_type}</span>}
          {job.category && <span>{job.category}</span>}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          {job.source_name && companyLabel !== job.source_name && (
            <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              via {job.source_name}
            </span>
          )}
          {job.source_url && (
            <a
              href={job.source_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              <Eye size={14} />
              Ver vaga
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
