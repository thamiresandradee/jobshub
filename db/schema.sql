-- Schema do VagasHub
-- Simples de propósito: 3 tabelas, sem ORM, sem migrations framework.

create extension if not exists "pgcrypto";

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  site_url text,
  -- URL de origem das vagas: pode ser um feed estruturado (JSON ou XML) ou a
  -- própria página pública de busca/listagem de vagas do site (ver src/lib/sync.ts).
  source_url text not null,
  status text not null default 'active', -- active | paused
  -- Conector embutido usado pra sincronizar, no lugar do fetch genérico de
  -- source_url: null (padrão) = feed JSON/XML/HTML genérico via source_url;
  -- 'remotive' = API pública da Remotive (vagas remotas globais);
  -- 'greenhouse'/'lever' = API pública de vagas da empresa nessas ATS
  -- (connector_config = board token/slug da empresa);
  -- 'adzuna' = busca na API da Adzuna (connector_config = termo buscado,
  -- reaproveita a coluna city como o parâmetro de localização "where").
  connector text,
  connector_config text,
  last_synced_at timestamptz,
  last_sync_status text, -- success | error
  last_sync_error text,
  jobs_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table sources add column if not exists connector text;
alter table sources add column if not exists connector_config text;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  external_id text not null,
  title text not null,
  description text,
  company text,
  work_type text, -- remoto | hibrido | presencial
  seniority text, -- estagio | junior | pleno | senior | especialista
  contract_type text, -- clt | pj | estagio | freelancer | temporario
  category text, -- área/categoria: TI, Marketing, Vendas, etc
  city text not null, -- "Remoto" para vagas sem cidade física
  state text,
  -- "Brasil" (confirmado) | nome do país estrangeiro (confirmado) | null
  -- (desconhecido — tratado como Brasil no filtro, ver /api/jobs e /api/meta).
  -- O filtro Brasil/Exterior olha só esta coluna; work_type não entra na conta.
  country text,
  salary_min numeric,
  salary_max numeric,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

alter table jobs add column if not exists country text;

create index if not exists idx_jobs_city on jobs (city);
create index if not exists idx_jobs_country on jobs (country);
create index if not exists idx_jobs_work_type on jobs (work_type);
create index if not exists idx_jobs_seniority on jobs (seniority);
create index if not exists idx_jobs_contract_type on jobs (contract_type);
create index if not exists idx_jobs_category on jobs (category);
create index if not exists idx_jobs_salary_min on jobs (salary_min);
create index if not exists idx_jobs_source on jobs (source_id);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_uuid uuid not null,
  job_id uuid not null references jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_uuid, job_id)
);

create index if not exists idx_favorites_user on favorites (user_uuid);
