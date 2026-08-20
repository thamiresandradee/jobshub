import { XMLParser } from "fast-xml-parser";
import { parseBRNumber } from "./brNumber";
import { parseSalaryRange } from "./salary";

/**
 * Parser tolerante para feeds estruturados de vagas (JSON ou XML).
 *
 * Não existe um único padrão oficial usado por todos os sistemas de
 * recrutamento (Gupy, Kenoby, Greenhouse, Lever, feeds no formato do
 * Indeed/LinkedIn XML, etc.), mas a grande maioria expõe a mesma "forma":
 * uma lista repetida de vagas, cada uma com campos de cargo, empresa,
 * localização, características e valores — só variando os nomes dos campos
 * (em inglês ou português) e o formato de serialização (a maioria dos ATS
 * modernos usa JSON; alguns feeds mais antigos/agregadores usam XML).
 *
 * Em vez de escrever um parser rígido para um schema específico (o que
 * quebraria a cada fonte diferente), este módulo:
 *   1. Faz o parse do documento (JSON.parse ou XMLParser, conforme o
 *      formato) — o resultado, nos dois casos, é a mesma árvore genérica de
 *      objetos/arrays, então o resto da lógica é compartilhado.
 *   2. Acha automaticamente a coleção repetida de vagas dentro do documento
 *      (o maior array de objetos).
 *   3. "Achata" cada vaga em um mapa chave->valor (ignorando a
 *      profundidade de aninhamento).
 *   4. Usa listas de nomes alternativos (aliases) para achar cada campo.
 *
 * O resultado é "best effort": campos não encontrados ficam null. Isso é
 * aceitável para o objetivo do projeto (agregador simples), mas não é
 * garantia de 100% de compatibilidade com qualquer feed do mercado.
 */

export type ParsedJob = {
  externalId: string;
  title: string;
  description: string | null;
  company: string | null;
  workType: string | null;
  seniority: string | null;
  contractType: string | null;
  category: string | null;
  city: string;
  state: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  sourceUrl: string | null;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

const FIELD_ALIASES: Record<string, string[]> = {
  id: ["id", "jobid", "job_id", "vagaid", "codigo", "código", "code", "ref", "referencia", "referência"],
  title: ["title", "jobtitle", "titulo", "título", "cargo", "position", "role", "name", "nome"],
  description: ["description", "descricao", "descrição", "details", "responsibilities", "resumo"],
  company: ["company", "companyname", "empresa", "employer", "organization", "organizacao"],
  workType: ["worktype", "remotetype", "workplacetype", "modalidade", "regimetrabalho", "remote"],
  seniority: ["seniority", "senioridade", "level", "experiencelevel", "nivel", "nível"],
  contractType: ["contracttype", "employmenttype", "tipocontrato", "regime", "jobtype", "vinculo", "vínculo"],
  category: ["category", "categoria", "area", "área", "department", "departamento"],
  city: ["city", "cidade", "location", "localidade"],
  state: ["state", "uf", "estado"],
  salaryMin: ["salarymin", "minsalary", "salariomin", "salariominimo", "basesalary", "paymin"],
  salaryMax: ["salarymax", "maxsalary", "salariomax", "salariomaximo", "paymax"],
  salary: ["salary", "salario", "salário", "salaryrange", "faixasalarial", "remuneracao", "remuneração"],
  sourceUrl: ["url", "link", "joburl", "applyurl", "vagaurl"],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Acha o array de objetos mais "denso" no documento — assumido como a lista de vagas. */
function findListingsArray(node: unknown): Record<string, unknown>[] {
  let best: Record<string, unknown>[] = [];

  function walk(n: unknown) {
    if (Array.isArray(n)) {
      const objectItems = n.filter(isPlainObject);
      if (objectItems.length > best.length) {
        best = objectItems;
      }
      for (const item of n) walk(item);
    } else if (isPlainObject(n)) {
      for (const value of Object.values(n)) walk(value);
    }
  }

  walk(node);
  return best;
}

/** Achata um objeto de vaga em um mapa chave(lowercase, sem separadores) -> valor escalar. */
function flattenLeaves(obj: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
  if (!isPlainObject(obj)) return out;

  for (const [rawKey, val] of Object.entries(obj)) {
    if (rawKey.startsWith("@_")) continue;
    if (val === null || val === undefined || val === "") continue;

    const key = rawKey.toLowerCase().replace(/[-_\s]/g, "");

    if (Array.isArray(val)) {
      const scalarFirst = val.find((v) => !isPlainObject(v) && !Array.isArray(v));
      if (scalarFirst !== undefined && out[key] === undefined) out[key] = scalarFirst;
      for (const v of val) {
        if (isPlainObject(v)) flattenLeaves(v, out);
      }
    } else if (isPlainObject(val)) {
      if ("#text" in val && out[key] === undefined) {
        out[key] = (val as Record<string, unknown>)["#text"];
      }
      flattenLeaves(val, out);
    } else {
      if (out[key] === undefined) out[key] = val;
    }
  }

  return out;
}

function pick(map: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const v = map[alias];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function normalizeWorkType(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/remot|home.?office/.test(s)) return "remoto";
  if (/h[ií]brid/.test(s)) return "hibrido";
  if (/presencial|on.?site/.test(s)) return "presencial";
  return s;
}

function normalizeSeniority(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/est[aá]gi/.test(s)) return "estagio";
  if (/j[uú]nior|\bjr\b/.test(s)) return "junior";
  if (/pleno/.test(s)) return "pleno";
  if (/s[eê]nior|\bsr\b/.test(s)) return "senior";
  if (/especialista/.test(s)) return "especialista";
  return s;
}

function normalizeContractType(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/\bclt\b/.test(s)) return "clt";
  if (/\bpj\b|pessoa jur[ií]dica/.test(s)) return "pj";
  if (/est[aá]gi/.test(s)) return "estagio";
  if (/freelan/.test(s)) return "freelancer";
  if (/tempor[aá]rio/.test(s)) return "temporario";
  return s;
}

export type FeedParseResult = {
  jobs: ParsedJob[];
  warnings: string[];
};

function parseListings(rawListings: Record<string, unknown>[]): FeedParseResult {
  const warnings: string[] = [];
  const jobs: ParsedJob[] = [];

  rawListings.forEach((raw, idx) => {
    const flat = flattenLeaves(raw);
    const externalId = pick(flat, FIELD_ALIASES.id) ?? String(idx);
    const title = pick(flat, FIELD_ALIASES.title);
    const city = pick(flat, FIELD_ALIASES.city) ?? (normalizeWorkType(pick(flat, FIELD_ALIASES.workType)) === "remoto" ? "Remoto" : undefined);

    if (!title || !city) {
      warnings.push(`Vaga #${externalId} ignorada: sem título ou cidade.`);
      return;
    }

    let salaryMin = parseBRNumber(pick(flat, FIELD_ALIASES.salaryMin));
    let salaryMax = parseBRNumber(pick(flat, FIELD_ALIASES.salaryMax));
    if (salaryMin === null && salaryMax === null) {
      const rawSalary = pick(flat, FIELD_ALIASES.salary);
      if (rawSalary) {
        const range = parseSalaryRange(rawSalary);
        salaryMin = range.min;
        salaryMax = range.max;
      }
    }

    jobs.push({
      externalId,
      title,
      description: pick(flat, FIELD_ALIASES.description) ?? null,
      company: pick(flat, FIELD_ALIASES.company) ?? null,
      workType: normalizeWorkType(pick(flat, FIELD_ALIASES.workType)),
      seniority: normalizeSeniority(pick(flat, FIELD_ALIASES.seniority)),
      contractType: normalizeContractType(pick(flat, FIELD_ALIASES.contractType)),
      category: pick(flat, FIELD_ALIASES.category) ?? null,
      city,
      state: pick(flat, FIELD_ALIASES.state) ?? null,
      salaryMin,
      salaryMax,
      sourceUrl: pick(flat, FIELD_ALIASES.sourceUrl) ?? null,
    });
  });

  return { jobs, warnings };
}

export function parseJobFeedXml(xml: string): FeedParseResult {
  let doc: unknown;
  try {
    doc = xmlParser.parse(xml);
  } catch (err) {
    throw new Error(`XML inválido: ${(err as Error).message}`);
  }

  const rawListings = findListingsArray(doc);
  if (rawListings.length === 0) {
    throw new Error("Não foi possível encontrar uma lista de vagas no feed XML.");
  }
  return parseListings(rawListings);
}

export function parseJobFeedJson(json: string): FeedParseResult {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (err) {
    throw new Error(`JSON inválido: ${(err as Error).message}`);
  }

  const rawListings = findListingsArray(doc);
  if (rawListings.length === 0) {
    throw new Error("Não foi possível encontrar uma lista de vagas no feed JSON.");
  }
  return parseListings(rawListings);
}
