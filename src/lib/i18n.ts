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
};

export function useT(): Dict {
  const lang = useAppStore((s) => s.settings.language);
  return lang === "en" ? EN : FR;
}
