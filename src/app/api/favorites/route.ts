import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeJobs } from "@/lib/normalize";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// GET /api/favorites?user=<uuid> -> lista as vagas favoritadas por esse usuário
export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user");
  if (!isValidUuid(user)) {
    return NextResponse.json({ error: "Parâmetro 'user' precisa ser um UUID válido." }, { status: 400 });
  }

  const rows = (await sql`
    select j.*, s.name as source_name, s.city as source_city
    from favorites f
    join jobs j on j.id = f.job_id
    join sources s on s.id = j.source_id
    where f.user_uuid = ${user}
    order by f.created_at desc
  `) as Record<string, unknown>[];

  return NextResponse.json(normalizeJobs(rows));
}

// POST { user_uuid, job_id } -> favorita
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { user_uuid, job_id } = body ?? {};

  if (!isValidUuid(user_uuid) || !isValidUuid(job_id)) {
    return NextResponse.json({ error: "user_uuid e job_id precisam ser UUIDs válidos." }, { status: 400 });
  }

  await sql`
    insert into favorites (user_uuid, job_id)
    values (${user_uuid}, ${job_id})
    on conflict (user_uuid, job_id) do nothing
  `;

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE { user_uuid, job_id } -> desfavorita
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { user_uuid, job_id } = body ?? {};

  if (!isValidUuid(user_uuid) || !isValidUuid(job_id)) {
    return NextResponse.json({ error: "user_uuid e job_id precisam ser UUIDs válidos." }, { status: 400 });
  }

  await sql`delete from favorites where user_uuid = ${user_uuid} and job_id = ${job_id}`;

  return NextResponse.json({ ok: true });
}
