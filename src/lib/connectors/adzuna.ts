import type { ParsedJob } from "../feedParser";
import { WORK_TYPE_KEYWORDS, SENIORITY_KEYWORDS, matchFirst } from "../jobKeywords";

/**
 * Conector para a API de busca da Adzuna (https://developer.adzuna.com/),
 * um agregador de vagas com cobertura no Brasil (inclui presencial/híbrido,
 * não só remoto). Precisa de app_id/app_key gratuitos (cadastro em
 * developer.adzuna.com) guardados em ADZUNA_APP_ID/ADZUNA_APP_KEY — nunca
 * expostos na resposta da nossa própria API nem salvos em `source_url`
 * (ver connector_config em src/lib/types.ts).
 *
 * Cada fonte com esse conector representa uma busca salva: `what` (termo)
 * fica em `connector_config`, `where` (localização) reaproveita a coluna
 * `city` da fonte.
 */

type AdzunaResult = {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  category?: { label?: string };
  redirect_url: string;
};

const CONTRACT_TYPE_MAP: Record<string, string> = {
  contract: "pj",
};

function toParsedJob(r: AdzunaResult): ParsedJob {
  const locationName = r.location?.display_name ?? "";
  const text = `${locationName} ${r.title}`;

  return {
    externalId: r.id,
    title: r.title,
    description: null,
    company: r.company?.display_name ?? null,
    workType: matchFirst(text, WORK_TYPE_KEYWORDS),
    seniority: matchFirst(r.title, SENIORITY_KEYWORDS),
    contractType: r.contract_type ? (CONTRACT_TYPE_MAP[r.contract_type] ?? null) : null,
    category: r.category?.label ?? null,
    city: locationName || "Remoto",
    state: null,
    salaryMin: r.salary_min ?? null,
    salaryMax: r.salary_max ?? null,
    sourceUrl: r.redirect_url,
  };
}

export async function fetchAdzunaJobs(what: string, where: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY não configurados. Crie uma conta gratuita em developer.adzuna.com e adicione as chaves nas variáveis de ambiente.");
  }

  const url = new URL("https://api.adzuna.com/v1/api/jobs/br/search/1");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "50");
  url.searchParams.set("content-type", "application/json");
  if (what) url.searchParams.set("what", what);
  if (where) url.searchParams.set("where", where);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Adzuna retornou HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results?: AdzunaResult[] };
  const results = data.results ?? [];

  return { jobs: results.map(toParsedJob), warnings: [] };
}
