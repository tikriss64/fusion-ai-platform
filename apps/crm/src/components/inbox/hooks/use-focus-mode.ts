import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "lovable.focusMode.v1";
const EVENT = "lovable:focus-mode-change";

let current = false;

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {}
}

export function useFocusMode() {
  const [focus, setFocus] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    current = read();
    setFocus(current);
    setHydrated(true);
    const onChange = () => setFocus(current);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setMode = useCallback((v: boolean) => {
    current = v;
    write(v);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);

  const toggle = useCallback(() => setMode(!current), [setMode]);

  return { focus, hydrated, setFocus: setMode, toggle };
}
