import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "lovable.snoozed.v1";

export type SnoozeMap = Record<string, string>; // emailId -> ISO datetime

function readStorage(): SnoozeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SnoozeMap) : {};
  } catch {
    return {};
  }
}

function writeStorage(map: SnoozeMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

// SSR-safe: always starts empty; hydrates from localStorage in useEffect.
export function useSnooze() {
  const [map, setMap] = useState<SnoozeMap>({});
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

  const snooze = useCallback((id: string, until: Date) => {
    setMap((prev) => {
      const next = { ...prev, [id]: until.toISOString() };
      writeStorage(next);
      return next;
    });
  }, []);

  const unsnooze = useCallback((id: string) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[id];
      writeStorage(next);
      return next;
    });
  }, []);

  return { map, hydrated, snooze, unsnooze };
}

export function isSnoozed(map: SnoozeMap, id: string, now = Date.now()): boolean {
  const v = map[id];
  if (!v) return false;
  return new Date(v).getTime() > now;
}

// Quick-pick presets
export function presetThisAfternoon(): Date {
  const d = new Date();
  d.setHours(15, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export function presetTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function presetMonday(): Date {
  const d = new Date();
  const day = d.getDay(); // 0..6, Mon=1
  const add = ((1 - day + 7) % 7) || 7;
  d.setDate(d.getDate() + add);
  d.setHours(9, 0, 0, 0);
  return d;
}
