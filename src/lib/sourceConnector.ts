export const KNOWN_CONNECTORS = new Set(["remotive", "greenhouse", "lever", "gupy", "adzuna", "jooble"]);

export type ConnectorResolution =
  | { ok: true; connector: string | null; connectorConfig: string | null; sourceUrl: string }
  | { ok: false; error: string };

/**
 * Resolve os campos de conexão de uma fonte a partir do conector escolhido —
 * usado tanto ao cadastrar (POST) quanto ao editar (PATCH), pra manter as
 * duas rotas sempre de acordo sobre o que cada conector exige e qual URL de
 * exibição (não usada pro fetch em si) fica salva em `source_url`.
 */
export function resolveConnectorFields(input: { connector: string | null; connectorConfig: string; genericSourceUrl: string }): ConnectorResolution {
  const { connector, connectorConfig, genericSourceUrl } = input;

  if (connector === "remotive") {
    return { ok: true, connector, connectorConfig: null, sourceUrl: "https://remotive.com/remote-jobs" };
  }

  if (connector === "greenhouse") {
    if (!connectorConfig) return { ok: false, error: "Informe o slug da empresa na Greenhouse." };
    return { ok: true, connector, connectorConfig, sourceUrl: `https://boards.greenhouse.io/${connectorConfig}` };
  }

  if (connector === "lever") {
    if (!connectorConfig) return { ok: false, error: "Informe o slug da empresa na Lever." };
    return { ok: true, connector, connectorConfig, sourceUrl: `https://jobs.lever.co/${connectorConfig}` };
  }

  if (connector === "gupy") {
    if (!connectorConfig) return { ok: false, error: "Informe o slug da empresa na Gupy (o subdomínio, ex.: \"ambev\" para ambev.gupy.io)." };
    return { ok: true, connector, connectorConfig, sourceUrl: `https://${connectorConfig}.gupy.io/` };
  }

  if (connector === "adzuna") {
    return { ok: true, connector, connectorConfig: connectorConfig || null, sourceUrl: "https://www.adzuna.com.br/" };
  }

  if (connector === "jooble") {
    return { ok: true, connector, connectorConfig: connectorConfig || null, sourceUrl: "https://jooble.org/" };
  }

  if (!genericSourceUrl) {
    return { ok: false, error: "Informe a URL de origem das vagas (feed ou página de listagem)." };
  }
  try {
    new URL(genericSourceUrl);
  } catch {
    return { ok: false, error: "A URL de origem é inválida." };
  }
  return { ok: true, connector: null, connectorConfig: null, sourceUrl: genericSourceUrl };
}
