"use client";

import { useAppStore } from "@/game/store/appStore";
import { PATCH_NOTES, LATEST_NOTE_ID } from "@/game/data/patchNotes";
import { Megaphone, Sparkle, X } from "lucide-react";

const SEEN_KEY = "poketft_news_seen";

/** Has the player NOT seen the latest patch note yet? Used to badge the News button. */
export function hasUnseenNews(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== LATEST_NOTE_ID; } catch { return false; }
}
export function markNewsSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST_NOTE_ID); } catch { /* ignore */ }
}

/** "What's new" changelog modal. */
export function NewsModal({ onClose }: { onClose: () => void }) {
  const lang = useAppStore((s) => s.settings.language);
  const tr = (en: string, fr: string) => (lang === "fr" ? fr : en);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={tr("What's new", "Nouveautés")}>
      <div className="panel w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
          <span className="text-amber-400"><Megaphone size={18} /></span>
          <h2 className="text-base font-extrabold gild-text flex-1">{tr("What's new", "Nouveautés")}</h2>
          <button onClick={onClose} aria-label={tr("Close", "Fermer")} className="text-slate-500 hover:text-amber-300"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-5">
          {PATCH_NOTES.map((note) => (
            <div key={note.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300">{note.version}</span>
                <span className="text-[13px] font-bold text-slate-200">{note.title[lang]}</span>
                <span className="text-[10px] text-slate-600 ml-auto tabular-nums">{note.id}</span>
              </div>
              <ul className="flex flex-col gap-1.5 pl-1">
                {note.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-400 leading-snug">
                    <span className="text-amber-400/70 mt-0.5 shrink-0"><Sparkle size={11} /></span>
                    <span>{c[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
