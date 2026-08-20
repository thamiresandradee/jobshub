import type { NextRequest } from "next/server";

/**
 * Cadastro/edição/remoção de fontes de vagas é restrito ao usuário master.
 * Não tem sistema de login — o master acessa a URL com `?admin_key=...`
 * uma vez (ver useAdminKey.ts, que salva no localStorage do navegador dele
 * e limpa a URL). Toda chamada de mutação manda essa chave de volta no
 * header `x-admin-key`, validado aqui contra a variável de ambiente
 * ADMIN_KEY. Sem essa variável configurada, os endpoints ficam bloqueados
 * por padrão (fail closed).
 */
export function isAdminRequest(req: NextRequest): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  const provided = req.headers.get("x-admin-key");
  return provided === expected;
}
