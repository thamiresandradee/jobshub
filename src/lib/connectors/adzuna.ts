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
 * Cada fonte com esse conector representa uma busca salva: o termo buscado
 * fica em `connector_config`, `where` (localização) reaproveita a coluna
 * `city` da fonte. Usamos o parâmetro `what_or` da Adzuna (não `what`): ele
 * casa QUALQUER uma das palavras informadas, em vez de exigir todas — assim
 * dá pra cobrir vários cargos numa fonte só (ex.: "desenvolvedor designer
 * analista de dados" traz vaga de qualquer um dos três), confirmado testando
 * contra a API real.
 *
 * Duas coisas confirmadas testando contra a API de verdade (não estão
 * documentadas de forma óbvia):
 *  - `salary_min`/`salary_max` vêm ANUALIZADOS, mesmo no Brasil onde vaga
 *    normalmente anuncia salário mensal — uma vaga de estágio real veio com
 *    "salary_min: 9600, salary_max: 12000", que só faz sentido como R$800–
 *    R$1.000/mês (÷12). Convertemos aqui pra não inflar o valor em 12x.
 *  - A sincronização (ver src/lib/sync.ts) já apaga do nosso banco qualquer
 *    vaga que não volte mais no resultado — o que efetivamente remove vaga
 *    com processo encerrado a cada sync, DESDE QUE a busca cubra resultado
 *    suficiente pra não confundir "saiu da primeira página" com "vaga
 *    fechou". Por isso paginamos aqui (até MAX_PAGES) em vez de pegar só a
 *    primeira página.
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

/** Adzuna anualiza salary_min/salary_max — convertemos pra mensal (padrão BR). */
function toMonthly(annual: number | undefined): number | null {
  if (annual === undefined || annual === null) return null;
  return Math.round(annual / 12);
}

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
    category: r.category?.label && r.category.label !== "Unknown" ? r.category.label : null,
    city: locationName || "Remoto",
    state: null,
    salaryMin: toMonthly(r.salary_min),
    salaryMax: toMonthly(r.salary_max),
    sourceUrl: r.redirect_url,
  };
}

const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 6; // até 300 vagas por fonte por sync

export async function fetchAdzunaJobs(what: string, where: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY não configurados. Crie uma conta gratuita em developer.adzuna.com e adicione as chaves nas variáveis de ambiente.");
  }

  const allResults: AdzunaResult[] = [];
  let totalCount = Infinity;

  for (let page = 1; page <= MAX_PAGES && allResults.length < totalCount; page++) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/br/search/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
    url.searchParams.set("content-type", "application/json");
    if (what) url.searchParams.set("what_or", what);
    if (where) url.searchParams.set("where", where);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) {
      if (page === 1) throw new Error(`Adzuna retornou HTTP ${res.status}`);
      break; // já temos resultado de páginas anteriores — não falha o sync inteiro por uma página a mais que não veio
    }
    const data = (await res.json()) as { results?: AdzunaResult[]; count?: number };
    const results = data.results ?? [];
    totalCount = data.count ?? results.length;
    allResults.push(...results);

    if (results.length < RESULTS_PER_PAGE) break; // última página
  }

  return { jobs: allResults.map(toParsedJob), warnings: [] };
}
