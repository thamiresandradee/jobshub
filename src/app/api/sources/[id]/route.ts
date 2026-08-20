import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAdminRequest } from "@/lib/adminAuth";
import type { JobSource } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);

  // Troca de status (ativar/pausar)
  if (typeof body?.status === "string") {
    if (body.status !== "active" && body.status !== "paused") {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    const rows = (await sql`
      update sources set status = ${body.status} where id = ${id} returning *
    `) as JobSource[];
    if (!rows[0]) return NextResponse.json({ error: "Fonte não encontrada." }, { status: 404 });
    return NextResponse.json(rows[0]);
  }

  // Edição dos dados cadastrais
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const sourceUrl = typeof body?.source_url === "string" ? body.source_url.trim() : "";
  const siteUrl = typeof body?.site_url === "string" ? body.site_url.trim() : null;

  if (!name || !city || !sourceUrl) {
    return NextResponse.json({ error: "Informe nome, cidade e a URL de origem das vagas." }, { status: 400 });
  }
  try {
    new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "A URL de origem é inválida." }, { status: 400 });
  }

  const rows = (await sql`
    update sources
    set name = ${name}, city = ${city}, source_url = ${sourceUrl}, site_url = ${siteUrl}
    where id = ${id}
    returning *
  `) as JobSource[];

  if (!rows[0]) {
    return NextResponse.json({ error: "Fonte não encontrada." }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }
  const { id } = await params;
  await sql`delete from sources where id = ${id}`;
  return NextResponse.json({ ok: true });
}
