import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ParsedJob } from "./feedParser";
import { parseSalaryRange } from "./salary";
import { WORK_TYPE_KEYWORDS, SENIORITY_KEYWORDS, CONTRACT_KEYWORDS, CATEGORY_KEYWORDS, matchFirst } from "./jobKeywords";
import { inferCountry } from "./location";

/**
 * Scraper genérico "melhor esforço" para páginas de busca/listagem de
 * vagas. Usado quando a fonte não tem (ou o usuário não tem acesso a) um
 * feed estruturado — nesse caso, extraímos os dados direto do HTML público
 * do site, que é exatamente o que qualquer visitante vê no navegador.
 *
 * Não existe um padrão de HTML entre sites de vaga (cada ATS/tema usa uma
 * estrutura diferente), então em vez de um parser fixo pra um site
 * específico, usamos uma heurística baseada em convenções comuns:
 *   - Cada vaga tem um link de detalhe (título/card). A partir dele, subimos
 *     a árvore até achar um ancestral que contenha um sinal de localização
 *     (padrão "Cidade, UF"/"Cidade/UF" ou a palavra "remoto") — ver
 *     `climbToCard`. Diferente de imóveis (que sempre tem preço), vaga
 *     frequentemente omite salário ("a combinar"), então localização é o
 *     sinal mais confiável e quase universal.
 *   - Salário, modalidade (remoto/híbrido/presencial), senioridade, regime
 *     de contrato e área são extraídos via texto em português.
 *   - Paginação é descoberta a partir de blocos com classe contendo "pag"
 *     ou de links com `rel="next"`.
 *   - Uma tag `<base href>`, se existir, é respeitada na resolução de
 *     links relativos.
 *
 * Resultado "best effort": funciona bem em sites renderizados no servidor
 * com HTML tradicional, mas não funciona em sites que montam a listagem
 * inteiramente via JavaScript no navegador (SPA — o caso de muitos grandes
 * portais de emprego), já que não usamos um navegador headless aqui.
 */

export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SALARY_RE = /R\$\s?[\d.,]+/;
const REMOTE_WORD_RE = /remoto|home[\s-]?office/i;
const CITY_UF_RE = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\s-]{1,38})[,/]\s*([A-Za-z]{2})\b/;
const LOCATION_HINT_RE = new RegExp(`${REMOTE_WORD_RE.source}|${CITY_UF_RE.source}`, "i");

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function effectiveBase($: CheerioAPI, pageUrl: string): string {
  const baseHref = $("base[href]").first().attr("href");
  if (!baseHref) return pageUrl;
  return resolveUrl(baseHref, pageUrl) ?? pageUrl;
}

function sameHost(url: string, base: string): boolean {
  try {
    return new URL(url).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
}

/**
 * Procura o padrão "Cidade, UF" / "Cidade/UF" no texto de nós "folha" (sem
 * filhos elemento) dentro do card. Usar só o texto próprio de cada nó — em
 * vez do texto inteiro do card concatenado — evita grudar esse padrão com o
 * final do título ou da descrição, que costumam ficar em elementos vizinhos.
 */
function findCityState($: CheerioAPI, card: ReturnType<CheerioAPI>): { city: string; state: string } | null {
  const leafRe = new RegExp(`^${CITY_UF_RE.source}$`);
  const leaf = card
    .find("*")
    .toArray()
    .find((el) => {
      const node = $(el);
      if (node.children().length > 0) return false;
      const text = node.text().replace(/\s+/g, " ").trim();
      return leafRe.test(text);
    });
  if (!leaf) return null;

  const text = $(leaf).text().replace(/\s+/g, " ").trim();
  const match = text.match(leafRe);
  if (!match) return null;
  return { city: match[1].trim(), state: match[2].toUpperCase() };
}

/** Procura texto de um elemento cuja classe/id sugira "nome da empresa". */
function findCompany($: CheerioAPI, card: ReturnType<CheerioAPI>): string | null {
  const el = card.find('[class*="compan" i], [class*="empresa" i], [id*="compan" i], [id*="empresa" i]').first();
  const text = el.text().replace(/\s+/g, " ").trim();
  return text || null;
}

const MAX_CARD_LEVELS = 9;
const MAX_CARD_TEXT = 3000;

/**
 * Sobe a árvore a partir de um link de vaga até achar um ancestral que
 * contenha um sinal de localização (cidade/UF ou "remoto") — o dado mais
 * universal entre anúncios de vaga, já que salário costuma faltar.
 * Limitado por altura e por tamanho de texto pra nunca acabar "explodindo"
 * pro contêiner da página inteira quando o sinal não aparece perto.
 */
function climbToCard($: CheerioAPI, start: ReturnType<CheerioAPI>): ReturnType<CheerioAPI> {
  let node = start;
  let best = start;

  for (let i = 0; i <= MAX_CARD_LEVELS; i++) {
    const text = node.text();
    if (text.length > MAX_CARD_TEXT) break;
    best = node;
    if (LOCATION_HINT_RE.test(text)) return node;

    const parent = node.parent();
    if (!parent.length) break;
    node = parent;
  }

  return best;
}

export type ScrapedPage = {
  jobs: ParsedJob[];
  paginationUrls: string[];
};

const DETAIL_PATH_KEYWORDS = new Set(["vaga", "vagas", "job", "jobs", "position", "cargo", "opportunity", "opportunities"]);

export function scrapeListingHtml(html: string, pageUrl: string, defaultCity: string): ScrapedPage {
  const $ = cheerio.load(html);
  const base = effectiveBase($, pageUrl);

  // 1. Acha os links candidatos a "detalhe da vaga": mesma origem, fora de
  // nav/header/footer (evita pegar itens de menu repetidos), e cujo caminho
  // termina em número/slug (padrão comum de URL de vaga) ou tem um segmento
  // inteiro igual a uma palavra típica de anúncio de emprego.
  const hrefGroups = new Map<string, ReturnType<CheerioAPI>[]>();

  $("a[href]").each((_, el) => {
    const node = $(el);
    if (node.closest("nav,header,footer").length > 0) return;

    const rawHref = node.attr("href");
    if (!rawHref || rawHref.startsWith("javascript:") || rawHref.startsWith("#")) return;

    const abs = resolveUrl(rawHref, base);
    if (!abs || !sameHost(abs, base)) return;

    const path = new URL(abs).pathname;
    // Um link cujo caminho é idêntico ao da própria página de listagem (só
    // muda a query string) é sempre paginação/ordenação, nunca o detalhe de
    // uma vaga — mesmo quando o caminho contém uma palavra-chave da lista
    // abaixo (ex.: a própria listagem em "/vagas", paginada via "/vagas?page=2").
    if (path === new URL(base).pathname) return;

    const segments = path.toLowerCase().split("/").filter(Boolean);
    const looksLikeDetail = /\/[\w-]*\d[\w-]*\/?$/.test(path) || segments.some((seg) => DETAIL_PATH_KEYWORDS.has(seg));
    if (!looksLikeDetail) return;

    const key = abs.split("#")[0];
    if (!hrefGroups.has(key)) hrefGroups.set(key, []);
    hrefGroups.get(key)!.push(node);
  });

  const jobs: ParsedJob[] = [];

  for (const [href, nodes] of hrefGroups) {
    const card = climbToCard($, nodes[0]);
    const cardText = card.text().replace(/\s+/g, " ").trim();
    const titleAttrs = card
      .find("[title]")
      .toArray()
      .map((e) => $(e).attr("title") ?? "")
      .join(" ");
    const fullText = `${cardText} ${titleAttrs}`;

    const salaryText = fullText.match(SALARY_RE) ? fullText : "";
    const { min: salaryMin, max: salaryMax } = parseSalaryRange(salaryText);

    const workType = matchFirst(fullText, WORK_TYPE_KEYWORDS);
    const seniority = matchFirst(fullText, SENIORITY_KEYWORDS);
    const contractType = matchFirst(fullText, CONTRACT_KEYWORDS);
    const category = matchFirst(`${pageUrl} ${fullText}`, CATEGORY_KEYWORDS);

    const cityState = findCityState($, card);
    const city = cityState?.city ?? (workType === "remoto" ? "Remoto" : defaultCity);
    const state = cityState?.state ?? null;

    const heading = card.find("h1,h2,h3,h4").first().text().trim();
    const title = heading || cardText.slice(0, 80) || "Vaga";
    const company = findCompany($, card);

    jobs.push({
      externalId: href,
      title,
      description: null,
      company,
      workType,
      seniority,
      contractType,
      category,
      city,
      state,
      country: inferCountry(state),
      salaryMin,
      salaryMax,
      sourceUrl: href,
    });
  }

  // 2. Descobre links de paginação: blocos com classe contendo "pag", ou
  // links marcados como próxima página.
  const paginationUrls = new Set<string>();
  $('[class*="pag" i] a[href], a[rel="next"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("javascript:")) return;
    const abs = resolveUrl(href, base);
    if (abs && sameHost(abs, base) && abs !== base) paginationUrls.add(abs);
  });

  return { jobs, paginationUrls: [...paginationUrls] };
}

export type CrawlResult = {
  jobs: ParsedJob[];
  pagesVisited: number;
  warnings: string[];
};

const MAX_PAGES = 40;
const FETCH_CONCURRENCY = 4;

/**
 * Continua o rastreamento de páginas de listagem a partir de uma primeira
 * página já baixada e processada (`seedPage`), pra não precisar buscar essa
 * mesma URL de novo. Quem chama decide o quê fazer com a primeira página
 * (ex.: `sync.ts` já baixou o HTML pra decidir o formato).
 */
export async function crawlListingPages(seedUrl: string, defaultCity: string, seedPage: ScrapedPage): Promise<CrawlResult> {
  const visited = new Set<string>([seedUrl]);
  const toVisit: string[] = [...seedPage.paginationUrls];
  const jobsByHref = new Map<string, ParsedJob>();
  for (const j of seedPage.jobs) jobsByHref.set(j.externalId, j);
  const warnings: string[] = [];

  while (toVisit.length > 0 && visited.size < MAX_PAGES) {
    const batch = toVisit.splice(0, FETCH_CONCURRENCY).filter((u) => !visited.has(u));
    for (const u of batch) visited.add(u);

    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": SCRAPER_USER_AGENT },
            signal: AbortSignal.timeout(15_000),
            cache: "no-store",
          });
          if (!res.ok) {
            warnings.push(`Falha ao buscar ${url}: HTTP ${res.status}`);
            return null;
          }
          const html = await res.text();
          return scrapeListingHtml(html, url, defaultCity);
        } catch (err) {
          warnings.push(`Erro ao buscar ${url}: ${(err as Error).message}`);
          return null;
        }
      })
    );

    for (const result of results) {
      if (!result) continue;
      for (const j of result.jobs) {
        jobsByHref.set(j.externalId, j);
      }
      for (const nextUrl of result.paginationUrls) {
        if (!visited.has(nextUrl) && !toVisit.includes(nextUrl) && visited.size + toVisit.length < MAX_PAGES) {
          toVisit.push(nextUrl);
        }
      }
    }
  }

  return { jobs: [...jobsByHref.values()], pagesVisited: visited.size, warnings };
}
