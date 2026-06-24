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
    id: "2026-06-25",
    version: "v0.7",
    title: { en: "Guest play, account security & tighter rules", fr: "Jeu invité, sécurité du compte & règles renforcées" },
    changes: [
      { en: "Play as Guest — jump in with one click, no account required. Your stats carry over if you create an account later.", fr: "Jouer en invité — rejoins en un clic, sans compte. Tes stats sont conservées si tu crées un compte par la suite." },
      { en: "Guest upgrade flow: create an account from your profile without losing your rank or match history.", fr: "Conversion de compte invité : crée un compte depuis ton profil sans perdre ton rang ni ton historique." },
      { en: "Security hardening: streak bonuses, bot memory and matchmaking fields are now server-authoritative — no more client-side exploits.", fr: "Sécurité renforcée : les bonus de série, la mémoire des bots et les champs de matchmaking sont désormais gérés côté serveur." },
      { en: "Nuzlocke mode fixed: elimination writes now go through correctly when you're hosting.", fr: "Mode Nuzlocke corrigé : les écrits d'élimination passent désormais correctement quand tu es hôte." },
      { en: "Desktop & mobile app (Tauri): Google sign-in now works on the game subdomain.", fr: "Application desktop & mobile (Tauri) : la connexion Google fonctionne désormais sur le sous-domaine du jeu." },
    ],
  },
  {
    id: "2026-06-21",
    version: "v0.6",
    title: { en: "Game Modes, Double Up & smarter AI", fr: "Modes de jeu, Duo & IA plus maligne" },
    changes: [
      { en: "New Game Modes: Region Clash — each of the 9 regions with its own modifier, legendary boss and signature gear — plus Mono-Type, Mega Madness and Treasure Hunt.", fr: "Nouveaux modes : Duel de Région — chacune des 9 régions avec son modificateur, son boss légendaire et son objet signature — ainsi que Mono-Type, Folie Méga et Chasse au Trésor." },
      { en: "Double Up (2v2): pair into teams sharing one HP bar — send gold and bench units to your partner, and the last team standing wins.", fr: "Duo (2c2) : formez des équipes de 2 partageant une barre de PV — envoyez or et unités à votre partenaire, la dernière équipe debout gagne." },
      { en: "Tougher AI: Expert & Ultimate opponents now draft real synergies and item builds — plus a new Clone bot that replays YOUR last game.", fr: "IA renforcée : les adversaires Expert et Ultime montent de vraies synergies et builds d'objets — et un nouveau bot Clone qui rejoue TA dernière partie." },
      { en: "Augments now tailor to your board's playstyle, with a reroll to refresh your options — plus a batch of new combat augments.", fr: "Les augments s'adaptent désormais à ton plateau, avec une relance pour rafraîchir tes choix — et une fournée de nouveaux augments de combat." },
      { en: "Mega Evolutions overhauled: buffs match each Mega's identity (bruiser, mage, wall…), Primal forms added, and some lines change type as they evolve.", fr: "Méga-Évolutions revues : les bonus collent à l'identité de chaque Méga (bagarreur, mage, mur…), formes Primal ajoutées, et certaines lignées changent de type en évoluant." },
      { en: "Earn achievements on your profile, and see your last fight's MVP on the end screen.", fr: "Débloque des hauts faits sur ton profil, et découvre le MVP de ton dernier combat sur l'écran de fin." },
      { en: "Ranked is fairer (bots count for less), a combat win now pays +1 gold, and a stability fix keeps games from stalling on the first timer.", fr: "Le classé est plus juste (les bots comptent moins), gagner un combat rapporte +1 or, et un correctif empêche les parties de bloquer au premier timer." },
    ],
  },
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
