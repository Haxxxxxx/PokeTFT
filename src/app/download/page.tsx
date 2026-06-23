"use client";

import { useEffect, useState } from "react";
import { PokeballIcon } from "@/components/game/icons";

const REPO = "https://github.com/Haxxxxxx/PokeTFT";
const RELEASE = `${REPO}/releases/latest`;
// Stable asset names — the release workflow renames the artifacts to these so the
// links never break across versions. See .github/workflows/tauri-build.yml.
const DL = {
  windows: `${RELEASE}/download/PokeTFT-Setup.exe`,
  macos: `${RELEASE}/download/PokeTFT.dmg`,
  android: `${RELEASE}/download/PokeTFT.apk`,
};

type OS = "windows" | "macos" | "android" | "other";
function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "other";
  if (/win/.test(ua)) return "windows";
  if (/mac/.test(ua)) return "macos";
  return "other";
}

const PLATFORMS: { id: OS; name: string; file: string; href: string; glyph: string }[] = [
  { id: "windows", name: "Windows", file: ".exe installer", href: DL.windows, glyph: "🪟" },
  { id: "macos", name: "macOS", file: ".dmg (Apple Silicon)", href: DL.macos, glyph: "" },
  { id: "android", name: "Android", file: ".apk (sideload)", href: DL.android, glyph: "🤖" },
];

export default function DownloadPage() {
  const [os, setOs] = useState<OS>("other");
  useEffect(() => { setOs(detectOS()); }, []);

  return (
    <main className="min-h-screen app-bg flex flex-col items-center px-5 py-12 sm:py-20">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mb-8">
        <span className="text-gold drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]"><PokeballIcon size={30} /></span>
        <span className="font-extrabold tracking-tight text-2xl">Poké<span className="gild-text">TFT</span></span>
      </div>

      {/* Hero */}
      <div className="text-center max-w-xl mb-10">
        <h1 className="font-bold tracking-tight text-4xl sm:text-5xl text-slate-100 leading-[1.1]">
          Get <span className="gild-text">PokéTFT</span> on your device
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-4 leading-relaxed">
          Teamfight Tactics — Pokémon edition. Evolutions are star-ups, types are traits,
          and the type chart is a combat layer. Play in your browser, or install the app.
        </p>
        <a href="/" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl font-bold text-[15px] bg-amber-500/95 hover:bg-amber-400 text-black transition-colors">
          ▶ Play in browser
        </a>
      </div>

      {/* Download cards */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => {
          const primary = p.id === os;
          return (
            <a
              key={p.id}
              href={p.href}
              className={`group panel rounded-2xl p-5 flex flex-col items-center text-center gap-2 transition-all hover:-translate-y-1 ${primary ? "ring-1 ring-amber-500/50 shadow-[0_20px_50px_-20px_rgba(251,191,36,0.4)]" : "hover:ring-1 hover:ring-white/10"}`}
            >
              <span className="text-3xl leading-none">{p.glyph || "🍎"}</span>
              <span className="text-base font-extrabold text-slate-100 mt-1">{p.name}</span>
              <span className="text-[11px] text-slate-500">{p.file}</span>
              {primary && <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-300 mt-0.5">Your device</span>}
              <span className={`mt-2 w-full py-2 rounded-lg text-[13px] font-bold transition-colors ${primary ? "bg-amber-500/90 group-hover:bg-amber-400 text-black" : "bg-white/[0.05] group-hover:bg-white/10 text-slate-200"}`}>
                Download
              </span>
            </a>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center gap-1 text-center">
        <a href={RELEASE} className="text-[12px] text-sky-400 hover:text-sky-300">All downloads & release notes →</a>
        <p className="text-[11px] text-slate-600 max-w-md mt-2">
          Windows: run the installer. macOS: open the .dmg and drag to Applications.
          Android: enable “install from unknown sources”, then open the .apk.
        </p>
      </div>

      <footer className="mt-12 text-[11px] text-slate-600 text-center max-w-md leading-relaxed">
        Fan project. Pokémon IP belongs to Nintendo / Game Freak / The Pokémon Company.
        Personal / non-commercial use only.
      </footer>
    </main>
  );
}
