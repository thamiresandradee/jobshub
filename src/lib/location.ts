/**
 * Separa "Cidade, Estado/País" (formato que a Greenhouse e a Lever devolvem
 * como uma string livre só) em cidade e estado. Importante fazer isso antes
 * de gravar `city`: o filtro de múltiplas cidades usa vírgula como separador
 * na URL (?city=A,B — ver FiltersBar.tsx e /api/jobs), então uma vírgula
 * sobrevivendo dentro do próprio valor de `city` faz esse valor virar duas
 * cidades erradas na hora de filtrar (bug real encontrado com a Adzuna, que
 * tem sua própria extração — ver src/lib/connectors/adzuna.ts).
 */
export function splitLocation(raw: string): { city: string; state: string | null } {
  const [city, ...rest] = raw.split(",").map((s) => s.trim());
  return { city: city || raw.trim(), state: rest.length > 0 ? rest.join(", ") : null };
}

const BR_UF_CODES = new Set(["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"]);

const BR_STATE_NAMES = new Set([
  "acre", "alagoas", "amapa", "amazonas", "bahia", "ceara", "distrito federal", "espirito santo", "goias",
  "maranhao", "mato grosso", "mato grosso do sul", "minas gerais", "para", "paraiba", "parana", "pernambuco",
  "piaui", "rio de janeiro", "rio grande do norte", "rio grande do sul", "rondonia", "roraima", "santa catarina",
  "sao paulo", "sergipe", "tocantins", "brasil", "brazil",
]);

function normalizeForCompare(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Infere o país a partir da parte "estado/região" de uma localização em
 * texto livre (o que a Greenhouse/Lever devolvem — ver splitLocation acima).
 * Se bater com um estado/UF brasileiro conhecido, é Brasil; senão, assume
 * que o texto já É o nome do país (comum em vaga internacional: "Remote,
 * Italy" -> state="Italy" -> country="Italy"). Sem "estado" nenhum pra
 * examinar (ex.: local só "Remote", sem vírgula), o país fica desconhecido
 * (null) — tratado como Brasil por padrão no filtro (ver cityFilter.ts).
 */
export function inferCountry(statePart: string | null): string | null {
  if (!statePart) return null;
  const norm = normalizeForCompare(statePart);
  if (!norm) return null;
  if (BR_UF_CODES.has(norm) || BR_STATE_NAMES.has(norm)) return "Brasil";
  return statePart.trim();
}
