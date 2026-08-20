import { parseBRNumber } from "./brNumber";

const AMOUNT_RE = /R\$\s?[\d.,]+/g;
const FROM_RE = /a partir de|acima de|desde/i;
const UP_TO_RE = /at[eé]|no m[aá]ximo/i;

/**
 * Extrai faixa salarial de um texto livre ("R$ 3.000 a R$ 5.000", "A partir
 * de R$ 4.500", "Até R$ 8.000", "R$ 6.000,00", "A combinar"). Best effort:
 * texto sem nenhum valor em R$ retorna { min: null, max: null } — cai no
 * mesmo "a combinar" que o resto do app já trata como ausência de dado.
 */
export function parseSalaryRange(text: string): { min: number | null; max: number | null } {
  const matches = text.match(AMOUNT_RE);
  if (!matches || matches.length === 0) return { min: null, max: null };

  const amounts = matches.map((m) => parseBRNumber(m.replace(/^R\$\s?/, ""))).filter((n): n is number => n !== null);
  if (amounts.length === 0) return { min: null, max: null };

  if (amounts.length >= 2) {
    return { min: Math.min(...amounts), max: Math.max(...amounts) };
  }

  const value = amounts[0];
  if (UP_TO_RE.test(text)) return { min: null, max: value };
  if (FROM_RE.test(text)) return { min: value, max: null };
  return { min: value, max: value };
}
