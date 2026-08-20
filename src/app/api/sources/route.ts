import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { syncSource } from "@/lib/sync";
import { isAdminRequest } from "@/lib/adminAuth";
import type { JobSource } from "@/lib/types";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }
  const sources = (await sql`
    select * from sources order by created_at desc
  `) as JobSource[];
  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const sourceUrl = typeof body?.source_url === "string" ? body.source_url.trim() : "";
  const siteUrl = typeof body?.site_url === "string" ? body.site_url.trim() : null;

  if (!name || !city || !sourceUrl) {
    return NextResponse.json({ error: "Informe nome, cidade e a URL de origem das vagas (feed ou página de listagem)." }, { status: 400 });
  }

  try {
    new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "A URL de origem é inválida." }, { status: 400 });
  }

  const rows = (await sql`
    insert into sources (name, city, source_url, site_url)
    values (${name}, ${city}, ${sourceUrl}, ${siteUrl})
    returning *
  `) as JobSource[];
  const source = rows[0];

  // Sincroniza imediatamente ao cadastrar, pra já popular as vagas.
  const result = await syncSource(source.id);

  const finalRows = (await sql`select * from sources where id = ${source.id}`) as JobSource[];

  return NextResponse.json({ source: finalRows[0], sync: result }, { status: 201 });
}
