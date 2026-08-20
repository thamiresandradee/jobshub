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
