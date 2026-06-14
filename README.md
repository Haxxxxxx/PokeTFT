# 🔴 PokéTFT

A **Teamfight Tactics** auto-battler built with **Pokémon** lore. Evolutions are star-ups,
Pokémon types are trait synergies, and the type-effectiveness chart is a unique combat layer.

> ⚠️ Fan project. Pokémon IP belongs to Nintendo/Game Freak/The Pokémon Company.
> Personal / portfolio / non-commercial use only — do **not** monetize.

## Run it

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Stack
- **Next.js 16** (App Router) + React + TypeScript + Tailwind v4
- **Zustand** game state · **@dnd-kit** drag-drop · **PixiJS** (Phase 2 combat render)
- **PokéAPI** sprites (fetched by national dex id at runtime)

## How TFT maps to Pokémon
| TFT | Pokémon |
|---|---|
| Star-up (3→⭐⭐, 9→⭐⭐⭐) | Evolution (Charmander→Charmeleon→Charizard) |
| Origin/Class traits | Types + roles (Starter, Legendary, Eeveelution…) |
| Cost tiers 1–5 | Rarity (route mons → Legendaries) |
| Abilities | Signature moves |
| Type-effectiveness | **Combat multiplier layered on armor/MR (our signature mechanic)** |

## Project structure
```
src/
  game/
    config.ts            # all TFT constants (shop odds, XP, economy, pools, rounds)
    types.ts             # domain types
    ui.ts                # cost/type colors
    data/
      mons.ts            # Gen 1 roster (evolution families = star tiers)
      traits.ts          # trait synergy definitions + breakpoints
      typeChart.ts       # 18x18 Pokémon type-effectiveness chart
    engine/              # PURE TS — no React, unit-testable
      rng.ts             # seedable deterministic PRNG
      shop.ts            # shared-pool shop rolls + odds
      economy.ts         # interest, streak, sell value
      combine.ts         # 3-into-evolution merge logic
      synergies.ts       # active-trait computation
    store/
      gameStore.ts       # Zustand: buy/sell/roll/level/move/endRound
  components/game/        # Board, Bench, ShopBar, TopBar, TraitPanel, UnitChip, GameClient
  app/page.tsx            # game screen
```

## Roadmap
- [x] **Phase 0** — scaffold, config, types, Gen 1 roster
- [x] **Phase 1** — board + shop + economy + auto-evolution + traits
- [x] **Phase 2** — deterministic auto-combat engine (hex pathing, moves, type-effectiveness) + replay
- [x] **Phase 3** — 8-trainer lobby, AI-vs-AI off-screen rounds, HP ladder, spectate any board, round timer, polished combat visuals (current)
- [ ] **Phase 3b** — lobby code + responsive phone team-view companion
- [ ] **Phase 4** — items/held-items, augments, evolution animations, more mons
- [ ] **Phase 5** — online multiplayer (server-authoritative)

## Phase 1 controls
- **Click a shop slot** to buy · **Reroll (2🪙)** · **Freeze** the shop
- **Buy XP (4🪙)** to level up → bigger board
- **Drag** mons between bench ↔ board hexes (drag onto an occupied hex to swap)
- **Drag to the SELL zone** to refund
- Buy 3 of the same mon → it **auto-evolves** to the next evolution (9 → final stage)
- **Click a mon** (or the info icon on a shop card) → docked detail panel on the right
- **Start Combat** → a deterministic auto-battle plays out vs a stage-scaled AI board, with type-effectiveness damage; result applies streak + HP loss
