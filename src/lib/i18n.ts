"use client";

import { useAppStore } from "@/game/store/appStore";

export type Dict = {
  // Welcome
  w_subtitle: string;
  w_username_label: string;
  w_username_placeholder: string;
  w_create: string;
  w_join: string;
  w_create_desc: string;
  w_create_btn: string;
  w_back: string;
  w_join_code_label: string;
  w_join_code_placeholder: string;
  w_join_btn: string;
  w_join_error: string;
  // Settings panel
  s_title: string;
  s_lang: string;
  s_sound: string;
  s_sound_on: string;
  s_sound_off: string;
  s_anim: string;
  s_lang_fr: string;
  s_lang_en: string;
  s_anim_normal: string;
  s_anim_fast: string;
  // Lobby
  l_players: (n: number, max: number) => string;
  l_slots: string;
  l_start: string;
  l_need_more: string;
  l_wait_ready: string;
  l_starting: string;
  l_rules: string;
  // Rules panel
  r_gens: string;
  r_pool: (n: number) => string;
  r_draft: string;
  r_draft_hint: string;
  r_hp: string;
  r_hp_unit: string;
  r_items: string;
  // Player slot
  p_slot: (n: number) => string;
  p_add_human: string;
  p_add_bot: string;
  p_ready: string;
  p_waiting: string;
  p_ready_btn: string;
  p_cancel_btn: string;
  p_bot_name: string;
  p_username_placeholder: string;
  p_diff_easy: string;
  p_diff_medium: string;
  p_diff_hard: string;
  // Top bar
  t_stage: string;
  t_health: string;
  t_gold: string;
  t_interest: string;
  t_streak_win: string;
  t_streak_loss: string;
  t_board: string;
  t_level: string;
  t_max: string;
  t_buy_xp: string;
  t_pve: string;
  t_carousel: string;
  t_pvp: string;
};

export const FR: Dict = {
  w_subtitle: "Teamfight Tactics — édition Pokémon",
  w_username_label: "Ton pseudo",
  w_username_placeholder: "Choisis un pseudo…",
  w_create: "⚔ Créer une partie",
  w_join: "🔗 Rejoindre",
  w_create_desc: "Tu seras l'hôte de la partie. Les autres joueurs pourront rejoindre avec le code du lobby.",
  w_create_btn: "⚔ Créer",
  w_back: "Retour",
  w_join_code_label: "Code du lobby",
  w_join_code_placeholder: "Ex: AB3X7K",
  w_join_btn: "🔗 Rejoindre",
  w_join_error: "Code invalide — 6 caractères requis.",
  s_title: "Paramètres généraux",
  s_lang: "Langue",
  s_sound: "Son",
  s_sound_on: "🔊 Activé",
  s_sound_off: "🔇 Désactivé",
  s_anim: "Animations",
  s_lang_fr: "Français",
  s_lang_en: "English",
  s_anim_normal: "Normal",
  s_anim_fast: "Rapide",
  l_players: (n, max) => `${n} / ${max} joueur${n > 1 ? "s" : ""}`,
  l_slots: "Slots",
  l_start: "⚔ Lancer la partie",
  l_need_more: "Il faut au moins 2 joueurs.",
  l_wait_ready: "Attente que tous les joueurs soient prêts.",
  l_starting: "Démarrage de la partie…",
  l_rules: "Règles de partie",
  r_gens: "Générations",
  r_pool: (n) => `Pool éligible : ${n} Pokémon`,
  r_draft: "Taille du draft",
  r_draft_hint: "Pokémon tirés aléatoirement dans la pool",
  r_hp: "PV de départ",
  r_hp_unit: "PV",
  r_items: "Objets disponibles",
  p_slot: (n) => `Slot ${n}`,
  p_add_human: "+ Humain",
  p_add_bot: "+ Bot IA",
  p_ready: "Prêt",
  p_waiting: "En attente",
  p_ready_btn: "✓ Prêt",
  p_cancel_btn: "Annuler",
  p_bot_name: "Bot IA",
  p_username_placeholder: "Ton nom",
  p_diff_easy: "Facile",
  p_diff_medium: "Moyen",
  p_diff_hard: "Difficile",
  t_stage: "Stage",
  t_health: "Santé",
  t_gold: "Or",
  t_interest: "Intérêts",
  t_streak_win: "Victoires",
  t_streak_loss: "Défaites",
  t_board: "Board",
  t_level: "Niveau",
  t_max: "MAX",
  t_buy_xp: "Acheter XP",
  t_pve: "Combat Sauvage",
  t_carousel: "Carousel",
  t_pvp: "Lancer le combat",
};

export const EN: Dict = {
  w_subtitle: "Teamfight Tactics — Pokémon edition",
  w_username_label: "Your username",
  w_username_placeholder: "Choose a username…",
  w_create: "⚔ Create a game",
  w_join: "🔗 Join",
  w_create_desc: "You'll be the host. Other players can join using the lobby code.",
  w_create_btn: "⚔ Create",
  w_back: "Back",
  w_join_code_label: "Lobby code",
  w_join_code_placeholder: "Ex: AB3X7K",
  w_join_btn: "🔗 Join",
  w_join_error: "Invalid code — 6 characters required.",
  s_title: "General settings",
  s_lang: "Language",
  s_sound: "Sound",
  s_sound_on: "🔊 Enabled",
  s_sound_off: "🔇 Disabled",
  s_anim: "Animations",
  s_lang_fr: "Français",
  s_lang_en: "English",
  s_anim_normal: "Normal",
  s_anim_fast: "Fast",
  l_players: (n, max) => `${n} / ${max} player${n > 1 ? "s" : ""}`,
  l_slots: "Slots",
  l_start: "⚔ Start game",
  l_need_more: "At least 2 players required.",
  l_wait_ready: "Waiting for all players to be ready.",
  l_starting: "Starting game…",
  l_rules: "Game rules",
  r_gens: "Generations",
  r_pool: (n) => `Eligible pool: ${n} Pokémon`,
  r_draft: "Draft size",
  r_draft_hint: "Pokémon randomly drawn from the pool",
  r_hp: "Starting HP",
  r_hp_unit: "HP",
  r_items: "Available items",
  p_slot: (n) => `Slot ${n}`,
  p_add_human: "+ Human",
  p_add_bot: "+ Bot AI",
  p_ready: "Ready",
  p_waiting: "Waiting",
  p_ready_btn: "✓ Ready",
  p_cancel_btn: "Cancel",
  p_bot_name: "Bot AI",
  p_username_placeholder: "Your name",
  p_diff_easy: "Easy",
  p_diff_medium: "Medium",
  p_diff_hard: "Hard",
  t_stage: "Stage",
  t_health: "Health",
  t_gold: "Gold",
  t_interest: "Interest",
  t_streak_win: "Win",
  t_streak_loss: "Loss",
  t_board: "Board",
  t_level: "Level",
  t_max: "MAX",
  t_buy_xp: "Buy XP",
  t_pve: "Battle Wild",
  t_carousel: "Carousel",
  t_pvp: "Start Combat",
};

export function useT(): Dict {
  const lang = useAppStore((s) => s.settings.language);
  return lang === "en" ? EN : FR;
}
