import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * Valores distintos usados para popular os selects de filtro (cidade e
 * área/categoria). Aceita `?cities=Cidade1,Cidade2` pra restringir a lista
 * de cidades retornada — usado pelos links com escopo de cidade (ver
 * src/lib/useCityScope.ts), pra que nem essa resposta revele cidades fora
 * do escopo.
 */
export async function GET(req: NextRequest) {
  const scope = (req.nextUrl.searchParams.get("cities") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const [cities, categories] = await Promise.all([
    scope.length ? sql`select distinct city from jobs where city = any(${scope}) order by city` : sql`select distinct city from jobs order by city`,
    sql`select distinct category from jobs where category is not null order by category`,
  ]);

  return NextResponse.json({
    cities: (cities as { city: string }[]).map((r) => r.city),
    categories: (categories as { category: string }[]).map((r) => r.category),
  });
}
