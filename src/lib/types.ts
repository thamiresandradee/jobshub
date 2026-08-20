export type JobSource = {
  id: string;
  name: string;
  city: string;
  site_url: string | null;
  source_url: string;
  connector: string | null; // null (genérico) | remotive | greenhouse | lever | adzuna
  connector_config: string | null; // board slug (greenhouse/lever) ou termo buscado (adzuna)
  status: "active" | "paused";
  last_synced_at: string | null;
  last_sync_status: "success" | "error" | null;
  last_sync_error: string | null;
  jobs_count: number;
  created_at: string;
};

export type Job = {
  id: string;
  source_id: string;
  external_id: string;
  title: string;
  description: string | null;
  company: string | null;
  work_type: string | null; // remoto | hibrido | presencial
  seniority: string | null; // estagio | junior | pleno | senior | especialista
  contract_type: string | null; // clt | pj | estagio | freelancer | temporario
  category: string | null;
  city: string;
  state: string | null;
  country: string | null; // "Brasil" | país estrangeiro | null (desconhecido, tratado como Brasil)
  salary_min: number | null;
  salary_max: number | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  // presentes quando o endpoint faz join com sources
  source_name?: string;
  source_city?: string;
};

export type JobFilters = {
  q?: string; // busca por texto no título da vaga
  abroad?: boolean; // true = só vaga no exterior + remota; false/ausente (padrão) = só Brasil + remota
  city?: string[];
  workType?: string;
  seniority?: string;
  contractType?: string;
  category?: string;
  minSalary?: number;
  maxSalary?: number;
  sourceId?: string;
  page?: number;
  pageSize?: number;
};
