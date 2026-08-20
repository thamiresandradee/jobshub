import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { syncSource } from "@/lib/sync";
import { isAdminRequest } from "@/lib/adminAuth";
import { KNOWN_CONNECTORS, resolveConnectorFields } from "@/lib/sourceConnector";
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
    insert into sources (name, city, source_url, site_url, connector, connector_config)
    values (${name}, ${city}, ${resolved.sourceUrl}, ${siteUrl}, ${resolved.connector}, ${resolved.connectorConfig})
    returning *
  `) as JobSource[];
  const source = rows[0];

  // Sincroniza imediatamente ao cadastrar, pra já popular as vagas.
  const result = await syncSource(source.id);

  const finalRows = (await sql`select * from sources where id = ${source.id}`) as JobSource[];

  return NextResponse.json({ source: finalRows[0], sync: result }, { status: 201 });
}
