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
 * `city` da fonte.
 *
 * Sintaxe do termo buscado — **vírgula separa grupos (OU entre eles),
 * espaço dentro de um grupo exige todas as palavras (E)**. Ex.:
 * "comercial, vendas, analista categoria" busca (comercial) OU (vendas) OU
 * (analista E categoria, em qualquer ordem). Cada grupo vira uma chamada
 * separada à API (parâmetro `what`, que é AND-de-palavras), com os
 * resultados combinados e sem duplicar. Confirmado testando contra a API
 * real que isso é necessário: o parâmetro `what_or` da Adzuna faz OU **por
 * palavra**, não por frase — "what_or=analista comercial" traz qualquer
 * vaga com "analista" OU "comercial" soltos (3 mil+ resultados, families
 * erradas misturadas), enquanto uma palavra isolada e ambígua como
 * "categoria" sozinha (sem "analista" junto) traz majoritariamente vaga de
 * motorista ("Categoria D" é categoria de CNH, não de produto).
 *
 * Duas outras coisas confirmadas testando contra a API de verdade (não
 * estão documentadas de forma óbvia):
 *  - `salary_min`/`salary_max` vêm ANUALIZADOS, mesmo no Brasil onde vaga
 *    normalmente anuncia salário mensal — uma vaga de estágio real veio com
 *    "salary_min: 9600, salary_max: 12000", que só faz sentido como R$800–
 *    R$1.000/mês (÷12). Convertemos aqui pra não inflar o valor em 12x.
 *  - A sincronização (ver src/lib/sync.ts) já apaga do nosso banco qualquer
 *    vaga que não volte mais no resultado — o que efetivamente remove vaga
 *    com processo encerrado a cada sync, DESDE QUE a busca cubra resultado
 *    suficiente pra não confundir "saiu da primeira página" com "vaga
 *    fechou". Por isso paginamos aqui (até MAX_PAGES_PER_GROUP) em vez de
 *    pegar só a primeira página.
 */

type AdzunaResult = {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
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

/**
 * `location.display_name` vem como "Cidade, Estado" — uma string só, com
 * vírgula, que colidiria com o separador de múltiplas cidades do filtro
 * (?city=A,B). `location.area` é mais confiável pra extrair só a cidade: é
 * uma lista do mais genérico pro mais específico (ex.: ["Brasil", "Sudeste",
 * "Estado de São Paulo", "Campinas"]) — o último item é a cidade, o
 * penúltimo o estado/região, confirmado testando contra a API real.
 */
function cityAndState(location: AdzunaResult["location"]): { city: string; state: string | null } {
  const area = location?.area;
  if (area && area.length > 0) {
    return { city: area[area.length - 1], state: area.length > 1 ? area[area.length - 2] : null };
  }
  return { city: location?.display_name ?? "Remoto", state: null };
}

function toParsedJob(r: AdzunaResult): ParsedJob {
  const { city, state } = cityAndState(r.location);
  const text = `${r.location?.display_name ?? ""} ${r.title}`;

  return {
    externalId: r.id,
    title: r.title,
    description: null,
    company: r.company?.display_name ?? null,
    workType: matchFirst(text, WORK_TYPE_KEYWORDS),
    seniority: matchFirst(r.title, SENIORITY_KEYWORDS),
    contractType: r.contract_type ? (CONTRACT_TYPE_MAP[r.contract_type] ?? null) : null,
    category: r.category?.label && r.category.label !== "Unknown" ? r.category.label : null,
    city,
    state,
    country: "Brasil", // busca sempre escopada ao Brasil (endpoint /jobs/br/search)
    salaryMin: toMonthly(r.salary_min),
    salaryMax: toMonthly(r.salary_max),
    sourceUrl: r.redirect_url,
  };
}

const RESULTS_PER_PAGE = 50;
const MAX_PAGES_PER_GROUP = 4; // até 200 vagas por grupo — fixo, não divide conforme o nº de grupos
const MAX_GROUPS = 10; // teto de grupos por fonte, só pra não sair buscando 50 termos numa fonte só

/** Busca um único grupo (AND das palavras dele), paginando até o teto de páginas dado. */
async function fetchGroup(appId: string, appKey: string, group: string, where: string, maxPages: number): Promise<AdzunaResult[]> {
  const results: AdzunaResult[] = [];
  let totalCount = Infinity;

  for (let page = 1; page <= maxPages && results.length < totalCount; page++) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/br/search/${page}`);
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
    url.searchParams.set("content-type", "application/json");
    if (group) url.searchParams.set("what", group);
    if (where) url.searchParams.set("where", where);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) {
      if (page === 1) throw new Error(`Adzuna retornou HTTP ${res.status} (busca: "${group || "todas as vagas"}")`);
      break; // já temos resultado de páginas anteriores — não falha o sync inteiro por uma página a mais que não veio
    }
    const data = (await res.json()) as { results?: AdzunaResult[]; count?: number };
    const pageResults = data.results ?? [];
    totalCount = data.count ?? pageResults.length;
    results.push(...pageResults);

    if (pageResults.length < RESULTS_PER_PAGE) break; // última página desse grupo
  }

  return results;
}

export async function fetchAdzunaJobs(what: string, where: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY não configurados. Crie uma conta gratuita em developer.adzuna.com e adicione as chaves nas variáveis de ambiente.");
  }

  // "comercial, vendas, analista categoria" -> ["comercial", "vendas", "analista categoria"]
  const groups = what
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const searches = (groups.length > 0 ? groups : [""]).slice(0, MAX_GROUPS); // sem termo nenhum: uma busca só, sem filtro de cargo
  const warnings = groups.length > MAX_GROUPS ? [`Só as primeiras ${MAX_GROUPS} opções separadas por vírgula foram buscadas.`] : [];

  const byId = new Map<string, AdzunaResult>();
  for (const group of searches) {
    const results = await fetchGroup(appId, appKey, group, where, MAX_PAGES_PER_GROUP);
    for (const r of results) byId.set(r.id, r); // dedup: mesma vaga batendo em dois grupos conta uma vez só
  }

  return { jobs: [...byId.values()].map(toParsedJob), warnings };
}
