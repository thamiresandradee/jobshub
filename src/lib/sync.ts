import { sql } from "./db";
import { parseJobFeedJson, parseJobFeedXml, type ParsedJob } from "./feedParser";
import { scrapeListingHtml, crawlListingPages, SCRAPER_USER_AGENT } from "./htmlScraper";
import { normalizeCityName } from "./cityName";
import { fetchRemotiveJobs } from "./connectors/remotive";
import { fetchGreenhouseJobs } from "./connectors/greenhouse";
import { fetchLeverJobs } from "./connectors/lever";
import { fetchAdzunaJobs } from "./connectors/adzuna";
import type { JobSource } from "./types";

export type SyncResult =
  | { success: true; count: number; mode: string; warnings: string[] }
  | { success: false; error: string };

/**
 * Fontes com `connector` preenchido usam uma integração embutida (API
 * pública conhecida) em vez do fetch genérico de `source_url` — ver
 * src/lib/connectors/. `connector_config` guarda o que essa integração
 * precisa (slug da empresa na Greenhouse/Lever, termo buscado na Adzuna).
 */
async function fetchViaConnector(source: JobSource): Promise<{ jobs: ParsedJob[]; warnings: string[] }> {
  switch (source.connector) {
    case "remotive":
      return fetchRemotiveJobs();
    case "greenhouse":
      return fetchGreenhouseJobs(source.connector_config ?? "", source.name);
    case "lever":
      return fetchLeverJobs(source.connector_config ?? "", source.name);
    case "adzuna":
      return fetchAdzunaJobs(source.connector_config ?? "", source.city);
    default:
      throw new Error(`Conector desconhecido: ${source.connector}`);
  }
}

/** Executa Promise.all em lotes pequenos, pra não abrir dezenas de conexões de uma vez. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Sincroniza as vagas de uma fonte. Duas formas de obter os dados:
 *
 *  1. Conector embutido (`source.connector` preenchido) — API pública
 *     conhecida (Remotive, Greenhouse, Lever, Adzuna), ver
 *     src/lib/connectors/. Preferível sempre que existir: são endpoints
 *     feitos pra esse uso, sem risco de ToS.
 *  2. Genérico (`source.connector` nulo) — busca `source.source_url` e
 *     detecta o formato sozinho pelo `content-type`/corpo da resposta: JSON
 *     ou XML estruturado (src/lib/feedParser.ts), ou HTML best-effort
 *     (src/lib/htmlScraper.ts) como último recurso.
 */
export async function syncSource(sourceId: string): Promise<SyncResult> {
  const rows = (await sql`select * from sources where id = ${sourceId}`) as JobSource[];
  const source = rows[0];
  if (!source) {
    return { success: false, error: "Fonte não encontrada." };
  }

  try {
    let jobs: ParsedJob[];
    let warnings: string[] = [];
    let mode: string;

    if (source.connector) {
      const result = await fetchViaConnector(source);
      jobs = result.jobs;
      warnings = result.warnings;
      mode = source.connector;
    } else {
      const res = await fetch(source.source_url, {
        headers: { "User-Agent": SCRAPER_USER_AGENT, Accept: "application/json, application/xml, text/html" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store", // o fetch do Next.js faz cache/dedup por padrão; sync sempre quer dado fresco
      });
      if (!res.ok) {
        throw new Error(`URL retornou HTTP ${res.status}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();
      const trimmed = body.trimStart();

      const looksJson = contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
      const looksXml = !looksJson && (contentType.includes("xml") || /^<\?xml/i.test(trimmed));

      if (looksJson) {
        const parsed = parseJobFeedJson(body);
        jobs = parsed.jobs;
        warnings = parsed.warnings;
        mode = "json";
      } else if (looksXml) {
        const parsed = parseJobFeedXml(body);
        jobs = parsed.jobs;
        warnings = parsed.warnings;
        mode = "xml";
      } else {
        const seedPage = scrapeListingHtml(body, source.source_url, source.city);
        const crawl = await crawlListingPages(source.source_url, source.city, seedPage);
        jobs = crawl.jobs;
        warnings = crawl.warnings;
        mode = "html";
      }
    }

    if (jobs.length === 0) {
      throw new Error(
        mode === "html"
          ? "A página foi lida, mas não conseguimos reconhecer nenhum card de vaga nela."
          : `A busca foi feita (${mode}), mas nenhuma vaga válida foi encontrada.`
      );
    }

    await inBatches(jobs, 8, async (j) => {
      await sql`
        insert into jobs (
          source_id, external_id, title, description, company, work_type, seniority,
          contract_type, category, city, state, salary_min, salary_max, source_url, updated_at
        ) values (
          ${sourceId}, ${j.externalId}, ${j.title}, ${j.description}, ${j.company}, ${j.workType}, ${j.seniority},
          ${j.contractType}, ${j.category}, ${normalizeCityName(j.city)}, ${j.state}, ${j.salaryMin}, ${j.salaryMax}, ${j.sourceUrl}, now()
        )
        on conflict (source_id, external_id) do update set
          title = excluded.title,
          description = excluded.description,
          company = excluded.company,
          work_type = excluded.work_type,
          seniority = excluded.seniority,
          contract_type = excluded.contract_type,
          category = excluded.category,
          city = excluded.city,
          state = excluded.state,
          salary_min = excluded.salary_min,
          salary_max = excluded.salary_max,
          source_url = excluded.source_url,
          updated_at = now()
      `;
    });

    // Remove do nosso banco vagas que não vieram mais na fonte (preenchidas/expiradas).
    const currentIds = jobs.map((j) => j.externalId);
    await sql`
      delete from jobs
      where source_id = ${sourceId}
        and not (external_id = any(${currentIds}))
    `;

    const countRows = (await sql`select count(*)::int as count from jobs where source_id = ${sourceId}`) as {
      count: number;
    }[];
    const count = countRows[0]?.count ?? jobs.length;

    await sql`
      update sources
      set last_synced_at = now(), last_sync_status = 'success', last_sync_error = null, jobs_count = ${count}
      where id = ${sourceId}
    `;

    return { success: true, count, mode, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao sincronizar.";
    await sql`
      update sources
      set last_synced_at = now(), last_sync_status = 'error', last_sync_error = ${message}
      where id = ${sourceId}
    `;
    return { success: false, error: message };
  }
}
