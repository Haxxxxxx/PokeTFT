"use client";

import { useEffect, useRef, useState } from "react";
import { ref, set, remove, onValue } from "firebase/database";
import { db } from "@/game/net/firebase";

const PRESETS = [
  "GG!",
  "Nice play!",
  "Oops...",
  "Let's go!",
  "Good luck!",
  "?",
  "Wow!",
  "See you next game",
] as const;

type ChatEntry = { uid: string; name: string; msg: string; t: number };

type ToastEntry = { id: string } & ChatEntry;

const TOAST_LIFETIME_MS = 3500;
const CHAT_EXPIRE_MS = 4000;

interface QuickChatProps {
  code: string;
  myUid: string;
  myName: string;
}

export function QuickChat({ code, myUid, myName }: QuickChatProps) {
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  // Track timeouts we own so we can clean up on unmount.
  const deleteTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Subscribe to incoming chat messages.
  useEffect(() => {
    const chatRef = ref(db(), `games/${code}/chat`);
    const unsub = onValue(chatRef, (snap) => {
      if (!snap.exists()) return;
      const val = snap.val() as Record<string, ChatEntry>;
      const entries = Object.entries(val);
      for (const [id, entry] of entries) {
        // Only surface messages that aren't ours already tracked.
        setToasts((prev) => {
          if (prev.some((t) => t.id === id)) return prev;
          const toast: ToastEntry = { id, ...entry };
          const timer = setTimeout(() => {
            setToasts((t) => t.filter((x) => x.id !== id));
          }, TOAST_LIFETIME_MS);
          toastTimers.current.push(timer);
          return [...prev, toast];
        });
      }
    });
    return () => {
      unsub();
    };
  }, [code]);

  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      for (const t of deleteTimers.current) clearTimeout(t);
      for (const t of toastTimers.current) clearTimeout(t);
    };
  }, []);

  function sendMessage(msg: string) {
    setOpen(false);
    const key = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const chatRef = ref(db(), `games/${code}/chat/${key}`);
    const entry: ChatEntry = { uid: myUid, name: myName, msg, t: Date.now() };
    set(chatRef, entry).catch(() => {});
    // Auto-expire: delete the node after 4 seconds.
    const timer = setTimeout(() => {
      remove(chatRef).catch(() => {});
    }, CHAT_EXPIRE_MS);
    deleteTimers.current.push(timer);
  }

  return (
    <>
      {/* Floating toast messages */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none select-none">
        {toasts.map((toast) => {
          const isMine = toast.uid === myUid;
          return (
            <div
              key={toast.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm border transition-all
                ${isMine
                  ? "bg-amber-500/25 border-amber-400/50 text-amber-200 self-end mr-4"
                  : "bg-slate-800/80 border-slate-600/60 text-slate-200 self-start ml-4"
                }`}
            >
              <span className="opacity-70 font-semibold">{toast.name}</span>
              <span>{toast.msg}</span>
            </div>
          );
        })}
      </div>

      {/* Picker popover */}
      {open && (
        <div
          className="fixed inset-0 z-[55]"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute bottom-20 right-4 w-48 rounded-xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {PRESETS.map((msg) => (
              <button
                key={msg}
                type="button"
                onClick={() => sendMessage(msg)}
                className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-amber-500/20 hover:text-amber-200 transition-colors border-b border-slate-800/60 last:border-none"
              >
                {msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Quick chat"
        className="fixed bottom-4 right-4 z-50 w-10 h-10 rounded-full bg-slate-800/90 border border-slate-700/80 hover:border-amber-400/60 hover:bg-slate-700/90 text-slate-300 hover:text-amber-300 shadow-lg flex items-center justify-center text-lg leading-none transition-all"
      >
        💬
      </button>
    </>
  );
}
