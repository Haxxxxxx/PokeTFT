# PokéTFT — Architecture & Arborescence

> Référence technique du projet. Mise à jour : 2026-06-14.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16.2.9 (App Router, Turbopack) |
| UI | React 19, TypeScript 5, Tailwind v4 |
| State | Zustand v5 (pas de `persist` actuellement) |
| Drag & drop | dnd-kit |
| Backend temps réel | Firebase Realtime Database (`poketft-arena`) |
| Déploiement | — (pas de CI/CD configuré) |

---

## Arborescence complète

```
PokéTFT/
├── Project Management/
│   ├── IMPLEMENTED.md          ← fonctionnalités implémentées
│   ├── ROADMAP.md              ← features à implémenter
│   ├── ARCHITECTURE.md         ← ce fichier
│   └── FEATURE.md              ← document combiné (legacy)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx          ← root layout Next.js (fonts, globals.css)
│   │   ├── page.tsx            ← unique page → monte <AppRoot />
│   │   └── globals.css         ← Tailwind v4 + animations custom
│   │
│   ├── components/
│   │   ├── AppRoot.tsx         ← ROUTEUR PRINCIPAL (welcome / lobby / jeu)
│   │   │
│   │   ├── welcome/
│   │   │   ├── WelcomeScreen.tsx   ← saisie pseudo + host/join via Firebase
│   │   │   └── AppSettingsPanel.tsx ← langue, son, animations
│   │   │
│   │   ├── lobby/
│   │   │   ├── LobbyScreen.tsx     ← lobby networké (useRoom)
│   │   │   ├── GameRulesPanel.tsx  ← générations, draft, HP, objets
│   │   │   ├── PlayerSlot.tsx      ← (legacy — non utilisé en mode net)
│   │   │   └── LobbyCodeBadge.tsx  ← affichage + copie du code
│   │   │
│   │   └── game/
│   │       ├── NetGameClient.tsx   ← CLIENT RÉSEAU PRINCIPAL (planning + combat)
│   │       ├── GameClient.tsx      ← client solo/offline (non utilisé par AppRoot)
│   │       ├── Board.tsx           ← grille hexagonale 7×4, drag targets
│   │       ├── Bench.tsx           ← bench 9 slots, drag targets
│   │       ├── ShopBar.tsx         ← shop 5 slots, reroll, freeze
│   │       ├── TopBar.tsx          ← barre HUD (HP, or, XP, timer)
│   │       ├── TraitPanel.tsx      ← synergies actives/inactives
│   │       ├── UnitDetail.tsx      ← fiche stats + ability au clic
│   │       ├── UnitChip.tsx        ← token d'unité (sprite + barres)
│   │       ├── CombatStage.tsx     ← replay du combat frame-by-frame
│   │       ├── Scoreboard.tsx      ← classement live des joueurs
│   │       ├── Timeline.tsx        ← historique + prochains rounds
│   │       ├── Carousel.tsx        ← écran de carousel (pick gratuit)
│   │       ├── ItemTray.tsx        ← inventaire d'objets + équipement
│   │       └── icons.tsx           ← icônes SVG inline
│   │
│   ├── game/
│   │   ├── types.ts            ← types centraux (PokeType, UnitDef, UnitInstance…)
│   │   ├── config.ts           ← constantes économie, shop odds, XP, stages
│   │   ├── ui.ts               ← couleurs par type et par coût
│   │   │
│   │   ├── data/
│   │   │   ├── mons.ts         ← 140 UnitDef (Gen I–IX) + unitsForGenerations()
│   │   │   ├── traits.ts       ← 25 TraitDef (18 types + 7 rôles) + activeTier()
│   │   │   ├── typeChart.ts    ← matrice 18×18 type-efficacité
│   │   │   ├── generations.ts  ← plages Pokédex Gen I–IX + totalPokemonCount()
│   │   │   ├── itemPool.ts     ← 8 ItemDef (nameFr, name, effect, icon)
│   │   │   └── mega.ts         ← 9 formes Mega + conditions d'activation
│   │   │
│   │   ├── engine/
│   │   │   ├── combat.ts       ← simulation tick-by-tick, IA, type-efficacité
│   │   │   ├── combine.ts      ← star-up automatique (3×★ → ★★, 3×★★ → ★★★)
│   │   │   ├── economy.ts      ← intérêts, streak gold, revenus de round
│   │   │   ├── enemy.ts        ← génération de boards IA (generateBoard)
│   │   │   ├── hex.ts          ← distance cube, voisins, pathfinding hexagonal
│   │   │   ├── rng.ts          ← PRNG Mulberry32 + weightedPick
│   │   │   ├── shop.ts         ← makePool, makeUnitsByCost, rollShop
│   │   │   └── synergies.ts    ← computeTraits (comptage traits du board)
│   │   │
│   │   ├── net/
│   │   │   ├── firebase.ts     ← init Firebase + ensureAuth (session UID)
│   │   │   ├── roomStore.ts    ← Zustand store networké (host/join/leave/addBot…)
│   │   │   ├── match.ts        ← beginMatch, startCombat, endCombat, heartbeat…
│   │   │   └── serverTime.ts   ← sync ServerTime Firebase (offset local↔serveur)
│   │   │
│   │   └── store/
│   │       ├── gameStore.ts    ← économie locale, pool, shop, board, bench
│   │       ├── combatStore.ts  ← résultat du dernier combat (pour CombatStage)
│   │       ├── lobbyStore.ts   ← état IA adversaires solo (offline uniquement)
│   │       ├── carouselStore.ts ← options du carousel actif
│   │       ├── uiStore.ts      ← inspect d'unité, vue spectateur
│   │       ├── preLobbyStore.ts ← règles locales (générations, HP, objets…)
│   │       ├── appStore.ts     ← settings globaux (langue, son, anim)
│   │       └── flow.ts         ← advanceFlow (transitions planning→combat→planning)
│   │
│   └── lib/
│       └── i18n.ts             ← dictionnaires FR/EN + hook useT()
│
├── FEATURE.md                  ← audit legacy (remplacé par Project Management/)
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts (implicite via CSS)
```

---

## Flux de navigation (AppRoot)

```
                    ┌─────────────────────────────────────────┐
                    │              AppRoot.tsx                 │
                    │                                          │
  useRoom.code == null ──► WelcomeScreen                      │
  useRoom.code != null                                         │
    room.meta.phase == "lobby" ──► LobbyScreen                │
    room.meta.phase == "planning"|"combat"|"over" ──► NetGameClient
                    └─────────────────────────────────────────┘
```

---

## Flux multijoueur (Firebase)

```
Hôte                          Firebase RTDB               Invité
────                          ─────────────               ──────
host(name, rules)
  └─► set /games/{code}  ──────────────────────────────► onValue
                                                            └─► room state

addBot / setReady              /games/{code}/players/*     setReady

beginMatch()
  └─► update meta.phase="planning"
      meta.deadline=now+30s ───────────────────────────► onValue
                                                           └─► netRound()
                                                               shop roll
                                                               push board

[deadline atteinte] (host loop 700ms)
startCombat()
  └─► bot boards générés par hôte
      shuffle + appariement
      simulate() × N paires
  └─► update meta.phase="combat"
      update /combat/{uid} ─────────────────────────────► onValue
                                                           └─► replay local

[deadline combat]
endCombat()
  └─► apply dmg, éliminations
  └─► update meta.phase="planning"|"over" ──────────────► onValue
```

---

## Flux de combat (engine)

```
simulate(allyUnits, enemyUnits)
  │
  ├─ init: stats + Mega Evolution si Mega Stone
  │
  └─ tick loop (TICK_MS = 100ms simulé) :
      ├─ pour chaque unité vivante :
      │   ├─ acquiert une cible (plus proche allié de l'ennemi)
      │   ├─ se déplace d'1 hex vers la cible si hors portée
      │   └─ si en portée :
      │       ├─ attaque auto → dégâts physiques (ATK × Armor reduction)
      │       ├─ génère mana (+10 attaquant, +3 défenseur)
      │       └─ si mana plein → cast ability → dégâts magiques (type chart × MgRes)
      │
      ├─ overtime après 900 ticks (15 s) : +2% HP/tick pour tous
      │
      └─ fin si 1 équipe éliminée → retourne {winner, survivors, frames}
```

---

## Pool de génération (shop filtering)

```
Lobby:  rules.generations = [1, 3]

AppRoot → GameClient/NetGameClient
  └─► unitsForGenerations([1, 3])
        filtre UNITS où dex[0] ∈ Gen1[1-151] ∪ Gen3[252-386]
        retourne allowedIds[]

newGame(startingHp, allowedIds)
  ├─► makePool(allowedIds)       → {pikachu: 30, treecko: 30, …}
  ├─► makeUnitsByCost(allowedIds) → {1:[…], 2:[…], 3:[…], 4:[…], 5:[…]}
  └─► rollShop(1, pool, rng, unitsByCost) → 5 slots

reroll / advancePartial → rollShop(..., state.unitsByCost)  // même filtre
```

---

## Stores Zustand — responsabilités

| Store | Responsabilité |
|---|---|
| `useRoom` | State Firebase (room, phase, joueurs, règles) — source de vérité réseau |
| `useGame` | Économie locale (gold, XP, pool, shop, units, board) |
| `useCombat` | Résultat du dernier combat pour affichage |
| `useLobby` | Adversaires IA solo (offline `GameClient`) |
| `useCarousel` | Options du carousel en cours |
| `useUi` | Unité inspectée, joueur spectateur |
| `usePreLobby` | Règles locales en cours d'édition (hôte → poussées en Firebase) |
| `useAppStore` | Settings globaux (langue, son, vitesse animations) |

---

## PRNG et déterminisme

- `makeRng(seed)` retourne un Mulberry32 → `() => number` dans [0,1)
- Le seed initial est `INITIAL_SEED = 1337` (reseedé à chaque `newGame`)
- `rollShop` utilise le RNG module-level pour garantir la même séquence entre rerolls
- `simulate()` accepte un seed optionnel pour le mode replay déterministe
- Les appariements de combat (`shuffled()`) utilisent `stage × 131 + round` comme seed
