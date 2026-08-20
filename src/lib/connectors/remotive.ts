import type { ParsedJob } from "../feedParser";
import { SENIORITY_KEYWORDS, matchFirst } from "../jobKeywords";

/**
 * Conector para a API pública da Remotive (https://remotive.com/api-documentation).
 *
 * A própria Remotive documenta, na resposta da API, que é permitido exibir
 * as vagas dela em site de terceiro DESDE QUE: (a) sempre linkemos de volta
 * pra URL original da vaga no Remotive (`job.url`, guardado aqui como
 * `sourceUrl` — é o link que o JobCard usa no botão "Ver vaga"), (b)
 * mostremos "Remotive" como fonte (o nome da fonte cadastrada já cumpre
 * isso), e (c) não façamos mais que ~4 requisições por dia — nosso cron
 * diário já respeita esse limite com folga.
 *
 * A Remotive é 100% vagas remotas, mas hospeda vagas de empresas do mundo
 * inteiro — a maioria não aceita candidatos do Brasil. Filtramos por
 * `candidate_required_location` pra manter só o que é plausivelmente
 * elegível pra alguém no Brasil (Brasil, LATAM, Américas ou global/mundial).
 * Salário vem em texto livre e normalmente em USD/EUR — como o resto do app
 * assume R$, não convertemos: fica "A combinar" em vez de mostrar um número
 * na moeda errada.
 */

const RELEVANT_LOCATION_RE = /brazil|brasil|latam|latin america|am[ée]rica latina|americas\b|worldwide|anywhere|global|remote$/i;

const JOB_TYPE_TO_CONTRACT: Record<string, string> = {
  contract: "pj",
  freelance: "freelancer",
  internship: "estagio",
};

type RemotiveJob = {
  id: number | string;
  url: string;
  title: string;
  company_name: string;
  category: string;
  job_type: string;
  candidate_required_location: string;
};

export async function fetchRemotiveJobs(): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  const res = await fetch("https://remotive.com/api/remote-jobs", {
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Remotive retornou HTTP ${res.status}`);
  }
  const data = (await res.json()) as { jobs?: RemotiveJob[] };
  const rawJobs = data.jobs ?? [];

  const jobs: ParsedJob[] = [];
  for (const j of rawJobs) {
    if (!RELEVANT_LOCATION_RE.test(j.candidate_required_location ?? "")) continue;
    if (!j.title || !j.url) continue;

    jobs.push({
      externalId: String(j.id),
      title: j.title,
      description: null,
      company: j.company_name ?? null,
      workType: "remoto",
      seniority: matchFirst(j.title, SENIORITY_KEYWORDS),
      contractType: JOB_TYPE_TO_CONTRACT[j.job_type] ?? null,
      category: j.category ?? null,
      city: "Remoto",
      state: null,
      salaryMin: null,
      salaryMax: null,
      sourceUrl: j.url,
    });
  }

  return { jobs, warnings: [] };
}
