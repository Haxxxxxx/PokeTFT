"use client";

import { useState } from "react";
import { useAuth } from "@/game/net/authStore";
import { usernameValid } from "@/game/net/users";
import { spriteUrl } from "@/game/data/mons";
import { useT } from "@/lib/i18n";
import { Modal } from "@/components/ui/Modal";

// A curated set of iconic Pokémon as avatar choices.
const AVATAR_DEX = [25, 1, 4, 7, 133, 6, 9, 3, 143, 94, 130, 149, 448, 282, 384, 658, 800, 197, 196, 700, 248, 445];
const AVATARS = AVATAR_DEX.map(spriteUrl);

export function ProfileEditor({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { profile, user, saveUsername, setAvatar, deleteAccount, openUpgradeModal, error, busy } = useAuth();
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
    <Modal onClose={onClose} label={t.pe_title} title={t.pe_title}>
      <div className="flex flex-col gap-5">

        {/* Current avatar */}
        <div className="flex items-center gap-3">
          <span className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
            {profile?.photoURL
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.photoURL} alt="" width={56} height={56} style={{ imageRendering: "pixelated" }} />
              : <span className="text-2xl font-extrabold text-slate-500">{(profile?.username || "?").slice(0, 1).toUpperCase()}</span>}
          </span>
          <div>
            <div className="text-sm font-bold text-gold-300">{profile?.username || "—"}</div>
            <div className="text-[11px] text-slate-500">{isGuest ? t.pe_guest : user?.email}</div>
          </div>
        </div>

        {/* Guest upgrade CTA */}
        {isGuest && (
          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-gold-500/10 border border-gold-500/20">
            <p className="text-[11px] text-gold-300 leading-snug">{t.pe_upgrade}</p>
            <button
              onClick={() => { onClose(); openUpgradeModal(); }}
              className="text-[11px] text-gold-400 underline underline-offset-2 text-left hover:text-gold-300 transition-colors"
            >
              {t.a_create_account} →
            </button>
          </div>
        )}

        {/* Username */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{t.pe_username}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none focus:border-gold-500"
          />
          {nameChanged && !valid && <span className="text-[10px] text-rose-400">{t.a_username_rule}</span>}
        </div>

        {/* Avatar picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{t.pe_avatar}</label>
          <div className="grid grid-cols-8 gap-1.5 max-h-[160px] overflow-y-auto">
            {AVATARS.map((url) => {
              const picked = profile?.photoURL === url;
              return (
                <button
                  key={url}
                  onClick={() => setAvatar(url)}
                  className={`aspect-square rounded-lg bg-slate-800 border flex items-center justify-center overflow-hidden transition-all ${picked ? "border-gold-400 ring-2 ring-gold-400/50" : "border-slate-700 hover:border-slate-500"}`}
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
          className="w-full py-2.5 rounded-xl font-extrabold text-sm bg-gold-500 hover:bg-gold-400 text-black disabled:opacity-40">
          {busy ? "…" : t.pe_done}
        </button>

        {/* Danger zone */}
        <div className="pt-3 border-t border-slate-800">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-[11px] text-slate-600 hover:text-rose-400 transition-colors">{t.pe_delete}</button>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-rose-300">{t.pe_delete_confirm}</span>
              <div className="flex gap-2">
                <button onClick={async () => { const r = await deleteAccount(); if (r.ok) onClose(); }} disabled={busy}
                  className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-40">{busy ? "…" : t.pe_delete_forever}</button>
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-lg text-[12px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300">{t.pe_cancel}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
