"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ref, push, onChildAdded, query, limitToLast, onValue } from "firebase/database";
import { db } from "@/game/net/firebase";
import { useT } from "@/lib/i18n";
import { useDraggablePanel } from "./useDraggablePanel";
import { MessageSquare, Send, X } from "lucide-react";

/**
 * Live match chat.
 *
 * Replaces a preset-only "quick chat" whose messages were written to
 * games/<code>/chat — a path with no rule of its own, so every write fell
 * through to games/<code>/.write, which permits only CREATING a game or the
 * host DELETING one. Every message had been refused since the feature shipped,
 * and the send was `.catch(() => {})`, so it failed in complete silence. The
 * rule now exists (see database.rules.json); this is the client for it.
 *
 * Design notes:
 *  - Free text AND the presets. The presets are what you use mid-fight, when
 *    you have four seconds and one hand on the board; typing is for between
 *    rounds. Dropping either one would be a downgrade for half the moments.
 *  - Scrollback, rather than the old 4-second self-deleting toast. A line that
 *    erases itself is not a conversation — you could not read what you missed
 *    while you were placing a unit, which is most of a round.
 *  - Messages arrive via onChildAdded on a limitToLast window, not onValue over
 *    the whole node: onValue re-delivers every message on every new one, which
 *    is quadratic in a long match and was already making the old toast logic
 *    re-scan the full list each time.
 */

/** Matches the 240-char ceiling in database.rules.json. Kept in sync by hand;
 *  a longer message is refused by the server, so this is the kind thing to do
 *  rather than the security boundary. */
const MAX_LEN = 240;
/** Client-side throttle. The rules deliberately do NOT enforce a rate limit —
 *  see the note there — so this is politeness, not protection. */
const SEND_GAP_MS = 900;
/** How much backlog to hold. A match is ~30 minutes; this is plenty, and it
 *  bounds what one client keeps in memory regardless of how chatty the lobby. */
const WINDOW = 80;
/** How long an unread message floats over the board when the panel is shut. */
const TOAST_MS = 5000;

const PRESETS = ["GG!", "Nice play!", "Oops...", "Let's go!", "Good luck!", "?", "Wow!"] as const;

type ChatEntry = { uid: string; name: string; msg: string; t: number };
type Msg = { id: string } & ChatEntry;

export function MatchChat({
  code, myUid, myName, canSend,
}: {
  code: string;
  myUid: string;
  myName: string;
  /** Spectators can read the room but have no player node, so the rules refuse
   *  their writes. Showing them a live input that always fails would be worse
   *  than showing them a disabled one that says why. */
  canSend: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Msg[]>([]);
  const lastSentRef = useRef(0);
  // The throttle has to be VISIBLE. It used to be a silent early return, so a
  // preset pressed just after another message simply did nothing and said
  // nothing -- indistinguishable, from the player's side, from the dead chat
  // this replaces. A disabled control at least tells the truth.
  const [cooling, setCooling] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Mirrored into a ref so the onChildAdded subscription can read "is the
  // panel open right now" without being torn down and rebuilt every time it
  // toggles -- re-subscribing would replay the backlog through onChildAdded.
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  // Messages already on the server when we joined are history, not events: they
  // must not toast or count as unread. onChildAdded fires for every existing
  // child on attach, so without this the panel would confetti the backlog at a
  // player who just reconnected.
  const primedRef = useRef(false);

  const { nodeRef, style, onPointerDown, dragging, moved, reset } = useDraggablePanel(
    "poketft.matchChat",
    { position: "fixed", right: 16, bottom: 64 },
  );

  useEffect(() => {
    const q = query(ref(db(), `games/${code}/chat`), limitToLast(WINDOW));
    // One pass to mark the existing backlog, then every later child is live.
    const stop = onValue(q, () => { primedRef.current = true; }, { onlyOnce: true });
    const unsub = onChildAdded(q, (snap) => {
      const v = snap.val() as ChatEntry | null;
      if (!v || typeof v.msg !== "string") return;
      const m: Msg = { id: snap.key ?? String(v.t), ...v };
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m].slice(-WINDOW)));
      if (!primedRef.current || m.uid === myUid) return;
      if (!openRef.current) {
        setUnread((n) => n + 1);
        setToasts((prev) => [...prev, m].slice(-3));
        window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== m.id)), TOAST_MS);
      }
    });
    return () => { unsub(); stop?.(); };
  }, [code, myUid]);

  // Pin to the newest line whenever one arrives or the panel opens.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, open]);

  // Clearing unread belongs to the toggle, not to an effect watching `open`:
  // nothing accumulates while the panel is open (the subscription skips the
  // counter in that case), so there is no state to synchronise -- only an
  // action to take at the moment the player looks.
  const toggle = useCallback(() => {
    setOpen((v) => !v);
    setUnread(0);
    setToasts([]);
  }, []);

  const send = useCallback((raw: string) => {
    const msg = raw.trim().slice(0, MAX_LEN);
    if (!msg || !canSend) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_GAP_MS) return;
    lastSentRef.current = now;
    setDraft("");
    setCooling(true);
    window.setTimeout(() => setCooling(false), SEND_GAP_MS);
    // push(), not a hand-rolled `${Date.now()}_${random}` key: push ids sort by
    // server time, so the log stays in true order even when two clients' clocks
    // disagree — which the old key, built from the SENDER's clock, did not.
    push(ref(db(), `games/${code}/chat`), { uid: myUid, name: myName, msg, t: Date.now() })
      .catch((e) => {
        // Loud. The predecessor swallowed exactly this and that is why nobody
        // noticed the feature was dead for its whole life.
        console.error("[chat] send failed:", (e as Error)?.message ?? e);
      });
  }, [code, myUid, myName, canSend]);

  const grouped = useMemo(() => msgs.map((m, i) => ({
    ...m,
    // Collapse the name on a run from the same speaker: a column of repeated
    // names is most of the panel's width spent saying nothing new.
    runOn: i > 0 && msgs[i - 1].uid === m.uid && m.t - msgs[i - 1].t < 60_000,
  })), [msgs]);

  return (
    <>
      {/* Unread, floated over the board while the panel is shut. */}
      {!open && toasts.length > 0 && (
        <div className="fixed bottom-16 right-4 z-screen flex flex-col items-end gap-1.5 pointer-events-none select-none">
          {toasts.map((m) => (
            <div key={m.id} className="flex items-baseline gap-2 rounded-full border border-slate-600/60 bg-slate-900/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
              <span className="font-bold text-gold-200/80">{m.name}</span>
              <span className="text-slate-200 max-w-[42ch] truncate">{m.msg}</span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div
          ref={nodeRef}
          style={style}
          data-panel="chat"
          className={`gilded gilded-strong z-panel flex w-[300px] max-w-[92vw] flex-col rounded-xl ${dragging ? "shadow-[0_8px_30px_rgba(0,0,0,0.6)]" : ""}`}
        >
          {/* The header is the drag handle; the body must stay selectable so a
              player can copy a lobby code someone pasted. */}
          <div
            onPointerDown={onPointerDown}
            className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.07] select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          >
            <span aria-hidden className="text-slate-600 leading-none tracking-[-0.15em] text-[11px]">⋮⋮</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gold-200/60">{t.chat_title}</span>
            <span className="ml-auto flex items-center gap-1.5">
              {moved && (
                <button onClick={reset} title={t.net_panel_reset} aria-label={t.net_panel_reset} className="text-slate-500 hover:text-slate-200 text-xs leading-none">↺</button>
              )}
              <button onClick={() => setOpen(false)} aria-label={t.chat_close} title={t.chat_close} className="text-slate-500 hover:text-slate-200 leading-none"><X size={13} /></button>
            </span>
          </div>

          <div ref={listRef} className="flex max-h-[42vh] min-h-[120px] flex-col gap-0.5 overflow-y-auto px-2.5 py-2">
            {grouped.length === 0 && (
              <p className="py-4 text-center text-[11px] text-slate-600">{t.chat_empty}</p>
            )}
            {grouped.map((m) => (
              <div key={m.id} className="text-[12px] leading-snug">
                {!m.runOn && (
                  <span className={`mr-1.5 font-bold ${m.uid === myUid ? "text-gold-300" : "text-sky-300"}`}>{m.name}</span>
                )}
                <span className="text-slate-200 break-words">{m.msg}</span>
              </div>
            ))}
          </div>

          {canSend ? (
            <>
              <div className="flex flex-wrap gap-1 border-t border-white/[0.07] px-2 py-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={cooling}
                    className="rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-gold-500/20 hover:text-gold-200 disabled:opacity-40 disabled:hover:bg-black/30 disabled:hover:text-slate-400"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); send(draft); }}
                className="flex items-center gap-1.5 border-t border-white/[0.07] px-2 py-1.5"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
                  // The match binds R / L / S / D / F as shop hotkeys on window.
                  // Without this, typing "roll" rerolls the shop three times and
                  // sells whatever is selected.
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={t.chat_placeholder}
                  maxLength={MAX_LEN}
                  className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/40 px-2 py-1 text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-gold-400/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || cooling}
                  aria-label={t.chat_send}
                  title={t.chat_send}
                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-gold-200 disabled:opacity-30"
                >
                  <Send size={13} />
                </button>
              </form>
            </>
          ) : (
            <p className="border-t border-white/[0.07] px-2.5 py-2 text-[10px] text-slate-500">{t.chat_spectator}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={t.chat_title}
        title={t.chat_title}
        className="fixed bottom-4 right-4 z-screen flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-800/90 text-slate-300 shadow-lg transition-all hover:border-gold-400/60 hover:bg-slate-700/90 hover:text-gold-300"
      >
        <MessageSquare size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
