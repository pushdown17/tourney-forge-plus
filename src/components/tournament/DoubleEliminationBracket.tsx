import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BracketMatch } from "./BracketMatch";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsRecapDialog } from "./MatchStatsRecapDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Shield, Skull, RefreshCw, RotateCcw } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SendToStationDialog } from "./SendToStationDialog";

interface Team {
  id: string;
  name: string;
  seed?: number;
}

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_id: string | null;
  round_number: number;
  is_third_place_match?: boolean;
  field_number?: number;
  team1?: Team;
  team2?: Team;
  isPlaceholder?: boolean;
}

interface DoubleEliminationBracketProps {
  tournamentId: string;
  currentPhase: string;
  onPhaseChanged: () => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

interface TimerState {
  durationSeconds: number;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedWhenPaused: number;
}

/**
 * Same standard seeding as single elimination:
 * recursively places #1 vs #last, ensuring top seeds are in opposite halves.
 * e.g. 8 teams:  [1,8],[4,5],[3,6],[2,7]
 * e.g. 16 teams: [1,16],[8,9],[5,12],[4,13],[3,14],[6,11],[7,10],[2,15]
 */
function getStandardSeeding(size: number): number[] {
  if (size === 1) return [1];
  const prev = getStandardSeeding(size / 2);
  const result: number[] = [];
  for (const seed of prev) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}

function getStandardSeedingPairs(count: number): [number, number][] {
  const seeding = getStandardSeeding(count);
  const pairs: [number, number][] = [];
  for (let i = 0; i < seeding.length; i += 2) {
    pairs.push([seeding[i], seeding[i + 1]]);
  }
  return pairs;
}

const getLosersRoundsCount = (totalTeams: number): number => {
  return (Math.log2(totalTeams) - 1) * 2;
};

const getWinnersRoundName = (roundNumber: number, totalTeams: number) => {
  const w = Math.log2(totalTeams);
  if (roundNumber === w) return "Winners Final";
  if (roundNumber === w - 1) return totalTeams >= 16 ? "Winners Semi" : "Winners Final";
  if (roundNumber === w - 2 && totalTeams >= 16) return "Winners QF";
  if (roundNumber === 1 && totalTeams >= 16) return "Round of 16";
  return `W-R${roundNumber}`;
};

const getLosersRoundName = (roundNumber: number, totalTeams: number) => {
  const lr = getLosersRoundsCount(totalTeams);
  if (roundNumber === lr) return "Losers Final";
  if (roundNumber === lr - 1) return "Losers Semi";
  // Minor rounds (odd): teams from winners drop in
  // Major rounds (even): survivors play each other
  const isMinor = roundNumber % 2 === 1;
  const pairIndex = Math.ceil(roundNumber / 2);
  // Map to winners round that feeds this losers round
  const winnersFeederRound = pairIndex; // W-R1 → L-R1 (minor), W-R2 → L-R3 (minor), etc.
  if (isMinor) {
    if (roundNumber === 1) return "Losers R1";
    return `Losers R${roundNumber}`;
  }
  return `Losers R${roundNumber}`;
};

export const DoubleEliminationBracket = ({
  tournamentId,
  currentPhase,
  onPhaseChanged,
  isClosed = false,
  isCreator = false
}: DoubleEliminationBracketProps) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tournament, setTournament] = useState<any>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scores, setScores] = useState<{ [key: string]: { team1: string; team2: string } }>({});
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [goalScorerDialogOpen, setGoalScorerDialogOpen] = useState(false);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [stationMatch, setStationMatch] = useState<{ id: string; label: string } | null>(null);
  const [scoringTeam, setScoringTeam] = useState<{ id: string; name: string; matchId: string } | null>(null);
  const [recentlyCompletedMatchId, setRecentlyCompletedMatchId] = useState<string | null>(null);
  const [recentlyAdvancedTeamIds, setRecentlyAdvancedTeamIds] = useState<string[]>([]);
  const [numberOfFields, setNumberOfFields] = useState(1);
  const [recapDialogOpen, setRecapDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("winners");

  // Real-time timer states
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
  const [activeStationMatches, setActiveStationMatches] = useState<Set<string>>(new Set());
  const [matchTimers, setMatchTimers] = useState<{ [matchId: string]: TimerState }>({});
  const [playersByTeam, setPlayersByTeam] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (currentPhase !== "double_elimination") return;
    fetchTournamentAndMatches();
    fetchActiveTimers();
  }, [tournamentId, currentPhase]);

  useEffect(() => {
    if (currentPhase !== "double_elimination") return;

    // Live broadcast channel — MUST match the channel used by referee station
    const liveChannel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on('broadcast', { event: 'live_score' }, (payload) => {
        const { matchId, team1_score, team2_score } = payload.payload;
        if (matchId) {
          setLiveMatches(prev => new Set([...prev, matchId]));
          // Update scores in-place for immediate live feedback
          setMatches(prev =>
            prev.map(m =>
              m.id === matchId ? { ...m, team1_score, team2_score } : m
            )
          );
        }
      })
      .on('broadcast', { event: 'timer_update' }, (payload) => {
        const { matchId, action, durationSeconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused } = payload.payload;
        if (matchId) {
          setMatchTimers(prev => ({
            ...prev,
            [matchId]: {
              durationSeconds: durationSeconds ?? prev[matchId]?.durationSeconds ?? 0,
              startedAt: timer_started_at,
              pausedAt: timer_paused_at,
              elapsedWhenPaused: timer_elapsed_when_paused ?? prev[matchId]?.elapsedWhenPaused ?? 0
            }
          }));
          if (action === 'start' || action === 'resume') {
            setLiveMatches(prev => new Set([...prev, matchId]));
          }
          if (action === 'reset') {
            setTimeout(() => {
              setLiveMatches(prev => { const next = new Set(prev); next.delete(matchId); return next; });
              setMatchTimers(prev => { const next = { ...prev }; delete next[matchId]; return next; });
            }, 1000);
          }
        }
      })
      .subscribe();

    // postgres_changes for saved scores & bracket progression
    const matchChannel = supabase
      .channel(`de-matches-${tournamentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          // Update only the changed match in-place — no full reload
          const updated = payload.new as any;
          setMatches(prev =>
            prev.map(m =>
              m.id === updated.id
                ? { ...m, team1_score: updated.team1_score, team2_score: updated.team2_score, winner_id: updated.winner_id }
                : m
            )
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        // New match inserted = new bracket round generated, need full refetch
        () => { fetchTournamentAndMatches(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        () => { fetchTournamentAndMatches(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referee_stations', filter: `tournament_id=eq.${tournamentId}` },
        () => { fetchActiveTimers(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(liveChannel);
      supabase.removeChannel(matchChannel);
    };
  }, [tournamentId, currentPhase]);

  // If not yet in elimination phase, show transition component
  if (currentPhase !== "double_elimination") {
    return (
      <PhaseTransition
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
        isCreator={isCreator}
      />
    );
  }

  const fetchActiveTimers = async () => {
    const { data: stations, error } = await supabase
      .from('referee_stations')
      .select('current_match_id, timer_duration_seconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused')
      .eq('tournament_id', tournamentId)
      .not('current_match_id', 'is', null);

    if (error || !stations) return;

    const timers: { [matchId: string]: TimerState } = {};
    const liveMatchIds: string[] = [];
    const stationMatchIds: string[] = [];

    stations.forEach((station: any) => {
      if (station.current_match_id) {
        stationMatchIds.push(station.current_match_id);
        if (station.timer_duration_seconds) {
          timers[station.current_match_id] = {
            durationSeconds: station.timer_duration_seconds,
            startedAt: station.timer_started_at,
            pausedAt: station.timer_paused_at,
            elapsedWhenPaused: station.timer_elapsed_when_paused || 0
          };
          if (station.timer_started_at) {
            liveMatchIds.push(station.current_match_id);
          }
        }
      }
    });

    setMatchTimers(timers);
    setLiveMatches(new Set(liveMatchIds));
    setActiveStationMatches(new Set(stationMatchIds));
  };


  const fetchTournamentAndMatches = async () => {
    setLoading(true);
    try {
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      setTournament(tournamentData);
      setNumberOfFields(tournamentData.number_of_fields || 1);

      const [matchesResult, standingsResult] = await Promise.all([
        supabase
          .from("matches")
          .select(`*, team1:teams!matches_team1_id_fkey(id, name), team2:teams!matches_team2_id_fkey(id, name)`)
          .eq("tournament_id", tournamentId)
          .eq("phase", "double_elimination")
          .order("round_number", { ascending: true }),
        supabase
          .from("team_stats")
          .select("team_id, points, goals_for, goals_against")
          .eq("tournament_id", tournamentId)
          .order("points", { ascending: false })
          .order("goals_for", { ascending: false })
      ]);

      if (matchesResult.error) throw matchesResult.error;

      const seedMap = new Map<string, number>();
      if (standingsResult.data) {
        standingsResult.data.forEach((stat, index) => {
          seedMap.set(stat.team_id, index + 1);
        });
      }

      const matchesWithSeeds = (matchesResult.data || []).map(match => ({
        ...match,
        team1: match.team1 ? { ...match.team1, seed: seedMap.get(match.team1.id) } : match.team1,
        team2: match.team2 ? { ...match.team2, seed: seedMap.get(match.team2.id) } : match.team2,
      }));

      setMatches(matchesWithSeeds);

      const teamIds = new Set<string>();
      matchesWithSeeds.forEach(m => {
        if (m.team1_id) teamIds.add(m.team1_id);
        if (m.team2_id) teamIds.add(m.team2_id);
      });

      if (teamIds.size > 0) {
        const { data: ttData } = await supabase
          .from("tournament_teams")
          .select("id, team_id")
          .eq("tournament_id", tournamentId)
          .in("team_id", Array.from(teamIds));

        if (ttData && ttData.length > 0) {
          const ttIds = ttData.map(tt => tt.id);
          const { data: ttpData } = await supabase
            .from("tournament_team_players")
            .select("tournament_team_id, players:player_id(name)")
            .in("tournament_team_id", ttIds);

          const ttIdToTeamId: Record<string, string> = {};
          ttData.forEach(tt => { ttIdToTeamId[tt.id] = tt.team_id; });

          const playersMap: Record<string, string[]> = {};
          ttpData?.forEach((ttp: any) => {
            const teamId = ttIdToTeamId[ttp.tournament_team_id];
            if (teamId) {
              if (!playersMap[teamId]) playersMap[teamId] = [];
              if (ttp.players?.name) playersMap[teamId].push(ttp.players.name);
            }
          });
          setPlayersByTeam(playersMap);
        }
      }

      if (!matchesResult.data || matchesResult.data.length === 0) {
        await generateBracket(tournamentData.teams_for_elimination);
      } else {
        // Retroactively repair losers bracket if W-R1 completed matches exist but no L-R1 matches
        await repairLosersBracket(matchesResult.data);
      }
    } catch (error: any) {
      toast.error("Error loading bracket");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Repair missing losers bracket matches by retroactively processing
   * all completed winners bracket rounds.
   */
  const repairLosersBracket = async (allMatchesData: any[]) => {
    try {
      const totalTeams = tournament?.teams_for_elimination || 8;
      const winnersRoundsCount = Math.log2(totalTeams);

      const sortFn = (a: any, b: any) => (a.field_number || 0) - (b.field_number || 0) || a.created_at.localeCompare(b.created_at);

      const winnersBracket = allMatchesData
        .filter(m => !m.is_third_place_match && m.round_number <= winnersRoundsCount)
        .sort(sortFn);
      // losersBracket is mutable: we add newly queued matches so later rounds can reference them
      const losersBracket = allMatchesData
        .filter(m => m.is_third_place_match)
        .sort(sortFn);

      const matchesToCreate: any[] = [];

      const matchExists = (arr: any[], r: number, t1: string, t2: string) =>
        arr.some(m => m.round_number === r && ((m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)));

      // Helper: get all matches for a given losers round (db + queued)
      const getLosersRound = (r: number) =>
        [...losersBracket, ...matchesToCreate]
          .filter((m: any) => m.round_number === r)
          .sort(sortFn);

      // ---------------------------------------------------------------
      // L-R1 (minor): W-R1 losers, spread logic
      // ---------------------------------------------------------------
      const allR1 = winnersBracket.filter(m => m.round_number === 1);
      const totalR1 = allR1.length;

      for (let i = 0; i < Math.floor(totalR1 / 2); i++) {
        const mLow  = allR1[i];
        const mHigh = allR1[totalR1 - 1 - i];
        if (!mLow?.winner_id || !mHigh?.winner_id) continue;

        const l1 = mLow.winner_id  === mLow.team1_id  ? mLow.team2_id  : mLow.team1_id;
        const l2 = mHigh.winner_id === mHigh.team1_id ? mHigh.team2_id : mHigh.team1_id;
        if (!l1 || !l2) continue;

        if (!matchExists(losersBracket, 1, l1, l2) && !matchExists(matchesToCreate, 1, l1, l2)) {
          matchesToCreate.push({
            tournament_id: tournamentId, phase: "double_elimination",
            round_number: 1, team1_id: l1, team2_id: l2,
            is_third_place_match: true, field_number: i + 1,
          });
        }
      }

      // ---------------------------------------------------------------
      // For each W-round 2+ → repair L major round, then next L minor
      // W-R2 → L-R2 (major), then L-R3 (minor)
      // W-R3 → L-R4 (major), then L-R5 (minor)
      // W-R4 → L-R6 (major = Losers Final, no minor after)
      // ---------------------------------------------------------------
      for (let wRound = 2; wRound <= winnersRoundsCount; wRound++) {
        const completedWRound = winnersBracket
          .filter((m: any) => m.round_number === wRound && m.winner_id)
          .sort(sortFn);
        if (completedWRound.length === 0) continue;

        const droppingLosers = completedWRound.map((m: any) =>
          m.winner_id === m.team1_id ? m.team2_id : m.team1_id
        );

        const majorRound  = (wRound - 1) * 2; // W-R2→L-R2, W-R3→L-R4, W-R4→L-R6
        const prevMinorRound = majorRound - 1;

        // --- Repair L major round ---
        const prevMinorMatches = getLosersRound(prevMinorRound);
        const minorSurvivors = prevMinorMatches.map((m: any) => m.winner_id || null);

        const existingMajor = getLosersRound(majorRound);
        for (let i = 0; i < droppingLosers.length; i++) {
          const dl = droppingLosers[i];
          const ms = minorSurvivors[i];
          if (!dl || !ms) continue;
          if (!matchExists(existingMajor, majorRound, dl, ms) && !matchExists(matchesToCreate, majorRound, dl, ms)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: majorRound, team1_id: dl, team2_id: ms,
              is_third_place_match: true, field_number: i + 1,
            });
          }
        }

        // --- Repair L minor round after this major (if not last losers round) ---
        // L-R3 comes after L-R2, L-R5 comes after L-R4; but NOT after L-R6 (final)
        const minorRoundAfter = majorRound + 1;
        const losersRoundsCount = getLosersRoundsCount(totalTeams);
        if (majorRound < losersRoundsCount) {
          // Get all major round matches (db + just queued) with their winners
          const allMajorMatches = getLosersRound(majorRound);
          const completedMajor = allMajorMatches.filter((m: any) => m.winner_id);

          // Pair consecutive winners: [0+1], [2+3], ...
          for (let i = 0; i < Math.floor(completedMajor.length / 2); i++) {
            const mA = completedMajor[i * 2];
            const mB = completedMajor[i * 2 + 1];
            if (!mA?.winner_id || !mB?.winner_id) continue;
            const w1 = mA.winner_id;
            const w2 = mB.winner_id;
            const existingMinorAfter = getLosersRound(minorRoundAfter);
            if (!matchExists(existingMinorAfter, minorRoundAfter, w1, w2) && !matchExists(matchesToCreate, minorRoundAfter, w1, w2)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: minorRoundAfter, team1_id: w1, team2_id: w2,
                is_third_place_match: true, field_number: i + 1,
              });
            }
          }
        }
      }

      if (matchesToCreate.length > 0) {
        const { error } = await supabase.from("matches").insert(matchesToCreate);
        if (error) throw error;
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error repairing losers bracket:", error);
    }
  };

  const generateBracket = async (teamsCount: number) => {
    setGenerating(true);
    try {
      const { data: standings, error: standingsError } = await supabase
        .from("team_stats")
        .select(`*, team:team_id(id, name)`)
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false })
        .limit(teamsCount);

      if (standingsError) throw standingsError;

      if (!standings || standings.length < teamsCount) {
        toast.error(`Not enough qualified teams (${standings?.length || 0}/${teamsCount})`);
        return;
      }

      // Use standard seeding pairs - assign sequential field numbers 1..n to preserve seeding order
      const pairs = getStandardSeedingPairs(teamsCount);
      const allMatches = pairs.map((pair, i) => ({
        tournament_id: tournamentId,
        phase: "double_elimination" as const,
        round_number: 1,
        team1_id: standings[pair[0] - 1].team_id,
        team2_id: standings[pair[1] - 1].team_id,
        field_number: i + 1, // sequential: M1=1, M2=2, M3=3... preserves seeding order via creation_at
        is_third_place_match: false,
      }));

      const { error: insertError } = await supabase.from("matches").insert(allMatches);
      if (insertError) throw insertError;

      toast.success("Double elimination bracket generated!");
      await fetchTournamentAndMatches();
    } catch (error: any) {
      toast.error("Error generating bracket");
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const handleScoreUpdate = async (matchId: string) => {
    const matchScores = scores[matchId];
    if (!matchScores) return;

    const team1Score = parseInt(matchScores.team1);
    const team2Score = parseInt(matchScores.team2);

    if (isNaN(team1Score) || isNaN(team2Score)) {
      toast.error("Please enter valid scores");
      return;
    }

    try {
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({ team1_score: team1Score, team2_score: team2Score });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }
    } catch { toast.error("Validation error"); return; }

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const winnerId = team1Score > team2Score ? match.team1_id :
                     team2Score > team1Score ? match.team2_id : null;

    if (!winnerId) { toast.error("An elimination match cannot end in a draw"); return; }

    const loserId = winnerId === match.team1_id ? match.team2_id : match.team1_id;

    try {
      const { error } = await supabase.from("matches").update({
        team1_score: team1Score,
        team2_score: team2Score,
        winner_id: winnerId
      }).eq("id", matchId);

      if (error) throw error;

      setRecentlyCompletedMatchId(matchId);
      setRecentlyAdvancedTeamIds([winnerId]);
      setTimeout(() => { setRecentlyCompletedMatchId(null); setRecentlyAdvancedTeamIds([]); }, 2000);

      toast.success("Score updated");
      setEditingMatchId(null);
      await fetchTournamentAndMatches();
      await handleChallongeProgression(match, winnerId, loserId);
    } catch (error: any) {
      toast.error("Error updating score");
      console.error(error);
    }
  };

  const handleChallongeProgression = async (completedMatch: Match, winnerId: string, loserId: string) => {
    try {
      const isLosersBracket = completedMatch.is_third_place_match;
      const roundNumber = completedMatch.round_number;
      const totalTeams = tournament?.teams_for_elimination || 8;
      const winnersRounds = Math.log2(totalTeams);

      const { data: allMatches, error: matchesError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", "double_elimination");

      if (matchesError) throw matchesError;

      // Sort by field_number then created_at for deterministic ordering
      const sortFn = (a: any, b: any) => (a.field_number || 0) - (b.field_number || 0) || a.created_at.localeCompare(b.created_at);
      const winnersBracket = (allMatches?.filter(m => !m.is_third_place_match) || []).sort(sortFn);
      const losersBracket = (allMatches?.filter(m => m.is_third_place_match) || []).sort(sortFn);

      const grandFinalRound1 = winnersRounds + 1;
      const losersRoundsCount = getLosersRoundsCount(totalTeams);

      // ---- GRAND FINAL / RESET ----
      if (!isLosersBracket && roundNumber >= grandFinalRound1) {
        if (roundNumber === grandFinalRound1) {
          const winnersFinalWinner = winnersBracket.find(m => m.round_number === winnersRounds)?.winner_id;
          const losersFinalWinner = losersBracket.find(m => m.round_number === losersRoundsCount)?.winner_id;
          if (winnersFinalWinner && losersFinalWinner && winnerId === losersFinalWinner && winnerId !== winnersFinalWinner) {
            await createGrandFinalReset(winnersFinalWinner, losersFinalWinner);
            toast.success("🔁 Bracket Reset! Grand Final #2 created!", { duration: 5000 });
            setActiveTab("finals");
          }
        }
        await fetchTournamentAndMatches();
        return;
      }

      const matchesToCreate: any[] = [];

      const matchExists = (arr: any[], r: number, t1: string, t2: string) =>
        arr.some(m => m.round_number === r && ((m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)));

      if (!isLosersBracket) {
        // ========== WINNERS BRACKET ==========
        // Like single elimination: when winner is known, look for their future opponent.
        // Winners advance when their "partner match" in the same round is also done.
        //
        // Structure (16 teams):
        //   W-R1 (8 matches) → winners pair up: M1+M2→QF1, M3+M4→QF2, M5+M6→QF3, M7+M8→QF4
        //   W-R2 QF (4 matches) → M1+M2→SF1, M3+M4→SF2
        //   W-R3 SF (2 matches) → winners meet in W Final
        //   W-R4 Final (1 match) → winner goes to Grand Final

        const currentRoundMatches = winnersBracket.filter(m => m.round_number === roundNumber);

        // Find the "partner" match: the other match in the same pair
        // Pairs are consecutive: index 0+1, 2+3, 4+5, ...
        const myIndex = currentRoundMatches.findIndex(m => m.id === completedMatch.id);
        const partnerIndex = myIndex % 2 === 0 ? myIndex + 1 : myIndex - 1;
        const partnerMatch = currentRoundMatches[partnerIndex];

        if (partnerMatch?.winner_id && winnerId) {
          // Both matches in this pair are done → create next round match
          const nextRound = roundNumber + 1;
          const w1 = myIndex % 2 === 0 ? winnerId : partnerMatch.winner_id;
          const w2 = myIndex % 2 === 0 ? partnerMatch.winner_id : winnerId;
          const nextFieldNumber = Math.floor(myIndex / 2) + 1;

          if (nextRound <= winnersRounds) {
            if (!matchExists(winnersBracket, nextRound, w1, w2)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: nextRound, team1_id: w1, team2_id: w2,
                is_third_place_match: false, field_number: nextFieldNumber,
              });
            }
          }
        }

        // Check for Grand Final (winners final winner vs losers champion)
        if (roundNumber === winnersRounds && winnerId) {
          const losersFinal = losersBracket.find(m => m.round_number === losersRoundsCount && m.winner_id);
          if (losersFinal?.winner_id) {
            await createGrandFinal(winnerId, losersFinal.winner_id, winnersBracket);
            setActiveTab("finals");
          }
        }

        // ========== INJECT LOSER INTO LOSERS BRACKET ==========
        // W-R1 losers → L-R1 (pair spread: loser[0] vs loser[n-1], loser[1] vs loser[n-2])
        // W-R2 losers → L-R2 (major round: loser vs L-R1 survivor)
        // W-R3 losers → L-R4 (major round: loser vs L-R3 survivor)
        // W-Rk losers → L-R(k-1)*2 major round

        if (roundNumber === 1) {
          // W-R1: inject losers progressively as pairs become available
          const completedR1 = winnersBracket.filter(m => m.round_number === 1 && m.winner_id);
          const n = completedR1.length;
          // Use spread pairing: loser[i] vs loser[n-1-i]
          for (let i = 0; i < Math.floor(n / 2); i++) {
            const l1 = completedR1[i].winner_id === completedR1[i].team1_id ? completedR1[i].team2_id : completedR1[i].team1_id;
            const l2 = completedR1[n - 1 - i].winner_id === completedR1[n - 1 - i].team1_id ? completedR1[n - 1 - i].team2_id : completedR1[n - 1 - i].team1_id;
            if (!l1 || !l2 || l1 === l2) continue;
            if (!matchExists(losersBracket, 1, l1, l2)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: 1, team1_id: l1, team2_id: l2,
                is_third_place_match: true,
                field_number: i + 1,
              });
            }
          }
        } else {
          // W-R2+: loser drops into L "major" round
          // W-R2 losers → L-R2, W-R3 losers → L-R4, W-R4 losers → L-R6
          // Formula: W-Rk loser → L-R(2*(k-1))
          const targetLosersRound = (roundNumber - 1) * 2;
          const prevMinorRound = targetLosersRound - 1;

          // Get ALL W losers from this round sorted by field_number (including not-yet-completed ones)
          const allCurrentRoundLosers = currentRoundMatches
            .sort(sortFn)
            .map(m => m.winner_id ? (m.winner_id === m.team1_id ? m.team2_id : m.team1_id) : null);

          // Get L minor survivors from previous minor round, sorted by field_number
          const prevMinorMatches = losersBracket.filter(m => m.round_number === prevMinorRound).sort(sortFn);
          const minorSurvivors = prevMinorMatches.map(m => m.winner_id || null);

          // Only create a major match when BOTH the W-loser[i] AND L-minor-survivor[i] are available
          const existingMajor = losersBracket.filter(m => m.round_number === targetLosersRound);
          for (let i = 0; i < allCurrentRoundLosers.length; i++) {
            const dl = allCurrentRoundLosers[i];
            const ms = minorSurvivors[i];
            // BOTH must be available - no match without both opponents
            if (!dl || !ms) continue;
            if (!matchExists(existingMajor, targetLosersRound, dl, ms) && !matchExists(matchesToCreate, targetLosersRound, dl, ms)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: targetLosersRound, team1_id: dl, team2_id: ms,
                is_third_place_match: true,
                field_number: i + 1,
              });
            }
          }
        }

      } else {
        // ========== LOSERS BRACKET ==========
        // Structure for 16 teams (losersRoundsCount = 8):
        //   L-R1 (minor, 4 matches): losers from W-R1 play each other
        //   L-R2 (major, 4 matches): L-R1 survivors vs W-R2 (QF) losers
        //   L-R3 (minor, 2 matches): L-R2 survivors play each other
        //   L-R4 (major, 2 matches): L-R3 survivors vs W-R3 (Semi) losers
        //   L-R5 (minor, 1 match):  L-R4 survivors play each other
        //   L-R6 (major, 1 match):  L-R5 survivor vs W-R4 (Final) loser → Losers Final
        //
        // ODD rounds (minor): survivors of previous major round play each other
        // EVEN rounds (major): minor survivors wait for W dropin
        //
        // After a MAJOR round win → check if partner major match done → create next MINOR round
        // After a MINOR round win → W dropin handles creating the MAJOR match (handled in W side)
        //                           BUT also check if W dropin already exists in next major round

        const currentLosersRound = losersBracket.filter(m => m.round_number === roundNumber).sort(sortFn);
        const myIndex = currentLosersRound.findIndex(m => m.id === completedMatch.id);

        const isMinorRound = roundNumber % 2 === 1;
        const nextRound = roundNumber + 1;

        if (roundNumber < losersRoundsCount) {
          if (isMinorRound) {
            // Minor round completed: winner goes to next MAJOR round.
            // Check if the W-dropin for that major round is ALREADY available.
            // W-feeder formula: L-major-R(2k) is fed by W-R(k) losers
            // e.g. L-R1 (minor) → L-R2 (major, k=1) ← W-R1 losers... wait:
            //   L-R2 = 2k → k=1 → W-R(1) — but W-R1 losers go to L-R1 (minor), not L-R2!
            //   Actually:
            //   L-R2 (major) ← W-R2 (QF) losers  → k=2 → wFeeder = nextMajorRound/2 = 1... wrong
            //   Correct mapping: L-R(2j) major ← W-R(j+1) losers
            //   j = nextMajorRound/2 → wFeederRound = nextMajorRound/2 + 1... also wrong for L-R6
            //
            // True mapping (from spec):
            //   L-R2 ← W-R2 losers (QF losers)
            //   L-R4 ← W-R3 losers (Semi losers)
            //   L-R6 ← W-R4 losers (Final loser)
            // Formula: wFeederRound = nextMajorRound / 2   (L-R2→W-R1? No)
            // L-R2=2 → W-R2, L-R4=4 → W-R3, L-R6=6 → W-R4
            // Pattern: wFeederRound = nextMajorRound / 2  gives 1,2,3 — off by 1
            // Correct: wFeederRound = nextMajorRound / 2 + 1? L-R2→W-R2✓, L-R4→W-R3✓, L-R6→W-R4✓
            // Wait: 2/2+1=2✓, 4/2+1=3✓, 6/2+1=4✓ — YES this formula IS correct.
            // The previous audit was wrong — let's verify once more:
            //   nextMajorRound=2: 2/2+1=2 → W-R2 ✅
            //   nextMajorRound=4: 4/2+1=3 → W-R3 ✅
            //   nextMajorRound=6: 6/2+1=4 → W-R4 ✅
            // The formula was actually correct. The real bug was in repairLosersBracket (now fixed).
            const nextMajorRound = nextRound;
            // wFeederRound: L-R(2k) ← W-R(k+1) losers → k = nextMajorRound/2 → wFeederRound = k+1
            const wFeederRound = nextMajorRound / 2 + 1; // L-R2←W-R2, L-R4←W-R3, L-R6←W-R4

            // Get all minor round matches sorted by field_number, map winner (or null if not done)
            const allMinorMatches = currentLosersRound.sort(sortFn);
            const allMinorWinners = allMinorMatches.map(m => {
              if (m.id === completedMatch.id) return winnerId;
              return m.winner_id || null;
            });

            // Get W-losers from the feeder Winners round: include all matches (use null if not complete)
            const wFeederMatches = winnersBracket.filter(m => m.round_number === wFeederRound).sort(sortFn);
            const wDropinLosers = wFeederMatches.map(m =>
              m.winner_id ? (m.winner_id === m.team1_id ? m.team2_id : m.team1_id) : null
            );

            // Only create a match when BOTH the minor-survivor[i] AND w-dropin[i] are available
            const existingMajor = losersBracket.filter(m => m.round_number === nextMajorRound);
            for (let i = 0; i < allMinorWinners.length; i++) {
              const ms = allMinorWinners[i];
              const wl = wDropinLosers[i];
              if (!ms || !wl) continue;
              if (!matchExists(existingMajor, nextMajorRound, ms, wl) && !matchExists(matchesToCreate, nextMajorRound, ms, wl)) {
                matchesToCreate.push({
                  tournament_id: tournamentId, phase: "double_elimination",
                  round_number: nextMajorRound, team1_id: wl, team2_id: ms,
                  is_third_place_match: true,
                  field_number: i + 1,
                });
              }
            }
          } else {
            // Major round completed: both teams in this match were either W-dropins or L-survivors
            // Winner advances to next MINOR round (survivors play each other)
            // We need to pair consecutive major-round winners
            const partnerIndex = myIndex % 2 === 0 ? myIndex + 1 : myIndex - 1;
            const partnerMatch = currentLosersRound[partnerIndex];

            if (partnerMatch?.winner_id) {
              // Both paired major matches done → create next minor match
              const w1 = myIndex % 2 === 0 ? winnerId : partnerMatch.winner_id;
              const w2 = myIndex % 2 === 0 ? partnerMatch.winner_id : winnerId;
              if (!matchExists(losersBracket, nextRound, w1, w2)) {
                matchesToCreate.push({
                  tournament_id: tournamentId, phase: "double_elimination",
                  round_number: nextRound, team1_id: w1, team2_id: w2,
                  is_third_place_match: true,
                  field_number: Math.floor(myIndex / 2) + 1,
                });
              }
            } else {
              // Partner not done yet, but check: if this major round has only 1 match total
              // (e.g. L-R6 final), then this winner IS the Losers Final winner
              if (currentLosersRound.length === 1) {
                // Single match in this major round = this IS the Losers Final
                // Grand final check is handled below
              }
            }
          }
        }

        // Grand Final check after Losers Final
        if (roundNumber === losersRoundsCount && winnerId) {
          const winnersFinal = winnersBracket.find(m => m.round_number === winnersRounds && m.winner_id);
          if (winnersFinal?.winner_id) {
            await createGrandFinal(winnersFinal.winner_id, winnerId, winnersBracket);
            setActiveTab("finals");
          }
        }
      }

      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase.from("matches").insert(matchesToCreate);
        if (insertError) throw insertError;
        toast.success("Next match(es) generated!");
        await fetchTournamentAndMatches();
      } else {
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error handling progression:", error);
    }
  };

  // generateMajorRound removed — logic now inline in handleChallongeProgression

  const createGrandFinal = async (winnersChampion: string, losersChampion: string, winnersMatches: any[]) => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const winnersRounds = Math.log2(totalTeams);
    const grandFinalRound = winnersRounds + 1;

    const exists = winnersMatches.some(m =>
      m.round_number === grandFinalRound &&
      ((m.team1_id === winnersChampion && m.team2_id === losersChampion) ||
       (m.team1_id === losersChampion && m.team2_id === winnersChampion))
    );

    if (!exists) {
      const { error } = await supabase.from("matches").insert({
        tournament_id: tournamentId, phase: "double_elimination",
        round_number: grandFinalRound, team1_id: winnersChampion, team2_id: losersChampion,
        is_third_place_match: false, field_number: 1,
      });
      if (error) throw error;
      toast.success("🏆 Grand Final created!");
    }
  };

  const createGrandFinalReset = async (winnersChampion: string, losersChampion: string) => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const winnersRounds = Math.log2(totalTeams);
    const resetRound = winnersRounds + 2;

    // Query DB directly to avoid stale in-memory snapshot of winnersMatches
    const { data: existingReset } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("phase", "double_elimination")
      .eq("round_number", resetRound)
      .eq("is_third_place_match", false)
      .limit(1);

    if (!existingReset || existingReset.length === 0) {
      const { error } = await supabase.from("matches").insert({
        tournament_id: tournamentId, phase: "double_elimination",
        round_number: resetRound, team1_id: winnersChampion, team2_id: losersChampion,
        is_third_place_match: false, field_number: 1,
      });
      if (error) throw error;
    }
  };

  const isPreviousRoundCompleted = (roundNumber: number, bracketMatches: Match[]): boolean => {
    if (roundNumber <= 1) return true;
    const previousRoundMatches = bracketMatches.filter(m => m.round_number === roundNumber - 1);
    if (previousRoundMatches.length === 0) return false;
    return previousRoundMatches.every(m => m.winner_id !== null);
  };

  const totalTeams = tournament?.teams_for_elimination || 8;
  const winnersRoundsCount = Math.log2(totalTeams);

  const grandFinalMatches = matches
    .filter(m => !m.is_third_place_match && m.round_number > winnersRoundsCount)
    .sort((a, b) => a.round_number - b.round_number);

  const winnersMatches = matches.filter(m => !m.is_third_place_match && m.round_number <= winnersRoundsCount);
  const losersMatches = matches.filter(m => m.is_third_place_match);

  const allGrandFinalsCompleted = grandFinalMatches.length > 0 && grandFinalMatches.every(m => m.winner_id);
  const decidingFinal = allGrandFinalsCompleted ? grandFinalMatches[grandFinalMatches.length - 1] : null;
  const hasReset = grandFinalMatches.length >= 2;

  const waitingMatches = matches
    .filter(m => !m.winner_id && !activeStationMatches.has(m.id) && m.team1 && m.team2 && !m.isPlaceholder)
    .sort((a, b) => a.round_number - b.round_number);
  const onDeckMatchId = waitingMatches[0]?.id;
  const inTheHoleMatchId = waitingMatches[1]?.id;

  const generateBracketStructure = (bracketMatches: Match[]) => {
    const structure: Match[][] = [];
    const maxRound = bracketMatches.length > 0 ? Math.max(...bracketMatches.map(m => m.round_number)) : 0;
    for (let round = 1; round <= maxRound; round++) {
      const roundMatches = bracketMatches
        .filter(m => m.round_number === round)
        .sort((a, b) => (a.field_number || 0) - (b.field_number || 0));
      if (roundMatches.length > 0) structure.push(roundMatches);
    }
    return structure;
  };

  const renderMatchCard = (match: Match, bracketMatches: Match[], isLosers: boolean) => {
    const roundNumber = match.round_number;
    const canAccessMatch = isPreviousRoundCompleted(roundNumber, bracketMatches);
    const isLocked = !canAccessMatch && !match.winner_id;
    const isMatchCompleted = !!match.winner_id;

    return (
      <BracketMatch
        key={match.id}
        match={match}
        matchNumber={match.field_number || 1}
        isEditing={editingMatchId === match.id}
        scores={scores[match.id] || { team1: "", team2: "" }}
        isClosed={isClosed || isLocked}
        isFinal={false}
        isRecentlyCompleted={recentlyCompletedMatchId === match.id}
        advancedTeamId={recentlyAdvancedTeamIds.includes(match.team1_id) ? match.team1_id :
                        recentlyAdvancedTeamIds.includes(match.team2_id) ? match.team2_id : undefined}
        isLocked={isLocked}
        isCompleted={isMatchCompleted}
        isCreator={isCreator}
        isLive={liveMatches.has(match.id)}
        isOnDeck={onDeckMatchId === match.id}
        isInTheHole={inTheHoleMatchId === match.id}
        timerState={matchTimers[match.id] || null}
        tournamentId={tournamentId}
        team1Players={playersByTeam[match.team1_id] || []}
        team2Players={playersByTeam[match.team2_id] || []}
        numberOfFields={numberOfFields}
        onStartEdit={() => {
          if (isLocked || isMatchCompleted) {
            toast.error(isMatchCompleted ? "This match is finished" : "Complete the previous round first");
            return;
          }
          setEditingMatchId(match.id);
          setScores({ ...scores, [match.id]: { team1: match.team1_score?.toString() || "0", team2: match.team2_score?.toString() || "0" } });
        }}
        onCancelEdit={() => setEditingMatchId(null)}
        onSaveScore={() => handleScoreUpdate(match.id)}
        onScoreChange={(team, value) => setScores({ ...scores, [match.id]: { ...scores[match.id], [team]: value } })}
        onMatchClick={() => {
          if (isLocked && !isMatchCompleted) { toast.error("Complete the previous round first"); return; }
          setSelectedMatch(match);
          if (isMatchCompleted) setRecapDialogOpen(true);
          else setStatsDialogOpen(true);
        }}
        onEditScore={() => { setSelectedMatch(match); setStatsDialogOpen(true); }}
        onSendToStation={isCreator && !isMatchCompleted && !isClosed ? () => {
          const label = `${match.team1?.name || "TBD"} vs ${match.team2?.name || "TBD"}`;
          setStationMatch({ id: match.id, label });
          setStationDialogOpen(true);
        } : undefined}
        onIncrementScore={(teamId, teamName) => {
          if (isLocked || isMatchCompleted) { toast.error(isMatchCompleted ? "Match finished" : "Complete previous round first"); return; }
          setScoringTeam({ id: teamId, name: teamName, matchId: match.id });
          setGoalScorerDialogOpen(true);
        }}
      />
    );
  };

  // Generate expected number of matches per round for a full bracket structure
  const getExpectedMatchCounts = (isLosers: boolean): { round: number; count: number }[] => {
    const rounds: { round: number; count: number }[] = [];
    if (!isLosers) {
      // Winners: R1=8, R2=4, R3=2, R4=1 (for 16 teams)
      for (let r = 1; r <= winnersRoundsCount; r++) {
        rounds.push({ round: r, count: Math.pow(2, winnersRoundsCount - r) });
      }
    } else {
      // For 16 teams (winnersRoundsCount=4):
      // L-R1(minor)=4, L-R2(major)=4, L-R3(minor)=2, L-R4(major)=2, L-R5(minor)=1, L-R6(Final)=1
      // Pattern: pairs of (minor, major) rounds, count halves per pair
      // pair 1: L-R1=W/2, L-R2=W/2
      // pair 2: L-R3=W/4, L-R4=W/4
      // etc.
      const lrCount = getLosersRoundsCount(totalTeams);
      for (let r = 1; r <= lrCount; r++) {
        const pairIdx = Math.ceil(r / 2); // pair 1 for r=1,2; pair 2 for r=3,4; etc.
        const count = Math.max(1, Math.pow(2, winnersRoundsCount - 1 - pairIdx));
        rounds.push({ round: r, count });
      }
    }
    return rounds;
  };

  const renderBracket = (realMatches: Match[], isLosers: boolean) => {
    // Use exact same layout system as Single Elimination
    const matchHeight = 148; // same as EliminationBracket
    const baseGap = 4;
    const unit = matchHeight + baseGap;
    const matchCenterY = 60; // visual center of match card (header ~20px + card center ~40px)
    const COL_W = 200;
    const CONNECTOR_W = 32;
    const isLastRound = false; // connectors always drawn between bracket rounds

    const expectedRounds = getExpectedMatchCounts(isLosers);
    if (expectedRounds.length === 0) return null;

    const matchByRound = new Map<number, Match[]>();
    realMatches.forEach(m => {
      if (!matchByRound.has(m.round_number)) matchByRound.set(m.round_number, []);
      matchByRound.get(m.round_number)!.push(m);
    });

    // For each column, compute spacingLevel like Single Elimination does
    // Winners: R1 has most matches, each subsequent round halves
    // Losers: alternating minor/major rounds with different match counts

    return (
      <div className="overflow-x-auto overflow-y-auto pb-4" style={{ maxHeight: "78vh" }}>
        <div className="flex gap-0 min-w-max px-4 pt-2" style={{ alignItems: "flex-start" }}>
          {expectedRounds.map(({ round, count }, colIdx) => {
            const realRoundMatches = (matchByRound.get(round) || [])
              .sort((a, b) => (a.field_number || 0) - (b.field_number || 0));

            const roundName = isLosers ? getLosersRoundName(round, totalTeams) : getWinnersRoundName(round, totalTeams);
            const isThisLastRound = colIdx === expectedRounds.length - 1;

            // Compute spacingLevel based purely on match count
            // spacingLevel = log2(maxCount / count), same formula as Single Elim
            const maxCount = expectedRounds[0].count;
            const spacingLevel = count > 0 ? Math.log2(maxCount / count) : 0;

            const verticalGap = unit * Math.pow(2, spacingLevel) - matchHeight;
            const topOffset = unit * (Math.pow(2, spacingLevel) - 1) / 2;

            // For losers bracket, same-count consecutive rounds keep same spacing
            // but SVG connectors only drawn when next round has fewer matches (pairs merge)

            return (
              <div key={`${isLosers ? 'L' : 'W'}-R${round}`} className="flex flex-col" style={{ minWidth: `${COL_W + CONNECTOR_W}px` }}>
                {/* Column header */}
                <div className={cn(
                  "text-center mb-4 py-2 px-3 rounded-lg text-sm font-bold",
                  isThisLastRound
                    ? (isLosers ? "bg-destructive/20 border border-destructive/30 text-destructive" : "bg-primary/20 border border-primary/30 text-primary")
                    : (isLosers ? "bg-destructive/10 border border-destructive/20 text-destructive/80" : "bg-muted/50 text-foreground")
                )} style={{ width: COL_W }}>
                  {roundName}
                </div>

                {/* Matches column with same gap+marginTop as Single Elim */}
                <div
                  className="flex flex-col relative"
                  style={{
                    gap: `${verticalGap}px`,
                    marginTop: `${topOffset}px`,
                    width: `${COL_W + CONNECTOR_W}px`,
                  }}
                >
                  {/* SVG connector lines — only draw bracket connectors when next round has FEWER matches (2→1 merge) */}
                  {!isThisLastRound && (() => {
                    const nextCount = expectedRounds[colIdx + 1]?.count ?? count;
                    const isPairMerge = nextCount < count; // 2 matches → 1: draw bracket connector
                    // For same-count (drop-in round): draw simple pass-through arrow
                    return (
                      <svg
                        className="absolute left-full top-0 pointer-events-none"
                        style={{ left: COL_W, width: `${CONNECTOR_W}px`, height: "100%", overflow: "visible" }}
                      >
                        {Array.from({ length: count }).map((_, matchIndex) => {
                          const totalSlotHeight = matchHeight + verticalGap;
                          const baseY = matchIndex * totalSlotHeight;
                          const y = baseY + matchCenterY;

                          if (isPairMerge) {
                            // Only draw on even indices (pair start)
                            if (matchIndex % 2 !== 0) return null;
                            if (matchIndex + 1 >= count) return null;
                            const y1 = baseY + matchCenterY;
                            const y2 = baseY + totalSlotHeight + matchCenterY;
                            const yMid = (y1 + y2) / 2;
                            return (
                              <g key={matchIndex}>
                                <line x1="0" y1={y1} x2="16" y2={y1} stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.6" />
                                <line x1="0" y1={y2} x2="16" y2={y2} stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.6" />
                                <line x1="16" y1={y1} x2="16" y2={y2} stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.6" />
                                <line x1="16" y1={yMid} x2="32" y2={yMid} stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.6" />
                              </g>
                            );
                          } else {
                            // 1:1 pass-through: simple horizontal arrow
                            return (
                              <g key={matchIndex}>
                                <line x1="0" y1={y} x2="32" y2={y} stroke="hsl(var(--border))" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 2" />
                              </g>
                            );
                          }
                        })}
                      </svg>
                    );
                  })()}

                  {/* Render match slots */}
                  {Array.from({ length: count }).map((_, slotIdx) => {
                    const realMatch = realRoundMatches[slotIdx];

                    if (!realMatch) {
                      return (
                        <div
                          key={`tbd-${round}-${slotIdx}`}
                          className="rounded-lg border border-dashed border-border/30 bg-muted/10 flex items-center justify-center"
                          style={{ height: `${matchHeight}px`, width: COL_W }}
                        >
                          <span className="text-xs text-muted-foreground/40 font-medium">TBD</span>
                        </div>
                      );
                    }

                    return (
                      <div key={realMatch.id} style={{ height: `${matchHeight}px`, width: COL_W }}>
                        {renderMatchCard(realMatch, realMatches, isLosers)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return <Card className="glass-card p-8 text-center"><p className="text-muted-foreground animate-pulse">Loading bracket...</p></Card>;
  }

  if (generating) {
    return (
      <Card className="glass-card p-8 text-center">
        <Trophy className="h-12 w-12 text-primary mx-auto mb-4 animate-bounce" />
        <p className="text-muted-foreground animate-pulse">Generating bracket...</p>
      </Card>
    );
  }

  const pendingWinnersMatches = winnersMatches.filter(m => !m.winner_id).length;
  const pendingLosersMatches = losersMatches.filter(m => !m.winner_id).length;
  const pendingFinalsMatches = grandFinalMatches.filter(m => !m.winner_id).length;

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Double Elimination</h2>
            {hasReset && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <RotateCcw className="h-3 w-3" />
                Bracket Reset!
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground ml-9">
            {totalTeams} teams — Lose twice to be eliminated
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTournamentAndMatches} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No matches generated</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="winners" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Winners</span>
              {pendingWinnersMatches > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{pendingWinnersMatches}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="losers" className="gap-2 data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
              <Skull className="h-4 w-4" />
              <span className="hidden sm:inline">Losers</span>
              {pendingLosersMatches > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{pendingLosersMatches}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="finals" className="gap-2 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Finals</span>
              {pendingFinalsMatches > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{pendingFinalsMatches}</Badge>
              )}
              {hasReset && <RotateCcw className="h-3 w-3 text-destructive" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="winners">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Winners Bracket</h3>
              <span className="text-sm text-muted-foreground">({winnersMatches.length} matches)</span>
            </div>
            {renderBracket(winnersMatches, false)}
          </TabsContent>

          <TabsContent value="losers">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
              <Skull className="h-5 w-5 text-destructive" />
              <h3 className="text-lg font-semibold text-destructive">Losers Bracket</h3>
              <span className="text-sm text-muted-foreground">({losersMatches.length} matches)</span>
            </div>
            {renderBracket(losersMatches, true)}
          </TabsContent>

          <TabsContent value="finals">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-yellow-500/50">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-semibold text-yellow-500">Grand Final</h3>
              {hasReset && (
                <Badge variant="destructive" className="gap-1 ml-2">
                  <RotateCcw className="h-3 w-3" />
                  Bracket Reset
                </Badge>
              )}
            </div>

            {grandFinalMatches.length === 0 ? (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 text-yellow-500/30 mx-auto mb-4" />
                <p className="text-muted-foreground">The Grand Final will be generated once both brackets have a champion</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 max-w-sm mx-auto">
                {grandFinalMatches.map((gf, idx) => {
                  const isResetMatch = gf.round_number === winnersRoundsCount + 2;
                  const resetLocked = isResetMatch && !grandFinalMatches.some(m => m.round_number === winnersRoundsCount + 1 && m.winner_id);

                  return (
                    <div key={gf.id} className="w-full">
                      {isResetMatch && (
                        <div className="flex items-center justify-center gap-2 mb-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                          <RotateCcw className="h-4 w-4 text-destructive animate-spin" style={{ animationDuration: "3s" }} />
                          <span className="text-sm font-semibold text-destructive">🔁 Bracket Reset! Grand Final #2</span>
                        </div>
                      )}
                      {!isResetMatch && (
                        <div className="text-center text-xs text-muted-foreground mb-2 font-medium">
                          Grand Final {hasReset ? "#1" : ""}
                        </div>
                      )}
                      <BracketMatch
                        match={gf}
                        matchNumber={idx + 1}
                        isEditing={editingMatchId === gf.id}
                        scores={scores[gf.id] || { team1: "", team2: "" }}
                        isClosed={isClosed}
                        isFinal={true}
                        isRecentlyCompleted={recentlyCompletedMatchId === gf.id}
                        advancedTeamId={undefined}
                        isLocked={resetLocked}
                        isCompleted={!!gf.winner_id}
                        isCreator={isCreator}
                        isLive={liveMatches.has(gf.id)}
                        isOnDeck={onDeckMatchId === gf.id}
                        isInTheHole={inTheHoleMatchId === gf.id}
                        timerState={matchTimers[gf.id] || null}
                        team1Players={playersByTeam[gf.team1_id] || []}
                        team2Players={playersByTeam[gf.team2_id] || []}
                        onStartEdit={() => {
                          if (resetLocked) { toast.error("Complete Grand Final #1 first"); return; }
                          if (gf.winner_id) { toast.error("This match is finished"); return; }
                          setEditingMatchId(gf.id);
                          setScores({ ...scores, [gf.id]: { team1: gf.team1_score?.toString() || "0", team2: gf.team2_score?.toString() || "0" } });
                        }}
                        onSaveScore={() => handleScoreUpdate(gf.id)}
                        onCancelEdit={() => setEditingMatchId(null)}
                        onScoreChange={(team, value) => setScores({ ...scores, [gf.id]: { ...(scores[gf.id] || { team1: "0", team2: "0" }), [team]: value } })}
                        onMatchClick={() => {
                          if (resetLocked) { toast.error("Complete Grand Final #1 first"); return; }
                          setSelectedMatch(gf);
                          if (gf.winner_id) setRecapDialogOpen(true);
                          else setStatsDialogOpen(true);
                        }}
                        onEditScore={() => { setSelectedMatch(gf); setStatsDialogOpen(true); }}
                        onSendToStation={isCreator && !gf.winner_id && !isClosed && !resetLocked ? () => {
                          const label = `${gf.team1?.name || "TBD"} vs ${gf.team2?.name || "TBD"}`;
                          setStationMatch({ id: gf.id, label });
                          setStationDialogOpen(true);
                        } : undefined}
                        onIncrementScore={(teamId, teamName) => {
                          if (resetLocked || gf.winner_id) { toast.error(gf.winner_id ? "Match finished" : "Complete GF #1 first"); return; }
                          setScoringTeam({ id: teamId, name: teamName, matchId: gf.id });
                          setGoalScorerDialogOpen(true);
                        }}
                      />
                    </div>
                  );
                })}

                {decidingFinal?.winner_id && (
                  <div className="mt-2 text-center p-6 bg-yellow-500/20 border border-yellow-500/30 rounded-xl w-full animate-fade-in">
                    <Trophy className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
                    <p className="text-xl font-bold text-yellow-500">
                      🏆 Champion
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      {decidingFinal.winner_id === decidingFinal.team1_id
                        ? decidingFinal.team1?.name
                        : decidingFinal.team2?.name}
                    </p>
                    {hasReset && (
                      <p className="text-xs text-muted-foreground mt-2">Via Bracket Reset</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {selectedMatch && (
        <MatchStatsDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={statsDialogOpen}
          onOpenChange={setStatsDialogOpen}
          onScoreUpdate={async () => {
            await fetchTournamentAndMatches();
            if (selectedMatch?.winner_id) {
              const loserId = selectedMatch.winner_id === selectedMatch.team1_id ? selectedMatch.team2_id : selectedMatch.team1_id;
              await handleChallongeProgression(selectedMatch, selectedMatch.winner_id, loserId);
            }
          }}
        />
      )}

      {selectedMatch && (
        <MatchStatsRecapDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={recapDialogOpen}
          onOpenChange={setRecapDialogOpen}
        />
      )}

      {scoringTeam && (
        <GoalScorerDialog
          open={goalScorerDialogOpen}
          onOpenChange={setGoalScorerDialogOpen}
          tournamentId={tournamentId}
          matchId={scoringTeam.matchId}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          onGoalRecorded={fetchTournamentAndMatches}
        />
      )}

      {stationMatch && (
        <SendToStationDialog
          open={stationDialogOpen}
          onOpenChange={setStationDialogOpen}
          tournamentId={tournamentId}
          matchId={stationMatch.id}
          matchLabel={stationMatch.label}
        />
      )}
    </Card>
  );
};
