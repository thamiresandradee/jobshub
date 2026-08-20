import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * Valores distintos usados para popular os selects de filtro (cidade e
 * área/categoria). Aceita `?cities=Cidade1,Cidade2` pra restringir a lista
 * de cidades retornada — usado pelos links com escopo de cidade (ver
 * src/lib/useCityScope.ts), pra que nem essa resposta revele cidades fora
 * do escopo. Aceita `?abroad=true` pra só listar cidade de vaga no exterior
 * (mesmo filtro Brasil/exterior de /api/jobs — ver ali o porquê do
 * país null contar como Brasil).
 */
export async function GET(req: NextRequest) {
  const scope = (req.nextUrl.searchParams.get("cities") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const abroad = req.nextUrl.searchParams.get("abroad") === "true";

  const countryCondition = abroad ? "(city = 'Remoto' or (country is not null and lower(country) <> 'brasil'))" : "(city = 'Remoto' or country is null or lower(country) = 'brasil')";

  const cityParams: unknown[] = [];
  const cityConditions = [countryCondition];
  if (scope.length) {
    cityParams.push(scope);
    cityConditions.push(`city = any($${cityParams.length})`);
  }

  const [cities, categories] = await Promise.all([
    sql.query(`select distinct city from jobs where ${cityConditions.join(" and ")} order by city`, cityParams),
    sql`select distinct category from jobs where category is not null order by category`,
  ]);

  return NextResponse.json({
    cities: (cities as { city: string }[]).map((r) => r.city),
    categories: (categories as { category: string }[]).map((r) => r.category),
  });
}
