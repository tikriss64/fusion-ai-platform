import { useEffect, useState, useCallback } from "react";

// Estado "resuelto" de un correo (persistente en localStorage, como el snooze).
// Permite trabajar la bandeja como una lista de tareas: pendientes vs resueltos.
const STORAGE_KEY = "fusion.resolved.v1";

function readStorage(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    return {};
  }
}

function writeStorage(map: Record<string, true>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// SSR-safe: arranca vacío, hidrata desde localStorage en useEffect.
export function useResolved() {
  const [map, setMap] = useState<Record<string, true>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMap(readStorage());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMap(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolve = useCallback((id: string) => {
    setMap((prev) => {
      const next = { ...prev, [id]: true as const };
      writeStorage(next);
      return next;
    });
  }, []);

  const unresolve = useCallback((id: string) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[id];
      writeStorage(next);
      return next;
    });
  }, []);

  return { map, hydrated, resolve, unresolve };
}

export function isResolved(map: Record<string, true>, id: string): boolean {
  return !!map[id];
}
