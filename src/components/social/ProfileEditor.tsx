"use client";

import { useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { usernameValid } from "@/game/net/users";
import { spriteUrl } from "@/game/data/mons";

// A curated set of iconic Pokémon as avatar choices.
const AVATAR_DEX = [25, 1, 4, 7, 133, 6, 9, 3, 143, 94, 130, 149, 448, 282, 384, 658, 800, 197, 196, 700, 248, 445];
const AVATARS = AVATAR_DEX.map(spriteUrl);

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { profile, user, saveUsername, setAvatar, deleteAccount, error, busy } = useAuth();
  const isGuest = user?.isAnonymous ?? false;
  const [name, setName] = useState(profile?.username ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameChanged = name.trim() !== (profile?.username ?? "");
  const valid = usernameValid(name.trim());

  const save = async () => {
    if (nameChanged && valid) { const ok = await saveUsername(name); if (!ok) return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl border border-slate-700 bg-slate-900 p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-100">Edit profile</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {/* Current avatar */}
        <div className="flex items-center gap-3">
          <span className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
            {profile?.photoURL
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.photoURL} alt="" width={56} height={56} style={{ imageRendering: "pixelated" }} />
              : <span className="text-2xl font-extrabold text-slate-500">{(profile?.username || "?").slice(0, 1).toUpperCase()}</span>}
          </span>
          <div>
            <div className="text-sm font-bold text-amber-300">{profile?.username || "—"}</div>
            <div className="text-[11px] text-slate-500">{isGuest ? "Guest account" : user?.email}</div>
          </div>
        </div>

        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Username</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
          />
          {nameChanged && !valid && <span className="text-[10px] text-rose-400">3–16 letters, numbers or _</span>}
        </div>

        {/* Avatar picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Avatar</label>
          <div className="grid grid-cols-8 gap-1.5 max-h-[160px] overflow-y-auto">
            {AVATARS.map((url) => {
              const picked = profile?.photoURL === url;
              return (
                <button
                  key={url}
                  onClick={() => setAvatar(url)}
                  className={`aspect-square rounded-lg bg-slate-800 border flex items-center justify-center overflow-hidden transition-all ${picked ? "border-amber-400 ring-2 ring-amber-400/50" : "border-slate-700 hover:border-slate-500"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" width={32} height={32} style={{ imageRendering: "pixelated" }} />
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button onClick={save} disabled={busy || (nameChanged && !valid)}
          className="w-full py-2.5 rounded-xl font-extrabold text-sm bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40">
          {busy ? "…" : "Done"}
        </button>

        {/* Danger zone */}
        <div className="pt-3 border-t border-slate-800">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-[11px] text-slate-600 hover:text-rose-400 transition-colors">Delete account</button>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-rose-300">This permanently deletes your account, rank and history. Are you sure?</span>
              <div className="flex gap-2">
                <button onClick={async () => { const r = await deleteAccount(); if (r.ok) onClose(); }} disabled={busy}
                  className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-40">{busy ? "…" : "Delete forever"}</button>
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-lg text-[12px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
