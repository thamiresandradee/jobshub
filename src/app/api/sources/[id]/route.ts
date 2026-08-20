import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAdminRequest } from "@/lib/adminAuth";
import { syncSource } from "@/lib/sync";
import { KNOWN_CONNECTORS, resolveConnectorFields } from "@/lib/sourceConnector";
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

  // Edição dos dados cadastrais (inclui o conector — trocar o termo buscado
  // na Adzuna ou o slug na Greenhouse/Lever também passa por aqui)
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  const siteUrl = typeof body?.site_url === "string" ? body.site_url.trim() : null;
  const connectorRaw = typeof body?.connector === "string" ? body.connector.trim() : "";
  const connector = KNOWN_CONNECTORS.has(connectorRaw) ? connectorRaw : null;
  const connectorConfig = typeof body?.connector_config === "string" ? body.connector_config.trim() : "";

  if (!name || !city) {
    return NextResponse.json({ error: "Informe nome e cidade." }, { status: 400 });
  }

  const resolved = resolveConnectorFields({ connector, connectorConfig, genericSourceUrl: typeof body?.source_url === "string" ? body.source_url.trim() : "" });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const rows = (await sql`
    update sources
    set name = ${name}, city = ${city}, source_url = ${resolved.sourceUrl}, site_url = ${siteUrl},
        connector = ${resolved.connector}, connector_config = ${resolved.connectorConfig}
    where id = ${id}
    returning *
  `) as JobSource[];

  if (!rows[0]) {
    return NextResponse.json({ error: "Fonte não encontrada." }, { status: 404 });
  }

  // Ressincroniza na hora — quem editou o termo buscado/slug quer ver o
  // efeito imediatamente, igual acontece ao cadastrar uma fonte nova.
  const result = await syncSource(id);
  const finalRows = (await sql`select * from sources where id = ${id}`) as JobSource[];

  return NextResponse.json({ source: finalRows[0], sync: result });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }
  const { id } = await params;
  await sql`delete from sources where id = ${id}`;
  return NextResponse.json({ ok: true });
}
