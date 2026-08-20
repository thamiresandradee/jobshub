"use client";

import { useState } from "react";

const STORAGE_KEY = "vagashub_uuid";

/** Gera (ou recupera) um UUID anônimo salvo no navegador do usuário. */
export function getOrCreateUuid(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function useUuid(): string {
  // Lazy initializer: roda uma vez no mount do cliente, sem precisar de effect.
  const [uuid] = useState(() => getOrCreateUuid());
  return uuid;
}
