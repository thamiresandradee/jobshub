/**
 * Normaliza o nome da cidade: capitaliza cada palavra, assim "sao paulo",
 * "SAO PAULO" e "São Paulo" viram todos o mesmo valor no filtro. Vagas sem
 * cidade física (100% remotas sem base definida) usam o valor especial
 * "Remoto", tratado à parte em src/lib/htmlScraper.ts e src/lib/feedParser.ts.
 *
 * É uma lista manual de aliases, não um algoritmo de similaridade — de
 * propósito. Fuzzy-matching automático arriscaria fundir cidades diferentes
 * que só parecem parecidas. Cada variação nova entra aqui só depois de
 * confirmada.
 */
const CITY_ALIASES: Record<string, string> = {};

function titleCase(raw: string): string {
  // Capitaliza a letra que vem logo após o início da string ou qualquer
  // caractere que não seja letra (espaço, apóstrofo, crase, hífen...).
  return raw.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, boundary, letter) => boundary + letter.toUpperCase());
}

export function normalizeCityName(raw: string): string {
  let trimmed = raw.trim().replace(/`/g, "'");
  if (/^remoto$/i.test(trimmed)) return "Remoto";

  // O filtro de múltiplas cidades (?city=A,B — ver FiltersBar.tsx e
  // /api/jobs) usa vírgula como separador. Uma vírgula sobrevivendo aqui
  // (ex.: conector que devolve "Cidade, Estado" sem ter sido separado antes)
  // faria esse valor virar duas cidades erradas na hora de filtrar — troca
  // por um traço pra nunca colidir com o separador.
  trimmed = trimmed.replace(/,/g, " -").replace(/\s+/g, " ").trim();

  const alias = CITY_ALIASES[trimmed.toLowerCase()];
  return alias ?? titleCase(trimmed);
}
