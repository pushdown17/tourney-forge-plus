import { useEffect, useState, useRef } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
  resetTrigger?: number;
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

/** Next power of 2 ≥ n */
const nextPow2 = (n: number): number => Math.pow(2, Math.ceil(Math.log2(n)));

/**
 * For a given teamsCount, the bracket size is the next power of 2.
 * For power-of-2 counts it's the same value.
 */
const getBracketSize = (teamsCount: number): number => nextPow2(teamsCount);

/**
 * Total number of losers bracket rounds.
 * For play-in brackets (byeCount > 0), W-R1 is play-in (losers eliminated),
 * so the effective DE starts at W-R2 with bracketSize/2 teams → fewer losers rounds.
 */
const getLosersRoundsCount = (bracketSize: number, byeCount = 0): number => {
  if (byeCount > 0) {
    // Effective DE = 8-team equivalent (bracketSize/2), losers rounds = (log2(bs/2)-1)*2
    return (Math.log2(bracketSize) - 2) * 2;
  }
  return (Math.log2(bracketSize) - 1) * 2;
};

const getWinnersRoundName = (roundNumber: number, bracketSize: number, byeCount = 0) => {
  const w = Math.log2(bracketSize);
  // Round 1 is "Play-in" for non-power-of-2 brackets
  if (roundNumber === 1 && byeCount > 0) return "Preliminary Round";
  if (roundNumber === w) return "Winners Final";
  if (roundNumber === w - 1) return w >= 3 ? "Winners Semi" : "Winners Final";
  if (roundNumber === w - 2 && w >= 4) return "Winners QF";
  return `Winners R${roundNumber}`;
};

const getLosersRoundName = (roundNumber: number, bracketSize: number, byeCount = 0) => {
  const lr = getLosersRoundsCount(bracketSize, byeCount);
  if (roundNumber === lr) return "Losers Final";
  if (roundNumber === lr - 1) return "Losers Semi";
  return `Losers R${roundNumber}`;
};

export const DoubleEliminationBracket = ({
  tournamentId,
  currentPhase,
  onPhaseChanged,
  isClosed = false,
  isCreator = false,
  resetTrigger = 0
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
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Ordered standings: index 0 = seed #1, used to resolve BYE team names
  const [standingsTeams, setStandingsTeams] = useState<{ teamId: string; name: string }[]>([]);

  // Trigger reset from parent (Tournament settings popover)
  const prevResetTrigger = useRef(resetTrigger);
  useEffect(() => {
    if (resetTrigger > 0 && resetTrigger !== prevResetTrigger.current) {
      prevResetTrigger.current = resetTrigger;
      handleResetBracket();
    }
  }, [resetTrigger]);

  // Real-time timer states
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
  const [activeStationMatches, setActiveStationMatches] = useState<Set<string>>(new Set());
  const [matchTimers, setMatchTimers] = useState<{ [matchId: string]: TimerState }>({});
  const [playersByTeam, setPlayersByTeam] = useState<Record<string, string[]>>({});

  // Refs to always have the latest state inside broadcast closures
  const matchesRef = useRef<Match[]>([]);
  const tournamentRef = useRef<any>(null);
  const standingsTeamsRef = useRef<{ teamId: string; name: string }[]>([]);
  useEffect(() => { matchesRef.current = matches; }, [matches]);
  useEffect(() => { tournamentRef.current = tournament; }, [tournament]);
  useEffect(() => { standingsTeamsRef.current = standingsTeams; }, [standingsTeams]);

  useEffect(() => {
    if (currentPhase !== "double_elimination") return;
    fetchTournamentAndMatches();
    fetchActiveTimers();
  }, [tournamentId, currentPhase]);

  // Auto-create Grand Final match as soon as both champions are known
  // This replaces the placeholder with a real interactive BracketMatch
  useEffect(() => {
    if (!tournament || !isCreator) return;
    const totalT = tournament.teams_for_elimination || 8;
    const bracketSz = getBracketSize(totalT);
    const byeCountT = bracketSz - totalT;
    const wRounds = Math.log2(bracketSz);
    const lRounds = getLosersRoundsCount(bracketSz, byeCountT);
    const grandFinalRound = wRounds + 1;

    const wFinal = matches.find(m => !m.is_third_place_match && m.round_number === wRounds && m.winner_id);
    const lFinal = matches.find(m => m.is_third_place_match && m.round_number === lRounds && m.winner_id);
    const grandFinalExists = matches.some(m => !m.is_third_place_match && m.round_number === grandFinalRound);

    if (wFinal?.winner_id && lFinal?.winner_id && !grandFinalExists) {
      createGrandFinal(wFinal.winner_id, lFinal.winner_id).then(() => {
        setActiveTab("finals");
      });
    }
  }, [matches, tournament, isCreator]);

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
      .on('broadcast', { event: 'de_match_completed' }, (payload) => {
        // Triggered by the referee station after validating a double_elimination match
        // → trigger bracket progression in real-time without waiting for INSERT postgres_changes
        const { matchId, winnerId, loserId } = payload.payload;
        if (!matchId || !winnerId || !loserId) return;
        const completedMatch = matchesRef.current.find(m => m.id === matchId);
        if (completedMatch) {
          handleChallongeProgression(completedMatch, winnerId, loserId);
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
        async (payload) => {
          // Silently merge the new match without triggering loading state
          const inserted = payload.new as any;
          if (!inserted || inserted.phase !== 'double_elimination') return;
          // Fetch team names for the new match
          const { data: newMatch } = await supabase
            .from("matches")
            .select(`*, team1:teams!matches_team1_id_fkey(id, name), team2:teams!matches_team2_id_fkey(id, name)`)
            .eq("id", inserted.id)
            .single();
          if (newMatch) {
            setMatches(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMatch.id)) return prev;
              return [...prev, newMatch];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
        (payload) => {
          const deleted = payload.old as any;
          if (deleted?.id) {
            setMatches(prev => prev.filter(m => m.id !== deleted.id));
          }
        }
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
          .select(`team_id, points, goals_for, goals_against, team:team_id(id, name)`)
          .eq("tournament_id", tournamentId)
          .order("points", { ascending: false })
          .order("goals_for", { ascending: false })
      ]);

      if (matchesResult.error) throw matchesResult.error;

      const seedMap = new Map<string, number>();
      const orderedTeams: { teamId: string; name: string }[] = [];
      if (standingsResult.data) {
        standingsResult.data.forEach((stat: any, index) => {
          seedMap.set(stat.team_id, index + 1);
          if (stat.team?.name) {
            orderedTeams.push({ teamId: stat.team_id, name: stat.team.name });
          }
        });
      }
      setStandingsTeams(orderedTeams);

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
        await repairLosersBracket(matchesResult.data, tournamentData.teams_for_elimination);
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
  const repairLosersBracket = async (allMatchesData: any[], teamsCount?: number) => {
    try {
      const totalTeams = teamsCount ?? (tournament ?? tournamentRef.current)?.teams_for_elimination ?? 8;
      const bracketSz = getBracketSize(totalTeams);
      const byeCount = bracketSz - totalTeams;
      const winnersRoundsCount = Math.log2(bracketSz);

      const sortFn = (a: any, b: any) => (a.field_number || 0) - (b.field_number || 0) || a.created_at.localeCompare(b.created_at);

      const winnersBracket = allMatchesData
        .filter(m => !m.is_third_place_match && m.round_number <= winnersRoundsCount)
        .sort(sortFn);
      const losersBracket = allMatchesData
        .filter(m => m.is_third_place_match)
        .sort(sortFn);

      const matchesToCreate: any[] = [];

      const matchExists = (arr: any[], r: number, t1: string, t2: string) =>
        arr.some(m => m.round_number === r && ((m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)));

      const teamInRound = (arr: any[], r: number, teamId: string) =>
        arr.some(m => m.round_number === r && (m.team1_id === teamId || m.team2_id === teamId));

      const getLosersRound = (r: number) =>
        [...losersBracket, ...matchesToCreate]
          .filter((m: any) => m.round_number === r)
          .sort(sortFn);

      // ---------------------------------------------------------------
      // PLAY-IN brackets (byeCount > 0):
      //   W-R1 losers are ELIMINATED — skip L-R1 from W-R1
      //   W-R2 losers → L-R1 (minor, pair them up)
      //   W-R(k≥3) losers → L-R((k-2)*2) major round
      // STANDARD brackets (byeCount = 0):
      //   W-R1 losers → L-R1 (minor, pair them up)
      //   W-R(k≥2) losers → L-R((k-1)*2) major round
      // ---------------------------------------------------------------
      const loserFirstWRound = byeCount > 0 ? 2 : 1; // First W round whose losers enter L bracket

      // L-R1 minor: losers from W-R(loserFirstWRound) paired consecutively
      const allR1W = winnersBracket.filter(m => m.round_number === loserFirstWRound);
      for (let k = 0; k < Math.floor(allR1W.length / 2); k++) {
        const mA = allR1W[k * 2];
        const mB = allR1W[k * 2 + 1];
        if (!mA?.winner_id || !mB?.winner_id) continue;
        const l1 = mA.winner_id === mA.team1_id ? mA.team2_id : mA.team1_id;
        const l2 = mB.winner_id === mB.team1_id ? mB.team2_id : mB.team1_id;
        if (!l1 || !l2 || l1 === l2) continue;
        const allLosersR1 = [...losersBracket, ...matchesToCreate].filter(m => m.round_number === 1);
        if (!teamInRound(allLosersR1, 1, l1) && !teamInRound(allLosersR1, 1, l2)) {
          matchesToCreate.push({
            tournament_id: tournamentId, phase: "double_elimination",
            round_number: 1, team1_id: l1, team2_id: l2,
            is_third_place_match: true, field_number: k + 1,
          });
        }
      }

      // For each subsequent W-round → repair L major round, then next L minor
      const losersRoundsCount = getLosersRoundsCount(bracketSz, byeCount);
      for (let wRound = loserFirstWRound + 1; wRound <= winnersRoundsCount; wRound++) {
        const completedWRound = winnersBracket
          .filter((m: any) => m.round_number === wRound && m.winner_id)
          .sort(sortFn);
        if (completedWRound.length === 0) continue;

        const droppingLosers = completedWRound.map((m: any) =>
          m.winner_id === m.team1_id ? m.team2_id : m.team1_id
        );

        // L major round formula: W-R(k) → L-R((k - loserFirstWRound) * 2)
        const majorRound = (wRound - loserFirstWRound) * 2;
        const prevMinorRound = majorRound - 1;

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

        const minorRoundAfter = majorRound + 1;
        if (majorRound < losersRoundsCount) {
          const allMajorMatches = getLosersRound(majorRound);
          const completedMajor = allMajorMatches.filter((m: any) => m.winner_id);
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
        console.log("[repairLosersBracket] Inserting matches:", matchesToCreate);
        const { error } = await supabase.from("matches").insert(matchesToCreate);
        if (error) {
          console.error("[repairLosersBracket] Insert error:", error);
          throw error;
        }
        await fetchTournamentAndMatches();
      } else {
        console.log("[repairLosersBracket] No matches to create. completedR1:", winnersBracket.filter(m => m.round_number === 1 && m.winner_id).length);
      }
    } catch (error: any) {
      console.error("[repairLosersBracket] Error:", error);
    }
  };

  const generateBracket = async (teamsCount: number) => {
    setGenerating(true);
    try {
      const bracketSz = getBracketSize(teamsCount);
      const byeCount = bracketSz - teamsCount;
      // For non-power-of-2, seeds 1..byeCount get BYEs (they skip R1)
      // Actual R1 matches involve seeds (byeCount+1)..teamsCount
      const realMatchCount = teamsCount - byeCount; // = 2*teamsCount - bracketSz

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

      if (byeCount === 0) {
        // Perfect power-of-2: standard bracket generation
        const pairs = getStandardSeedingPairs(teamsCount);
        const allMatches = pairs.map((pair, i) => ({
          tournament_id: tournamentId,
          phase: "double_elimination" as const,
          round_number: 1,
          team1_id: standings[pair[0] - 1].team_id,
          team2_id: standings[pair[1] - 1].team_id,
          field_number: i + 1,
          is_third_place_match: false,
        }));
        const { error: insertError } = await supabase.from("matches").insert(allMatches);
        if (insertError) throw insertError;
      } else {
        // BYE bracket: bracketSz slots, top `byeCount` seeds get BYEs
        // Standard seeding on bracketSz slots determines positions
        // Seeds 1..byeCount fill positions with BYEs (no match needed in R1)
        // Seeds (byeCount+1)..teamsCount play R1 matches filling the remaining positions
        //
        // Standard seeding pairs for the full bracketSz bracket:
        const fullPairs = getStandardSeedingPairs(bracketSz);
        // Remap: seed k maps to standings[k-1] if k <= teamsCount, else BYE
        const teamBySeed = (seed: number) => seed <= teamsCount ? standings[seed - 1].team_id : null;

        // R1 matches: only slots where BOTH seeds > byeCount (real teams play)
        // Slots where one or both seeds ≤ byeCount → that team gets a BYE → auto-advances to R2
        const r1Matches: any[] = [];
        const r1ByeWinners: { slotIdx: number; teamId: string }[] = []; // teams auto-advancing to R2

        fullPairs.forEach((pair, slotIdx) => {
          const [s1, s2] = pair;
          const t1 = teamBySeed(s1);
          const t2 = teamBySeed(s2);

          if (t1 && t2) {
            // Both real teams → real match
            r1Matches.push({
              tournament_id: tournamentId,
              phase: "double_elimination" as const,
              round_number: 1,
              team1_id: t1,
              team2_id: t2,
              field_number: r1Matches.length + 1,
              is_third_place_match: false,
            });
          } else if (t1 && !t2) {
            // t1 gets BYE → auto-advances to R2
            r1ByeWinners.push({ slotIdx, teamId: t1 });
          } else if (!t1 && t2) {
            // t2 gets BYE → auto-advances to R2
            r1ByeWinners.push({ slotIdx, teamId: t2 });
          }
          // Both null: impossible with valid even teamsCount
        });

        if (r1Matches.length !== realMatchCount) {
          console.warn(`[generateBracket] Expected ${realMatchCount} R1 matches, got ${r1Matches.length}`);
        }

        // Insert R1 real matches
        if (r1Matches.length > 0) {
          const { error: insertError } = await supabase.from("matches").insert(r1Matches);
          if (insertError) throw insertError;
        }

        // Auto-generate R2 matches for BYE winners
        // BYE winners are paired from the fullPairs structure:
        // R2 slot k pairs fullPairs[k*2] winner vs fullPairs[k*2+1] winner
        // For BYE slots, the winner is already known; for real R1 matches, winner is unknown yet
        // So R2 can only be created when both "contributors" to a R2 slot are known.
        // We pair BYE winners vs their R2 opponent (which may be another BYE winner or a R1 real match winner)
        // For simplicity, we create R2 slots immediately for BYE vs BYE pairs.
        // BYE vs R1-match pairs will be created by handleChallongeProgression as usual.
        const byePairs: { w1: string; w2: string; fieldNum: number }[] = [];
        // fullPairs[0,1] → R2 slot 0, fullPairs[2,3] → R2 slot 1, etc.
        const r2SlotCount = bracketSz / 4;
        for (let r2Slot = 0; r2Slot < r2SlotCount; r2Slot++) {
          const srcA = fullPairs[r2Slot * 2];
          const srcB = fullPairs[r2Slot * 2 + 1];
          const [sA1, sA2] = srcA;
          const [sB1, sB2] = srcB;
          const tA1 = teamBySeed(sA1), tA2 = teamBySeed(sA2);
          const tB1 = teamBySeed(sB1), tB2 = teamBySeed(sB2);
          // Winner of srcA slot: known only if one is BYE
          const srcAWinner = !tA2 ? tA1 : !tA1 ? tA2 : null;
          // Winner of srcB slot: known only if one is BYE
          const srcBWinner = !tB2 ? tB1 : !tB1 ? tB2 : null;
          // If both R2 contributors are BYE-winners, create R2 match now
          if (srcAWinner && srcBWinner) {
            byePairs.push({ w1: srcAWinner, w2: srcBWinner, fieldNum: r2Slot + 1 });
          }
        }
        if (byePairs.length > 0) {
          const r2ByeMatches = byePairs.map(bp => ({
            tournament_id: tournamentId,
            phase: "double_elimination" as const,
            round_number: 2,
            team1_id: bp.w1,
            team2_id: bp.w2,
            field_number: bp.fieldNum,
            is_third_place_match: false,
          }));
          const { error: r2Err } = await supabase.from("matches").insert(r2ByeMatches);
          if (r2Err) throw r2Err;
        }
      }

      toast.success(`Double elimination bracket generated! (${teamsCount} teams${byeCount > 0 ? `, ${byeCount} BYE${byeCount > 1 ? 's' : ''}` : ''})`);
      await fetchTournamentAndMatches();
    } catch (error: any) {
      toast.error("Error generating bracket");
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const handleResetBracket = async () => {
    setResetting(true);
    try {
      const { error } = await supabase
        .from("matches")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("phase", "double_elimination");
      if (error) throw error;
      setMatches([]);
      toast.success("Bracket reset! Regenerating...");
      await generateBracket(tournament?.teams_for_elimination || totalTeams);
    } catch (error: any) {
      toast.error("Error resetting bracket");
      console.error(error);
    } finally {
      setResetting(false);
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

      // Update local state immediately — no full reload needed
      setMatches(prev => prev.map(m =>
        m.id === matchId ? { ...m, team1_score: team1Score, team2_score: team2Score, winner_id: winnerId } : m
      ));

      toast.success("Score updated");
      setEditingMatchId(null);
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
      const totalTeams = (tournament ?? tournamentRef.current)?.teams_for_elimination || 8;
      const bracketSz = getBracketSize(totalTeams);
      const winnersRounds = Math.log2(bracketSz);

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
      const byeCount = bracketSz - totalTeams;
      const losersRoundsCount = getLosersRoundsCount(bracketSz, byeCount);

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
        // Realtime listeners handle UI update — no full reload needed
        return;
      }

      const matchesToCreate: any[] = [];

      const matchExists = (arr: any[], r: number, t1: string, t2: string) =>
        arr.some(m => m.round_number === r && ((m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)));

      // Check if a team is already in ANY match of a given round
      const teamInRound = (arr: any[], r: number, teamId: string) =>
        arr.some(m => m.round_number === r && (m.team1_id === teamId || m.team2_id === teamId));

      if (!isLosersBracket) {
        // ========== WINNERS BRACKET ==========
        const byeCount = bracketSz - totalTeams;

        if (roundNumber === 1 && byeCount > 0) {
          // ── Non-power-of-2 R1: BYE-aware pairing via full bracket slot mapping ──
          // Fetch fresh standings from DB to avoid any closure/state staleness issues
          const { data: freshStandings } = await supabase
            .from("team_stats")
            .select(`team_id, points, goals_for, goals_against`)
            .eq("tournament_id", tournamentId)
            .order("points", { ascending: false })
            .order("goals_for", { ascending: false })
            .limit(totalTeams);

          if (!freshStandings || freshStandings.length === 0) {
            console.error("[handleChallongeProgression] Could not fetch standings for BYE mapping");
            return;
          }

          const fullPairs = getStandardSeedingPairs(bracketSz);
          const teamBySeed = (seed: number): string | null =>
            seed <= totalTeams ? (freshStandings[seed - 1]?.team_id ?? null) : null;

          // Find the completed match's slot in fullPairs by matching its two team IDs
          const matchSlot = fullPairs.findIndex(([s1, s2]) => {
            const t1 = teamBySeed(s1);
            const t2 = teamBySeed(s2);
            return (
              (t1 === completedMatch.team1_id && t2 === completedMatch.team2_id) ||
              (t1 === completedMatch.team2_id && t2 === completedMatch.team1_id)
            );
          });

          if (matchSlot !== -1) {
            // Partner slot: adjacent slot XOR last bit
            const partnerSlot = matchSlot % 2 === 0 ? matchSlot + 1 : matchSlot - 1;
            const [ps1, ps2] = fullPairs[partnerSlot];
            const pt1 = teamBySeed(ps1);
            const pt2 = teamBySeed(ps2);
            const nextRound = 2;
            // R2 field number: which "pair of pairs" this is (1-indexed)
            const r2FieldNum = Math.floor(Math.min(matchSlot, partnerSlot) / 2) + 1;

            const byeTeamId = !pt2 ? pt1 : !pt1 ? pt2 : null; // exactly one null = BYE slot

            if (byeTeamId) {
              // Partner slot is a BYE → create R2 match immediately (BYE team + this R1 winner)
              // Lower slot index → team1 (top of the match card), higher → team2
              const r2t1 = partnerSlot < matchSlot ? byeTeamId : winnerId;
              const r2t2 = partnerSlot < matchSlot ? winnerId : byeTeamId;
              const alreadyInR2 = teamInRound(winnersBracket.filter(m => m.round_number === nextRound), nextRound, r2t1)
                                || teamInRound(winnersBracket.filter(m => m.round_number === nextRound), nextRound, r2t2);
              if (!matchExists(winnersBracket, nextRound, r2t1, r2t2) && !alreadyInR2) {
                matchesToCreate.push({
                  tournament_id: tournamentId, phase: "double_elimination" as const,
                  round_number: nextRound, team1_id: r2t1, team2_id: r2t2,
                  is_third_place_match: false, field_number: r2FieldNum,
                });
              }
            } else if (pt1 && pt2) {
              // Partner slot is also a real R1 match → wait for both to complete
              const partnerMatch = winnersBracket.find(m =>
                m.round_number === 1 &&
                ((m.team1_id === pt1 && m.team2_id === pt2) || (m.team1_id === pt2 && m.team2_id === pt1))
              );
              if (partnerMatch?.winner_id) {
                const lowerSlotWinner = partnerSlot < matchSlot ? partnerMatch.winner_id : winnerId;
                const higherSlotWinner = partnerSlot < matchSlot ? winnerId : partnerMatch.winner_id;
                const alreadyInR2b = teamInRound(winnersBracket.filter(m => m.round_number === nextRound), nextRound, lowerSlotWinner)
                                  || teamInRound(winnersBracket.filter(m => m.round_number === nextRound), nextRound, higherSlotWinner);
                if (!matchExists(winnersBracket, nextRound, lowerSlotWinner, higherSlotWinner) && !alreadyInR2b) {
                  matchesToCreate.push({
                    tournament_id: tournamentId, phase: "double_elimination" as const,
                    round_number: nextRound, team1_id: lowerSlotWinner, team2_id: higherSlotWinner,
                    is_third_place_match: false, field_number: r2FieldNum,
                  });
                }
              }
            }
          }
        } else {
          // ── Standard consecutive pairing (power-of-2, or R2+) ──
          const currentRoundMatches = winnersBracket.filter(m => m.round_number === roundNumber);
          const myIndex = currentRoundMatches.findIndex(m => m.id === completedMatch.id);
          const partnerIndex = myIndex % 2 === 0 ? myIndex + 1 : myIndex - 1;
          const partnerMatch = currentRoundMatches[partnerIndex];

          if (partnerMatch?.winner_id && winnerId) {
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
        }

        // Check for Grand Final (winners final winner vs losers champion)
        if (roundNumber === winnersRounds && winnerId) {
          const losersFinal = losersBracket.find(m => m.round_number === losersRoundsCount && m.winner_id);
          if (losersFinal?.winner_id) {
            await createGrandFinal(winnerId, losersFinal.winner_id);
            setActiveTab("finals");
          }
        }

        // ========== INJECT LOSER INTO LOSERS BRACKET ==========
        // PLAY-IN brackets (byeCount > 0):
        //   W-R1 (Play-in) losers → ELIMINATED (no losers bracket entry)
        //   W-R2 losers → L-R1 (minor, pair them up like standard W-R1 behavior)
        //   W-R(k≥3) losers → L-R((roundNumber-2)*2) major round
        // STANDARD brackets (byeCount = 0):
        //   W-R1 losers → L-R1 (minor, pair them up)
        //   W-R(k≥2) losers → L-R((roundNumber-1)*2) major round

        if (roundNumber === 1 && byeCount > 0) {
          // Play-in loser: ELIMINATED — do not add to losers bracket

        } else if ((roundNumber === 1 && byeCount === 0) || (roundNumber === 2 && byeCount > 0)) {
          // W-R1 standard / W-R2 play-in: pair up losers for L-R1 (minor round)
          const wRound = roundNumber;
          const allRSorted = winnersBracket.filter(m => m.round_number === wRound).sort(sortFn);
          const myPosInR = allRSorted.findIndex(m => m.id === completedMatch.id);
          const partnerPosInR = myPosInR % 2 === 0 ? myPosInR + 1 : myPosInR - 1;
          const partnerMatchR = allRSorted[partnerPosInR];

          if (partnerMatchR?.winner_id) {
            const l1 = loserId;
            const l2 = partnerMatchR.winner_id === partnerMatchR.team1_id
              ? partnerMatchR.team2_id
              : partnerMatchR.team1_id;
            const fieldNum = Math.floor(Math.min(myPosInR, partnerPosInR) / 2) + 1;
            if (l1 && l2 && l1 !== l2
              && !teamInRound(losersBracket, 1, l1) && !teamInRound(losersBracket, 1, l2)
              && !teamInRound(matchesToCreate.filter(m => m.round_number === 1), 1, l1)
              && !teamInRound(matchesToCreate.filter(m => m.round_number === 1), 1, l2)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: 1, team1_id: l1, team2_id: l2,
                is_third_place_match: true, field_number: fieldNum,
              });
            }
          }
        } else {
          // W-R(k≥2) standard / W-R(k≥3) play-in: loser drops into L major round
          const targetLosersRound = byeCount > 0
            ? (roundNumber - 2) * 2  // Play-in: W-R2→L-0? No: W-R3→L-R2, W-R4→L-R4
            : (roundNumber - 1) * 2; // Standard: W-R2→L-R2, W-R3→L-R4
          // Note: for byeCount>0, roundNumber>=3: (3-2)*2=2, (4-2)*2=4 ✓
          const prevMinorRound = targetLosersRound - 1;

          const currentRoundMatchesForLosers = winnersBracket.filter(m => m.round_number === roundNumber);
          const allCurrentRoundLosers = currentRoundMatchesForLosers
            .sort(sortFn)
            .map(m => m.winner_id ? (m.winner_id === m.team1_id ? m.team2_id : m.team1_id) : null);

          const prevMinorMatches = losersBracket.filter(m => m.round_number === prevMinorRound).sort(sortFn);
          const minorSurvivors = prevMinorMatches.map(m => m.winner_id || null);

          const existingMajor = losersBracket.filter(m => m.round_number === targetLosersRound);
          for (let i = 0; i < allCurrentRoundLosers.length; i++) {
            const dl = allCurrentRoundLosers[i];
            const ms = minorSurvivors[i];
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
            // Standard formula: L-R2←W-R2, L-R4←W-R3, L-R6←W-R4 → wFeederRound = nextMajorRound/2 + 1
            // Play-in formula: L-R2←W-R3, L-R4←W-R4 → wFeederRound = nextMajorRound/2 + 2
            const nextMajorRound = nextRound;
            const wFeederRound = byeCount > 0
              ? nextMajorRound / 2 + 2  // Play-in: L-R2←W-R3, L-R4←W-R4
              : nextMajorRound / 2 + 1; // Standard: L-R2←W-R2, L-R4←W-R3, L-R6←W-R4

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
            await createGrandFinal(winnersFinal.winner_id, winnerId);
            setActiveTab("finals");
          }
        }
      }

      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase.from("matches").insert(matchesToCreate);
        if (insertError) throw insertError;
        // New matches will be picked up by the realtime INSERT listener — no full reload needed
      }
      // Grand final tab switch handled above; no reload needed for other progressions
    } catch (error: any) {
      console.error("Error handling progression:", error);
    }
  };

  // generateMajorRound removed — logic now inline in handleChallongeProgression

  const createGrandFinal = async (winnersChampion: string, losersChampion: string, _winnersMatches?: any[]) => {
    const totalTeams = (tournament ?? tournamentRef.current)?.teams_for_elimination || 8;
    const bracketSz = getBracketSize(totalTeams);
    const winnersRounds = Math.log2(bracketSz);
    const grandFinalRound = winnersRounds + 1;

    // Always query DB directly to avoid race conditions with stale in-memory state
    const { data: existingGF } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("phase", "double_elimination")
      .eq("round_number", grandFinalRound)
      .eq("is_third_place_match", false)
      .limit(1);

    if (!existingGF || existingGF.length === 0) {
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
    const bracketSz = getBracketSize(totalTeams);
    const winnersRounds = Math.log2(bracketSz);
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
  const bracketSize = getBracketSize(totalTeams);
  const byeCount = bracketSize - totalTeams;
  const winnersRoundsCount = Math.log2(bracketSize);

  const grandFinalMatches = matches
    .filter(m => !m.is_third_place_match && m.round_number > winnersRoundsCount)
    .sort((a, b) => a.round_number - b.round_number);

  const winnersMatches = matches.filter(m => !m.is_third_place_match && m.round_number <= winnersRoundsCount);
  const losersMatches = matches.filter(m => m.is_third_place_match);

  const hasReset = grandFinalMatches.length >= 2;
  // GF#1 winner is the Losers champion → a reset match (GF#2) must be created first
  // Only show the champion banner when ALL grand final matches are done AND
  // if a reset was triggered (GF#1 won by Losers champ), GF#2 must exist before declaring winner.
  const gf1 = grandFinalMatches[0] ?? null;
  const gf1WinnerIsLosersChamp = gf1?.winner_id && losersMatches.find(m => m.round_number === getLosersRoundsCount(bracketSize, byeCount) && m.winner_id)?.winner_id === gf1.winner_id;
  const resetExpected = gf1?.winner_id && gf1WinnerIsLosersChamp && !hasReset;
  const allGrandFinalsCompleted = grandFinalMatches.length > 0 && grandFinalMatches.every(m => m.winner_id) && !resetExpected;
  const decidingFinal = allGrandFinalsCompleted ? grandFinalMatches[grandFinalMatches.length - 1] : null;

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
        highlightedTeamId={highlightedTeamId}
        onTeamClick={(teamId) => setHighlightedTeamId(teamId || null)}
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
  // For BYE brackets (e.g. 12 teams in 16-slot bracket):
  //   - R1: only real matches shown (bracketSize/2 - byeCount)
  //   - R2+: full bracketSize-based slots
  const getExpectedMatchCounts = (isLosers: boolean): { round: number; count: number }[] => {
    const rounds: { round: number; count: number }[] = [];
    const byeCount = bracketSize - totalTeams;
    if (!isLosers) {
      for (let r = 1; r <= winnersRoundsCount; r++) {
        let count = Math.pow(2, winnersRoundsCount - r);
        if (r === 1 && byeCount > 0) {
          // Only real R1 matches: bracketSize/2 slots minus BYE slots
          count = bracketSize / 2 - byeCount;
        }
        if (count > 0) rounds.push({ round: r, count });
      }
    } else {
      // Losers bracket sizes based on bracketSize (for play-in: use byeCount-aware count)
      const lrCount = getLosersRoundsCount(bracketSize, byeCount);
      // For play-in brackets, effective winners rounds = log2(bracketSize/2)
      const effectiveWRounds = byeCount > 0 ? winnersRoundsCount - 1 : winnersRoundsCount;
      for (let r = 1; r <= lrCount; r++) {
        const pairIdx = Math.ceil(r / 2);
        const count = Math.max(1, Math.pow(2, effectiveWRounds - 1 - pairIdx));
        rounds.push({ round: r, count });
      }
    }
    return rounds;
  };

  const sortFnField = (a: any, b: any) => (a.field_number || 0) - (b.field_number || 0) || (a.created_at || '').localeCompare(b.created_at || '');

  /**
   * Returns a map of slotIndex → { team1, team2 } for pending (not-yet-created) match slots.
   * For BYE brackets: R2 pending slots show the known BYE seed directly alongside TBD opponent.
   */
  const getPendingTeamsForRound = (isLosers: boolean, round: number): Map<number, { team1: { name: string; teamId: string; isBye?: boolean } | null; team2: { name: string; teamId: string; isBye?: boolean } | null }> => {
    const pending = new Map<number, { team1: { name: string; teamId: string; isBye?: boolean } | null; team2: { name: string; teamId: string; isBye?: boolean } | null }>();
    const allW = winnersMatches.sort(sortFnField);
    const allL = losersMatches.sort(sortFnField);
    const byeCount = bracketSize - totalTeams;

    const teamFromMatch = (m: Match, role: 'winner' | 'loser'): { name: string; teamId: string } | null => {
      if (!m.winner_id) return null;
      const isTeam1Winner = m.winner_id === m.team1_id;
      if (role === 'winner') {
        const team = isTeam1Winner ? m.team1 : m.team2;
        const id = isTeam1Winner ? m.team1_id : m.team2_id;
        return team ? { name: team.name, teamId: id } : null;
      } else {
        const team = isTeam1Winner ? m.team2 : m.team1;
        const id = isTeam1Winner ? m.team2_id : m.team1_id;
        return team ? { name: team.name, teamId: id } : null;
      }
    };

    const isAlreadyInRound = (arr: Match[], r: number, teamId: string) =>
      arr.some(m => m.round_number === r && (m.team1_id === teamId || m.team2_id === teamId));

    if (!isLosers) {
      const currentRoundMatches = allW.filter(m => m.round_number === round).sort(sortFnField);

      if (round === 1) {
        // R1 with BYE brackets: no pending slots (BYE slots are hidden, only real matches shown)
        return pending;
      }

      if (round === 2 && byeCount > 0) {
        // R2 with BYEs: show pending slots for each bracketSize/4 R2 slot.
        // BYE teams = top byeCount seeds from standings (they skip R1 entirely).
        // standingsTeams[0] = seed #1 ... standingsTeams[byeCount-1] = seed #byeCount
        const r1Matches = allW.filter(m => m.round_number === 1).sort(sortFnField);

        // Use standard seeding to determine which R2 slot each BYE team belongs to
        const fullPairs = getStandardSeedingPairs(bracketSize);
        const r2SlotCount = bracketSize / 4;

        // Map each full-bracket pair slot to its "contributor type": bye or real
        // BYE slot: exactly one of the two seeds > totalTeams
        const slotIsBye = fullPairs.map(([s1, s2]) =>
          (s1 <= totalTeams && s2 > totalTeams) || (s2 <= totalTeams && s1 > totalTeams)
        );

        // Assign BYE teams to BYE slots using the actual seed from the pair.
        // For a BYE slot (s1 ≤ totalTeams, s2 > totalTeams) the real seed is s1.
        // standingsTeams is ordered by seed: [0]=seed1, [1]=seed2, ...
        const byeSlotToTeam = new Map<number, { name: string; teamId: string }>();
        fullPairs.forEach(([s1, s2], pairIdx) => {
          if (!slotIsBye[pairIdx]) return;
          // The real team seed is whichever is ≤ totalTeams
          const realSeed = s1 <= totalTeams ? s1 : s2;
          const team = standingsTeams[realSeed - 1]; // seed is 1-indexed
          if (team) byeSlotToTeam.set(pairIdx, team);
        });

        // Map R1 matches to their full-bracket pair slot by seed
        // R1 real matches: slots where both seeds ≤ totalTeams — in creation order = sorted by field_number
        const realR1Slots: number[] = [];
        fullPairs.forEach(([s1, s2], pairIdx) => {
          if (s1 <= totalTeams && s2 <= totalTeams) realR1Slots.push(pairIdx);
        });
        // r1Matches[k] corresponds to realR1Slots[k] (both sorted by field_number / creation order)
        const pairSlotToR1Match = new Map<number, Match>();
        realR1Slots.forEach((pairSlotIdx, k) => {
          if (r1Matches[k]) pairSlotToR1Match.set(pairSlotIdx, r1Matches[k]);
        });

        for (let r2Slot = 0; r2Slot < r2SlotCount; r2Slot++) {
          if (currentRoundMatches[r2Slot]) continue; // real match exists, skip

          const srcAIdx = r2Slot * 2;
          const srcBIdx = r2Slot * 2 + 1;

          const resolveContrib = (pairSlotIdx: number): { name: string; teamId: string; isBye?: boolean } | null => {
            if (slotIsBye[pairSlotIdx]) {
              const byeTeam = byeSlotToTeam.get(pairSlotIdx);
              return byeTeam ? { ...byeTeam, isBye: true } : null;
            } else {
              // Real R1 match — show winner if known
              const r1M = pairSlotToR1Match.get(pairSlotIdx);
              return r1M ? teamFromMatch(r1M, 'winner') : null;
            }
          };

          const contribA = resolveContrib(srcAIdx);
          const contribB = resolveContrib(srcBIdx);

          // Show this R2 slot as pending if at least one BYE is involved (or a winner is known)
          const srcAIsBye = slotIsBye[srcAIdx];
          const srcBIsBye = slotIsBye[srcBIdx];
          if (contribA || contribB || srcAIsBye || srcBIsBye) {
            pending.set(r2Slot, { team1: contribA, team2: contribB });
          }
        }
        return pending;
      }

      // R3+: pair-based advancement from previous round
      const prevRoundMatches = allW.filter(m => m.round_number === round - 1).sort(sortFnField);
      const expectedCount = Math.pow(2, winnersRoundsCount - round);
      for (let slot = 0; slot < expectedCount; slot++) {
        if (currentRoundMatches[slot]) continue;
        const srcA = prevRoundMatches[slot * 2];
        const srcB = prevRoundMatches[slot * 2 + 1];
        const t1 = srcA ? teamFromMatch(srcA, 'winner') : null;
        const t2 = srcB ? teamFromMatch(srcB, 'winner') : null;
        if (t1 || t2) pending.set(slot, { team1: t1, team2: t2 });
      }
    } else {
      // ── Losers bracket ──
      const isMinor = round % 2 === 1;
      const currentLosersRound = allL.filter(m => m.round_number === round);

      if (round === 1) {
        // L-R1 minor: losers from W-R(loserFirstWRound)
        // For play-in brackets: W-R1 losers are eliminated → use W-R2 losers instead
        const loserFeederWRound = byeCount > 0 ? 2 : 1;
        const wR1 = allW.filter(m => m.round_number === loserFeederWRound).sort(sortFnField);
        const expectedCount = Math.floor(wR1.length / 2);
        for (let k = 0; k < expectedCount; k++) {
          if (currentLosersRound[k]) continue;
          const mA = wR1[k * 2];
          const mB = wR1[k * 2 + 1];
          const t1 = mA ? teamFromMatch(mA, 'loser') : null;
          const t2 = mB ? teamFromMatch(mB, 'loser') : null;
          if (t1 || t2) {
            if (t1 && isAlreadyInRound(allL, 1, t1.teamId)) continue;
            if (t2 && isAlreadyInRound(allL, 1, t2.teamId)) continue;
            pending.set(k, { team1: t1, team2: t2 });
          }
        }
      } else if (isMinor) {
        const prevMajor = allL.filter(m => m.round_number === round - 1).sort(sortFnField);
        const pairCount = Math.floor(prevMajor.length / 2);
        for (let k = 0; k < pairCount; k++) {
          if (currentLosersRound[k]) continue;
          const mA = prevMajor[k * 2];
          const mB = prevMajor[k * 2 + 1];
          const t1 = mA ? teamFromMatch(mA, 'winner') : null;
          const t2 = mB ? teamFromMatch(mB, 'winner') : null;
          if (t1 || t2) pending.set(k, { team1: t1, team2: t2 });
        }
      } else {
        // Major round: pair W-loser (from wFeederRound) vs L-minor survivor
        const k = round / 2;
        // For play-in: wFeederRound = k + 2 (L-R2←W-R3, L-R4←W-R4)
        // Standard:    wFeederRound = k + 1 (L-R2←W-R2, L-R4←W-R3)
        const wFeederRound = byeCount > 0 ? k + 2 : k + 1;
        const prevMinorRound = round - 1;
        const wFeederMatches = allW.filter(m => m.round_number === wFeederRound).sort(sortFnField);
        const prevMinorMatches = allL.filter(m => m.round_number === prevMinorRound).sort(sortFnField);
        const slotCount = Math.max(wFeederMatches.length, prevMinorMatches.length);
        for (let slot = 0; slot < slotCount; slot++) {
          if (currentLosersRound[slot]) continue;
          const wDrop = wFeederMatches[slot] ? teamFromMatch(wFeederMatches[slot], 'loser') : null;
          const minorSurvivor = prevMinorMatches[slot] ? teamFromMatch(prevMinorMatches[slot], 'winner') : null;
          if (wDrop || minorSurvivor) pending.set(slot, { team1: wDrop, team2: minorSurvivor });
        }
      }
    }

    return pending;
  };

  const renderBracket = (realMatches: Match[], isLosers: boolean) => {
    // Use exact same layout system as Single Elimination
    const matchHeight = 148; // same as EliminationBracket
    const baseGap = 4;
    const unit = matchHeight + baseGap;
    const matchCenterY = 60; // visual center of match card (header ~20px + card center ~40px)
    const COL_W = 200;
    const CONNECTOR_W = 32;

    const expectedRounds = getExpectedMatchCounts(isLosers);
    if (expectedRounds.length === 0) return null;

    const matchByRound = new Map<number, Match[]>();
    realMatches.forEach(m => {
      if (!matchByRound.has(m.round_number)) matchByRound.set(m.round_number, []);
      matchByRound.get(m.round_number)!.push(m);
    });

    // Pre-compute pending teams for every round
    const pendingByRound = new Map<number, ReturnType<typeof getPendingTeamsForRound>>();
    getExpectedMatchCounts(isLosers).forEach(({ round }) => {
      pendingByRound.set(round, getPendingTeamsForRound(isLosers, round));
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

            const roundName = isLosers
              ? getLosersRoundName(round, bracketSize, byeCount)
              : getWinnersRoundName(round, bracketSize, byeCount);
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
                    ? (isLosers ? "bg-orange-500/20 border border-orange-500/30 text-orange-500" : "bg-primary/20 border border-primary/30 text-primary")
                    : (isLosers ? "bg-orange-500/10 border border-orange-500/20 text-orange-500/80" : "bg-muted/50 text-foreground")
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
                      const pendingSlot = pendingByRound.get(round)?.get(slotIdx);
                      const t1 = pendingSlot?.team1 ?? null;
                      const t2 = pendingSlot?.team2 ?? null;
                      const hasPending = !!(t1 || t2);
                      const isLoserSlot = isLosers;

                      const renderTeamSlot = (t: typeof t1, mb: boolean) => (
                        <div className={cn(
                          "flex items-center gap-2 py-1.5 px-2 rounded border",
                          mb ? "mb-1" : "",
                          t
                            ? (isLoserSlot ? "bg-orange-500/10 border-orange-500/20" : "bg-primary/10 border-primary/20")
                            : "bg-muted/20 border-dashed border-border/30"
                        )}>
                          {t ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              {isLoserSlot && <Skull className="h-3 w-3 text-orange-500 shrink-0" />}
                              <span className="text-sm font-semibold text-foreground truncate">{t.name}</span>
                              {(t as any).isBye && (
                                <span className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                                  BYE
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">TBD</span>
                          )}
                        </div>
                      );

                      return (
                        <div
                          key={`tbd-${round}-${slotIdx}`}
                          className={cn(
                            "rounded-lg border flex flex-col justify-center px-3",
                            hasPending
                              ? (isLoserSlot ? "border-orange-500/40 bg-orange-500/5" : "border-primary/30 bg-primary/5")
                              : "border-dashed border-border/30 bg-muted/10 items-center"
                          )}
                          style={{ height: `${matchHeight}px`, width: COL_W }}
                        >
                          {hasPending ? (
                            <>
                              <p className="text-xs text-muted-foreground mb-1.5 font-medium">En attente…</p>
                              {renderTeamSlot(t1, true)}
                              {renderTeamSlot(t2, false)}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 font-medium">TBD</span>
                          )}
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

  const liveWinnersMatches = winnersMatches.some(m => activeStationMatches.has(m.id));
  const liveLosersMatches = losersMatches.some(m => activeStationMatches.has(m.id));
  const liveFinalsMatches = grandFinalMatches.some(m => activeStationMatches.has(m.id));

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTournamentAndMatches} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
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
              {liveWinnersMatches && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
              {pendingWinnersMatches > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{pendingWinnersMatches}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="losers" className="gap-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white">
              <Skull className="h-4 w-4" />
              <span className="hidden sm:inline">Losers</span>
              {liveLosersMatches && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
              {pendingLosersMatches > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{pendingLosersMatches}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="finals" className="gap-2 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Finals</span>
              {liveFinalsMatches && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
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
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-orange-500/40">
              <Skull className="h-5 w-5 text-orange-500" />
              <h3 className="text-lg font-semibold text-orange-500">Losers Bracket</h3>
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

            {grandFinalMatches.length === 0 ? (() => {
              // Show pending Grand Final with known teams
              const winnersChampion = winnersMatches.find(m => m.round_number === winnersRoundsCount && m.winner_id);
              const losersChampion = losersMatches.find(m => m.round_number === getLosersRoundsCount(bracketSize, byeCount) && m.winner_id);
              const wTeam = winnersChampion ? (winnersChampion.winner_id === winnersChampion.team1_id ? winnersChampion.team1 : winnersChampion.team2) : null;
              const lTeam = losersChampion ? (losersChampion.winner_id === losersChampion.team1_id ? losersChampion.team1 : losersChampion.team2) : null;

              return (
                <div className="flex flex-col items-center gap-6 max-w-sm mx-auto">
                  <div className="text-center text-xs text-muted-foreground mb-0 font-medium">Grand Final</div>
                  {/* Pending Grand Final card */}
                  <div className="w-full rounded-xl border-2 border-yellow-500/40 bg-yellow-500/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
                      <Trophy className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-bold text-yellow-500">Grande Finale</span>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      {/* Winners side */}
                      <div className={cn(
                        "flex items-center gap-2 py-2 px-3 rounded-lg border",
                        wTeam ? "bg-primary/10 border-primary/30" : "bg-muted/20 border-dashed border-border/30"
                      )}>
                        <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                        {wTeam ? (
                          <span className="text-sm font-semibold text-foreground truncate">{wTeam.name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">En attente du champion Winners…</span>
                        )}
                      </div>
                      <div className="text-center text-xs text-muted-foreground font-bold">VS</div>
                      {/* Losers side */}
                      <div className={cn(
                        "flex items-center gap-2 py-2 px-3 rounded-lg border",
                        lTeam ? "bg-orange-500/10 border-orange-500/30" : "bg-muted/20 border-dashed border-border/30"
                      )}>
                        <Skull className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        {lTeam ? (
                          <span className="text-sm font-semibold text-foreground truncate">{lTeam.name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">En attente du champion Losers…</span>
                        )}
                      </div>
                    </div>
                    <div className="px-4 pb-3">
                      <p className="text-xs text-muted-foreground/70 text-center leading-relaxed">
                        Si le champion Winners gagne → 🏆 Champion<br/>
                        Si le champion Losers gagne → 🔁 Bracket Reset (M2)
                      </p>
                    </div>
                  </div>
                  {/* Reset placeholder */}
                  <div className="w-full rounded-xl border border-dashed border-destructive/30 bg-destructive/5 overflow-hidden opacity-60">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-destructive/20">
                      <RotateCcw className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-sm font-semibold text-destructive/80">Bracket Reset (M2)</span>
                      <span className="text-xs text-muted-foreground ml-auto">Si nécessaire</span>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg border bg-muted/10 border-dashed border-border/30">
                        <span className="text-xs text-muted-foreground italic">TBD</span>
                      </div>
                      <div className="text-center text-xs text-muted-foreground font-bold">VS</div>
                      <div className="flex items-center gap-2 py-2 px-3 rounded-lg border bg-muted/10 border-dashed border-border/30">
                        <span className="text-xs text-muted-foreground italic">TBD</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : (
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
            // Fetch the updated match from DB to get the fresh winner_id after score correction
            const { data: updatedMatch } = await supabase
              .from("matches")
              .select(`*, team1:teams!matches_team1_id_fkey(id, name), team2:teams!matches_team2_id_fkey(id, name)`)
              .eq("id", selectedMatch.id)
              .single();
            await fetchTournamentAndMatches();
            if (updatedMatch?.winner_id) {
              const loserId = updatedMatch.winner_id === updatedMatch.team1_id ? updatedMatch.team2_id : updatedMatch.team1_id;
              await handleChallongeProgression(updatedMatch as Match, updatedMatch.winner_id, loserId);
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


      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Réinitialiser le bracket ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cela va <strong>supprimer définitivement tous les matchs</strong> de la double élimination et régénérer le bracket depuis zéro. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setResetConfirmOpen(false); handleResetBracket(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
