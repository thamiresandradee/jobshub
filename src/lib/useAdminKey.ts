"use client";

import { useEffect, useState } from "react";

export const ADMIN_KEY_STORAGE_KEY = "vagashub_admin_key";
const STORAGE_KEY = ADMIN_KEY_STORAGE_KEY;

/**
 * Se a página foi aberta com `?admin_key=...`, salva no localStorage e
 * limpa o parâmetro da URL (pra não ficar exposto no histórico/link
 * compartilhável). Depois disso, a chave persiste no navegador do master.
 *
 * Retorna `undefined` enquanto ainda não checou (evita piscar a mensagem de
 * "área restrita" pro próprio admin antes do localStorage ser lido), e
 * `null` quando já checou e não achou nenhuma chave.
 */
export function useAdminKey(): string | null | undefined {
  const [key, setKey] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("admin_key");

    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      url.searchParams.delete("admin_key");
      window.history.replaceState({}, "", url.toString());
      setKey(fromUrl);
      return;
    }

    setKey(localStorage.getItem(STORAGE_KEY));
  }, []);

  return key;
}
