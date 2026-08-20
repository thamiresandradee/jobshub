import type { ParsedJob } from "../feedParser";
import { WORK_TYPE_KEYWORDS, SENIORITY_KEYWORDS, matchFirst } from "../jobKeywords";
import { SCRAPER_USER_AGENT } from "../htmlScraper";

/**
 * Conector para a Gupy (https://{empresa}.gupy.io), a ATS mais usada por
 * empresa brasileira — bem mais comum aqui que Greenhouse/Lever, que são
 * mais americanas. Diferente das outras duas, a Gupy não publica uma API
 * documentada pra isso: os dados vêm de dentro do JSON de estado que a
 * própria página (Next.js) usa pra renderizar (`__NEXT_DATA__`), então é
 * mais frágil a mudanças de layout do que uma API versionada — mas ainda
 * assim é dado estruturado (cidade/estado já vêm separados, sem precisar
 * arrancar de texto livre), bem mais confiável que o scraper de HTML
 * genérico.
 *
 * Verificado antes de usar: o robots.txt do site principal da Gupy permite
 * explicitamente o ClaudeBot, e o subdomínio de carreira (empresa.gupy.io)
 * nem tem robots.txt próprio — sem sinal de restrição.
 */

type GupyWorkplace = {
  workplaceType?: string;
  address?: { city?: string; state?: string; stateShortName?: string; country?: string };
};

type GupyJob = {
  id: number;
  title: string;
  type?: string; // vacancy_type_effective | vacancy_type_talent_pool | vacancy_type_internship | vacancy_type_apprentice
  department?: string;
  workplace?: GupyWorkplace;
};

const WORKPLACE_TYPE_MAP: Record<string, string> = {
  "on-site": "presencial",
  hybrid: "hibrido",
  remote: "remoto",
};

// "Efetivo" é o termo padrão de RH brasileiro pra vaga CLT; estágio e jovem
// aprendiz mapeiam pro mesmo "estagio" do nosso filtro (mais próximo que
// existe). "Banco de talentos" não é uma vaga aberta de verdade — filtrado
// fora antes de chegar aqui, nunca aparece nesse mapa.
const VACANCY_TYPE_TO_CONTRACT: Record<string, string> = {
  vacancy_type_effective: "clt",
  vacancy_type_internship: "estagio",
  vacancy_type_apprentice: "estagio",
};

function extractNextData(html: string): { props?: { pageProps?: { jobs?: GupyJob[]; careerPage?: { name?: string } } } } | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function fetchRaw(slug: string): Promise<{ jobs: GupyJob[]; companyName: string | null } | null> {
  const res = await fetch(`https://${slug}.gupy.io/`, {
    headers: { "User-Agent": SCRAPER_USER_AGENT },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const data = extractNextData(html);
  const jobs = data?.props?.pageProps?.jobs;
  if (!jobs) return null;
  return { jobs, companyName: data?.props?.pageProps?.careerPage?.name ?? null };
}

function toParsedJob(j: GupyJob, slug: string, fallbackCompany: string): ParsedJob {
  const address = j.workplace?.address;
  const workplaceType = j.workplace?.workplaceType ?? "";
  const city = address?.city || (workplaceType === "remote" ? "Remoto" : fallbackCompany);
  const text = `${j.title} ${workplaceType}`;

  return {
    externalId: String(j.id),
    title: j.title,
    description: null,
    company: fallbackCompany,
    workType: WORKPLACE_TYPE_MAP[workplaceType] ?? matchFirst(text, WORK_TYPE_KEYWORDS),
    seniority: matchFirst(j.title, SENIORITY_KEYWORDS),
    contractType: j.type ? (VACANCY_TYPE_TO_CONTRACT[j.type] ?? null) : null,
    category: j.department || null,
    city,
    state: address?.stateShortName || null,
    salaryMin: null,
    salaryMax: null,
    sourceUrl: `https://${slug}.gupy.io/jobs/${j.id}?jobBoardSource=gupy_public_page`,
  };
}

/** "Banco de talentos" não é vaga aberta de verdade — não é preenchida com processo em andamento, é cadastro genérico pra futuro. */
function isRealOpening(j: GupyJob): boolean {
  return j.type !== "vacancy_type_talent_pool";
}

export async function fetchGupyJobs(slug: string, fallbackCompany: string): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const raw = await fetchRaw(slug);
  if (raw === null) {
    throw new Error(`Empresa "${slug}" não encontrada na Gupy, ou a página mudou de formato.`);
  }
  const company = raw.companyName ?? fallbackCompany;
  const jobs = raw.jobs.filter(isRealOpening).map((j) => toParsedJob(j, slug, company));
  return { jobs, warnings: [] };
}

/** Usado pela auto-detecção (POST /api/sources/discover) pra testar um slug candidato. */
export async function probeGupy(slug: string): Promise<{ ok: boolean; count: number; sampleTitles: string[] }> {
  try {
    const raw = await fetchRaw(slug);
    if (!raw) return { ok: false, count: 0, sampleTitles: [] };
    const open = raw.jobs.filter(isRealOpening);
    if (open.length === 0) return { ok: false, count: 0, sampleTitles: [] };
    return { ok: true, count: open.length, sampleTitles: open.slice(0, 3).map((j) => j.title) };
  } catch {
    return { ok: false, count: 0, sampleTitles: [] };
  }
}
