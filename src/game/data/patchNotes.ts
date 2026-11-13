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
    // One entry for the whole batch, on the PATCH digit. A version per feature
    // burns through numbers that then mean nothing -- v0.5 to v0.9 shipped in
    // under three hours once. There is plenty of room below the minor.
    id: "2026-11-12",
    version: "v0.9.1",
    title: {
      en: "Live chat, draft your starter, and an arena that reads your board",
      fr: "Tchat en direct, draft de ton starter, et une ar\u00e8ne qui lit ton plateau",
    },
    changes: [
      { en: "Live chat in every match \u2014 free text and quick presets, with scrollback you can actually read. The old quick-chat had never delivered a single message: the database refused every write and the error was swallowed.",
        fr: "Tchat en direct dans chaque partie \u2014 texte libre et messages rapides, avec un historique lisible. L'ancien tchat n'avait jamais d\u00e9livr\u00e9 un seul message : la base refusait chaque \u00e9criture et l'erreur \u00e9tait aval\u00e9e." },
      { en: "Draft your starter: the free opening mon is now a choice between six, drawn from the lobby's roster, instead of a random handout.",
        fr: "Draft de ton starter : le Pok\u00e9mon offert en ouverture est d\u00e9sormais un choix parmi six, tir\u00e9s du roster du salon, au lieu d'un tirage al\u00e9atoire." },
      { en: "The arena takes its character from your board \u2014 a Fire team fights on warm basalt under drifting embers, a Water team on a cold shelf in the rain. Eighteen types, each with its own weather.",
        fr: "L'ar\u00e8ne prend le caract\u00e8re de ton plateau \u2014 une \u00e9quipe Feu combat sur du basalte chaud sous des braises, une \u00e9quipe Eau sur une dalle froide sous la pluie. Dix-huit types, chacun sa m\u00e9t\u00e9o." },
      { en: "Unit details now recommend the items worth building on that mon, ranked from its own statline, instead of reprinting the type chart.",
        fr: "La fiche d'une unit\u00e9 recommande d\u00e9sormais les objets qui lui conviennent, class\u00e9s d'apr\u00e8s ses propres stats, au lieu de r\u00e9afficher le tableau des types." },
      { en: "Shop: the drop odds moved above the cards they are odds on, freeze became a lock at the top right, the level now shows what it costs in gold, and the sell slot is gone \u2014 drag onto the shop to sell, so the cards get the full width.",
        fr: "Boutique : les chances sont pass\u00e9es au-dessus des cartes concern\u00e9es, le gel est devenu un cadenas en haut \u00e0 droite, le niveau affiche son co\u00fbt en or, et la case de vente a disparu \u2014 glisse sur la boutique pour vendre, les cartes prennent toute la largeur." },
      { en: "The Day Care moved off the board into the right rail under the trainers list, and is no longer taller than it needs to be.",
        fr: "La Pension a quitt\u00e9 le plateau pour la colonne de droite sous la liste des dresseurs, et n'est plus plus grande que n\u00e9cessaire." },
      { en: "Both recap panels can be dragged anywhere and stay where you put them \u2014 the round recap and the combat DMG/TANK/HEAL panel, which used to cover the fight it was describing.",
        fr: "Les deux r\u00e9capitulatifs se d\u00e9placent o\u00f9 tu veux et y restent \u2014 celui du round et celui du combat (DMG/TANK/HEAL), qui masquait le combat qu'il d\u00e9crivait." },
      { en: "Round tracker: the icons were being cut in half by a scrolling strip, and every round now explains itself on hover \u2014 stage, type, who you fought and what it cost.",
        fr: "Suivi des rounds : les ic\u00f4nes \u00e9taient coup\u00e9es en deux par la barre d\u00e9filante, et chaque round s'explique au survol \u2014 \u00e9tage, type, adversaire et PV perdus." },
      { en: "Your item stash can no longer squeeze the synergy list off the rail when your inventory fills up.",
        fr: "Ton stock d'objets ne peut plus chasser la liste des synergies de la colonne quand l'inventaire se remplit." },
      { en: "A carousel reward is no longer lost if you are disconnected when the timer runs out \u2014 it waits for you and is applied when you come back.",
        fr: "Une r\u00e9compense de carrousel n'est plus perdue si tu es d\u00e9connect\u00e9 \u00e0 la fin du chrono \u2014 elle t'attend et s'applique \u00e0 ton retour." },
      { en: "The game has one address now: poke-tft.web.app. Old links still work.",
        fr: "Le jeu a une seule adresse d\u00e9sormais : poke-tft.web.app. Les anciens liens fonctionnent toujours." },
    ],
  },
  {
    id: "2026-08-25",
    version: "v0.8",
    title: { en: "Desktop app sign-in actually fixed, plus UI & history fixes", fr: "Connexion de l'appli desktop enfin corrigée, plus correctifs d'affichage & d'historique" },
    changes: [
      { en: "Desktop & mobile app: Google sign-in now completes reliably end to end — no more getting stuck on the login screen after signing in through your browser.", fr: "Application desktop & mobile : la connexion Google se termine désormais de bout en bout — plus de blocage sur l'écran de connexion après s'être identifié dans le navigateur." },
      { en: "Fixed the item Recipe Book, Augments panel and Co-op panel sometimes rendering underneath other UI, making them unreadable.", fr: "Correction du Livre de recettes, du panneau Augmentations et du panneau Coopération qui s'affichaient parfois sous le reste de l'interface, les rendant illisibles." },
      { en: "Match history and rating now record reliably even if you close the app mid-game or your opponents are all bots.", fr: "L'historique des parties et le classement sont désormais enregistrés de manière fiable, même en quittant l'appli en cours de partie ou face à des bots uniquement." },
    ],
  },
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
