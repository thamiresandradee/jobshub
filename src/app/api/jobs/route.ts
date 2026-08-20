import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeJobs } from "@/lib/normalize";

const PAGE_SIZE_DEFAULT = 24;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  const search = q.get("q")?.trim() || null;
  const abroad = q.get("abroad") === "true";
  const cities = (q.get("city") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const workTypes = (q.get("workType") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const seniorities = (q.get("seniority") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const contractTypes = (q.get("contractType") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const categories = (q.get("category") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
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
  // País desconhecido (null) conta como Brasil por padrão — ver
  // src/lib/location.ts (inferCountry). Vaga remota sempre passa nos dois
  // modos, já que não faz sentido restringir por localização física.
  conditions.push(
    abroad
      ? "(j.work_type = 'remoto' or (j.country is not null and lower(j.country) <> 'brasil'))"
      : "(j.work_type = 'remoto' or j.country is null or lower(j.country) = 'brasil')"
  );
  if (cities.length) addCondition("j.city = any(?)", cities);
  if (workTypes.length) addCondition("j.work_type = any(?)", workTypes);
  if (seniorities.length) addCondition("j.seniority = any(?)", seniorities);
  if (contractTypes.length) addCondition("j.contract_type = any(?)", contractTypes);
  if (categories.length) addCondition("j.category = any(?)", categories);
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
