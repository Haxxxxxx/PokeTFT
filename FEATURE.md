# PokéTFT — Feature Tracker

## ✅ Fonctionnalités implémentées et fonctionnelles

### Écran d'accueil
- Saisie de pseudo (1–24 caractères, validation)
- Création de partie (mode hôte)
- Rejoindre une partie via code lobby (validation 6 caractères)
- Navigation clavier (Enter pour valider)
- Paramètres généraux : langue FR/EN, son on/off, vitesse d'animation

### Localisation FR / EN
- Dictionnaire complet FR/EN (`src/lib/i18n.ts`) + hook `useT()`
- Appliqué sur : WelcomeScreen, AppSettingsPanel, LobbyScreen, GameRulesPanel, PlayerSlot, TopBar
- Switch langue en temps réel sans rechargement

### Lobby
- Grille de slots 2–8 joueurs configurable par l'hôte
- Ajout de joueur humain ou bot IA (difficulté Facile / Moyen / Difficile)
- Suppression de joueurs invités (humains ou bots) par l'hôte
- Bot ajouté en difficulté Moyen par défaut
- Toggle Prêt / En attente par joueur
- Code lobby affiché, copiable, régénérable
- Règles de partie :
  - Sélection des générations (Gen I–IX)
  - Taille du draft (60 / 90 / 120 Pokémon)
  - PV de départ (50 / 75 / 100 / 125 / 150 / 200)
  - Objets activables/désactivables individuellement
- Lancement de partie conditionné à ≥ 2 joueurs tous prêts

### Filtrage du roster par génération
- Le pool de la partie (shop + pool partagé) est filtré selon les générations sélectionnées en lobby
- Fonction `unitsForGenerations(gens)` filtre par numéro Pokédex de la forme de base
- `makePool()` et `rollShop()` paramétrés pour accepter une liste d'IDs autorisés
- `GameClient` reçoit les `generations` de l'`AppRoot` et les passe à `newGame()`
- Comportement : sélectionner plusieurs gens = pool fusionné, mons des gens actives apparaissent en shop

### Roster — 140 unités Gen I–IX
- **Gen I (42)** : Starters Kanto, Caterpie, Weedle, Pidgey, Poliwag, Rattata, Jigglypuff, Zubat, Geodude, Machop, Abra, Oddish, Gastly, Growlithe, Ponyta, Magnemite, Psyduck, Koffing, Paras, Drowzee, Magikarp, Eevee, Scyther, Cubone, Onix, Electabuzz, Jynx, Rhyhorn, Hitmonlee, Dratini, Lapras, Snorlax, Aerodactyl, Omanyte, Porygon, Articuno, Zapdos, Moltres, Mewtwo, Mew
- **Gen II (13)** : Chikorita/Cyndaquil/Totodile, Mareep, Snubbull, Murkrow, Heracross, Houndour, Misdreavus, Tyranitar, Steelix, Lugia, Ho-Oh, Celebi
- **Gen III (14)** : Treecko/Torchic/Mudkip, Ralts, Electrike, Aron, Flygon, Absol, Mawile, Metagross, Salamence, Kyogre, Groudon, Rayquaza
- **Gen IV (15)** : Turtwig/Chimchar/Piplup, Shinx, Riolu, Buizel, Garchomp, Electivire, Togekiss, Weavile, Roserade, Dialga, Palkia, Giratina, Arceus
- **Gen V (13)** : Snivy/Tepig/Oshawott, Sandile, Joltik, Chandelure, Haxorus, Excadrill, Hydreigon, Reshiram, Zekrom, Kyurem, Victini
- **Gen VI (10)** : Chespin/Fennekin/Froakie, Fletchling, Litleo, Goomy, Pancham, Aegislash, Xerneas, Yveltal, Zygarde
- **Gen VII (11)** : Rowlet/Litten/Popplio, Rockruff, Wishiwashi, Jangmo-o, Mimikyu, Silvally, Solgaleo, Lunala, Necrozma
- **Gen VIII (10)** : Grookey/Scorbunny/Sobble, Yamper, Snom, Rookidee, Dreepy, Zacian, Zamazenta, Eternatus
- **Gen IX (10)** : Sprigatito/Fuecoco/Quaxly, Pawmi, Nacli, Frigibax, Palafin, Koraidon, Miraidon, Terapagos
- Traits type : tous les 18 couverts (Fighting, Dark, Steel ajoutés)
- Rôles : Starter, Evolver, Swarm, Eeveelution, Fossil, Pseudo-Legend, Legendary, Mythic

### Jeu — Économie & Progression
- Revenus de base : 5 gold/round + intérêts (1 par tranche de 10 gold, cap 5)
- Gold de streak (victoires ou défaites consécutives : +1 / +2 / +3)
- XP passif par round + achat d'XP (4 XP pour 4 gold)
- Niveaux 1–10 avec seuils XP cumulatifs
- Capacité de board = niveau joueur
- Vente d'unités avec remboursement (valeur réduite pour unités stellées)

### Jeu — Shop & Unités
- Shop 5 slots, probabilités par niveau (SHOP_ODDS)
- Reroll (2 gold), freeze du shop pour le prochain round
- Achat d'unités depuis le pool global partagé (30/25/18/10/9 copies par tier)
- Combinaison automatique 3→⭐⭐ et 3⭐⭐→⭐⭐⭐
- Affichage "combien de copies manquent" pour l'étoile suivante
- Surbrillance "1 copie manquante" dans le shop

### Jeu — Board & Bench
- Grille hexagonale 7×4 par joueur
- Bench 9 emplacements
- Drag & drop (dnd-kit) : board↔bench, board↔board, bench↔bench
- Swap automatique si la destination est occupée

### Jeu — Combat
- Simulation déterministe tick-by-tick (seed PRNG Mulberry32)
- IA de combat : acquisition de cible (plus proche, équilibrage de charge), déplacement, attaque auto
- Génération de mana sur attaque (+10 lanceur, +3 cible) et cast d'ability au mana plein
- Multiplicateurs type-efficacité (matrice 18×18 complète)
- Réduction dégâts via Armor (dégâts physiques) et Magic Resist (dégâts magiques)
- Shapes d'ability : single / splash (cible + voisins) / line
- Mécanique overtime : après 15 s de combat, dégâts % croissants
- Mega Evolution : stat boost + changement de type si l'unité porte une Mega Stone compatible
- 9 Mega formes (Charizard X, Venusaur, Blastoise, Beedrill, Alakazam, Gengar, Gyarados, Aéroctali, Mewtwo)
- Enregistrement frame-by-frame pour replay

### Jeu — Visualisation du combat
- Rendu hexagonal 7×8 avec animation des unités
- Barres HP et Mana par unité
- Projectiles pour unités à distance
- Nombres de dégâts flottants (crit mis en évidence)
- Anneaux de cast (indicateurs d'efficacité de type)
- Animation de mort (niveaux de gris)
- Contrôles de vitesse de lecture : 1×, 1.5×, 2×, 4×
- Bouton "Passer à la fin"
- Écran de résultat (Victoire / Défaite / Égalité) + compteur de survivants

### Jeu — Adversaires IA
- 7 dresseurs IA nommés (Brock, Misty, Surge, Érika, Koga, Sabrina, Blaine)
- Scaling IA par round cumulatif (niveau + count de board)
- Sélection round-robin des adversaires
- Combat IA-vs-IA hors-écran pour les matchs non joués
- Dégâts sur défaite : base par stage + unités survivantes adverses
- Élimination et suivi du classement (1er–8ème)

### Jeu — Carousel
- 5 choix (4 unités + 1 Mega Stone)
- Cartes avec sprite, coût et types
- Déterministe par stage + seed

### Jeu — Synergies (affichage)
- Comptage de traits par unité distincte sur le board
- Seuils d'activation (ex. Fire 2/4/6)
- Panel synergies avec tiers actifs, compteurs, tooltips avec effets
- Colorisation par type

### Jeu — Objets (inventaire)
- 8 objets disponibles : Restes, Choix Ruban, Choix Lunettes, Orbe Vie, Ceinture Concentration, Éviolite, Veste Assaut, Casque Rocher
- Système d'armement (clic pour équiper un objet sélectionné sur une unité)
- Max 3 objets par unité
- Compteur Mega Stones dans le plateau d'objets

### Jeu — Interface générale
- Barre du haut : stage/round, PV, gold, intérêts, streak, capacité de board, XP
- Timeline des rounds (historique victoires/défaites, prochains rounds)
- Scoreboard : classement, barres PV, niveau, avatar (Pokémon le plus cher/étoilé), spectating
- Détail d'unité : stats complètes (HP, ATK, DPS, AtkSpd, Armor, MgRes, Range, Mana, Tier), types, rôles, ability
- Écran de game over / victoire
- Animation "Top 4 atteint"
- Mode spectateur (voir le board d'un autre dresseur)

### Données de jeu
- 42 unités Gen I définies avec stats, moves et dex IDs complets
- Matrice de type-efficacité 18×18 complète
- 23 traits (16 types + 7 rôles) avec descriptions et seuils
- Générations I–IX avec plages de Pokédex
- Config économie/shop/board centralisée dans `config.ts`

---

## ❌ Fonctionnalités manquantes (jeu non entièrement fonctionnel)

### Priorité haute — bloque l'équilibre du jeu

- **Effets mécaniques des synergies** — les traits sont affichés mais n'ont aucun effet en combat
  - Exemples : Fire → brûlure sur ability, Water → régénération mana, Psychic → bouclier, Starter → bonus stats, Swarm → % dégâts supplémentaires selon count
  - Fichier cible : `src/game/engine/combat.ts` + `src/game/engine/synergies.ts`

- **Effets mécaniques des objets** — les objets sont équipables mais n'appliquent aucun stat ou effet
  - Exemples : Restes → régénération HP/round, Orbe Vie → +30% dégâts −10% HP/attaque, Veste Assaut → +MR +immunité aux dégâts magiques, Casque Rocher → riposte aux attaquants
  - Fichier cible : `src/game/engine/combat.ts` (initialisation des unités + résolution des attaques)

- **Roster Gen II–IX partiel** — ~12–15 unités par génération définies, couverture des 5 tiers de coût
  - Toutes les générations sont jouables ; mons des gens sélectionnées apparaissent en shop
  - Manque : la majorité du roster officiel (seuls les représentants clés sont définis)

### Priorité moyenne — expérience incomplète

- **Persistance des paramètres** — les settings (langue, son, animations) se réinitialisent au rechargement
  - Solution : `zustand/middleware` `persist` avec `localStorage` dans `appStore.ts`

- **Localisation partielle** — GameClient, CombatStage, Scoreboard, Timeline encore en anglais dur
  - Étendre `i18n.ts` et câbler `useT()` dans les composants restants

- **Système audio** — toggle son présent, aucun fichier audio ni lecture
  - Besoin : effets sonores (attaque, achat, combinaison, victoire/défaite)

- **Vitesse d'animation** — le réglage "Rapide" n'affecte que la lecture du combat, pas les animations de board/bench/drag

- **Draft Pokémon** (si mode draft activé) — le paramètre `draftPoolSize` (60/90/120) est configuré en lobby mais aucun écran de draft n'existe
  - Le jeu démarre directement en shop sans phase de sélection initiale

- **Code de lobby "Rejoindre"** — l'UI accepte le code mais il n'y a aucun backend/réseau ; les deux joueurs ne partagent pas d'état
  - Solution court-terme : désactiver ou indiquer clairement "multijoueur non disponible"

### Priorité basse — polish

- **Animations board** — pas d'animation sur le placement/déplacement d'unités hors combat

- **Indicateur de round PvE / Carousel** — la timeline affiche les icônes mais pas de preview des ennemis PvE ni des unités carousel à venir

- **Historique de partie** — aucun récap post-game (quels traits actifs, unités posées, gold dépensé)

- **Tutoriel / onboarding** — aucune aide en jeu (premier lancement, explication du shop/board/synergies)

- **Responsive / mobile** — UI conçue pour desktop large uniquement

- **Tests** — aucun test unitaire ni test e2e
