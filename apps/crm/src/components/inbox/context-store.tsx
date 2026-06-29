import { createContext, useContext, useState, type ReactNode } from "react";

export interface ContactContext {
  id: string;
  name: string;
  initials: string;
  role: string;
  since: string;
  emails: number;
  calls: number;
  lastInteraction: string;
  pending?: string;
  promisesFromThem?: string;
  promisesFromYou?: string;
  tone: string;
}

interface Store {
  selected: ContactContext | null;
  setSelected: (c: ContactContext | null) => void;
}

const Ctx = createContext<Store | null>(null);

export function ContextStoreProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ContactContext | null>(null);
  return <Ctx.Provider value={{ selected, setSelected }}>{children}</Ctx.Provider>;
}

export function useContextStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useContextStore must be used inside ContextStoreProvider");
  return v;
}
