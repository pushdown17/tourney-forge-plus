
## Problem Analysis

For the **12-team Double Elimination** format, the play-in structure shifts all round numbers by 1 compared to a standard 8-team bracket:

```text
12-team bracket rounds (byeCount=4):
  W-R1  = Preliminary (play-in, 4 matches)
  W-R2  = Winners QF  (4 matches, sentinels → real matches)
  W-R3  = Winners SF  (2 matches)
  W-R4  = Winners Final (1 match)
  L-R1  = Losers R1   (2 matches: from W-QF losers)
  L-R2  = Losers R2   (2 matches: L-R1 winners vs W-SF losers)
  L-R3  = Losers Semi (1 match)
  L-R4  = Losers Final (1 match: L-Semi winner vs W-Final loser)
  GF-R5 = Grand Final
  GF-R6 = Reset (if needed)
```

**Strict play order required:**
```text
1. W-R1  (Prelim — 4 matches)
2. W-R2  (Winners QF — 4 matches)
3. L-R1  (Losers R1 — 2 matches: W-QF losers)
4. W-R3  (Winners SF — 2 matches)
5. L-R2  (Losers R2 — 2 matches: L-R1 winners + W-SF losers)
6. W-R4  (Winners Final — 1 match)
7. L-R3  (Losers Semi — 1 match)
8. L-R4  (Losers Final — 1 match: L-Semi winner + W-Final loser)
9. GF    (Grand Final)
10. Reset (if needed)
```

## Root Cause

There are **two bugs** in `RefereeStation.tsx`:

### Bug 1 — Wrong sequence numbers for play-in (12-team)
The generic `wSeq`/`getSeq` formula in the auto-advance sort (lines ~1373-1399) was designed for standard brackets. For play-in (`byeCount > 0`), the formula maps:
- L-R1 → seq=2 (comes **before** W-R2 QF at seq=3)

But in 12-team format, L-R1 losers come FROM W-R2 (QF), so L-R1 must come **after** W-R2. The correct sequence for 12 teams is:
```
W-R1→1, W-R2→2, L-R1→3, W-R3→4, L-R2→5, W-R4→6, L-R3→7, L-R4→8, GF→9
```

### Bug 2 — No round-blocking (the main request)
The `availableMatches` list currently includes **all** unplayed matches across all rounds at once. This means a future-round match appears as "next" even when the current round isn't finished. There is no check: "is the previous round fully completed?"

## Solution

**File: `src/pages/RefereeStation.tsx`**

### Fix 1 — Separate sequence tables for play-in vs standard

Replace the single `getSeq` function with two explicit lookup tables:

**Standard (byeCount=0):** L-R1=2, W-R2=3, L-R2=4, L-R3=5, W-R3=6, L-R4=7, W-R4=8, L-R5=9, L-R6=10, GF=11
**Play-in (byeCount>0):** W-R1=1, W-R2=2, L-R1=3, W-R3=4, L-R2=5, W-R4=6, L-R3=7, L-R4=8, GF=9

The play-in formula: `W-Rk → k`, `L-Rr (minor, odd) → r/2*2+1 ... ` (simplest: build a map keyed on `{is_losers, round_number}`).

### Fix 2 — Round blocking in auto-advance

After computing `availableMatches` sorted by sequence, add a **round-blocking filter**:

1. Compute the **minimum sequence number** among all currently unplayed matches (the "current frontier").
2. From `availableMatches`, only allow matches whose `seq === minSeq`.
3. Among those, pick `[0]` as the next match (by field_number).

This ensures that when W-QF still has 2 unplayed matches, the station can only auto-advance to another W-QF match — never to L-R1.

### Fix 3 — Block round in `SendToStationDialog` (manager manual assignment)

Apply the same sequence logic in the Tournament view so the manager cannot manually send a match from a future round to a station. This is a UX guard: the `SendToStationDialog` should only show matches from the current frontier.

**File: `src/components/tournament/SendToStationDialog.tsx`** — add a `currentPhase` + `allMatches` prop and filter for only frontier matches.

### Technical Details

```text
play-in sequence map (byeCount > 0, bracketSize=8):
  W-R1  → 1   (Prelim)
  W-R2  → 2   (QF)
  L-R1  → 3   (post-QF losers, minor)
  W-R3  → 4   (SF)
  L-R2  → 5   (major: L-R1 winners + W-SF losers)
  W-R4  → 6   (Winners Final)
  L-R3  → 7   (Losers Semi, minor)
  L-R4  → 8   (Losers Final, major — needs W-R4 loser)
  GF    → 9
  Reset → 10
```

The blocking logic:
```tsx
// After sorting availableMatches by seq:
const minSeq = Math.min(...availableMatches.map(getSeq));
const frontierMatches = availableMatches.filter(m => getSeq(m) === minSeq);
const nextMatch = frontierMatches[0] || null;
```

### Files to modify

1. **`src/pages/RefereeStation.tsx`** — Fix `getSeq()` for play-in, add frontier blocking in auto-advance (2 targeted changes in `validateMatch`)
2. **`src/components/tournament/SendToStationDialog.tsx`** — Filter match list to only show frontier matches when phase is `double_elimination`
