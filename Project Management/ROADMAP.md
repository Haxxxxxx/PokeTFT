# PokéTFT — Roadmap (features à implémenter)

> Priorisé par impact sur l'expérience de jeu. Mise à jour : 2026-06-14.

---

## Priorité 1 — Bloque l'équilibre du jeu

### Effets mécaniques des synergies
**Statut** : affichage seul — aucun effet en combat  
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

### Effets mécaniques des objets
**Statut** : équipables mais aucun effet en combat  
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

### Persistance des paramètres
**Statut** : langue/son/animations réinitialisés au rechargement  
**Solution** : ajouter middleware `persist` (localStorage) dans `src/game/store/appStore.ts`

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

### Tests automatisés
- Aucun test unitaire (moteur combat, économie, combinaisons) ni test e2e (Playwright)
- Suggestion : Jest pour les engines purs + Playwright pour les flux critiques (lobby → game → combat)

---

## Priorité 4 — Infrastructure & DevEx

### Sécurité Firebase
- Les règles RTDB sont actuellement ouvertes (`"read": true, "write": true`)
- À sécuriser avec auth anonyme Firebase + règles par room code
- Activer `signInAnonymously()` dans la console Firebase

### Variables d'environnement
- La config Firebase est hardcodée dans `firebase.ts` (clés publiques, pas de secrets)
- À migrer dans `.env.local` + vérifier `.gitignore`

### Rate-limiting et anti-cheat
- Pas de validation serveur : un client peut écrire n'importe quelle valeur dans sa save
- Solution long terme : Cloud Functions pour valider l'économie côté serveur

### CI/CD
- Pas de pipeline automatique ; les PR sont mergées manuellement
- Suggestion : GitHub Actions pour `tsc --noEmit` + lint sur chaque PR

### Nettoyage des rooms Firebase
- Les rooms ne sont jamais supprimées après la partie
- Suggestion : Cloud Function `onUpdate` qui supprime les rooms `over` après 1 h
