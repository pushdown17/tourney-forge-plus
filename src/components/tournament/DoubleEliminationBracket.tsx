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
 * Standard seeding pairs for a bracket of given size.
 * e.g. 8 teams: [1,8],[4,5],[3,6],[2,7]
 * e.g. 16 teams: [1,16],[8,9],[5,12],[4,13],[3,14],[6,11],[7,10],[2,15]
 */
function getStandardSeedingPairs(count: number): [number, number][] {
  const pairs: [number, number][] = [];
  const buildBracket = (seeds: number[]): [number, number][] => {
    if (seeds.length === 2) return [[seeds[0], seeds[1]]];
    const half = seeds.length / 2;
    const top: number[] = [];
    const bottom: number[] = [];
    for (let i = 0; i < seeds.length; i++) {
      if (i % 2 === 0) top.push(seeds[i]);
      else bottom.push(seeds[i]);
    }
    const result: [number, number][] = [];
    const topPairs = buildBracket(top);
    const bottomPairs = buildBracket(bottom.reverse());
    for (let i = 0; i < topPairs.length; i++) {
      result.push(topPairs[i]);
      result.push(bottomPairs[i]);
    }
    return result;
  };

  // Build initial seed list and create standard bracket
  const seeds = Array.from({ length: count }, (_, i) => i + 1);
  // Standard bracket: 1 vs last, then recurse
  const makePairs = (s: number[]): [number, number][] => {
    if (s.length === 2) return [[s[0], s[1]]];
    const result: [number, number][] = [];
    const top = s.slice(0, s.length / 2);
    const bottom = s.slice(s.length / 2).reverse();
    for (let i = 0; i < top.length; i++) {
      result.push(...makePairs([top[i], bottom[i]]));
    }
    return result;
  };
  return makePairs(seeds);
}

const getLosersRoundsCount = (totalTeams: number): number => {
  return (Math.log2(totalTeams) - 1) * 2;
};

const getRoundName = (roundNumber: number, totalTeams: number, isLosers: boolean) => {
  const winnersRounds = Math.log2(totalTeams);

  if (isLosers) {
    const losersRoundsCount = getLosersRoundsCount(totalTeams);
    if (roundNumber === losersRoundsCount) return "Losers Final";
    if (roundNumber === losersRoundsCount - 1) return "Losers Semi";
    const isMinor = roundNumber % 2 === 1;
    return `L-R${roundNumber} ${isMinor ? "(Minor)" : "(Major)"}`;
  }

  if (roundNumber === winnersRounds + 2) return "Grand Final #2 (Reset)";
  if (roundNumber === winnersRounds + 1) return "Grand Final";
  if (roundNumber === winnersRounds) return "Winners Final";
  if (roundNumber === winnersRounds - 1) return "Winners Semi";
  if (roundNumber === winnersRounds - 2) {
    if (totalTeams >= 16) return "Winners QF";
    return "Winners Semi";
  }
  if (totalTeams >= 16 && roundNumber === 1) return "Round of 16";
  return `W-R${roundNumber}`;
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
    const channel = supabase
      .channel(`tournament-live-de-${tournamentId}`)
      .on('broadcast', { event: 'live_score' }, (payload) => {
        const { matchId } = payload.payload;
        if (matchId) setLiveMatches(prev => new Set([...prev, matchId]));
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referee_stations', filter: `tournament_id=eq.${tournamentId}` }, () => {
        fetchActiveTimers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
      }
    } catch (error: any) {
      toast.error("Error loading bracket");
      console.error(error);
    } finally {
      setLoading(false);
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

      // Use standard seeding pairs
      const pairs = getStandardSeedingPairs(teamsCount);
      const allMatches = pairs.map((pair, i) => ({
        tournament_id: tournamentId,
        phase: "double_elimination" as const,
        round_number: 1,
        team1_id: standings[pair[0] - 1].team_id,
        team2_id: standings[pair[1] - 1].team_id,
        field_number: (i % (numberOfFields || 1)) + 1,
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

      const winnersMatches = allMatches?.filter(m => !m.is_third_place_match) || [];
      const losersMatches = allMatches?.filter(m => m.is_third_place_match) || [];

      const grandFinalRound1 = winnersRounds + 1;
      const grandFinalRound2 = winnersRounds + 2;
      const losersRoundsCount = getLosersRoundsCount(totalTeams);

      // Grand Final reset logic
      if (!isLosersBracket && roundNumber >= grandFinalRound1) {
        const winnersFinalWinner = winnersMatches.find(m => m.round_number === winnersRounds)?.winner_id || null;
        const losersFinalWinner = losersMatches.find(m => m.round_number === losersRoundsCount)?.winner_id || null;

        if (roundNumber === grandFinalRound1) {
          if (winnersFinalWinner && losersFinalWinner && winnerId === losersFinalWinner && winnerId !== winnersFinalWinner) {
            await createGrandFinalReset(winnersFinalWinner, losersFinalWinner, winnersMatches);
            toast.success("🔁 Bracket Reset! Grand Final #2 created!", { duration: 5000 });
            // Switch to finals tab
            setActiveTab("finals");
          }
        }

        await fetchTournamentAndMatches();
        return;
      }

      const matchesToCreate: any[] = [];

      if (!isLosersBracket) {
        // WINNERS BRACKET LOGIC
        const currentRoundMatches = winnersMatches.filter(m => m.round_number === roundNumber);
        const allCompleted = currentRoundMatches.every(m => m.winner_id);

        if (allCompleted) {
          if (currentRoundMatches.length >= 2) {
            // Pair winners correctly: preserve bracket position
            const sortedMatches = currentRoundMatches.sort((a, b) => (a.field_number || 0) - (b.field_number || 0));
            const nextRound = roundNumber + 1;
            const existingNextRound = winnersMatches.filter(m => m.round_number === nextRound);

            for (let i = 0; i < sortedMatches.length; i += 2) {
              if (i + 1 >= sortedMatches.length) break;
              const w1 = sortedMatches[i].winner_id;
              const w2 = sortedMatches[i + 1].winner_id;
              const exists = existingNextRound.some(m =>
                (m.team1_id === w1 && m.team2_id === w2) || (m.team1_id === w2 && m.team2_id === w1)
              );
              if (!exists && w1 && w2) {
                matchesToCreate.push({
                  tournament_id: tournamentId, phase: "double_elimination",
                  round_number: nextRound, team1_id: w1, team2_id: w2,
                  is_third_place_match: false,
                  field_number: Math.floor(i / 2) % (numberOfFields || 1) + 1,
                });
              }
            }
          }

          // Losers bracket: inject losers
          const losers = currentRoundMatches
            .sort((a, b) => (a.field_number || 0) - (b.field_number || 0))
            .map(m => m.winner_id === m.team1_id ? m.team2_id : m.team1_id);

          if (roundNumber === 1) {
            // W-R1 losers → L-R1 (Minor: losers play each other, flipped to avoid rematches)
            const flippedLosers = [...losers].reverse();
            for (let i = 0; i < flippedLosers.length; i += 2) {
              if (i + 1 >= flippedLosers.length) break;
              const exists = losersMatches.some(m =>
                m.round_number === 1 &&
                ((m.team1_id === flippedLosers[i] && m.team2_id === flippedLosers[i + 1]) ||
                 (m.team1_id === flippedLosers[i + 1] && m.team2_id === flippedLosers[i]))
              );
              if (!exists) {
                matchesToCreate.push({
                  tournament_id: tournamentId, phase: "double_elimination",
                  round_number: 1, team1_id: flippedLosers[i], team2_id: flippedLosers[i + 1],
                  is_third_place_match: true,
                  field_number: (Math.floor(i / 2)) % (numberOfFields || 1) + 1,
                });
              }
            }
          } else {
            await generateMajorRound(losersMatches, losers, roundNumber);
          }
        }

        // Check for Grand Final
        if (roundNumber === winnersRounds && winnerId) {
          const losersFinal = losersMatches.find(m => m.round_number === losersRoundsCount && m.winner_id);
          if (losersFinal?.winner_id) {
            await createGrandFinal(winnerId, losersFinal.winner_id, winnersMatches);
            setActiveTab("finals");
          }
        }

      } else {
        // LOSERS BRACKET LOGIC
        const currentLosersRound = losersMatches.filter(m => m.round_number === roundNumber);
        const allCompleted = currentLosersRound.every(m => m.winner_id);

        if (allCompleted) {
          const survivors = currentLosersRound
            .sort((a, b) => (a.field_number || 0) - (b.field_number || 0))
            .map(m => m.winner_id);

          const isMinorRound = roundNumber % 2 === 1;

          if (roundNumber < losersRoundsCount) {
            if (isMinorRound && survivors.length >= 1) {
              const correspondingWinnersRound = Math.ceil(roundNumber / 2) + 1;
              const droppingLosers = winnersMatches
                .filter(m => m.round_number === correspondingWinnersRound && m.winner_id)
                .sort((a, b) => (a.field_number || 0) - (b.field_number || 0))
                .map(m => m.winner_id === m.team1_id ? m.team2_id : m.team1_id);

              if (droppingLosers.length === survivors.length) {
                const nextRound = roundNumber + 1;
                const existingNextRound = losersMatches.filter(m => m.round_number === nextRound);

                for (let i = 0; i < survivors.length; i++) {
                  const droppingLoser = droppingLosers[survivors.length - 1 - i];
                  const exists = existingNextRound.some(m =>
                    (m.team1_id === survivors[i] && m.team2_id === droppingLoser) ||
                    (m.team1_id === droppingLoser && m.team2_id === survivors[i])
                  );
                  if (!exists && survivors[i] && droppingLoser) {
                    matchesToCreate.push({
                      tournament_id: tournamentId, phase: "double_elimination",
                      round_number: nextRound, team1_id: droppingLoser, team2_id: survivors[i],
                      is_third_place_match: true,
                      field_number: i % (numberOfFields || 1) + 1,
                    });
                  }
                }
              }
            } else if (!isMinorRound) {
              const nextRound = roundNumber + 1;
              const existingNextRound = losersMatches.filter(m => m.round_number === nextRound);

              for (let i = 0; i < survivors.length; i += 2) {
                if (i + 1 >= survivors.length) break;
                const exists = existingNextRound.some(m =>
                  (m.team1_id === survivors[i] && m.team2_id === survivors[i + 1]) ||
                  (m.team1_id === survivors[i + 1] && m.team2_id === survivors[i])
                );
                if (!exists && survivors[i] && survivors[i + 1]) {
                  matchesToCreate.push({
                    tournament_id: tournamentId, phase: "double_elimination",
                    round_number: nextRound, team1_id: survivors[i], team2_id: survivors[i + 1],
                    is_third_place_match: true, field_number: 1,
                  });
                }
              }
            }
          }

          // Check for Grand Final after Losers Final
          if (survivors.length === 1 && roundNumber === losersRoundsCount) {
            const winnersFinal = winnersMatches.find(m => m.round_number === winnersRounds && m.winner_id);
            if (winnersFinal?.winner_id) {
              await createGrandFinal(winnersFinal.winner_id, survivors[0]!, winnersMatches);
              setActiveTab("finals");
            }
          }
        }
      }

      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase.from("matches").insert(matchesToCreate);
        if (insertError) throw insertError;
        toast.success("Next match(es) generated!");
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error handling progression:", error);
    }
  };

  const generateMajorRound = async (losersMatches: any[], droppingLosers: string[], winnersRound: number) => {
    const previousLosersRound = (winnersRound - 1) * 2 - 1;
    const previousRoundMatches = losersMatches.filter(m => m.round_number === previousLosersRound);
    if (!previousRoundMatches.every(m => m.winner_id)) return;

    const minorRoundWinners = previousRoundMatches
      .sort((a, b) => (a.field_number || 0) - (b.field_number || 0))
      .map(m => m.winner_id);

    if (minorRoundWinners.length !== droppingLosers.length) return;

    const majorRound = previousLosersRound + 1;
    const existingMajorRound = losersMatches.filter(m => m.round_number === majorRound);
    const matchesToCreate: any[] = [];

    for (let i = 0; i < droppingLosers.length; i++) {
      const minorWinner = minorRoundWinners[droppingLosers.length - 1 - i];
      const exists = existingMajorRound.some(m =>
        (m.team1_id === droppingLosers[i] && m.team2_id === minorWinner) ||
        (m.team1_id === minorWinner && m.team2_id === droppingLosers[i])
      );
      if (!exists && droppingLosers[i] && minorWinner) {
        matchesToCreate.push({
          tournament_id: tournamentId, phase: "double_elimination",
          round_number: majorRound, team1_id: droppingLosers[i], team2_id: minorWinner,
          is_third_place_match: true, field_number: 1,
        });
      }
    }

    if (matchesToCreate.length > 0) {
      const { error } = await supabase.from("matches").insert(matchesToCreate);
      if (error) throw error;
    }
  };

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

  const createGrandFinalReset = async (winnersChampion: string, losersChampion: string, winnersMatches: any[]) => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const winnersRounds = Math.log2(totalTeams);
    const resetRound = winnersRounds + 2;

    const exists = winnersMatches.some(m =>
      m.round_number === resetRound &&
      ((m.team1_id === winnersChampion && m.team2_id === losersChampion) ||
       (m.team1_id === losersChampion && m.team2_id === winnersChampion))
    );

    if (!exists) {
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
        team1Players={playersByTeam[match.team1_id] || []}
        team2Players={playersByTeam[match.team2_id] || []}
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
        onIncrementScore={(teamId, teamName) => {
          if (isLocked || isMatchCompleted) { toast.error(isMatchCompleted ? "Match finished" : "Complete previous round first"); return; }
          setScoringTeam({ id: teamId, name: teamName, matchId: match.id });
          setGoalScorerDialogOpen(true);
        }}
      />
    );
  };

  const renderBracket = (bracketMatches: Match[], isLosers: boolean) => {
    const structure = generateBracketStructure(bracketMatches);

    if (structure.length === 0) {
      return (
        <div className="text-center py-12">
          {isLosers ? <Skull className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" /> : <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />}
          <p className="text-muted-foreground">
            {isLosers ? "Complete winners bracket matches to generate losers bracket" : "No matches generated yet"}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-8 min-w-max px-4">
          {structure.map((roundMatches, roundIndex) => {
            const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
            const matchHeight = 124;
            const baseGap = 16;
            const unit = matchHeight + baseGap;
            const verticalGap = isLosers ? baseGap : unit * Math.pow(2, roundIndex) - matchHeight;
            const topOffset = isLosers ? 0 : unit * (Math.pow(2, roundIndex) - 1) / 2;

            return (
              <div key={`${isLosers ? 'L' : 'W'}-${roundNumber}`} className="flex flex-col" style={{ minWidth: "220px" }}>
                <div className={cn(
                  "text-center mb-4 py-2 px-4 rounded-lg",
                  isLosers ? "bg-destructive/10 border border-destructive/20" : "bg-primary/10 border border-primary/20"
                )}>
                  <span className={cn("text-sm font-bold", isLosers ? "text-destructive" : "text-primary")}>
                    {getRoundName(roundNumber, totalTeams, isLosers)}
                  </span>
                </div>

                <div className="flex flex-col relative" style={{ gap: `${verticalGap}px`, marginTop: `${topOffset}px` }}>
                  {/* SVG connectors for winners bracket */}
                  {!isLosers && (
                    <svg className="absolute left-full top-0 pointer-events-none" style={{ width: "32px", height: "100%", overflow: "visible" }}>
                      {roundMatches.map((_, matchIndex) => {
                        if (matchIndex % 2 !== 0 || matchIndex + 1 >= roundMatches.length) return null;
                        const totalHeight = matchHeight + verticalGap;
                        const baseY = matchIndex * totalHeight;
                        const y1 = baseY + matchHeight / 2;
                        const y2 = baseY + totalHeight + matchHeight / 2;
                        const yMid = (y1 + y2) / 2;
                        const color = "hsl(var(--primary))";
                        return (
                          <g key={matchIndex} className="animate-fade-in">
                            <line x1="0" y1={y1} x2="16" y2={y1} stroke={color} strokeWidth="2" className="opacity-30" />
                            <line x1="0" y1={y2} x2="16" y2={y2} stroke={color} strokeWidth="2" className="opacity-30" />
                            <line x1="16" y1={y1} x2="16" y2={y2} stroke={color} strokeWidth="2" className="opacity-30" />
                            <line x1="16" y1={yMid} x2="32" y2={yMid} stroke={color} strokeWidth="2" className="opacity-30" />
                          </g>
                        );
                      })}
                    </svg>
                  )}
                  {roundMatches.map(match => renderMatchCard(match, bracketMatches, isLosers))}
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
            {losersMatches.length === 0 ? (
              <div className="text-center py-12">
                <Skull className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-muted-foreground">Complete Round 1 of the Winners Bracket to generate the Losers Bracket</p>
              </div>
            ) : renderBracket(losersMatches, true)}
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
    </Card>
  );
};
