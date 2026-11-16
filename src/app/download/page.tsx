"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PokeballIcon } from "@/components/game/icons";
import { isNativeShell } from "@/game/net/nativeShell";

const REPO = "https://github.com/Haxxxxxx/PokeTFT";
const RELEASE = `${REPO}/releases/latest`;
// Stable asset names — the release workflow renames the artifacts to these so the
// links never break across versions. See .github/workflows/tauri-build.yml.
const DL = {
  windows: `${RELEASE}/download/PokeTFT-Setup.exe`,
  macos: `${RELEASE}/download/PokeTFT.dmg`,
  android: `${RELEASE}/download/PokeTFT.apk`,
};

type OS = "windows" | "macos" | "android" | "ios" | "other";
function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipod/.test(ua)) return "ios";
  // iPadOS 13+ reports itself as a Mac. The touch-point count is what still
  // separates them, and getting this wrong sends an iPad user to a .dmg.
  if (/ipad/.test(ua) || (/mac/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/win/.test(ua)) return "windows";
  if (/mac/.test(ua)) return "macos";
  return "other";
}

const PLATFORMS: { id: OS; name: string; file: string; href: string; glyph: string; tip: string }[] = [
  {
    id: "windows", name: "Windows", file: ".exe installer", href: DL.windows, glyph: "🪟",
    tip: 'Windows SmartScreen may warn about this file. Click "More info" → "Run anyway" to install.',
  },
  {
    id: "macos", name: "macOS", file: ".dmg (Apple Silicon)", href: DL.macos, glyph: "🍎",
    tip: "macOS Gatekeeper may block the first launch. Right-click the app → Open → Open, or go to System Settings → Privacy & Security → Open Anyway.",
  },
  {
    id: "android", name: "Android", file: ".apk (sideload)", href: DL.android, glyph: "🤖",
    tip: 'Enable "Install from unknown sources" in Settings → Apps → Special app access, then open the .apk.',
  },
];

export default function DownloadPage() {
  const [os, setOs] = useState<OS>("other");
  const [native, setNative] = useState(false);
  // Intentional post-mount detection: this page is statically exported, so both values
  // MUST start at their server-rendered defaults and only resolve on the client, or the
  // first paint hydration-mismatches. The cascading-render cost is one frame, once.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOs(detectOS()); setNative(isNativeShell()); }, []);

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
        {!native && (
          <Link href="/" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl font-bold text-[15px] bg-gold-500/95 hover:bg-gold-400 text-black transition-colors">
            ▶ Play in browser
          </Link>
        )}
      </div>

      {/* iOS has no download, and saying so plainly is the point.
          Apple permits installation only through the App Store, TestFlight
          (builds expire after 90 days; external testing needs review) or
          ad-hoc (every device UDID registered by hand, 100 a year). None of
          those is something a visitor can act on from a link, so there is no
          .ipa to offer and pretending otherwise would just waste their time.
          Add to Home Screen gives them the fullscreen game in two taps, which
          is the thing they actually came for. */}
      {os === "ios" && (
        <div className="w-full max-w-3xl mb-4 panel rounded-2xl p-5 ring-1 ring-gold-500/50 shadow-[0_20px_50px_-20px_rgba(251,191,36,0.4)]">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-2xl leading-none">🍎</span>
            <span className="text-base font-extrabold text-slate-100">iPhone &amp; iPad</span>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-gold-300">Your device</span>
          </div>
          <p className="text-[12px] text-slate-400 leading-relaxed">
            There is no iOS app to download — Apple only allows installs through the App Store,
            and PokéTFT is not on it. Instead, add it to your Home Screen: it launches
            fullscreen, with no address bar and no Safari toolbar.
          </p>
          <ol className="mt-3 flex flex-col gap-1.5 text-[12px] text-slate-300">
            <li><span className="font-bold text-gold-300">1.</span> Open <span className="font-semibold">poke-tft.web.app</span> in <span className="font-semibold">Safari</span> (it has to be Safari — Chrome on iOS cannot install it).</li>
            <li><span className="font-bold text-gold-300">2.</span> Tap the <span className="font-semibold">Share</span> button (the square with an arrow).</li>
            <li><span className="font-bold text-gold-300">3.</span> Choose <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>.</li>
            <li><span className="font-bold text-gold-300">4.</span> Launch it from the Home Screen icon — rotate to landscape and play.</li>
          </ol>
        </div>
      )}

      {/* Download cards */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => {
          const primary = p.id === os;
          return (
            <a
              key={p.id}
              href={p.href}
              className={`group panel rounded-2xl p-5 flex flex-col items-center text-center gap-2 transition-all hover:-translate-y-1 ${primary ? "ring-1 ring-gold-500/50 shadow-[0_20px_50px_-20px_rgba(251,191,36,0.4)]" : "hover:ring-1 hover:ring-white/10"}`}
            >
              <span className="text-3xl leading-none">{p.glyph || "🍎"}</span>
              <span className="text-base font-extrabold text-slate-100 mt-1">{p.name}</span>
              <span className="text-[11px] text-slate-500">{p.file}</span>
              {primary && <span className="text-[9px] font-extrabold uppercase tracking-wider text-gold-300 mt-0.5">Your device</span>}
              <span className={`mt-2 w-full py-2 rounded-lg text-[13px] font-bold transition-colors ${primary ? "bg-gold-500/90 group-hover:bg-gold-400 text-black" : "bg-white/[0.05] group-hover:bg-white/10 text-slate-200"}`}>
                Download
              </span>
              <span className="text-[10px] text-slate-600 leading-snug text-left mt-1">{p.tip}</span>
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

      <footer className="mt-12 text-[11px] text-slate-600 text-center max-w-md leading-relaxed flex flex-col gap-1.5 items-center">
        <a href="/privacy" className="text-slate-500 hover:text-slate-300 transition-colors">Privacy Policy</a>
        <span>Fan project. Pokémon IP belongs to Nintendo / Game Freak / The Pokémon Company. Personal / non-commercial use only.</span>
      </footer>
    </main>
  );
}
