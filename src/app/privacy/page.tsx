"use client";

import { PokeballIcon } from "@/components/game/icons";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen app-bg px-5 py-12 sm:py-20">
      <div className="max-w-2xl mx-auto">

        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-10">
          <span className="text-gold drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]"><PokeballIcon size={26} /></span>
          <span className="font-extrabold tracking-tight text-xl">Poké<span className="gild-text">TFT</span></span>
        </div>

        <h1 className="font-bold text-3xl sm:text-4xl tracking-tight text-slate-100 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: June 2026</p>

        <div className="flex flex-col gap-8 text-sm text-slate-300 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">What we collect</h2>
            <p className="mb-3">When you create an account or play PokéTFT, we store the minimum data needed to run the game:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 text-slate-400">
              <li><span className="text-slate-200">Username</span> — the display name you choose</li>
              <li><span className="text-slate-200">Email address</span> — only if you sign up with email/password or Google</li>
              <li><span className="text-slate-200">Profile photo URL</span> — from your Google account if you use Google sign-in</li>
              <li><span className="text-slate-200">Rank and match history</span> — your LP, placement history, and season stats</li>
              <li><span className="text-slate-200">Friends list</span> — other player UIDs you add</li>
              <li><span className="text-slate-200">Type affinity</span> — your favourite Pokémon types, used for display only</li>
              <li><span className="text-slate-200">Online presence</span> — whether you are currently in-game (shown to friends)</li>
            </ul>
            <p className="mt-3 text-slate-500">Guest (anonymous) accounts store no email. They get a temporary UID and a generated display name.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">How we use it</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 text-slate-400">
              <li>Showing your rank and stats on the leaderboard</li>
              <li>Letting friends find and add you by username</li>
              <li>Displaying your avatar and name in game lobbies</li>
              <li>Keeping your progress across devices and sessions</li>
            </ul>
            <p className="mt-3">We do not sell your data, run ads, or share your information with third parties outside of Firebase (our hosting and database provider, operated by Google).</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">Firebase & Google</h2>
            <p>PokéTFT uses <a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">Firebase</a> (Google) for authentication and the Realtime Database. Data is stored on Google Cloud infrastructure. Google's privacy policy applies to their platform services.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">Data retention & deletion</h2>
            <p>You can delete your account at any time from within the app (Settings → Delete Account). This permanently removes your username, email, rank, friends list, and all associated records. Data is deleted immediately — there is no waiting period.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">Cookies & local storage</h2>
            <p>The app uses browser local storage and session storage to keep you signed in between sessions. No tracking cookies are set. No analytics or advertising scripts run on this site.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">Contact</h2>
            <p>Questions? Open an issue on <a href="https://github.com/Haxxxxxx/PokeTFT" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">GitHub</a>.</p>
          </section>

          <section className="pt-2 border-t border-white/[0.06]">
            <p className="text-slate-600 text-xs">PokéTFT is a fan project — not affiliated with Nintendo, Game Freak, or The Pokémon Company. Personal, non-commercial use only.</p>
          </section>

        </div>
      </div>
    </main>
  );
}
