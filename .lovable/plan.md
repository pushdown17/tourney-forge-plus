

## Regeneration du bracket d'elimination

### Ce qui sera fait

1. **Suppression des matchs d'elimination existants** - Les 4 matchs preliminaires actuels (dont M1 non joue, M2-M4 joues) seront supprimes de la base de donnees.

2. **Le bracket se regenerera automatiquement** - En retournant sur l'onglet Elimination, le composant detectera qu'il n'y a plus de matchs et proposera le bouton "Start Elimination" pour relancer la generation complete du bracket a partir du classement des tours preliminaires.

### Details techniques

- Execution d'un `DELETE` sur les matchs avec `tournament_id = '35e6c64f-...'` et `phase = 'single_elimination'`
- Le tournament reste en phase `single_elimination`, donc le bouton de generation sera disponible immediatement
- Les 12 equipes seront re-seedees selon le classement actuel du round robin/swiss
- Les 4 matchs preliminaires seront regeneres avec le bon seeding (#12 vs #5, #11 vs #6, #10 vs #7, #9 vs #8) et les field_numbers sequentiels (1, 2, 3, 4)

