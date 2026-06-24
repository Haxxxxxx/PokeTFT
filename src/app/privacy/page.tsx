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
              <li><span className="text-slate-200">Username</span> — the display name you choose (3–16 characters)</li>
              <li><span className="text-slate-200">Email address</span> — only if you sign up with email/password or Google</li>
              <li><span className="text-slate-200">Profile photo URL</span> — from your Google account if you use Google sign-in</li>
              <li><span className="text-slate-200">Rank and rating</span> — your LP and placement history across ranked games</li>
              <li><span className="text-slate-200">Match history</span> — placement, team snapshot, and traits for each finished game</li>
              <li><span className="text-slate-200">Friends list</span> — the UIDs of other players you add</li>
              <li><span className="text-slate-200">Pending game invites</span> — room codes sent to you by friends (auto-cleared on use)</li>
              <li><span className="text-slate-200">Type affinity</span> — your preferred Pokémon types, used for display only</li>
              <li><span className="text-slate-200">Online presence</span> — whether you are currently in-game (shown to friends only)</li>
              <li><span className="text-slate-200">Current game</span> — the room code of your active match (shown to friends only)</li>
              <li><span className="text-slate-200">Account creation date</span></li>
            </ul>
            <p className="mt-3 text-slate-500">Guest (anonymous) accounts store no email. They get a temporary UID and a generated display name. If you sign up with a new email/password or link your Google account while still playing as a guest, your guest stats and history carry over to the new account — the UID is preserved. If you sign in to an existing account, the guest session ends and that account&apos;s data is used instead.</p>
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
            <h2 className="text-base font-bold text-slate-100 mb-2">Firebase &amp; Google</h2>
            <p>PokéTFT uses <a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">Firebase</a> (Google) for authentication and the Realtime Database. Data is stored on Google Cloud infrastructure. Google&apos;s privacy policy applies to their platform services.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">Data retention &amp; deletion</h2>
            <p className="mb-2">You can delete your account at any time from within the app (Settings → Delete Account). This immediately removes your Firebase Auth account and triggers a best-effort deletion of your stored profile data (username, email, rank, friends list, match history, and related records).</p>
            <p className="text-slate-400">In rare cases — such as a network failure during deletion — residual profile data may persist. Any such orphaned data is automatically removed within 30 days by a scheduled cleanup process.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-100 mb-2">Cookies &amp; local storage</h2>
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
