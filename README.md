# VagasHub

Agregador simples de vagas de emprego: cadastre fontes (empresas ou sites de
vagas, com a URL de onde tirar as vagas delas), o sistema sincroniza
automaticamente, e qualquer visitante pode buscar com filtros (cidade,
modalidade, senioridade, contrato, área, faixa salarial) e favoritar vagas
sem precisar criar conta — só um UUID anônimo salvo no navegador.

## Stack

- **Next.js 16** (App Router) + **React** + **TypeScript**
- **Tailwind CSS 4**
- **Neon** (Postgres serverless), acessado direto via `@neondatabase/serverless`, sem ORM
- **Vercel** para deploy + Cron Jobs (sincronização automática 2x/dia)

## Como encontrar vagas sem saber os sites

O ponto de partida do VagasHub não é "eu sei a URL da vaga" — é "eu quero encontrar
vagas e não sei onde procurar". Pra isso, `/fontes` oferece quatro formas de cadastrar
uma fonte, dos dois lados dessa dificuldade:

1. **Remotive** (`src/lib/connectors/remotive.ts`) — um clique importa vagas 100%
   remotas da API pública da Remotive, já filtradas por elegibilidade
   Brasil/LATAM/mundial. A [própria Remotive autoriza esse uso](https://remotive.com/api-documentation)
   desde que sempre linkemos de volta pro anúncio original e a citemos como fonte — é
   exatamente o que o app faz (botão "Ver vaga" + selo "via Remotive" em cada card).
2. **Adzuna** (`src/lib/connectors/adzuna.ts`) — busca vagas no Brasil (inclui
   presencial/híbrido, não só remoto) via API oficial. Precisa de `ADZUNA_APP_ID`/
   `ADZUNA_APP_KEY` grátis — crie uma conta em [developer.adzuna.com](https://developer.adzuna.com/).
   Cada fonte representa uma busca salva: o campo "cidade" da fonte é o `where`, e
   `connector_config` guarda o `what`.
3. **Empresa via Greenhouse/Lever** (`src/lib/connectors/greenhouse.ts`,
   `.../lever.ts`) — você digita só o nome da empresa, e `POST /api/sources/discover`
   tenta variações do nome como slug contra as APIs públicas de board dessas duas ATS
   (as mais comuns entre empresas que expõem vagas via API). Resolve o "eu conheço a
   empresa, não sei o link do board de carreiras dela".
4. **URL genérica** (`src/lib/feedParser.ts` + `src/lib/htmlScraper.ts`) — pra quando
   você já tem o link de um feed (JSON/XML) ou da página de vagas de um site
   específico (ex.: a página de carreiras de uma empresa pequena/média, sem API
   própria). O formato é detectado sozinho: tenta JSON, depois XML, e por fim trata
   como HTML — varrendo "cards" de vaga por localização/modalidade/senioridade/salário
   e seguindo a paginação. Best effort: campos não reconhecidos ficam `null`.

**Por que não Indeed/LinkedIn/vagas.com.br direto?** Testamos: essas plataformas usam
proteção anti-bot ativa (o próprio Indeed devolveu HTTP 403 numa tentativa de cadastro
aqui) e o `robots.txt` delas proíbe explicitamente crawlear as páginas de busca — a da
vagas.com.br bloqueia especificamente `/vagas/pesquisas`, e as duas bloqueiam por nome
os crawlers de IA, incluindo o da Anthropic. Contornar isso fingindo ser um navegador
humano iria contra o que os próprios sites pediram, então o app não tenta. As 4 opções
acima existem justamente para cobrir essa lacuna por vias que autorizam o uso.

Vagas sem cidade física (100% remotas) recebem a cidade especial `"Remoto"`,
que também aparece como opção no filtro de cidade.

A sincronização roda:

- **Automaticamente**, 1x por dia, via Vercel Cron (`/api/cron/sync`, ver `vercel.json`) — o plano
  Hobby da Vercel permite só 1 execução de cron por dia; num plano Pro vale considerar rodar mais
  vezes, já que vaga costuma sair do ar mais rápido que imóvel.
- **Sob demanda**, pelo botão "Sincronizar agora" na página `/fontes`.
- **Ao cadastrar** uma fonte nova (sync imediato).

## Rodando localmente

```bash
npm install
vercel env pull .env.local   # credenciais do Neon + segredo do cron
node scripts/migrate.mjs     # aplica db/schema.sql no banco
npm run dev
```

## Estrutura

```
src/
  app/                 páginas (/, /favoritos, /fontes) e rotas de API
  components/          UI (cards, filtros, header, paginação)
  context/             estado de favoritos (client-side, ligado ao UUID do usuário)
  lib/                 db, parser de feed, sincronização, tipos, hooks
db/schema.sql          schema do banco (3 tabelas: sources, jobs, favorites)
scripts/migrate.mjs    aplica o schema.sql no Neon
```
