"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Language = "fr" | "en";
export type AnimationSpeed = "normal" | "fast";

export type AppSettings = {
  language: Language;
  soundEnabled: boolean;
  animationSpeed: AnimationSpeed;
};

export type AppStore = {
  settings: AppSettings;
  setSettings: (update: Partial<AppSettings>) => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: {
        language: "fr",
        soundEnabled: true,
        animationSpeed: "normal",
      },
      setSettings: (update) => set((s) => ({ settings: { ...s.settings, ...update } })),
    }),
    {
      name: "poketft_settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
    },
  ),
);
