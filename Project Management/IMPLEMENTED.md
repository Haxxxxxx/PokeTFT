# PokéTFT — Fonctionnalités implémentées

> Audit complet au 2026-06-14. Branche de référence : `main` (commit `d0e273a`).

---

## Réseau & Multijoueur (Firebase Realtime DB)

- **Authentification anonyme** par ID de session (tab-scoped `sessionStorage`) — pas de compte requis
- **Création de lobby** : l'hôte génère un code à 6 caractères et écrit la room dans Firebase
- **Rejoindre par code** : validation (room existante, pas pleine, phase lobby), ajout au nœud Firebase
- **Reconnexion automatique** : si le code est en `sessionStorage`, le client se ré-attache à la room au rechargement
- **Présence live** : `onDisconnect` Firebase marque le joueur `connected: false` en cas de perte réseau
- **Bots IA dans le lobby** : l'hôte ajoute des bots (easy/medium/hard) via l'UI ; boards générés côté hôte chaque round
- **Suppression de joueur** : l'hôte peut retirer un bot ou un joueur du lobby
- **Synchronisation des règles** : l'hôte édite les règles (HP, générations, objets) → poussées en Firebase → tous les clients voient les mêmes règles (read-only pour non-hôtes)
- **Bascule hôte** : si le heartbeat de l'hôte est périmé (> 3,5 s), le client au plus petit UID revendique le rôle via une transaction atomique Firebase
- **Loop hôte-autoritatif** :
  - Phase `planning` (30 s) : chaque client pousse son board + snapshot économie
  - Phase `combat` (16 s) : l'hôte apparie les joueurs, simule les combats, écrit les résultats
  - Transition automatique par deadline partagée (serverTime Firebase)
- **Replay déterministe** : le client rejoue son combat depuis les boards congelés par l'hôte (même résultat garanti)
- **Fin de partie** : éliminations, classement 1–8, phase `over` diffusée à tous

---

## Écran d'accueil

- Saisie de pseudo (1–24 caractères, validation)
- Bouton « Créer une partie » → `useRoom.host()` → Firebase
- Bouton « Rejoindre » + champ code 6 caractères → `useRoom.join()`
- Affichage d'erreur réseau (lobby introuvable, plein, déjà démarré)
- État `busy` pendant la connexion (boutons désactivés)

---

## Lobby (networké)

- Grille live des joueurs connectés (mis à jour en temps réel via `onValue`)
- Badges : Host, You, Bot, état Prêt/En attente
- Hôte : ajout de bots (easy/medium/hard), suppression de joueur/bot
- Non-hôte : bouton Ready/Not ready
- Panel de règles de partie (voir section ci-dessous)
- Bouton « Start game » (hôte, tous prêts) → `beginMatch()` → phase `planning`
- Bouton Leave → nettoyage Firebase + retour Welcome

---

## Règles de partie (lobby)

- **Générations** (Gen I–IX) — sélection multiple, pool Pokémon filtré dynamiquement
- **PV de départ** : 50 / 75 / 100 / 125 / 150 / 200
- **Taille du draft** : 60 / 90 / 120 (UI uniquement — écran de draft non implémenté)
- **Objets** : 8 objets activables/désactivables individuellement

---

## Localisation FR / EN

- Dictionnaire complet `src/lib/i18n.ts` (2 langues × ~50 clés)
- Hook `useT()` retourne le dictionnaire actif
- Câblé dans : WelcomeScreen, AppSettingsPanel, LobbyScreen, GameRulesPanel, PlayerSlot, TopBar
- Switch live sans rechargement (Zustand `appStore`)

---

## Paramètres généraux (AppSettingsPanel)

- Langue : FR / EN
- Son : on/off (toggle, pas de lecture audio implémentée)
- Vitesse d'animation : Normal / Rapide (affecte la lecture du combat)

---

## Jeu — Économie & Progression

- Or de base : 5/round + intérêts (1 par tranche de 10 gold, cap 5)
- Gold de streak (victoires ou défaites consécutives : +1/+2/+3)
- XP passif par round + achat d'XP (4 XP pour 4 gold)
- Niveaux 1–10 avec seuils XP cumulatifs
- Capacité de board = niveau joueur
- Vente d'unités avec remboursement (valeur réduite pour unités stellées)
- Snapshot économie exportée/importée pour reconnexion (`exportSave/importSave`)

---

## Jeu — Shop & Unités

- Shop 5 slots, probabilités par niveau (SHOP_ODDS)
- Pool filtré par générations sélectionnées en lobby (`makePool(allowedIds)`)
- Reroll (2 gold), freeze du shop pour le prochain round
- Pool global partagé : 30/25/18/10/9 copies par tier de coût
- Combinaison automatique 3→⭐⭐ et 3⭐⭐→⭐⭐⭐
- Indicateur "copies manquantes" jusqu'à la prochaine étoile
- Surbrillance "1 copie manquante" dans le shop
- Affichage traits actifs/inactifs sur chaque carte du shop

---

## Jeu — Board & Bench

- Grille hexagonale 7×4 (board joueur)
- Bench 9 emplacements
- Drag & drop (dnd-kit) : board↔bench, board↔board, bench↔bench
- Swap automatique si la destination est occupée
- Zone de vente (drag & drop)

---

## Jeu — Combat (moteur déterministe)

- Simulation tick-by-tick (PRNG Mulberry32, seed reproductible)
- IA de combat : acquisition de cible (plus proche, load balancing), déplacement hexagonal, attaque auto
- Génération de mana sur attaque (+10 lanceur, +3 cible) ; cast d'ability au mana plein
- Matrice type-efficacité 18×18 complète (super-effectif, peu efficace, immunité)
- Réduction dégâts via Armor (physique) et Magic Resist (magique)
- Shapes d'ability : `single` / `splash` (cible + voisins hexagonaux) / `line`
- Overtime : après 15 s de combat, dégâts % croissants pour forcer la fin
- **Mega Evolution** : stat boost + changement de type si l'unité porte une Mega Stone compatible (9 formes : Charizard X, Venusaur, Blastoise, Beedrill, Alakazam, Gengar, Gyarados, Aéroctali, Mewtwo)
- Enregistrement frame-by-frame pour replay client

---

## Jeu — Visualisation du combat

- Rendu hexagonal 7×8 avec unités animées
- Barres HP et Mana par unité
- Projectiles pour unités à distance
- Dégâts flottants (crits mis en évidence)
- Anneaux de cast avec indicateur type-efficacité
- Animation de mort (niveaux de gris)
- Contrôles vitesse : 1×, 1.5×, 2×, 4×, Skip
- Écran de résultat (Victoire / Défaite / Égalité + survivants)

---

## Jeu — Adversaires IA (mode solo hors réseau)

> Note : en mode réseau, les bots ont leurs boards générés par `botBoard()` dans `match.ts`.

- 7 dresseurs IA nommés (Brock, Misty, Surge, Érika, Koga, Sabrina, Blaine)
- Scaling par round cumulatif (niveau + count d'unités)
- Sélection round-robin des adversaires

---

## Jeu — Carousel

- 5 choix (4 unités + 1 Mega Stone), déterministe par stage + seed
- Cartes avec sprite, coût et types

---

## Jeu — Synergies (affichage)

- Comptage de traits (18 types + 7 rôles) par unité distincte sur le board
- Seuils d'activation (ex. Fire 2/4/6)
- Panel synergies : tiers actifs, compteurs, tooltips
- Colorisation par type (`TYPE_COLOR`)

---

## Jeu — Objets (inventaire)

- 8 objets : Restes, Choix Ruban, Choix Lunettes, Orbe Vie, Ceinture Concentration, Éviolite, Veste Assaut, Casque Rocher
- Équipement par clic (drag vers unité)
- Max 3 objets/unité ; récupération à la vente
- Compteur Mega Stones dans l'ItemTray

---

## Jeu — Interface générale (NetGameClient)

- Barre du haut : Stage-Round, HP, Or, Niveau, nb joueurs vivants, timer de phase (planning/combat)
- Indicateur Host / badge nom
- Scoreboard live : classement, barres HP colorées, avatar (premier board unit), statut offline
- Bouton Leave toujours accessible

---

## Roster — 140 unités Gen I–IX

| Génération | # | Exemples notables |
|---|---|---|
| Gen I — Kanto | 42 | Starters Kanto, Magikarp, Eevee, Scyther, oiseaux légendaires, Mewtwo, Mew |
| Gen II — Johto | 13 | Starters Johto, Mareep, Tyranitar, Steelix, Lugia, Ho-Oh, Celebi |
| Gen III — Hoenn | 14 | Starters Hoenn, Ralts, Mawile, Metagross, Salamence, Kyogre, Groudon, Rayquaza |
| Gen IV — Sinnoh | 15 | Starters Sinnoh, Riolu, Garchomp, Togekiss, Weavile, Dialga, Palkia, Giratina, Arceus |
| Gen V — Unova | 13 | Starters Unova, Chandelure, Haxorus, Hydreigon, Reshiram, Zekrom, Kyurem, Victini |
| Gen VI — Kalos | 10 | Starters Kalos, Aegislash, Goomy, Xerneas, Yveltal, Zygarde |
| Gen VII — Alola | 11 | Starters Alola, Mimikyu, Jangmo-o, Solgaleo, Lunala, Necrozma |
| Gen VIII — Galar | 10 | Starters Galar, Dreepy, Corviknight, Zacian, Zamazenta, Eternatus |
| Gen IX — Paldea | 10 | Starters Paldea, Frigibax, Palafin, Koraidon, Miraidon, Terapagos |

- **18 types** couverts (Fighting, Dark, Steel ajoutés)
- **Traits** : 18 types × seuils + 7 rôles (Starter, Evolver, Swarm, Eeveelution, Fossil, Pseudo-Legend, Legendary, Mythic)
- **Mega Evolution** : 9 formes actives

---

## Données & Configuration

- Matrice type-efficacité 18×18 complète (`typeChart.ts`)
- Générations I–IX avec plages Pokédex (`generations.ts`)
- Config économie/shop/board centralisée (`config.ts`)
- PRNG Mulberry32 déterministe (`rng.ts`)
- Calcul de distance hexagonale cube + pathfinding (`hex.ts`)
