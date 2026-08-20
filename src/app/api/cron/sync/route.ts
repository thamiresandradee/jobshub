import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { syncSource } from "@/lib/sync";

export const maxDuration = 120;

/**
 * Disparado periodicamente pelo Vercel Cron (ver vercel.json).
 * Sincroniza todas as fontes ativas, uma de cada vez.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sources = (await sql`select id, name from sources where status = 'active'`) as {
    id: string;
    name: string;
  }[];

  const results = [];
  for (const source of sources) {
    const result = await syncSource(source.id);
    results.push({ source: source.name, ...result });
  }

  return NextResponse.json({ synced: results.length, results });
}
