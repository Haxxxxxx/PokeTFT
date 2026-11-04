# PokéTFT — Roadmap (features à implémenter)

> Priorisé par impact sur l'expérience de jeu. Rédigé le 2026-06-14.
>
> ⚠️ **Ce document a pris du retard sur le code.** Audit du 2026-11-03 : toute la
> « Priorité 1 » ci-dessous est **livrée**. Vérifié dans le code, pas dans les notes :
> les buffs de synergies sont appliqués au combat (`engine/combat.ts:325-336`, via
> `computeTraits` + `TRAITS_BY_KEY[].tiers[].buff`) et les objets le sont aussi
> (`ITEM_EFFECT`, `engine/combat.ts:210-242`). Idem pour la persistance des
> paramètres (`store/appStore.ts` utilise le middleware `persist`), le roster
> complet (1025 entrées) et les tests automatisés (`npm test` — déterminisme du
> combat, simulation 24 joueurs, flux Double Up).
>
> Les sections conservées ci-dessous servent d'historique. Avant de reprendre un
> point, **vérifier dans le code** — ne pas se fier à son statut écrit ici.

---

## Priorité 1 — ~~Bloque l'équilibre du jeu~~ ✅ LIVRÉ (vérifié 2026-11-03)

### ~~Effets mécaniques des synergies~~ ✅ IMPLÉMENTÉ
**Statut au 2026-06-14** : affichage seul — aucun effet en combat  
**Statut réel** : chaque palier de trait porte un `TraitBuff` concret, appliqué à
l'initialisation du combat (scope `self` ou `team`).  
**Fichiers cibles** : `src/game/engine/combat.ts`, `src/game/engine/synergies.ts`  
**À implémenter** :
- Fire 2/4/6 : brûlure sur ability (dégâts/sec sur la cible)
- Water 2/4/6 : régénération mana passif (+3/+6/+10/sec)
- Electric 2/4 : chain lightning (dégâts arcing vers 1/3 cible supplémentaire)
- Grass 3/6 : régénération HP passif (2%/5% max HP/sec)
- Psychic 2/4/6 : bouclier au début du combat (15%/30%/50% HP max)
- Poison 3/5 : cibles empoisonnées prennent +12%/+20% dégâts
- Rock 2/4 : +20/+45 Armor & MgRes
- Flying 3/6 : 15%/30% esquive des attaques auto
- Dragon 2 : +40% ATK et AP
- Ghost 2 : inciblable les 3 premières secondes
- Ground 2 : +200 HP max
- Bug 3 : mort → swarmling à 40% des stats
- Normal 2/4 : +1/+3 gold fin de round
- Ice 2 : 25% chance de freeze (1,5 s) sur ability
- Fairy 2 : −25% dégâts de l'ennemi le plus coûteux
- Fighting 2/4 : ignore 20%/40% d'Armor
- Dark 2/4 : +20% dégâts sur cible la moins pv ; execute < 15% HP
- Steel 2/4 : +30/+60 Armor & MgRes
- Starter 3 : +8 ATK et +60 HP par round (stack)
- Evolver 4/6 : +10%/+25% stats au star-up
- Swarm 2/4 : +10%/+18% AtkSpd par allié Swarm
- Eeveelution 1 : Eevee copie le trait le plus fort du board
- Fossil 2 : revie une fois à 33% HP
- Pseudo-Legend 2 : +30% ATK, AP et HP
- Legendary 2/3 : +15%/+30% dégâts élémentaires
- Mythic 1 : +20% tous les stats, ignore immunités de type

### ~~Effets mécaniques des objets~~ ✅ IMPLÉMENTÉ
**Statut au 2026-06-14** : équipables mais aucun effet en combat  
**Statut réel** : effets pilotés par la donnée (`ITEM_EFFECT`), appliqués à la
construction du combattant, avec plafonnement des multiplicateurs cumulés.  
**Fichier cible** : `src/game/engine/combat.ts` (init + résolution des attaques)  
**À implémenter** :
- Restes : +5% HP max par round
- Choix Ruban : +50% ATK, verrouille sur 1 move
- Choix Lunettes : +50% dégâts ability, verrouille sur 1 move
- Orbe Vie : +30% dégâts, −10% HP par attaque
- Ceinture Concentration : survive à 1 PV si HP plein au coup fatal
- Évolite : +50% Armor & MgRes si non-évolution finale
- Veste Assaut : +50% MgRes, interdit les abilities de statut
- Casque Rocher : 16% HP de l'attaquant perdu sur contact physique

---

## Priorité 2 — Expérience incomplète

### Écran de draft
**Statut** : `draftPoolSize` (60/90/120) configuré en lobby — aucun écran de draft  
**Description** : avant le premier round, afficher N Pokémon tirés aléatoirement du pool de la génération sélectionnée. Chaque joueur choisit 1 pick en serpentine ou simultané.  
**Fichiers à créer** : `src/components/game/DraftScreen.tsx`, `src/game/store/draftStore.ts`

### ~~Persistance des paramètres~~ ✅ IMPLÉMENTÉ
**Statut au 2026-06-14** : langue/son/animations réinitialisés au rechargement  
**Statut réel** : `src/game/store/appStore.ts` utilise `persist` + `createJSONStorage(localStorage)`.

### ~~Localisation partielle~~ ✅ IMPLÉMENTÉ
~FR/EN câblé sur welcome/lobby/topbar uniquement~  
**Réalisé** : i18n étendu à ~115 clés, câblé dans LobbyScreen, NetGameClient, ShopBar, CombatStage, UnitDetail. Toute l'UI principale bascule en FR/EN en temps réel.

### ~~Système audio~~ ✅ IMPLÉMENTÉ
~Toggle son présent, aucun fichier audio~  
**Réalisé** (`src/lib/audio.ts`) :
- Cris Pokémon via PokeAPI CDN (`/cries/pokemon/latest/{id}.ogg`)
- Sons UI Web Audio (oscillateurs) : buy, reroll, combine ★, freeze, victory, defeat
- Cliquable sur le nom de l'ability dans UnitDetail

### Roster Gen II–IX partiellement complet
**Statut** : 206 unités (18–23/gen), toutes générations jouables avec couverture des 5 tiers de coût  
**Manquant** : ~800 Pokémon pour atteindre le roster officiel complet (> 1000 entrées)  
**Fichier cible** : `src/game/data/mons.ts` (ajouter par priorité gameplay — types/rôles sous-représentés)

---

## Priorité 3 — Qualité & polish

### Animations board
- Pas d'animation sur le dépôt/déplacement d'unités hors combat
- Suggestion : transition CSS `translate` sur les UnitChips lors des drags

### Historique de partie
- Aucun récap post-game (traits actifs, unités posées, gold dépensé, matchups)

### Scoreboard enrichi
- Afficher le board complet d'un autre joueur (mode spectateur en mode réseau)

### Responsive / mobile
- UI conçue pour desktop large ; pas d'adaptation tactile

### ~~Tests automatisés~~ ✅ PARTIELLEMENT IMPLÉMENTÉ
**Statut réel** : suite headless `npm test` (tsx, sans framework) — déterminisme du
combat, simulation 24 joueurs, flux Double Up + transferts co-op. Exécutée sur chaque
PR depuis `.github/workflows/ci.yml`.
**Reste à faire** : tests e2e (Playwright) sur le flux lobby → game → combat.

---

## Priorité 4 — Infrastructure & DevEx

### ~~Sécurité Firebase~~ ✅ IMPLÉMENTÉ
**Statut au 2026-06-14** : règles RTDB ouvertes (`"read": true, "write": true`)  
**Statut réel** : `database.rules.json` (183 lignes) — tout est derrière `auth != null`,
avec validation de forme et de bornes par champ, champs réservés à l'hôte, et écritures
scopées par `$uid`. Durci sur plusieurs passes d'audit (PR #86 → #89).

### ~~Variables d'environnement~~ ✅ IMPLÉMENTÉ
**Statut réel** : `firebase.ts` lit `NEXT_PUBLIC_FIREBASE_*` avec les valeurs du projet
canonique en repli (identifiants publics, pas des secrets). `.env.example` fourni,
`.env.local` ignoré par git.

### Rate-limiting et anti-cheat
- Pas de validation serveur : un client peut écrire n'importe quelle valeur dans sa save
- Solution long terme : Cloud Functions pour valider l'économie côté serveur

### ~~CI/CD~~ ✅ IMPLÉMENTÉ
**Statut réel** : `.github/workflows/ci.yml` — lint, `tsc --noEmit`, `npm test` et
build de production sur chaque push `main` et chaque PR.

### Nettoyage des rooms Firebase
- Les rooms ne sont jamais supprimées après la partie
- Suggestion : Cloud Function `onUpdate` qui supprime les rooms `over` après 1 h
