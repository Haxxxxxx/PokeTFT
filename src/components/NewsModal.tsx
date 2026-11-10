"use client";

import { useAppStore } from "@/game/store/appStore";
import { PATCH_NOTES, LATEST_NOTE_ID } from "@/game/data/patchNotes";
import { Megaphone, Sparkle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

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
    <Modal
      onClose={onClose}
      label={tr("What's new", "Nouveautés")}
      title={tr("What's new", "Nouveautés")}
      icon={<Megaphone size={18} />}
    >
      <div className="flex flex-col gap-5">
          {PATCH_NOTES.map((note) => (
            <div key={note.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-gold-500/15 border border-gold-500/30 text-gold-300">{note.version}</span>
                <span className="text-[13px] font-bold text-slate-200">{note.title[lang]}</span>
                <span className="text-[10px] text-slate-600 ml-auto tabular-nums">{note.id}</span>
              </div>
              <ul className="flex flex-col gap-1.5 pl-1">
                {note.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-slate-400 leading-snug">
                    <span className="text-gold-400/70 mt-0.5 shrink-0"><Sparkle size={11} /></span>
                    <span>{c[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </Modal>
  );
}
