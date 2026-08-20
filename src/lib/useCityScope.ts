"use client";

import { useEffect, useState } from "react";

export const CITY_SCOPE_STORAGE_KEY = "vagashub_city_scope";

/**
 * Restringe, de forma discreta, quais cidades um link mostra — permite dar
 * visões diferentes do mesmo site pra pessoas diferentes sem precisar de
 * instâncias/deploys separados.
 *
 * IMPORTANTE: isso não é controle de acesso de verdade. É só uma
 * preferência salva no navegador da pessoa; alguém com conhecimento
 * técnico (abrir o DevTools, limpar o localStorage) consegue ver tudo.
 * Serve pra organizar o que cada link mostra por padrão, não pra proteger
 * dado sensível.
 *
 * Uso: compartilhe a URL com `?cities=Cidade1,Cidade2`. Na primeira visita
 * isso é salvo no navegador da pessoa e o parâmetro some da URL — não
 * aparece de novo em navegações seguintes.
 */
export function useCityScope(): string[] | undefined {
  const [scope, setScope] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("cities");

    if (fromUrl) {
      const cities = fromUrl
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      localStorage.setItem(CITY_SCOPE_STORAGE_KEY, JSON.stringify(cities));
      url.searchParams.delete("cities");
      window.history.replaceState({}, "", url.toString());
      setScope(cities);
      return;
    }

    const stored = localStorage.getItem(CITY_SCOPE_STORAGE_KEY);
    try {
      setScope(stored ? JSON.parse(stored) : []);
    } catch {
      setScope([]);
    }
  }, []);

  return scope;
}
