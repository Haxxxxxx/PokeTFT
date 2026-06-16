"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Language = "fr" | "en";

export type AppSettings = {
  language: Language;
  soundEnabled: boolean;
  /** Master volume 0..1 (scales music + SFX). */
  volume: number;
};

export type AppStore = {
  settings: AppSettings;
  setSettings: (update: Partial<AppSettings>) => void;
  /** Home-screen nav: when true (and not in a game), show the profile/history view. */
  profileOpen: boolean;
  setProfileOpen: (v: boolean) => void;
  /** Home-screen nav: show the ranked leaderboard. */
  leaderboardOpen: boolean;
  setLeaderboardOpen: (v: boolean) => void;
  /** When set, the profile view shows this user's PUBLIC profile (read-only) instead
   *  of your own. Cleared on close. Leaderboard rows + friends set this. */
  viewProfileUid: string | null;
  openUserProfile: (uid: string) => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: {
        language: "fr",
        soundEnabled: true,
        volume: 0.7,
      },
      setSettings: (update) => set((s) => ({ settings: { ...s.settings, ...update } })),
      profileOpen: false,
      setProfileOpen: (v) => set(v ? { profileOpen: true } : { profileOpen: false, viewProfileUid: null }),
      leaderboardOpen: false,
      setLeaderboardOpen: (v) => set({ leaderboardOpen: v }),
      viewProfileUid: null,
      openUserProfile: (uid) => set({ viewProfileUid: uid, profileOpen: true }),
    }),
    {
      name: "poketft_settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
);
