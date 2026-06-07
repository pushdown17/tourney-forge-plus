## Contexte

Aujourd'hui, dès qu'on ouvre l'onglet **Elimination** d'un tournoi en `single_elimination` ou `double_elimination`, le bracket se génère automatiquement à partir du seeding (classement Round Robin/Swiss). Pour un tournoi **élimination directe** (pas de RR/Swiss), il n'y a pas de classement → le seeding tombe sur l'ordre d'insertion en DB, ce qui ne permet pas au créateur de décider qui joue qui (ex. Gone Invit' 2k26 DE, 12 équipes en DE).

## Objectif

Pour les tournois **single-elimination only** et **double-elimination only** :
1. Ne PAS auto-générer le bracket à l'ouverture de l'onglet Elimination.
2. Afficher un écran d'accueil avec un bouton **"Créer le tableau éliminatoire"**.
3. Au clic, ouvrir une étape de **composition manuelle des paires** : le créateur choisit, slot par slot du Round 1 (et du Preliminary Round si applicable), quelle équipe occupe quelle position.
4. Une fois validé, générer les matches du R1 avec ces appariements ; la suite du bracket fonctionne ensuite comme aujourd'hui (gagnants/perdants routés normalement, double élim complète).

Les tournois avec une phase préliminaire (RR / Swiss) conservent le comportement actuel basé sur le classement.

## Parcours utilisateur

```text
Onglet Elimination (tournoi élim directe, pas de bracket)
 ├─ Écran "Aucun tableau créé"
 │    [ Créer le tableau éliminatoire ]
 │
 ├─ Dialog/écran "Composer les paires"
 │    Liste des N slots du bracket dans l'ordre standard
 │    (Seed 1, Seed 2, ... + slots préliminaires si besoin)
 │    Chaque slot = Select "Choisir une équipe"
 │    Validation possible quand toutes les équipes sont assignées
 │    [ Annuler ]  [ Générer le bracket ]
 │
 └─ Bracket normal (R1 prêt, suite générée au fil des résultats)
```

## Détails techniques

### 1. Désactiver l'auto-génération pour les élim directes

Dans `src/components/tournament/EliminationBracket.tsx` (`fetchTournamentAndMatches`, ~ligne 703-705) et `src/components/tournament/DoubleEliminationBracket.tsx` (logique équivalente d'auto-génération à l'ouverture), conditionner l'appel à `generateBracket(...)` :

- Si `tournament.initial_phase` vaut `single_elimination` ou `double_elimination` (= tournoi élim directe) **et** qu'aucun match n'existe encore → ne rien générer, afficher l'écran "Créer le tableau".
- Sinon (tournoi avec RR/Swiss en amont) → comportement actuel inchangé.

### 2. Écran "Aucun bracket"

Nouvel état rendu à la place du bracket vide quand `matches.length === 0` et qu'on est en mode élim directe :

- Carte centrée avec icône Trophy, titre "Tableau éliminatoire", court texte explicatif.
- Bouton primaire **"Créer le tableau éliminatoire"** (visible uniquement pour `isCreator`).
- Pour les visiteurs : message "Le tableau n'a pas encore été créé".

### 3. Dialog "Composer les paires"

Nouveau composant `src/components/tournament/ManualBracketComposer.tsx` :

- Props : `tournamentId`, `eliminationType` ("single" | "double"), `teamsForElimination`, `onCreated`.
- Charge toutes les équipes du tournoi via `tournament_teams` + jointure `teams`.
- Calcule la structure via la fonction existante `computeBracketParams(teamsCount)` :
  - 12 équipes en DE → `bracketSize = 8`, `numPreliminaryMatches = 4` (les 8 perdants → losers bracket, etc.).
  - Affiche d'abord les slots du Preliminary Round (paires `(bracketSize/2 + 1) .. teamsCount` selon getStandardSeeding) puis les seeds directs.
- Pour chaque slot : `Select` listant les équipes non encore choisies.
- Bouton "Auto-remplir" (option) : remplit aléatoirement les slots restants.
- "Générer le bracket" → construit un `seedMap` manuel (team_id → seed selon position choisie) et appelle la logique de génération existante avec ce seedMap (au lieu du classement).

### 4. Génération à partir d'un seedMap manuel

Refactor minimal dans `EliminationBracket.tsx` / `DoubleEliminationBracket.tsx` :

- Extraire le calcul du `seedMap` dans `fetchTournamentAndMatches` pour qu'il puisse être :
  - dérivé du classement (cas RR/Swiss, comportement actuel),
  - ou injecté depuis le composer (cas élim directe).
- Sauvegarder ce `seedMap` dans `frozenSeedMapRef` + localStorage comme aujourd'hui pour qu'il soit gelé.
- Appeler ensuite `generateBracket(teamsCount)` qui consomme `frozenSeedToTeamRef`.

### 5. Réinitialisation

Le bouton "Réinitialiser le bracket" existant (Popover Settings) doit, en mode élim directe, ramener à l'écran "Créer le tableau" (et non régénérer automatiquement). Ajustement dans `handleResetBracket` : ne pas rappeler `generateBracket` si on est en élim directe — supprimer les matches et vider le seedMap suffit.

## Fichiers touchés

- `src/components/tournament/EliminationBracket.tsx` — gating auto-gen, écran vide, intégration composer, reset adapté.
- `src/components/tournament/DoubleEliminationBracket.tsx` — même gating + écran vide pour DE.
- `src/components/tournament/ManualBracketComposer.tsx` — **nouveau** composant dialog.

## Hors scope (à confirmer si tu veux les inclure)

- Drag & drop des équipes dans le bracket (on reste sur des Selects par slot pour la v1).
- Édition des paires après création (pour ça : passer par "Réinitialiser le bracket" puis recomposer).
- Re-seeding manuel pour les tournois RR/Swiss (on garde le seeding par classement).