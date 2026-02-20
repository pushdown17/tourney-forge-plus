

## Fix: Show directly qualified teams in Quarter-Finals slots

### Problem

When generating a 12-team bracket, seeds #1-#4 (H, D, I, G) are directly qualified for the Quarter-Finals and don't play preliminary matches. However, the bracket display currently shows empty "TBD" placeholders for all QF slots until the preliminary round completes. The directly qualified teams should be visible in their QF slots immediately, waiting for their opponent from the preliminary round.

### Root Cause

In `generateBracketStructure()` (line ~1216-1249), when building R1 placeholders for the preliminary case, the code only looks at prelim match winners to populate slots. It has no knowledge of which directly qualified team belongs in each slot.

### Solution

Modify `generateBracketStructure()` to compute the full R1 seeding map and show directly qualified teams in their correct QF slots even before preliminary matches are played.

### Technical Details

**File: `src/components/tournament/EliminationBracket.tsx`**

In the `generateBracketStructure()` function, specifically the `round === 1 && hasPreliminary` branch (lines 1216-1249):

1. Compute the standard seeding order for the bracket size (e.g., `[1,8,4,5,2,7,3,6]` for 8)
2. Build a seed-to-team map from the current standings data (available in the `matches` state via team seeds)
3. For each R1 slot, determine which two seeds should play:
   - If a real match exists for this slot, display it normally
   - If no match exists yet, create a placeholder that shows:
     - The directly qualified team (seed #1-#4) in one slot
     - "TBD" or the prelim winner (if known) in the other slot

This requires fetching standings data and storing it in component state (or deriving it from match seeds), then using `getStandardSeeding(bracketSize)` to determine which seed goes where in R1.

The key mapping for 12 teams (bracketSize=8, seeding `[1,8,4,5,2,7,3,6]`):
- QF slot 0: Seed #1 (H) vs Seed #8 (prelim winner)
- QF slot 1: Seed #4 (G) vs Seed #5 (prelim winner)
- QF slot 2: Seed #2 (D) vs Seed #7 (prelim winner)
- QF slot 3: Seed #3 (I) vs Seed #6 (prelim winner)

**Changes needed:**
1. Store standings/seed map in component state (fetch alongside matches in `fetchTournamentAndMatches`)
2. In `generateBracketStructure()`, use the seeding + standings to populate R1 placeholders with directly qualified teams
3. Determine which team in each slot is "direct" vs "from prelim" to correctly assign team1/team2 in the placeholder

