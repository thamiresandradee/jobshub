import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeJobs } from "@/lib/normalize";

const PAGE_SIZE_DEFAULT = 24;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  const search = q.get("q")?.trim() || null;
  const cities = (q.get("city") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const workType = q.get("workType")?.trim() || null;
  const seniority = q.get("seniority")?.trim() || null;
  const contractType = q.get("contractType")?.trim() || null;
  const category = q.get("category")?.trim() || null;
  const sourceId = q.get("sourceId")?.trim() || null;
  const minSalary = q.get("minSalary") ? Number(q.get("minSalary")) : null;
  const maxSalary = q.get("maxSalary") ? Number(q.get("maxSalary")) : null;
  const page = Math.max(1, Number(q.get("page")) || 1);
  const pageSize = Math.min(60, Number(q.get("pageSize")) || PAGE_SIZE_DEFAULT);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: unknown[] = [];

  function addCondition(clause: string, value: unknown) {
    params.push(value);
    conditions.push(clause.replace("?", `$${params.length}`));
  }

  if (search) addCondition("j.title ilike ?", `%${search}%`);
  if (cities.length) addCondition("j.city = any(?)", cities);
  if (workType) addCondition("j.work_type = ?", workType);
  if (seniority) addCondition("j.seniority = ?", seniority);
  if (contractType) addCondition("j.contract_type = ?", contractType);
  if (category) addCondition("j.category = ?", category);
  if (sourceId) addCondition("j.source_id = ?", sourceId);
  if (minSalary) addCondition("j.salary_max >= ?", minSalary);
  if (maxSalary) addCondition("j.salary_min <= ?", maxSalary);

  const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const countQuery = `select count(*)::int as count from jobs j ${whereClause}`;
  const countRows = (await sql.query(countQuery, params)) as { count: number }[];
  const total = countRows[0]?.count ?? 0;

  const listParams = [...params, pageSize, offset];
  const listQuery = `
    select j.*, s.name as source_name, s.city as source_city
    from jobs j
    join sources s on s.id = j.source_id
    ${whereClause}
    order by j.created_at desc
    limit $${listParams.length - 1} offset $${listParams.length}
  `;
  const rows = (await sql.query(listQuery, listParams)) as Record<string, unknown>[];
  const jobs = normalizeJobs(rows);

  return NextResponse.json({
    jobs,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
