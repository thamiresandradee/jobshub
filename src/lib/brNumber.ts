/**
 * Converte um número em formato brasileiro/feed (R$ 3.000 / R$ 5.500,00 /
 * 1.234.567,89 / 5000.00) pra float.
 *
 * Regra: se tem vírgula, ela é o separador decimal e os pontos são milhar
 * (padrão BR: "5.500,00"). Se não tem vírgula mas tem um único ponto,
 * desambiguamos pela quantidade de dígitos depois dele — exatamente 3
 * dígitos é quase sempre separador de milhar ("3.000" = 3000), qualquer
 * outra quantidade é decimal ("3000.5" = 3000.5, "5000.00" = 5000).
 * Isso evita o erro clássico de ler "R$ 3.000" (sem centavos) como 3,0.
 */
export function parseBRNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,]/g, "").trim();
  if (!s) return null;

  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    const dotParts = s.split(".");
    if (dotParts.length === 2 && dotParts[1].length === 3) {
      s = dotParts.join("");
    }
    // múltiplos pontos sem vírgula ("1.234.567") também é sempre milhar
    else if (dotParts.length > 2) {
      s = dotParts.join("");
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
