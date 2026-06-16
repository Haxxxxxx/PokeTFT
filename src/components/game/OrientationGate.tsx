"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/game/store/appStore";
import { RotateCcw, Smartphone } from "lucide-react";

/**
 * Full-screen "rotate your device" veil shown only when a TOUCH device is held in
 * portrait. The match lives on a fixed 1760×1190 canvas that scales to fit — in
 * portrait that scale collapses to ~0.2 and the tokens become un-tappable, so we
 * ask the player to turn sideways (standard TFT-mobile behaviour). Desktops (fine
 * pointer) are never gated, even in a tall narrow window.
 */
export function OrientationGate() {
  const lang = useAppStore((s) => s.settings.language);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const check = () => {
      const portrait = window.innerHeight > window.innerWidth;
      // Only gate real handhelds: coarse pointer AND a small short edge (tablets in
      // portrait with plenty of width stay playable, so we leave them alone).
      setBlocked(!!coarse && portrait && window.innerWidth < 820);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-slate-950 px-8 text-center">
      <div className="relative">
        <Smartphone size={64} className="text-amber-400 rotate-90 drop-shadow-[0_0_18px_rgba(212,175,55,0.4)]" />
        <RotateCcw size={26} className="absolute -top-3 -right-4 text-sky-300 animate-spin" style={{ animationDuration: "3s" }} />
      </div>
      <div>
        <h2 className="text-xl font-extrabold gild-text">
          {lang === "fr" ? "Tournez votre appareil" : "Rotate your device"}
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-xs">
          {lang === "fr"
            ? "PokéTFT se joue en mode paysage. Mettez votre téléphone à l'horizontale pour entrer dans l'arène."
            : "PokéTFT plays in landscape. Turn your phone sideways to step into the arena."}
        </p>
      </div>
    </div>
  );
}
