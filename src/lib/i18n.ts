"use client";

import { useAppStore } from "@/game/store/appStore";

export type Dict = {
  // Welcome
  w_subtitle: string;
  w_hero_title: string;
  w_how_to_play: string;
  w_profile: string;
  w_open_games: string;
  w_no_games: string;
  w_create_btn: string;
  w_join_btn: string;
  // Settings panel
  s_title: string;
  s_lang: string;
  s_sound: string;
  s_sound_on: string;
  s_sound_off: string;
  s_lang_fr: string;
  s_lang_en: string;
  // Lobby (legacy offline)
  l_rules: string;
  l_lobby: string;
  l_items_short: string;
  // Lobby (networked)
  l_net_players: (n: number, max: number) => string;
  l_net_open_slot: string;
  l_net_add_ai: string;
  l_net_wait_ready: string;
  l_net_start: string;
  l_net_ready_up: string;
  l_net_not_ready: string;
  l_net_leave: string;
  l_net_host: string;
  l_net_you: string;
  // Rules panel
  r_gens: string;
  r_pool: (n: number) => string;
  r_draft: string;
  r_draft_hint: string;
  r_hp: string;
  r_hp_unit: string;
  r_items: string;
  // Player slot (legacy)
  p_diff_easy: string;
  p_diff_medium: string;
  p_diff_hard: string;
  p_diff_expert: string;
  p_diff_ultimate: string;
  p_diff_nightmare: string;
  // Top bar (offline GameClient)
  // NetGameClient HUD
  net_stage: string;
  net_hp: string;
  net_gold: string;
  net_level: string;
  net_interest: string;
  net_streak: string;
  net_buy_xp: string;
  net_alive: (n: number) => string;
  net_phase_planning: string;
  net_phase_combat: string;
  net_phase_carousel: string;
  net_phase_over: string;
  net_host_badge: string;
  net_offline: string;
  net_trainers: (n: number) => string;
  net_leave: string;
  net_eliminated: string;
  net_placed: (n: number) => string;
  net_viewing: (name: string) => string;
  net_back_to_mine: string;
  net_spectate_badge: string;
  net_spectate_switch: string;
  net_victory: string;
  net_gameover: string;
  net_spectating: string;
  net_final_standings: string;
  net_play_again: string;
  net_quit: string;
  net_empty_board: string;
  // Shop
  sh_reroll: string;
  sh_freeze: string;
  sh_frozen: string;
  sh_drag_sell: string;
  sh_view_details: string;
  sh_max: string;
  sh_odds: string;
  sh_items_title: string;
  it_empty: string;
  it_equip_mega: string;
  it_drag_equip: string;
  it_reforge: string;
  it_forge_emblem: string;
  it_recipes: string;
  it_recipes_title: string;
  // Combat stage
  cs_your_team: string;
  cs_vs: string;
  cs_overtime: string;
  cs_get_ready: string;
  cs_breather: string;
  cs_no_dmg: string;
  cs_continue: string;
  cs_victory: string;
  cs_defeat: string;
  cs_draw: string;
  cs_recap: string;
  cs_show_recap: string;
  cs_hide_recap: string;
  // Unit detail
  ud_click_hint: string;
  ud_ability: string;
  ud_per_star: string;
  ud_stat_health: string;
  ud_stat_attack: string;
  ud_stat_dps: string;
  ud_stat_aspd: string;
  ud_stat_armor: string;
  ud_stat_mr: string;
  ud_stat_range: string;
  ud_stat_mana: string;
  ud_stat_tier: string;
  ud_melee: string;
  ud_hexes: (n: number) => string;
  ud_cost_common: string;
  ud_cost_uncommon: string;
  ud_cost_rare: string;
  ud_cost_epic: string;
  ud_cost_legendary: string;
  ud_shape_single: string;
  ud_shape_splash: string;
  ud_shape_line: string;
  ud_deals: (n: number, type: string) => string;
  ud_type_eff: string;
  ud_mana_label: string;
  // Auth + account
  a_signin_sub: string; a_google: string; a_or: string; a_email: string; a_password: string;
  a_signin: string; a_create_account: string; a_no_account: string; a_have_account: string;
  a_forgot: string; a_username_rule: string; a_continue: string; a_signout: string;
  // Profile editor + tile
  pe_title: string; pe_guest: string; pe_username: string; pe_avatar: string; pe_done: string;
  pe_delete: string; pe_delete_confirm: string; pe_delete_forever: string; pe_cancel: string;
  pt_view: string; pt_games: string; pt_wins: string; pt_best: string;
  // Friends
  fr_title: string; fr_create_acct: string; fr_add_ph: string; fr_add: string; fr_empty: string;
  fr_in_game: string; fr_online: string; fr_offline: string; fr_join: string; fr_watch: string; fr_remove: string;
  // Options menu
  o_options: string; o_volume: string; o_sound: string; o_language: string; o_muted: string; o_on: string; o_off: string;
  // In-game misc
  net_enemy: string; net_recap: string; net_recap_title: string; net_fullscreen: string; net_exit_fullscreen: string; net_your_board: string;
  r_augments: string;
  // Item / mega tooltips
  it_mega_stone: string; it_held_item: string; it_held_items: string; it_reforge_t: string; it_forge_t: string; it_collect: string;
  ud_play_cry: string; ud_mega_effect: string; ud_mega_at_start: string;
  a_close: string;
  tp_synergies: string; tp_place_mons: string; tp_cap_only: string; tp_cap_rest: string;
  uc_mega_ready: string; uc_click_details: string; ud_unequip: string;
  fr_added: string; fr_failed: string; fr_net_err: string; fr_you: string; fr_spectate_t: string;
  net_rival: string;
  // NetGameClient — Pension (Day Care)
  net_pension: string;
  net_pension_title: (cost: number, rounds: number) => string;
  net_pension_collect: string;
  net_pension_rounds: (n: number) => string;
  // NetGameClient — reconnect / error screen
  net_reconnecting: string;
  net_back_home: string;
  // NetGameClient — forfeit confirm dialog
  net_forfeit_title: string;
  net_forfeit_body: string;
  net_forfeit_confirm: string;
  net_forfeit_cancel: string;
  // NetGameClient — cannot Mega Evolve toast
  net_no_mega: string;
  // NetGameClient — stage-up banner
  net_stage_banner: string;
  net_stage_early: string;
  net_stage_mid: string;
  net_stage_powerspike: string;
  net_stage_endgame: string;
  // NetGameClient — round-tracker recap chip
  net_round_win: string;
  net_round_loss: string;
  // NetGameClient — HUD chips
  net_streak_title: string;
  net_next_opp: string;
  net_wild: string;
  net_ghost_suffix: string;
  net_ghost_title: string;
  net_resolving: string;
  net_interest_label: string;
  net_gold_label: string;
  // NetGameClient — board controls
  net_board_label: string;
  net_board_fill_title: string;
  net_board_fill: string;
  net_keys_label: string;
  net_key_sell: string;
  // NetGameClient — carousel overlay
  net_carousel_title: string;
  net_carousel_comeback: string;
  net_carousel_picked_waiting: (n: number) => string;
  net_carousel_picked_round: string;
  net_carousel_pick_free: string;
  net_bench_full: string;
  net_carousel_mega_sub: string;
  net_show_choices: string;
  net_hide_view_board: string;
  // NetGameClient — augment overlay
  net_augment_pick_one: string;
  net_augment_slot: (n: number) => string;
  net_augment_reroll: string;
  net_augment_free: string;
  // NetGameClient — game-over screen
  net_host_left: string;
  net_waiting_host: string;
  net_mvp_label: string;
  net_mvp_damage: string;
  net_mvp_tanked: string;
  net_mvp_healed: string;
  net_rank_promoted: string;
  net_rank_demoted: string;
  net_team_label: string;
  // NetGameClient — boot veil
  net_boot_connecting: string;
  net_boot_trainers: (n: number, total: number) => string;
  // NetGameClient — fight recap panel
  net_fight_last: string;
  net_fight_you: string;
  // NetGameClient — scoreboard hover
  net_view_board: (name: string) => string;
  // NetGameClient — spectate bench empty
  net_bench_empty: string;
  // NetGameClient — level badge prefix
  net_lv: string;
};

export const FR: Dict = {
  w_subtitle: "Teamfight Tactics — édition Pokémon",
  w_hero_title: "Prêt au combat ?",
  w_how_to_play: "Comment jouer",
  w_profile: "Profil",
  w_open_games: "Parties ouvertes",
  w_no_games: "Aucune partie ouverte — crées-en une !",
  w_create_btn: "Créer",
  w_join_btn: "Rejoindre",
  s_title: "Paramètres généraux",
  s_lang: "Langue",
  s_sound: "Son",
  s_sound_on: "Activé",
  s_sound_off: "Désactivé",
  s_lang_fr: "Français",
  s_lang_en: "English",
  l_rules: "Règles de partie",
  l_lobby: "Salon",
  l_items_short: "objets",
  l_net_players: (n, max) => `${n} / ${max} joueur${n > 1 ? "s" : ""} · slots vides jouent comme fantômes`,
  l_net_open_slot: "Slot libre",
  l_net_add_ai: "Ajouter IA",
  l_net_wait_ready: "En attente que tous soient prêts.",
  l_net_start: "Lancer la partie",
  l_net_ready_up: "Prêt",
  l_net_not_ready: "Pas prêt",
  l_net_leave: "Quitter",
  l_net_host: "Hôte",
  l_net_you: "Vous",
  r_gens: "Générations",
  r_pool: (n) => `Pool éligible : ${n} Pokémon`,
  r_draft: "Taille du draft",
  r_draft_hint: "Pokémon tirés aléatoirement dans la pool",
  r_hp: "PV de départ",
  r_hp_unit: "PV",
  r_items: "Objets disponibles",
  p_diff_easy: "Facile",
  p_diff_medium: "Moyen",
  p_diff_hard: "Difficile",
  p_diff_expert: "Expert",
  p_diff_ultimate: "Ultime",
  p_diff_nightmare: "Cauchemar",
  net_stage: "Stage",
  net_hp: "PV",
  net_gold: "Or",
  net_level: "Niveau",
  net_interest: "Intérêt",
  net_streak: "Série",
  net_buy_xp: "Acheter XP",
  net_alive: (n) => `${n} vivant${n > 1 ? "s" : ""}`,
  net_phase_planning: "planification",
  net_phase_combat: "combat",
  net_phase_carousel: "carrousel",
  net_phase_over: "terminé",
  net_host_badge: "Hôte",
  net_offline: " ·hors ligne",
  net_trainers: (n) => `Dresseurs · ${n} restant${n > 1 ? "s" : ""}`,
  net_leave: "Quitter",
  net_eliminated: "Éliminé",
  net_placed: (n) => `Classé #${n}`,
  net_viewing: (name) => `Plateau de ${name}`,
  net_back_to_mine: "Retour au mien",
  net_spectate_badge: "Spectateur",
  net_spectate_switch: "Clique un dresseur pour le suivre",
  net_victory: "Victoire Royale",
  net_gameover: "Game Over",
  net_spectating: "spectateur",
  net_final_standings: "Classement final",
  net_play_again: "Rejouer",
  net_quit: "Quitter",
  net_empty_board: "Aucun Pokémon",
  sh_reroll: "Reroll",
  sh_freeze: "Geler",
  sh_frozen: "Gelé",
  sh_drag_sell: "Glisser pour vendre",
  sh_view_details: "Voir les détails",
  sh_max: "MAX",
  sh_odds: "Chances",
  sh_items_title: "Objets",
  it_empty: "Aucun objet — gagne-les en carrousel ou PvE.",
  it_equip_mega: "Clique un mon Méga-capable pour l'équiper",
  it_drag_equip: "Glisse un objet sur un mon pour l'équiper.",
  it_reforge: "Reforger",
  it_forge_emblem: "Emblème",
  it_recipes: "Recettes",
  it_recipes_title: "Voir toutes les recettes d'objets",
  cs_your_team: "Votre équipe",
  cs_vs: "VS",
  cs_overtime: "PROLONGATION",
  cs_get_ready: "Préparez-vous !",
  cs_breather: "Répit — aucun PV perdu",
  cs_no_dmg: "Aucun PV perdu",
  cs_recap: "Bilan",
  cs_show_recap: "Afficher le bilan",
  cs_hide_recap: "Masquer le bilan",
  cs_continue: "Continuer",
  cs_victory: "Victoire",
  cs_defeat: "Défaite",
  cs_draw: "Égalité",
  ud_click_hint: "Cliquez sur un Pokémon du board, bench ou shop pour voir ses stats et capacité.",
  ud_ability: "Capacité",
  ud_per_star: "Par étoile",
  ud_stat_health: "PV",
  ud_stat_attack: "Attaque",
  ud_stat_dps: "DPS",
  ud_stat_aspd: "Vit. Att.",
  ud_stat_armor: "Armure",
  ud_stat_mr: "Rés. Mag.",
  ud_stat_range: "Portée",
  ud_stat_mana: "Mana",
  ud_stat_tier: "Tier",
  ud_melee: "Mêlée",
  ud_hexes: (n) => `${n} hexes`,
  ud_cost_common: "Commun",
  ud_cost_uncommon: "Peu commun",
  ud_cost_rare: "Rare",
  ud_cost_epic: "Épique",
  ud_cost_legendary: "Légendaire",
  ud_shape_single: "Frappe sa cible actuelle.",
  ud_shape_splash: "Frappe la cible et les ennemis adjacents.",
  ud_shape_line: "Traverse tous les ennemis en ligne.",
  ud_deals: (n, type) => `Inflige ${n} dégâts ${type}.`,
  ud_type_eff: "L'efficacité de type multiplie les dégâts.",
  ud_mana_label: "Mana",
  a_signin_sub: "Connecte-toi pour jouer avec tes amis", a_google: "Continuer avec Google", a_or: "ou", a_email: "E-mail", a_password: "Mot de passe (6+ car.)",
  a_signin: "Se connecter", a_create_account: "Créer un compte", a_no_account: "Pas de compte ? Créez-en un", a_have_account: "Déjà un compte ? Connectez-vous",
  a_forgot: "Mot de passe oublié ?", a_username_rule: "3–16 lettres, chiffres ou tiret bas.", a_continue: "Continuer", a_signout: "Se déconnecter",
  pe_title: "Modifier le profil", pe_guest: "Compte invité", pe_username: "Nom d'utilisateur", pe_avatar: "Avatar", pe_done: "Terminé",
  pe_delete: "Supprimer le compte", pe_delete_confirm: "Cela supprime définitivement ton compte, ton rang et ton historique. Es-tu sûr ?", pe_delete_forever: "Supprimer définitivement", pe_cancel: "Annuler",
  pt_view: "Voir le profil", pt_games: "Parties", pt_wins: "Victoires", pt_best: "Meilleur",
  fr_title: "Amis", fr_create_acct: "Crée un compte pour ajouter des amis et rejoindre leurs parties.", fr_add_ph: "Ajouter par nom", fr_add: "Ajouter", fr_empty: "Aucun ami — ajoute quelqu'un par son nom.",
  fr_in_game: "en partie", fr_online: "en ligne", fr_offline: "hors ligne", fr_join: "Rejoindre", fr_watch: "Regarder", fr_remove: "Retirer",
  o_options: "Options", o_volume: "Volume", o_sound: "Son", o_language: "Langue", o_muted: "Coupé", o_on: "Activé", o_off: "Désactivé",
  net_enemy: "Ennemi", net_recap: "Récap", net_recap_title: "Récap du dernier combat", net_fullscreen: "Plein écran", net_exit_fullscreen: "Quitter le plein écran", net_your_board: "Ton plateau",
  r_augments: "Augmentations",
  it_mega_stone: "Méga-Gemme", it_held_item: "Objet tenu", it_held_items: "Objets tenus", it_reforge_t: "Reforger en un autre objet aléatoire de la même classe", it_forge_t: "Forger cet objet en un Emblème de trait aléatoire", it_collect: "Ramasser l'objet",
  ud_play_cry: "▶ cri", ud_mega_effect: "À tenir sur un mon Méga-capable → il Méga-évolue au début du combat.", ud_mega_at_start: "Méga-évolue au début du combat.",
  a_close: "Fermer",
  tp_synergies: "Synergies", tp_place_mons: "Placez des mons pour activer les traits.", tp_cap_only: "Seulement", tp_cap_rest: "dans cette région — palier suivant inatteignable",
  uc_mega_ready: "Méga prêt", uc_click_details: "cliquer pour détails", ud_unequip: "Déséquiper (retour à l'inventaire)",
  fr_added: "Ajouté", fr_failed: "Échec", fr_net_err: "Erreur réseau — réessayez", fr_you: "vous :", fr_spectate_t: "Observer cette partie (lecture seule)",
  net_rival: "Rival",
  net_pension: "Pension",
  net_pension_title: (cost, rounds) => `Glissez un ★ pour élever une copie (${cost} or, ${rounds} tours)`,
  net_pension_collect: "Récupérer +1",
  net_pension_rounds: (n) => `${n} tour${n > 1 ? "s" : ""}`,
  net_reconnecting: "Reconnexion à la partie…",
  net_back_home: "Retour à l'accueil",
  net_forfeit_title: "Abandonner la partie ?",
  net_forfeit_body: "Vous serez éliminé à la dernière place restante et la partie sera enregistrée comme une défaite.",
  net_forfeit_confirm: "Abandonner",
  net_forfeit_cancel: "Annuler",
  net_no_mega: "Ce Pokémon ne peut pas Méga-Évoluer",
  net_stage_banner: "Manche",
  net_stage_early: "Le début de partie",
  net_stage_mid: "Le milieu de partie commence",
  net_stage_powerspike: "Pic de puissance",
  net_stage_endgame: "Fin de partie",
  net_round_win: "Victoire",
  net_round_loss: "Défaite",
  net_streak_title: "Or de série (victoires OU défaites d'affilée) : 2–3 → +1, 4 → +2, 5+ → +3 or par tour.",
  net_next_opp: "Prochain",
  net_wild: "Sauvages",
  net_ghost_suffix: " (clone)",
  net_ghost_title: "Combat fantôme (copie d'un adversaire)",
  net_resolving: "Résolution…",
  net_interest_label: "Intérêt",
  net_gold_label: "or",
  net_board_label: "Plateau",
  net_board_fill_title: "Remplir le plateau depuis le banc",
  net_board_fill: "Remplir",
  net_keys_label: "Raccourcis",
  net_key_sell: "Vendre",
  net_carousel_title: "Carrousel",
  net_carousel_comeback: "Bonus de remontée",
  net_carousel_picked_waiting: (n) => `Choisi — en attente de ${n} dresseur${n > 1 ? "s" : ""}…`,
  net_carousel_picked_round: "Choisi — en attente du tour…",
  net_carousel_pick_free: "Choisis une récompense gratuite.",
  net_bench_full: "Banc plein",
  net_carousel_mega_sub: "Méga-Évolution",
  net_show_choices: "Afficher les choix",
  net_hide_view_board: "Voir mon plateau",
  net_augment_pick_one: "Choisis un bonus permanent.",
  net_augment_slot: (n) => `Augmentation ${n}/3`,
  net_augment_reroll: "Relancer",
  net_augment_free: "Gratuit",
  net_host_left: "L'hôte a quitté — partie terminée.",
  net_waiting_host: "En attente de l'hôte…",
  net_mvp_label: "MVP du dernier combat",
  net_mvp_damage: "Dégâts",
  net_mvp_tanked: "Encaissé",
  net_mvp_healed: "Soins",
  net_rank_promoted: "Promu",
  net_rank_demoted: "Rétrogradé",
  net_team_label: "Éq.",
  net_boot_connecting: "Connexion au serveur…",
  net_boot_trainers: (n, total) => `${n}/${total} dresseurs prêts`,
  net_fight_last: "Dernier combat",
  net_fight_you: "Vous",
  net_view_board: (name) => `Voir le plateau de ${name}`,
  net_bench_empty: "Banc vide",
  net_lv: "Nv",
};

export const EN: Dict = {
  w_subtitle: "Teamfight Tactics — Pokémon edition",
  w_hero_title: "Ready to battle?",
  w_how_to_play: "How to play",
  w_profile: "Profile",
  w_open_games: "Open games",
  w_no_games: "No open games — host one!",
  w_create_btn: "Create",
  w_join_btn: "Join",
  s_title: "General settings",
  s_lang: "Language",
  s_sound: "Sound",
  s_sound_on: "Enabled",
  s_sound_off: "Disabled",
  s_lang_fr: "Français",
  s_lang_en: "English",
  l_rules: "Game rules",
  l_lobby: "Lobby",
  l_items_short: "items",
  l_net_players: (n, max) => `${n} / ${max} player${n > 1 ? "s" : ""} · empty slots play as ghosts`,
  l_net_open_slot: "Open slot",
  l_net_add_ai: "Add AI",
  l_net_wait_ready: "Waiting for everyone to ready up.",
  l_net_start: "Start game",
  l_net_ready_up: "Ready up",
  l_net_not_ready: "Not ready",
  l_net_leave: "Leave",
  l_net_host: "Host",
  l_net_you: "You",
  r_gens: "Generations",
  r_pool: (n) => `Eligible pool: ${n} Pokémon`,
  r_draft: "Draft size",
  r_draft_hint: "Pokémon randomly drawn from the pool",
  r_hp: "Starting HP",
  r_hp_unit: "HP",
  r_items: "Available items",
  p_diff_easy: "Easy",
  p_diff_medium: "Medium",
  p_diff_hard: "Hard",
  p_diff_expert: "Expert",
  p_diff_ultimate: "Ultimate",
  p_diff_nightmare: "Nightmare",
  net_stage: "Stage",
  net_hp: "HP",
  net_gold: "Gold",
  net_level: "Level",
  net_interest: "Interest",
  net_streak: "Streak",
  net_buy_xp: "Buy XP",
  net_alive: (n) => `${n} alive`,
  net_phase_planning: "planning",
  net_phase_combat: "combat",
  net_phase_carousel: "carousel",
  net_phase_over: "over",
  net_host_badge: "Host",
  net_offline: " ·offline",
  net_trainers: (n) => `Trainers · ${n} left`,
  net_leave: "Leave",
  net_eliminated: "Eliminated",
  net_placed: (n) => `You placed #${n}`,
  net_viewing: (name) => `${name}'s board`,
  net_back_to_mine: "Back to mine",
  net_spectate_badge: "Spectating",
  net_spectate_switch: "Click a trainer to follow",
  net_victory: "Victory Royale",
  net_gameover: "Game Over",
  net_spectating: "spectating",
  net_final_standings: "Final Standings",
  net_play_again: "Play again",
  net_quit: "Quit",
  net_empty_board: "No Pokémon",
  sh_reroll: "Reroll",
  sh_freeze: "Freeze",
  sh_frozen: "Frozen",
  sh_drag_sell: "Drag here to sell",
  sh_view_details: "View details",
  sh_max: "MAX",
  sh_odds: "Odds",
  sh_items_title: "Items",
  it_empty: "No items yet — win them in carousel or PvE.",
  it_equip_mega: "Click a Mega-capable mon to equip",
  it_drag_equip: "Drag an item onto a mon to equip it.",
  it_reforge: "Reforge",
  it_forge_emblem: "Emblem",
  it_recipes: "Recipes",
  it_recipes_title: "View all item recipes",
  cs_your_team: "Your Team",
  cs_vs: "VS",
  cs_overtime: "OVERTIME",
  cs_get_ready: "Get ready!",
  cs_breather: "Breather — no HP lost",
  cs_no_dmg: "No HP lost",
  cs_recap: "Recap",
  cs_show_recap: "Show recap",
  cs_hide_recap: "Hide recap",
  cs_continue: "Continue",
  cs_victory: "Victory",
  cs_defeat: "Defeat",
  cs_draw: "Draw",
  ud_click_hint: "Click a mon on the board, bench, or shop to inspect its stats and ability.",
  ud_ability: "Ability",
  ud_per_star: "Per star",
  ud_stat_health: "Health",
  ud_stat_attack: "Attack",
  ud_stat_dps: "DPS",
  ud_stat_aspd: "Atk Spd",
  ud_stat_armor: "Armor",
  ud_stat_mr: "Mag Res",
  ud_stat_range: "Range",
  ud_stat_mana: "Mana",
  ud_stat_tier: "Tier",
  ud_melee: "Melee",
  ud_hexes: (n) => `${n} hexes`,
  ud_cost_common: "Common",
  ud_cost_uncommon: "Uncommon",
  ud_cost_rare: "Rare",
  ud_cost_epic: "Epic",
  ud_cost_legendary: "Legendary",
  ud_shape_single: "Strikes its current target.",
  ud_shape_splash: "Strikes the target and adjacent enemies.",
  ud_shape_line: "Pierces every enemy in a line.",
  ud_deals: (n, type) => `Deals ${n} ${type} damage.`,
  ud_type_eff: "Type-effectiveness multiplies the damage.",
  ud_mana_label: "Mana",
  a_signin_sub: "Sign in to play with friends", a_google: "Continue with Google", a_or: "or", a_email: "Email", a_password: "Password (6+ chars)",
  a_signin: "Sign in", a_create_account: "Create account", a_no_account: "No account? Create one", a_have_account: "Already have an account? Sign in",
  a_forgot: "Forgot password?", a_username_rule: "3–16 letters, numbers or underscore.", a_continue: "Continue", a_signout: "Sign out",
  pe_title: "Edit profile", pe_guest: "Guest account", pe_username: "Username", pe_avatar: "Avatar", pe_done: "Done",
  pe_delete: "Delete account", pe_delete_confirm: "This permanently deletes your account, rank and history. Are you sure?", pe_delete_forever: "Delete forever", pe_cancel: "Cancel",
  pt_view: "View profile", pt_games: "Games", pt_wins: "Wins", pt_best: "Best",
  fr_title: "Friends", fr_create_acct: "Create an account to add friends and quick-join their games.", fr_add_ph: "Add by username", fr_add: "Add", fr_empty: "No friends yet — add someone by their username.",
  fr_in_game: "in game", fr_online: "online", fr_offline: "offline", fr_join: "Join", fr_watch: "Watch", fr_remove: "Remove",
  o_options: "Options", o_volume: "Volume", o_sound: "Sound", o_language: "Language", o_muted: "Muted", o_on: "On", o_off: "Off",
  net_enemy: "Enemy", net_recap: "Recap", net_recap_title: "Last fight recap", net_fullscreen: "Enter fullscreen", net_exit_fullscreen: "Exit fullscreen", net_your_board: "Your board",
  r_augments: "Augments",
  it_mega_stone: "Mega Stone", it_held_item: "Held item", it_held_items: "Held items", it_reforge_t: "Reforge into a random different item of the same class", it_forge_t: "Forge this item into a random trait Emblem", it_collect: "Collect item",
  ud_play_cry: "▶ cry", ud_mega_effect: "Holds on a Mega-capable mon → it Mega Evolves at combat start.", ud_mega_at_start: "Mega Evolves at combat start.",
  a_close: "Close",
  tp_synergies: "Synergies", tp_place_mons: "Place mons to activate traits.", tp_cap_only: "Only", tp_cap_rest: "in this region — can't reach the next tier",
  uc_mega_ready: "Mega ready", uc_click_details: "click for details", ud_unequip: "Unequip (back to inventory)",
  fr_added: "Added", fr_failed: "Failed", fr_net_err: "Network error — try again", fr_you: "you:", fr_spectate_t: "Spectate this game (read-only)",
  net_rival: "Rival",
  net_pension: "Day Care",
  net_pension_title: (cost, rounds) => `Drag a ★ mon to breed a copy of it (${cost} gold, ${rounds} rounds)`,
  net_pension_collect: "Collect +1",
  net_pension_rounds: (n) => `${n} round${n > 1 ? "s" : ""}`,
  net_reconnecting: "Reconnecting to your game…",
  net_back_home: "Back to home",
  net_forfeit_title: "Forfeit the match?",
  net_forfeit_body: "You'll be eliminated at the worst remaining place and the game is recorded as a loss.",
  net_forfeit_confirm: "Forfeit",
  net_forfeit_cancel: "Cancel",
  net_no_mega: "This Pokémon can't Mega Evolve",
  net_stage_banner: "Stage",
  net_stage_early: "The early game",
  net_stage_mid: "The midgame begins",
  net_stage_powerspike: "Powerspike",
  net_stage_endgame: "Endgame",
  net_round_win: "Win",
  net_round_loss: "Loss",
  net_streak_title: "Streak gold (a run of wins OR losses): 2–3 → +1, 4 → +2, 5+ → +3 gold per round.",
  net_next_opp: "Next",
  net_wild: "Wild",
  net_ghost_suffix: " (copy)",
  net_ghost_title: "Ghost fight (a copy of a rival)",
  net_resolving: "Resolving…",
  net_interest_label: "Interest",
  net_gold_label: "gold",
  net_board_label: "Board",
  net_board_fill_title: "Fill the board from the bench",
  net_board_fill: "Fill",
  net_keys_label: "Keys",
  net_key_sell: "Sell",
  net_carousel_title: "Carousel",
  net_carousel_comeback: "Comeback bonus",
  net_carousel_picked_waiting: (n) => `Picked — waiting for ${n} trainer${n > 1 ? "s" : ""}…`,
  net_carousel_picked_round: "Picked — waiting for the round…",
  net_carousel_pick_free: "Pick one free reward.",
  net_bench_full: "Bench full",
  net_carousel_mega_sub: "Mega Evolve",
  net_show_choices: "Show choices",
  net_hide_view_board: "Hide & view board",
  net_augment_pick_one: "Pick one permanent boost.",
  net_augment_slot: (n) => `Augment ${n}/3`,
  net_augment_reroll: "Reroll",
  net_augment_free: "Free",
  net_host_left: "The host left — game ended.",
  net_waiting_host: "Waiting for host…",
  net_mvp_label: "Last-fight MVP",
  net_mvp_damage: "Damage",
  net_mvp_tanked: "Tanked",
  net_mvp_healed: "Healed",
  net_rank_promoted: "Promoted",
  net_rank_demoted: "Demoted",
  net_team_label: "Team",
  net_boot_connecting: "Connecting to the arena…",
  net_boot_trainers: (n, total) => `${n}/${total} trainers ready`,
  net_fight_last: "Last fight",
  net_fight_you: "You",
  net_view_board: (name) => `${name}'s board`,
  net_bench_empty: "Empty bench",
  net_lv: "Lv",
};

export function useT(): Dict {
  const lang = useAppStore((s) => s.settings.language);
  return lang === "en" ? EN : FR;
}
