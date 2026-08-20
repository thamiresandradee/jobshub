import type { ParsedJob } from "../feedParser";
import { WORK_TYPE_KEYWORDS, SENIORITY_KEYWORDS, matchFirst } from "../jobKeywords";
import { parseSalaryRange } from "../salary";

/**
 * Conector para a API da Jooble (https://jooble.org/api/about) — outro
 * agregador amplo tipo a Adzuna, com cobertura no Brasil, incluindo vaga
 * presencial/híbrida.
 *
 * ⚠️ NÃO TESTADO AO VIVO — diferente de todos os outros conectores deste
 * projeto (Remotive, Greenhouse, Lever, Gupy, Adzuna), este foi escrito só
 * com base na documentação pública da Jooble, sem uma chave própria pra
 * confirmar contra a API real. A chave da Jooble não é auto-serviço
 * instantâneo como a da Adzuna — precisa pedir em jooble.org/api/about e
 * esperar. Toda vez que testamos um conector ao vivo neste projeto achamos
 * pelo menos uma surpresa que a documentação não deixava óbvia (a Adzuna
 * anualiza salário, por exemplo) — é bem possível que precise de ajuste
 * assim que tiver uma chave de teste.
 *
 * Cada fonte com esse conector representa uma busca salva: o termo buscado
 * fica em `connector_config` (parâmetro `keywords`), `where`/localização
 * reaproveita a coluna `city` da fonte (parâmetro `location`).
 */

type JoobleJob = {
  id?: string | number;
  title: string;
  location?: string;
  snippet?: string;
  salary?: string;
  type?: string;
  link: string;
  company?: string;
};

function toParsedJob(j: JoobleJob): ParsedJob {
  const text = `${j.location ?? ""} ${j.title} ${j.type ?? ""}`;
  const { min, max } = j.salary ? parseSalaryRange(j.salary) : { min: null, max: null };

  return {
    // A Jooble pode não devolver um `id` estável em todo item — usamos o
    // link (que é sempre único por vaga) como fallback de identidade.
    externalId: String(j.id ?? j.link),
    title: j.title,
    description: null,
    company: j.company ?? null,
    workType: matchFirst(text, WORK_TYPE_KEYWORDS),
    seniority: matchFirst(j.title, SENIORITY_KEYWORDS),
    contractType: null,
    category: null,
    city: j.location || "Remoto",
    state: null,
    country: null, // não verificado se a busca por location realmente restringe ao Brasil — ver aviso no topo do arquivo
    salaryMin: min,
    salaryMax: max,
    sourceUrl: j.link,
  };
}

const RESULTS_PER_PAGE = 20; // padrão documentado da Jooble
const MAX_PAGES = 5; // até ~100 vagas por fonte por sync

export async function fetchJoobleJobs(keywords: string, location: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) {
    throw new Error("JOOBLE_API_KEY não configurada. Peça uma chave gratuita em jooble.org/api/about e adicione na variável de ambiente.");
  }

  const allJobs: JoobleJob[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`https://jooble.org/api/${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: keywords || undefined, location: location || undefined, page: String(page) }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) {
      if (page === 1) throw new Error(`Jooble retornou HTTP ${res.status}`);
      break;
    }
    const data = (await res.json()) as { jobs?: JoobleJob[]; totalCount?: number };
    const jobs = data.jobs ?? [];
    allJobs.push(...jobs);

    if (jobs.length < RESULTS_PER_PAGE) break; // última página
  }

  return { jobs: allJobs.map(toParsedJob), warnings: [] };
}
