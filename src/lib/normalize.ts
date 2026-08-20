// O driver do Postgres retorna colunas `numeric` como string (pra não perder
// precisão). Isso é ótimo pro banco, mas o front-end quer number de verdade
// pra poder usar toLocaleString etc. Normalizamos aqui, num único lugar.

const NUMERIC_FIELDS = ["salary_min", "salary_max"] as const;

export function normalizeJob<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of NUMERIC_FIELDS) {
    const value = out[field];
    if (value !== null && value !== undefined) {
      out[field] = Number(value);
    }
  }
  return out as T;
}

export function normalizeJobs<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(normalizeJob);
}
