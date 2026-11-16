"use client";

import { useState, useSyncExternalStore } from "react";
import { isStandalone } from "@/lib/fullscreen";
import { useAppStore } from "@/game/store/appStore";
import { X, Share } from "lucide-react";

const DISMISSED = "poketft_ios_a2hs_dismissed";

/** iPhone/iPad in Safari — the only place Add to Home Screen is both possible
 *  and necessary. Chrome and Firefox on iOS are Safari underneath but cannot
 *  install, so prompting there would send the player down a dead end. */
function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPod/.test(ua)
    // iPadOS 13+ claims to be a Mac; touch points are what still separate them.
    || /iPad/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  // CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge. All are WebKit, none can
  // add to the home screen.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/**
 * Tells an iPhone player the one thing that makes this playable on their
 * device.
 *
 * Safari on iPhone has no Fullscreen API — the in-game button could never work
 * there — and Apple does not allow installing an app from a website, so there
 * is no .ipa to hand them either. Add to Home Screen is the only route to a
 * game without an address bar eating the top of the board, and nothing in iOS
 * advertises it: there is no install prompt, no banner, no API to trigger one.
 * If the game does not say it, the player never finds out.
 *
 * Shown once, dismissible, and never again after that — a prompt that keeps
 * coming back is the reason people stop reading prompts.
 */
export function IosInstallHint() {
  const lang = useAppStore((s) => s.settings.language);
  const [dismissed, setDismissed] = useState(false);

  // useSyncExternalStore, not state written from an effect: this reads browser
  // facts that never change after load (which browser, whether the app is
  // already installed, what localStorage says). Mirroring them into state is
  // an extra render and a lint error. The server snapshot returns false so the
  // static export's markup matches the first client paint.
  const eligible = useSyncExternalStore(
    () => () => {},
    () => {
      if (!isIosSafari()) return false;
      if (isStandalone()) return false; // already installed — nothing to suggest
      try {
        return window.localStorage.getItem(DISMISSED) !== "1";
      } catch {
        return true; // blocked storage — show it, it is dismissible
      }
    },
    () => false,
  );

  const show = eligible && !dismissed;
  if (!show) return null;

  const close = () => {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISSED, "1"); } catch { /* ignore */ }
  };

  const fr = lang === "fr";
  return (
    <div className="mx-auto w-full max-w-[940px] px-4 sm:px-6 pt-3">
      <div className="panel rounded-xl border-gold-500/25 px-4 py-3 flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5">🍎</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-gold-300">
            {fr ? "Joue en plein écran sur iPhone" : "Play fullscreen on iPhone"}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">
            {fr
              ? "Safari sur iPhone ne permet pas le plein écran dans la page. Ajoute PokéTFT à ton écran d'accueil : le jeu s'ouvre sans barre d'adresse ni barre Safari."
              : "Safari on iPhone can't go fullscreen inside the page. Add PokéTFT to your Home Screen and it opens with no address bar and no Safari toolbar."}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px] text-slate-300">
            <Share size={13} className="text-sky-300" />
            <span>{fr ? "Partager" : "Share"}</span>
            <span className="text-slate-600">→</span>
            <span className="font-semibold">{fr ? "Sur l'écran d'accueil" : "Add to Home Screen"}</span>
          </p>
        </div>
        <button
          onClick={close}
          aria-label={fr ? "Fermer" : "Dismiss"}
          className="shrink-0 text-slate-500 hover:text-slate-200"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
