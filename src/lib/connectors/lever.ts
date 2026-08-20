import type { ParsedJob } from "../feedParser";
import { SENIORITY_KEYWORDS, matchFirst } from "../jobKeywords";
import { splitLocation } from "../location";

/**
 * Conector para a API pública de postings da Lever
 * (https://github.com/lever/postings-api), usada por empresas que contratam
 * através dessa ATS. Endpoint público, feito pra consumo externo (é a mesma
 * API que alimenta a página de carreiras hospedada pela própria Lever) —
 * sem chave, sem scraping.
 */

const WORKPLACE_TYPE_MAP: Record<string, string> = {
  remote: "remoto",
  hybrid: "hibrido",
  onsite: "presencial",
};

const COMMITMENT_TO_CONTRACT: Record<string, string> = {
  contract: "pj",
  contractor: "pj",
  intern: "estagio",
  internship: "estagio",
  temporary: "temporario",
};

type LeverPosting = {
  id: string;
  text: string;
  hostedUrl: string;
  workplaceType?: string;
  categories?: { location?: string; team?: string; commitment?: string };
};

function postingsUrl(slug: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
}

async function fetchRaw(slug: string): Promise<LeverPosting[] | null> {
  const res = await fetch(postingsUrl(slug), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as LeverPosting[]) : null;
}

function toParsedJob(j: LeverPosting, fallbackCompany: string): ParsedJob {
  // Vaga com múltiplas localizações elegíveis vem como uma string só
  // separada por ";" (ex.: "Remote Ireland; Remote, France; Remote, Germany")
  // — usamos só a primeira. Ela, por sua vez, costuma vir "Cidade, País" —
  // separamos pra `city` nunca carregar vírgula (que colidiria com o
  // separador de múltiplas cidades do filtro).
  const rawLocation = (j.categories?.location ?? "").split(";")[0].trim();
  const commitment = (j.categories?.commitment ?? "").toLowerCase();
  const { city, state } = rawLocation
    ? splitLocation(rawLocation)
    : { city: j.workplaceType === "remote" ? "Remoto" : fallbackCompany, state: null };

  return {
    externalId: j.id,
    title: j.text,
    description: null,
    company: fallbackCompany,
    workType: (j.workplaceType && WORKPLACE_TYPE_MAP[j.workplaceType]) ?? null,
    seniority: matchFirst(j.text, SENIORITY_KEYWORDS),
    contractType: COMMITMENT_TO_CONTRACT[commitment] ?? null,
    category: j.categories?.team ?? null,
    city,
    state,
    salaryMin: null,
    salaryMax: null,
    sourceUrl: j.hostedUrl,
  };
}

export async function fetchLeverJobs(slug: string, fallbackCompany: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const raw = await fetchRaw(slug);
  if (raw === null) {
    throw new Error(`Empresa "${slug}" não encontrada na Lever (HTTP não-200).`);
  }
  return { jobs: raw.map((j) => toParsedJob(j, fallbackCompany)), warnings: [] };
}

/** Usado pela auto-detecção (POST /api/sources/discover) pra testar um slug candidato. */
export async function probeLever(slug: string): Promise<{ ok: boolean; count: number; sampleTitles: string[] }> {
  try {
    const raw = await fetchRaw(slug);
    if (!raw || raw.length === 0) return { ok: false, count: 0, sampleTitles: [] };
    return { ok: true, count: raw.length, sampleTitles: raw.slice(0, 3).map((j) => j.text) };
  } catch {
    return { ok: false, count: 0, sampleTitles: [] };
  }
}
