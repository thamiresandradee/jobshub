import { NextRequest, NextResponse } from "next/server";
import { syncSource } from "@/lib/sync";
import { isAdminRequest } from "@/lib/adminAuth";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 401 });
  }
  const { id } = await params;
  const result = await syncSource(id);

  if (!result.success) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
