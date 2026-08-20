import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não está definido nas variáveis de ambiente.");
}

// Cliente único, reutilizado em toda a aplicação. Sem ORM: SQL direto,
// que é suficiente para o tamanho deste projeto.
export const sql = neon(connectionString);
