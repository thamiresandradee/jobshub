# VagasHub — Project Guide (CLAUDE.md)

## Overview

Agregador de vagas de emprego. O problema real que o projeto resolve não é
"cadastrar uma URL de vaga" — é **"não sei onde procurar"**: a maioria das
fontes cadastradas vêm de integrações prontas (Remotive, Adzuna, Jooble,
Gupy/Greenhouse/Lever via auto-detecção por nome de empresa), não de link
digitado à mão. App único, banco único, sem multi-tenant, sem login — só um
UUID anônimo por visitante (favoritos) e uma chave de admin por URL
(cadastro de fontes).

## Stack (decidido — não trocar sem discutir)

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS 4**
- **Neon** (Postgres serverless) via `@neondatabase/serverless` — **sem
  ORM**, SQL direto (tagged template `sql\`...\`` ou `sql.query(text, params)`
  parametrizado). Mesmo banco serve dev e produção (não há branch/DB
  separado — `vercel env pull` traz as mesmas credenciais nos dois).
- **Vercel** — deploy + Cron (`vercel.json`, 1x/dia — teto do plano Hobby é
  1 execução/dia; mais de uma linha em `crons` com intervalo menor que 24h
  falha o deploy)
- `cheerio` (scraper de HTML), `fast-xml-parser` (feed XML)
- **Sem migration framework**: `db/schema.sql` é reaplicado inteiro a cada
  mudança (`create table if not exists` + `alter table ... add column if
  not exists` para colunas novas em tabela já existente) via
  `node scripts/migrate.mjs`. Rodar manualmente depois de editar o schema —
  nada aplica isso sozinho.

## Arquitetura

### As 3 tabelas (`db/schema.sql`)

- `sources` — fonte cadastrada (empresa, busca salva, ou URL genérica).
- `jobs` — vaga, sempre ligada a uma `source_id` (`on delete cascade`),
  dedup por `unique(source_id, external_id)`.
- `favorites` — `user_uuid` (anônimo, gerado no navegador) + `job_id`.

### Duas formas de popular `jobs` (`src/lib/sync.ts`)

`syncSource(sourceId)` decide pelo campo `sources.connector`:

1. **Conector embutido** (`connector` preenchido) — `src/lib/connectors/`,
   uma API/fonte pública conhecida. Sempre preferível ao genérico: sem
   risco de ToS, dado estruturado.
2. **Genérico** (`connector` nulo) — busca `sources.source_url` e detecta o
   formato sozinho: JSON/XML estruturado (`src/lib/feedParser.ts`, best
   effort por lista de aliases de campo) ou HTML (`src/lib/htmlScraper.ts`,
   heurística de "card" por proximidade de sinais de vaga — ver comentário
   no topo do arquivo).

Depois de buscar (por qualquer um dos dois caminhos), `syncSource` faz
upsert de todas as vagas e **apaga do banco qualquer vaga que não veio mais
no resultado** — é assim que vaga com processo encerrado some sozinha a
cada sync.

### Conectores (`src/lib/connectors/`)

Cada um foi **testado contra a API/site real antes de ser considerado
pronto** — o histórico deste projeto tem vários casos de comportamento que
a documentação não deixava óbvio (ver Convenções). Resumo do que cada um
sabe e não sabe fazer:

- **`remotive.ts`** — API pública, sem chave. 100% remoto; filtra por
  elegibilidade Brasil/LATAM/mundial (`RELEVANT_LOCATION_RE`) pra não
  importar vaga só-EUA. Sem salário (maioria em USD, resto do app assume
  R$). Atribuição obrigatória pelos termos da Remotive: sempre linkar de
  volta pro `job.url` original — é o que `sourceUrl` já faz.
- **`adzuna.ts`** — precisa de `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` (grátis,
  auto-serviço em developer.adzuna.com). Busca sempre escopada a
  `/jobs/br/search`. `connector_config` aceita **grupos separados por
  vírgula, palavras dentro de um grupo em AND** (`what`, não `what_or` —
  `what_or` faz OU por palavra solta, inútil pra termo de 2+ palavras e
  perigoso com palavra ambígua sozinha tipo "categoria", que sozinha traz
  majoritariamente vaga de motorista/CNH). `salary_min`/`salary_max` vêm
  **anualizados** mesmo pro Brasil — sempre dividir por 12. Pagina até
  `MAX_PAGES_PER_GROUP` (fixo por grupo, não dividido pelo nº de grupos —
  já foi bug: dividir um orçamento fixo fazia adicionar um grupo *reduzir*
  o total). Localização vem de `location.area` (lista do genérico ao
  específico — não de `display_name`, que tem vírgula).
- **`gupy.ts`** — sem chave, sem API documentada: lê o `__NEXT_DATA__`
  (JSON de estado do Next.js) embutido no HTML da página pública de
  carreiras (`{slug}.gupy.io`). É a ATS mais comum entre empresa
  brasileira — checar aqui primeiro na auto-detecção. Filtra fora
  `vacancy_type_talent_pool` (banco de talentos não é vaga aberta de
  verdade). `city`/`state`/`country` vêm direto de `workplace.address`,
  já limpos (não precisa `splitLocation`).
- **`greenhouse.ts`** / **`lever.ts`** — APIs públicas documentadas, sem
  chave, feitas pra esse uso. Localização vem como string livre
  ("Cidade, País"; múltiplas localizações separadas por `;` — usa só a
  primeira) — sempre passar por `splitLocation`/`inferCountry`
  (`src/lib/location.ts`) antes de gravar.
- **`jooble.ts`** — **não testado contra a API real** (chave não é
  auto-serviço instantâneo, precisa pedir em jooble.org/api/about e
  esperar). Escrito só com base na documentação pública — reavaliar campo
  a campo assim que houver uma chave de teste, seguindo o mesmo processo
  dos outros.

### Auto-detecção de empresa (`POST /api/sources/discover`)

A partir só do nome da empresa, gera slugs candidatos e testa contra
Gupy/Greenhouse/Lever em paralelo (`probeGupy`/`probeGreenhouse`/
`probeLever`). **Risco conhecido:** o slug pode bater com a empresa errada
quando duas empresas diferentes usam o mesmo "apelido" de URL (achado real:
"Azul" no Lever é a Azul Systems americana, não a Azul Linhas Aéreas
brasileira) — sempre olhar `sampleTitles` do resultado antes de confirmar.

### Filtro de cidade em fonte por board completo (`src/lib/cityFilter.ts`)

Gupy/Greenhouse/Lever não têm parâmetro de localização na API — o board
inteiro da empresa vem sempre. Pra essas três, `sources.city` funciona como
allowlist pós-busca (`filterByCityAllowlist`): lista separada por vírgula,
"Nacional"/"Brasil"/"Todas" desliga o filtro. Adzuna/Jooble são buscas de
verdade (`where`/`location`), não precisam desse filtro.

### Filtro Brasil/Exterior (coluna `jobs.country`)

Cada conector grava `country` com o que sabe: `"Brasil"` (Adzuna sempre;
Gupy direto de `address.country`), nome do país inferido
(Greenhouse/Lever via `inferCountry`, que reconhece os 27
estados/UFs brasileiros e trata qualquer outro texto como o nome do país),
ou `null` (desconhecido — **tratado como Brasil por padrão**). O toggle na
home (`/api/jobs?abroad=true|false`, mesma lógica em `/api/meta`) filtra
só por essa coluna — `work_type` (remoto/híbrido/presencial) não entra na
conta.

### Admin sem login

`?admin_key=...` na URL uma vez → salvo em `localStorage`
(`src/lib/useAdminKey.ts`) → toda mutação manda de volta no header
`x-admin-key`, validado contra `process.env.ADMIN_KEY`
(`src/lib/adminAuth.ts`, fail-closed sem a env var). Cadastrar/editar fonte
(`POST`/`PATCH /api/sources`) **ressincroniza na hora** e devolve
`{source, sync}` — editar tem que mostrar o resultado do sync igual criar
mostra.

## Convenções

- **Português em tudo**: comentários, textos de usuário, mensagens de
  commit. Sem exceção — diferente de projeto que separa "código em inglês,
  texto de usuário em pt-BR", aqui é tudo pt-BR.
- **Nunca concatenar valor de usuário em SQL.** Toda condição dinâmica usa
  `sql.query(text, params)` com `$1, $2...` (ver `addCondition` em
  `/api/jobs`) ou o tagged template `sql\`...\``. `ILIKE` com wildcard é
  seguro porque o `%termo%` vai como valor do parâmetro, não concatenado
  na string.
- **Filtro de múltipla seleção é sempre `?campo=A,B` (vírgula).** Vale pra
  `city`, `category`, `workType`, `seniority`, `contractType` — no back
  (`/api/jobs`, `/api/meta`) e no front (`MultiSelect` em
  `FiltersBar.tsx`). Consequência direta: **nenhum valor armazenado nesses
  campos pode conter vírgula**, ou ele vira dois valores errados na hora de
  filtrar (bug real, já corrigido: Adzuna devolvia "Cidade, Estado" numa
  string só). `normalizeCityName()` tem uma proteção final pra isso — mas
  o certo é já gravar limpo (`splitLocation`, `cityAndState` em
  `adzuna.ts`).
- **Testar todo conector/scraper novo contra a API ou site real antes de
  dar como pronto.** Não é opcional — é assim que se acham as pegadinhas
  que a documentação não avisa (salário anualizado da Adzuna, `location`
  com vírgula, orçamento de página dividido errado ao adicionar mais
  grupos de busca, "categoria" sozinha trazendo vaga de motorista). Usar
  fixture local quando não há dado real disponível pra não abusar do site
  de terceiro em teste.
- **Não construir scraper pra site que bloqueia por `robots.txt`/ToS.** Já
  verificado e descartado: Indeed (retorna HTTP 403 pra automação, e o
  `robots.txt` proíbe paginar resultado de busca) e vagas.com.br (bloqueia
  especificamente `/vagas/pesquisas`) — os dois bloqueiam por nome
  crawlers de IA da Anthropic. Preferir sempre a integração legítima
  (conector dedicado ou feed que a própria fonte publica) a contornar um
  bloqueio explícito.
- **Nunca guardar segredo em campo visível pela API/admin.** `source_url`
  de fonte com conector é só exibição (nunca embute `app_key`/token) — ver
  `resolveConnectorFields` em `src/lib/sourceConnector.ts`, usado por
  `POST`/`PATCH /api/sources` pra manter as duas rotas de acordo.

## Deploy / Infra

- **Vercel**: projeto `vagashub`, scope `thamires-andrades-projects` (nome
  sem "-app", por pedido explícito). Deploy manual:
  `vercel deploy --prod --scope thamires-andrades-projects`.
- **GitHub**: `thamiresandradee/jobshub`. Deploy automático no push **não
  está conectado** — a Vercel não conseguiu autorizar o GitHub App via CLI
  (pendência que só o dono da conta resolve pelo dashboard, em
  Project Settings → Git).
- **Neon**: provisionado via integração Vercel-Neon (`vercel integration
  add neon`). Sem Neon Auth/Data API em uso — só Postgres.
- **Env vars** (`vercel env add ... development preview production` +
  `vercel env pull .env.local`): `ADMIN_KEY`, `CRON_SECRET`,
  `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `JOOBLE_API_KEY` (pendente — ver
  `jooble.ts`). As `POSTGRES_*`/`PG*`/`DATABASE_URL*` vêm da integração
  Neon automaticamente.
- Depois de editar `db/schema.sql`: `node scripts/migrate.mjs` (usa
  `DATABASE_URL` do `.env.local`) — local e produção são o mesmo banco,
  um `migrate.mjs` já vale pros dois.

## Comandos

- `npm run dev` / `build` / `start` / `lint`
- `node scripts/migrate.mjs` — aplica `db/schema.sql`
- `vercel deploy --prod --scope thamires-andrades-projects` — deploy manual
- `vercel env pull .env.local --yes` — sincroniza env vars locais

## Guard-rails — NÃO

- ❌ Scraper de HTML pra site que bloqueia por `robots.txt`/ToS (Indeed,
  vagas.com.br, ou qualquer site que negue explicitamente crawler de IA)
  — usar conector/API legítima, ou pedir pro usuário achar o link direto.
- ❌ Dar um conector novo como pronto sem testar contra a API/site real
  primeiro (fixture local serve pra isso quando não há acesso à API).
- ❌ Deixar `city`/`category`/`workType`/`seniority`/`contractType`
  armazenado conter vírgula.
- ❌ Concatenar valor dinâmico direto numa string SQL — sempre parâmetro
  (`$1`, `sql\`...\``, ou `sql.query(text, params)`).
- ❌ Introduzir ORM, framework de migration, ou arquitetura maior do que o
  necessário — o projeto é deliberadamente simples, sem "muita
  arquitetura por trás" (pedido explícito na criação do projeto).
- ❌ Guardar chave/token de API em `source_url` ou qualquer campo que a
  API/admin devolve pro cliente.
