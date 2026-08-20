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

## Como funciona a sincronização

A fonte é cadastrada com uma única URL de origem, que pode ser:

1. **Um feed estruturado de verdade** (`src/lib/feedParser.ts`) — o ideal, quando a
   fonte expõe uma API pública de vagas em **JSON** (o formato mais comum em
   plataformas de recrutamento modernas) ou **XML/RSS**. Tolerante a variações
   de nomenclatura: acha a lista de vagas automaticamente e reconhece campos
   comuns por uma lista de nomes alternativos (pt-BR/en).
2. **A própria página pública de busca/listagem de vagas do site** (`src/lib/htmlScraper.ts`)
   — o caso mais comum, usado quando não se tem acesso a um feed. O sistema varre o
   HTML público do site em busca de "cards" de vaga (localização, modalidade,
   senioridade, salário) e segue a paginação automaticamente.

O formato é detectado sozinho (`src/lib/sync.ts`): tenta ler como JSON primeiro, depois
XML, e se não for nenhum dos dois, trata como HTML. Os três caminhos são "melhor
esforço" — campos que não forem reconhecidos ficam `null`, e sites que montam a
listagem inteiramente via JavaScript no navegador (SPA — o caso de muitos grandes
portais de emprego, como LinkedIn, Indeed ou Gupy) não são suportados pelo scraper de
HTML, já que ele não usa um navegador headless.

Vagas sem cidade física (100% remotas) recebem a cidade especial `"Remoto"`,
que também aparece como opção no filtro de cidade.

A sincronização roda:

- **Automaticamente**, 2x por dia, via Vercel Cron (`/api/cron/sync`, ver `vercel.json`) — vagas
  costumam sair do ar mais rápido que imóveis, por isso o intervalo é menor que 1x/dia.
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
