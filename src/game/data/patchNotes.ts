/**
 * Player-facing changelog. Newest entry FIRST. `id` is a stable, monotonically-sortable
 * tag used to remember the latest note a player has seen (localStorage) so we can badge
 * the News button when something new ships. Bump it whenever you add an entry.
 */
export type PatchNote = {
  id: string;            // e.g. "2026-06-16" — also the displayed date
  version: string;       // short tag shown as a chip
  title: { en: string; fr: string };
  changes: { en: string; fr: string }[];
};

export const PATCH_NOTES: PatchNote[] = [
  {
    id: "2026-06-16",
    version: "v0.5",
    title: { en: "Profiles, mobile & onboarding", fr: "Profils, mobile & prise en main" },
    changes: [
      { en: "View any trainer's profile from the leaderboard or your friends list.", fr: "Consulte le profil de n'importe quel dresseur depuis le classement ou tes amis." },
      { en: "Click a match in your history to see the full game — placement, synergies and final board.", fr: "Clique sur une partie de ton historique pour voir tout le détail — classement, synergies et composition finale." },
      { en: "Mobile: a landscape gate and zoom-lock make the arena playable on phones.", fr: "Mobile : un mode paysage et le verrouillage du zoom rendent l'arène jouable sur téléphone." },
      { en: "New first-match coach guides brand-new trainers through the basics.", fr: "Un nouveau guide accompagne les nouveaux dresseurs lors de leur première partie." },
    ],
  },
  {
    id: "2026-06-14",
    version: "v0.4",
    title: { en: "Ranked & social", fr: "Classé & social" },
    changes: [
      { en: "Ranked ladder with tiers, divisions and LP — climb from Iron to Master.", fr: "Échelle classée avec paliers, divisions et LP — grimpe de Fer à Maître." },
      { en: "Invite friends straight into your lobby; their placeholder shows until they join.", fr: "Invite tes amis directement dans ton salon ; leur emplacement s'affiche en attendant." },
      { en: "Surrender / concede and account management (password reset, delete).", fr: "Abandon et gestion du compte (réinitialisation du mot de passe, suppression)." },
    ],
  },
  {
    id: "2026-06-10",
    version: "v0.3",
    title: { en: "Deeper combat", fr: "Combat approfondi" },
    changes: [
      { en: "Type-effectiveness damage multipliers and Mega Evolutions at combat start.", fr: "Multiplicateurs d'efficacité des types et Méga-Évolutions au début du combat." },
      { en: "Custom augments at stages 2-3-4 and a richer synergy panel.", fr: "Augments personnalisés aux stages 2-3-4 et un panneau de synergies enrichi." },
    ],
  },
];

export const LATEST_NOTE_ID = PATCH_NOTES[0].id;
