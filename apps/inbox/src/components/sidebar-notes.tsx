import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StickyNote, X } from "lucide-react";

const STORAGE_KEY = "lovable.sidebar.notes.v1";

interface Note {
  id: string;
  text: string;
}

function readNotes(): Note[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNotes(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {}
}

export function SidebarNotes() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNotes(readNotes());
  }, []);

  const addNote = () => {
    const text = draft.trim();
    if (!text) return;
    const next = [{ id: crypto.randomUUID(), text }, ...notes].slice(0, 8);
    setNotes(next);
    writeNotes(next);
    setDraft("");
  };

  const removeNote = (id: string) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    writeNotes(next);
  };

  return (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-1.5 mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="size-3.5" />
        {t("notes.title")}
      </div>

      <div className="mb-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              addNote();
            }
          }}
          placeholder={t("notes.placeholder")}
          rows={3}
          className="w-full rounded-xl border border-sidebar-border bg-card px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none shadow-soft"
        />
        <button
          type="button"
          onClick={addNote}
          disabled={!draft.trim()}
          className="mt-1.5 w-full rounded-lg bg-sidebar-accent px-3 py-1.5 text-[11px] font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("notes.add")}
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="w-full rounded-xl border border-dashed border-sidebar-border bg-sidebar-accent/20 px-3 py-4 text-[11px] text-muted-foreground text-center">
          {t("notes.empty")}
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group relative rounded-xl bg-[color-mix(in_oklab,var(--warn)_12%,var(--card))] border border-warn/15 px-3 py-2 pr-7 text-[12px] leading-snug text-foreground shadow-soft"
            >
              <span className="whitespace-pre-wrap break-words">{n.text}</span>
              <button
                type="button"
                onClick={() => removeNote(n.id)}
                aria-label={t("notes.remove")}
                className="absolute top-1.5 right-1.5 size-5 grid place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/60 hover:text-foreground transition-opacity"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
