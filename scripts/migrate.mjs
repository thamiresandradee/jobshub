// Aplica db/schema.sql no banco Neon apontado por DATABASE_URL.
// Uso: node scripts/migrate.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido. Rode `vercel env pull .env.local` antes.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

// Remove comentários de linha e separa por statements simples (";").
const statements = schema
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) {
  await sql.query(statement);
  console.log("OK:", statement.slice(0, 60).replace(/\s+/g, " ") + "...");
}

console.log(`\nMigração concluída. ${statements.length} statements aplicados.`);
