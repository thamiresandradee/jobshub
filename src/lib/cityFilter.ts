import type { ParsedJob } from "./feedParser";

/**
 * Gupy, Greenhouse e Lever não têm um parâmetro de localização na API deles
 * — o board devolve TODAS as vagas da empresa no Brasil inteiro, sempre. A
 * Adzuna e a Jooble são diferentes: são busca de verdade, com `where`/
 * `location` restringindo direto na origem.
 *
 * Pra essas três (board completo), a coluna `city` da fonte funciona como
 * um filtro aplicado *depois* de buscar tudo: lista de cidades aceitas,
 * separadas por vírgula, comparação sem acento/maiúscula. Vaga remota
 * sempre passa, independente da cidade configurada — é o que faz sentido
 * pra alguém "de Campinas" também poder pegar vaga remota.
 *
 * Uma das palavras em NO_RESTRICTION_WORDS desliga o filtro por completo
 * (importa o board inteiro, sem restringir por cidade) — é o padrão de
 * quem cadastra uma empresa sem se importar com localização.
 */
const NO_RESTRICTION_WORDS = new Set(["nacional", "brasil", "brazil", "todas", "todas as cidades", "*"]);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filterByCityAllowlist(jobs: ParsedJob[], cityField: string): ParsedJob[] {
  if (NO_RESTRICTION_WORDS.has(normalize(cityField))) return jobs;

  const allowed = cityField
    .split(",")
    .map((c) => normalize(c))
    .filter(Boolean);
  if (allowed.length === 0) return jobs;

  return jobs.filter((j) => {
    if (j.workType === "remoto") return true;
    const jobCity = normalize(j.city);
    return allowed.some((a) => jobCity.includes(a) || a.includes(jobCity));
  });
}
