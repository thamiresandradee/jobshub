import type { ParsedJob } from "../feedParser";
import { WORK_TYPE_KEYWORDS, SENIORITY_KEYWORDS, matchFirst } from "../jobKeywords";
import { splitLocation, inferCountry } from "../location";

/**
 * Conector para a API pública de board da Greenhouse
 * (https://developers.greenhouse.io/job-board.html), usada por empresas que
 * contratam através dessa ATS. O endpoint é público, feito pra ser
 * consumido por sites de terceiro (é a mesma API que alimenta o widget
 * "embed jobs" oficial da Greenhouse) — sem chave, sem scraping.
 */

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string };
  departments?: { name?: string }[];
};

function boardUrl(boardToken: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;
}

async function fetchRaw(boardToken: string): Promise<GreenhouseJob[] | null> {
  const res = await fetch(boardUrl(boardToken), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  return data.jobs ?? [];
}

function toParsedJob(j: GreenhouseJob, fallbackCompany: string): ParsedJob {
  // Vaga com múltiplas localizações elegíveis vem como uma string só
  // separada por ";" (ex.: "Remote Ireland; Remote, Germany; Remote, Spain")
  // — usamos só a primeira pra não poluir o filtro de cidade com uma opção
  // gigante e ilegível por vaga. A primeira, por sua vez, costuma vir como
  // "Cidade, Estado/País" — separamos pra `city` nunca carregar a vírgula
  // (que colidiria com o separador de múltiplas cidades do filtro).
  const rawLocation = (j.location?.name ?? "").split(";")[0].trim();
  const { city, state } = rawLocation ? splitLocation(rawLocation) : { city: fallbackCompany, state: null };
  const text = `${rawLocation} ${j.title}`;

  return {
    externalId: String(j.id),
    title: j.title,
    description: null,
    company: j.company_name ?? fallbackCompany,
    workType: matchFirst(text, WORK_TYPE_KEYWORDS),
    seniority: matchFirst(j.title, SENIORITY_KEYWORDS),
    contractType: null,
    category: j.departments?.[0]?.name ?? null,
    city,
    state,
    country: inferCountry(state),
    salaryMin: null,
    salaryMax: null,
    sourceUrl: j.absolute_url,
  };
}

export async function fetchGreenhouseJobs(boardToken: string, fallbackCompany: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const raw = await fetchRaw(boardToken);
  if (raw === null) {
    throw new Error(`Board "${boardToken}" não encontrado na Greenhouse (HTTP não-200).`);
  }
  return { jobs: raw.map((j) => toParsedJob(j, fallbackCompany)), warnings: [] };
}

/** Usado pela auto-detecção (POST /api/sources/discover) pra testar um slug candidato. */
export async function probeGreenhouse(boardToken: string): Promise<{ ok: boolean; count: number; sampleTitles: string[] }> {
  try {
    const raw = await fetchRaw(boardToken);
    if (!raw || raw.length === 0) return { ok: false, count: 0, sampleTitles: [] };
    return { ok: true, count: raw.length, sampleTitles: raw.slice(0, 3).map((j) => j.title) };
  } catch {
    return { ok: false, count: 0, sampleTitles: [] };
  }
}
