import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { probeGreenhouse } from "@/lib/connectors/greenhouse";
import { probeLever } from "@/lib/connectors/lever";

/**
 * Tenta achar automaticamente a API pública de vagas de uma empresa nas ATS
 * mais comuns (Greenhouse, Lever), a partir só do nome dela — resolve o caso
 * "eu sei o nome da empresa, mas não sei o link do board de vagas". Gera
 * alguns slugs candidatos (variações de como o nome costuma virar URL) e
 * testa cada um contra as duas APIs em paralelo.
 */

function slugCandidates(name: string): string[] {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\b(ltda|s\.?a\.?|s\/a|inc|llc|corp|ltd)\b\.?/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();

  const noSpace = base.replace(/\s+/g, "");
  const hyphenated = base.replace(/\s+/g, "-").replace(/-+/g, "-");

  return [...new Set([noSpace, hyphenated])].filter((s) => s.length >= 2);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  if (!companyName) {
    return NextResponse.json({ error: "Informe o nome da empresa." }, { status: 400 });
  }

  const candidates = slugCandidates(companyName);
  if (candidates.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const attempts = candidates.flatMap((slug) => [
    probeGreenhouse(slug).then((r) => ({ connector: "greenhouse", slug, ...r })),
    probeLever(slug).then((r) => ({ connector: "lever", slug, ...r })),
  ]);

  const results = await Promise.all(attempts);
  const matches = results.filter((r) => r.ok).map(({ connector, slug, count, sampleTitles }) => ({ connector, slug, count, sampleTitles }));

  // Um mesmo slug pode "bater" com falso-positivo em mais de um candidato
  // gerado (ex.: "acme" e "acme-inc" apontando pro mesmo board) — dedup por
  // conector+slug antes de devolver.
  const seen = new Set<string>();
  const deduped = matches.filter((m) => {
    const key = `${m.connector}:${m.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({ matches: deduped });
}
