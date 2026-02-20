import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BracketMatch } from "./BracketMatch";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsRecapDialog } from "./MatchStatsRecapDialog";
import { DoubleEliminationBracket } from "./DoubleEliminationBracket";
import { SendToStationDialog } from "./SendToStationDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Medal } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  created_at?: string;
}

interface EliminationBracketProps {
  tournamentId: string;
  eliminationType: "single" | "double" | null;
  currentPhase: string;
  onPhaseChanged: () => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

export const EliminationBracket = ({ 
  tournamentId, 
  eliminationType, 
  currentPhase,
  onPhaseChanged,
  isClosed = false,
  isCreator = false
}: EliminationBracketProps) => {
  // If double elimination, use dedicated component
  if (eliminationType === "double" || currentPhase === "double_elimination") {
    return (
      <DoubleEliminationBracket
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
        isClosed={isClosed}
        isCreator={isCreator}
      />
    );
  }

  // If not yet in elimination phase, show transition component
  if (currentPhase !== "single_elimination" && currentPhase !== "double_elimination") {
    return (
      <PhaseTransition 
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
        isCreator={isCreator}
      />
    );
  }

  // If in elimination phase but no type defined
  if (!eliminationType) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground">
          Tournament configuration error.
        </p>
      </Card>
    );
  }

  // Active elimination phase
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
  const [thirdPlaceDialogOpen, setThirdPlaceDialogOpen] = useState(false);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [stationMatch, setStationMatch] = useState<{ id: string; label: string } | null>(null);
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
  const [activeStationMatches, setActiveStationMatches] = useState<Set<string>>(new Set());
  const [seedToTeam, setSeedToTeam] = useState<Map<number, Team>>(new Map());
  const [matchTimers, setMatchTimers] = useState<{ [matchId: string]: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  }}>({});
  const [pendingFinalMatches, setPendingFinalMatches] = useState<{
    finale: any;
    thirdPlace: any;
  } | null>(null);
  const thirdPlaceDecisionMadeRef = useRef(false);

  useEffect(() => {
    fetchTournamentAndMatches();
    fetchActiveTimers();
  }, [tournamentId]);

  // Fetch active timers from referee stations
  const fetchActiveTimers = async () => {
    const { data: stations, error } = await supabase
      .from('referee_stations')
      .select('current_match_id, timer_duration_seconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused')
      .eq('tournament_id', tournamentId)
      .not('current_match_id', 'is', null);
    
    if (error || !stations) return;
    
    const timers: { [matchId: string]: { durationSeconds: number; startedAt: string | null; pausedAt: string | null; elapsedWhenPaused: number } } = {};
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
          liveMatchIds.push(station.current_match_id);
        }
      }
    });
    
    setMatchTimers(timers);
    setLiveMatches(new Set(liveMatchIds));
    setActiveStationMatches(new Set(stationMatchIds));
  };

  // Realtime subscription for saved score updates (database changes)
  useEffect(() => {
    console.log('Setting up realtime DB subscription for tournament:', tournamentId);
    
    const channel = supabase
      .channel(`matches-realtime-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches'
        },
        (payload) => {
          console.log('Realtime DB event received:', payload);
          
          // Only process updates for this tournament
          if (payload.new && (payload.new as any).tournament_id === tournamentId) {
            console.log('Match updated in realtime:', payload.new);
            const updatedMatch = payload.new as any;
            const oldMatch = payload.old as any;
            
            setMatches(prevMatches => 
              prevMatches.map(match => {
                if (match.id === updatedMatch.id) {
                  return {
                    ...match,
                    team1_score: updatedMatch.team1_score,
                    team2_score: updatedMatch.team2_score,
                    winner_id: updatedMatch.winner_id,
                  };
                }
                return match;
              })
            );

            // Always refresh to show newly created matches (from station or other clients)
            // Note: next round generation is handled by the referee station or by manual score entry (handleScoreUpdate).
            // We do NOT call checkAndGenerateNextRound here to avoid duplicate match creation race conditions.
            if (updatedMatch.winner_id && (!oldMatch || !oldMatch.winner_id)) {
              setTimeout(() => fetchTournamentAndMatches(), 2000);
            }
            
            // If match was inserted (new match created externally), refresh
            if (payload.eventType === 'INSERT') {
              fetchTournamentAndMatches();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime DB subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime DB subscription');
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  // Realtime subscription for referee station timer updates
  useEffect(() => {
    console.log('Setting up realtime referee_stations subscription for tournament:', tournamentId);
    
    const channel = supabase
      .channel(`stations-timer-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'referee_stations',
          filter: `tournament_id=eq.${tournamentId}`
        },
        (payload) => {
          console.log('Referee station update received:', payload);
          const station = payload.new as any;
          
          if (station.current_match_id) {
            // Track as active station match
            setActiveStationMatches(prev => new Set(prev).add(station.current_match_id));
            // Update timer state from DB
            if (station.timer_duration_seconds) {
              setMatchTimers(prev => ({
                ...prev,
                [station.current_match_id]: {
                  durationSeconds: station.timer_duration_seconds,
                  startedAt: station.timer_started_at,
                  pausedAt: station.timer_paused_at,
                  elapsedWhenPaused: station.timer_elapsed_when_paused || 0
                }
              }));
              setLiveMatches(prev => new Set(prev).add(station.current_match_id));
            }
          } else {
            // Match removed from station - check old value
            const oldMatchId = (payload.old as any)?.current_match_id;
            if (oldMatchId) {
              setActiveStationMatches(prev => {
                const next = new Set(prev);
                next.delete(oldMatchId);
                return next;
              });
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Referee stations subscription status:', status);
      });

    return () => {
      console.log('Cleaning up referee stations subscription');
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  // Live broadcast subscription for real-time score updates (before save) and timer updates
  useEffect(() => {
    console.log('Setting up live broadcast subscription for tournament:', tournamentId);
    
    const liveTimeouts: { [matchId: string]: NodeJS.Timeout } = {};
    
    const channel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on(
        'broadcast',
        { event: 'live_score' },
        (payload) => {
          console.log('Live score broadcast received:', payload);
          
          const { matchId, team1_score, team2_score } = payload.payload;
          
          // Mark match as live
          setLiveMatches(prev => new Set(prev).add(matchId));
          
          // Clear existing timeout for this match
          if (liveTimeouts[matchId]) {
            clearTimeout(liveTimeouts[matchId]);
          }
          
          // Only set timeout to remove live status if there's no active timer for this match
          // Check if match has a timer - if so, don't auto-remove live status
          setMatchTimers(currentTimers => {
            if (!currentTimers[matchId]) {
              // No timer, set timeout to remove live status after 10 seconds
              liveTimeouts[matchId] = setTimeout(() => {
                setLiveMatches(prev => {
                  const next = new Set(prev);
                  next.delete(matchId);
                  return next;
                });
              }, 10000);
            }
            return currentTimers;
          });
          
          setMatches(prevMatches => 
            prevMatches.map(match => {
              if (match.id === matchId) {
                return {
                  ...match,
                  team1_score,
                  team2_score,
                };
              }
              return match;
            })
          );
        }
      )
      .on(
        'broadcast',
        { event: 'timer_update' },
        (payload) => {
          console.log('Timer update broadcast received:', payload);
          
          const { matchId, action, durationSeconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused } = payload.payload;
          
          // Mark match as live when it has a timer (regardless of action)
          if (action !== 'reset') {
            setLiveMatches(prev => new Set(prev).add(matchId));
          }
          
          // Update timer state
          setMatchTimers(prev => ({
            ...prev,
            [matchId]: {
              durationSeconds: durationSeconds ?? prev[matchId]?.durationSeconds ?? 0,
              startedAt: timer_started_at,
              pausedAt: timer_paused_at,
              elapsedWhenPaused: timer_elapsed_when_paused ?? prev[matchId]?.elapsedWhenPaused ?? 0
            }
          }));
          
          // If timer is reset, remove live status after a delay
          if (action === 'reset') {
            setTimeout(() => {
              setLiveMatches(prev => {
                const next = new Set(prev);
                next.delete(matchId);
                return next;
              });
              setMatchTimers(prev => {
                const next = { ...prev };
                delete next[matchId];
                return next;
              });
            }, 2000);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'match_ended' },
        (payload) => {
          console.log('Match ended broadcast received:', payload);
          const { matchId } = payload.payload;
          
          // Remove from live matches
          setLiveMatches(prev => {
            const next = new Set(prev);
            next.delete(matchId);
            return next;
          });
          
          // Remove timer state
          setMatchTimers(prev => {
            const next = { ...prev };
            delete next[matchId];
            return next;
          });
          
          // Refresh matches to get final scores
          // Note: Matches will be updated via the postgres_changes subscription
        }
      )
      .subscribe((status) => {
        console.log('Live broadcast subscription status:', status);
      });

    return () => {
      console.log('Cleaning up live broadcast subscription');
      // Clear all timeouts
      Object.values(liveTimeouts).forEach(timeout => clearTimeout(timeout));
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  // Auto-detect when semis are complete (from station) and 3rd place decision is needed
  useEffect(() => {
    if (!tournament || !isCreator || thirdPlaceDecisionMadeRef.current) return;

    const totalTeams = tournament.teams_for_elimination;
    if (!totalTeams) return;
    const { bracketSize } = computeBracketParams(totalTeams);
    const totalRounds = Math.log2(bracketSize);
    const semiRound = totalRounds - 1;
    const finalRound = totalRounds;

    const semiMatches = matches.filter(m => m.round_number === semiRound && !m.is_third_place_match);
    const finalMatch = matches.find(m => m.round_number === finalRound && !m.is_third_place_match);
    const thirdPlace = matches.find(m => m.is_third_place_match);
    const isFinaleOnStation = activeStationMatches.has(finalMatch?.id || '');

    if (semiMatches.length === 2 &&
        semiMatches.every(m => m.winner_id) &&
        finalMatch && !finalMatch.winner_id &&
        !thirdPlace &&
        !thirdPlaceDialogOpen &&
        !pendingFinalMatches &&
        !isFinaleOnStation) {

      const sortedSemis = [...semiMatches].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const loser1 = sortedSemis[0].winner_id === sortedSemis[0].team1_id
        ? sortedSemis[0].team2_id : sortedSemis[0].team1_id;
      const loser2 = sortedSemis[1].winner_id === sortedSemis[1].team1_id
        ? sortedSemis[1].team2_id : sortedSemis[1].team1_id;

      setPendingFinalMatches({
        finale: null,
        thirdPlace: {
          tournament_id: tournamentId,
          phase: currentPhase as any,
          round_number: finalRound,
          team1_id: loser1,
          team2_id: loser2,
          is_third_place_match: true,
          field_number: 2,
        }
      });
      setThirdPlaceDialogOpen(true);
    }
  }, [matches, tournament, isCreator, activeStationMatches]);

  const fetchTournamentAndMatches = async () => {
    setLoading(true);
    try {
      // Get tournament info
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      setTournament(tournamentData);
      setNumberOfFields(tournamentData.number_of_fields || 1);

      // Fetch matches and standings in parallel
      const [matchesResult, standingsResult] = await Promise.all([
        supabase
          .from("matches")
          .select(`
            *,
            team1:teams!matches_team1_id_fkey(id, name),
            team2:teams!matches_team2_id_fkey(id, name)
          `)
          .eq("tournament_id", tournamentId)
          .eq("phase", currentPhase)
          .order("round_number", { ascending: true }),
        supabase
          .from("team_stats")
          .select("team_id, points, goals_for, goals_against, team:teams!team_stats_team_id_fkey(id, name)")
          .eq("tournament_id", tournamentId)
          .order("points", { ascending: false })
          .order("goals_for", { ascending: false })
      ]);

      if (matchesResult.error) throw matchesResult.error;
      
      // Build seed map from standings
      const seedMap = new Map<string, number>();
      const reverseSeedMap = new Map<number, Team>();
      if (standingsResult.data) {
        standingsResult.data.forEach((stat: any, index: number) => {
          seedMap.set(stat.team_id, index + 1);
          if (stat.team) {
            reverseSeedMap.set(index + 1, { id: stat.team.id, name: stat.team.name, seed: index + 1 });
          }
        });
      }
      setSeedToTeam(reverseSeedMap);

      // No BYE logic: if teams_for_elimination isn't a power of 2, we rely on a preliminary round.


      // Attach seed to teams
      const matchesWithSeeds = (matchesResult.data || []).map(match => ({
        ...match,
        team1: match.team1 ? { ...match.team1, seed: seedMap.get(match.team1.id) } : match.team1,
        team2: match.team2 ? { ...match.team2, seed: seedMap.get(match.team2.id) } : match.team2,
      }));

      setMatches(matchesWithSeeds);
      if (!matchesResult.data || matchesResult.data.length === 0) {
        // Auto-generate matches
        await generateBracket(tournamentData.teams_for_elimination);
      }
    } catch (error: any) {
      toast.error("Error loading bracket");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Helper: compute bracket parameters for any team count
  const computeBracketParams = (teamsCount: number) => {
    if (teamsCount <= 1) return { bracketSize: 2, numPreliminaryMatches: 0, numByes: 2 - teamsCount };
    const lowerBracket = Math.pow(2, Math.floor(Math.log2(teamsCount)));
    if (lowerBracket === teamsCount) {
      return { bracketSize: lowerBracket, numPreliminaryMatches: 0, numByes: 0 };
    }
    const numPrelim = teamsCount - lowerBracket;
    if (numPrelim <= lowerBracket / 2) {
      return { bracketSize: lowerBracket, numPreliminaryMatches: numPrelim, numByes: 0 };
    }
    return { bracketSize: lowerBracket * 2, numPreliminaryMatches: 0, numByes: lowerBracket * 2 - teamsCount };
  };

  // Helper: standard tournament seeding order (ensures #1 and #2 in opposite halves)
  const getStandardSeeding = (size: number): number[] => {
    if (size === 1) return [1];
    const prev = getStandardSeeding(size / 2);
    const result: number[] = [];
    for (const seed of prev) {
      result.push(seed);
      result.push(size + 1 - seed);
    }
    return result;
  };

  const generateBracket = async (teamsCount: number) => {
    setGenerating(true);
    try {
      // Get qualified teams according to ranking
      const { data: standings, error: standingsError } = await supabase
        .from("team_stats")
        .select(`
          *,
          team:team_id(id, name)
        `)
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false })
        .limit(teamsCount);

      if (standingsError) throw standingsError;

      if (!standings || standings.length < teamsCount) {
        toast.error(`Pas assez d'équipes qualifiées (${standings?.length || 0}/${teamsCount})`);
        return;
      }

      const { bracketSize, numPreliminaryMatches, numByes } = computeBracketParams(teamsCount);
      
      console.log(`Generating bracket: ${teamsCount} teams, bracket size ${bracketSize}, ${numPreliminaryMatches} preliminary matches, ${numByes} byes`);
      
      // BYE CASE: standard seeding, top seeds get byes (auto-advance)
      if (numByes > 0) {
        const seeding = getStandardSeeding(bracketSize);
        let courtIndex = 0;
        for (let i = 0; i < seeding.length; i += 2) {
          const seed1 = seeding[i];
          const seed2 = seeding[i + 1];
          const team1 = standings[seed1 - 1];
          
          if (seed2 <= teamsCount) {
            const team2 = standings[seed2 - 1];
            const { error } = await supabase.from("matches").insert({
              tournament_id: tournamentId,
              phase: currentPhase,
              round_number: 1,
              team1_id: team1.team_id,
              team2_id: team2.team_id,
              field_number: (courtIndex % numberOfFields) + 1,
            });
            if (error) throw error;
            courtIndex++;
            console.log(`R1: #${seed1} ${team1.team?.name} vs #${seed2} ${team2.team?.name}`);
          } else {
            // Bye: team auto-advances (same team on both sides)
            const { error } = await supabase.from("matches").insert({
              tournament_id: tournamentId,
              phase: currentPhase,
              round_number: 1,
              team1_id: team1.team_id,
              team2_id: team1.team_id,
              winner_id: team1.team_id,
            });
            if (error) throw error;
            console.log(`R1 BYE: #${seed1} ${team1.team?.name}`);
          }
        }
        
        const realMatches = bracketSize / 2 - numByes;
        toast.success(`Bracket généré! ${realMatches} match(s) + ${numByes} bye(s)`);
        await fetchTournamentAndMatches();
        return;
      }
      
      // PRELIM + DIRECT CASE
      const matchesToInsert: any[] = [];
      let matchIndex = 0;
      
      if (numPreliminaryMatches > 0) {
        // Create preliminary matches pairing lowest seeds
        // For 10 teams: prelim seeds are #7,#8,#9,#10
        // Pairs: #7v#10, #8v#9 (crossed seeding)
        const prelimTeams = standings.slice(bracketSize - numPreliminaryMatches, teamsCount);
        // prelimTeams has 2*numPreliminaryMatches entries
        
        for (let i = 0; i < numPreliminaryMatches; i++) {
          const highSeed = prelimTeams[i];
          const lowSeed = prelimTeams[prelimTeams.length - 1 - i];
          
          if (highSeed && lowSeed) {
            matchesToInsert.push({
              tournament_id: tournamentId,
              phase: currentPhase,
              round_number: 0,
              team1_id: highSeed.team_id,
              team2_id: lowSeed.team_id,
              field_number: matchIndex + 1,
            });
            matchIndex++;
            
            const seed1 = standings.indexOf(highSeed) + 1;
            const seed2 = standings.indexOf(lowSeed) + 1;
            console.log(`Preliminary: #${seed1} ${highSeed.team?.name} vs #${seed2} ${lowSeed.team?.name}`);
          }
        }
      }
      
      // Create Round 1 matches for directly qualified teams
      // Direct teams: seeds that don't play preliminary
      // For 10 teams with 2 prelim: direct seeds are #1..#6, but #1 and #2 wait for prelim winners
      // Direct pairings (crossed): #3v#6, #4v#5
      const numDirectTeams = bracketSize - numPreliminaryMatches; // teams going directly to R1 without prelim
      // But numPreliminaryMatches of these will face prelim winners (created after prelim ends)
      // So direct R1 matches = (numDirectTeams - numPreliminaryMatches) / 2
      
      const directR1Teams = standings.slice(numPreliminaryMatches, bracketSize - numPreliminaryMatches);
      const numR1Matches = Math.floor(directR1Teams.length / 2);
      
      for (let i = 0; i < numR1Matches; i++) {
        const highSeed = directR1Teams[i];
        const lowSeed = directR1Teams[directR1Teams.length - 1 - i];
        
        if (highSeed && lowSeed && highSeed.team_id !== lowSeed.team_id) {
          matchesToInsert.push({
            tournament_id: tournamentId,
            phase: currentPhase,
            round_number: 1,
            team1_id: highSeed.team_id,
            team2_id: lowSeed.team_id,
            field_number: matchIndex + 1,
          });
          matchIndex++;
          
          const seed1 = standings.indexOf(highSeed) + 1;
          const seed2 = standings.indexOf(lowSeed) + 1;
          console.log(`R1: #${seed1} ${highSeed.team?.name} vs #${seed2} ${lowSeed.team?.name}`);
        }
      }

      // Insert all matches
      if (matchesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToInsert);

        if (insertError) throw insertError;
      }

      // Show success message
      const prelimCount = matchesToInsert.filter(m => m.round_number === 0).length;
      const r1Count = matchesToInsert.filter(m => m.round_number === 1).length;
      
      if (prelimCount > 0) {
        toast.success(`Bracket généré! ${prelimCount} préliminaire(s) + ${r1Count} match(s) en R1`);
      } else {
        toast.success(`Bracket généré! ${r1Count} matchs`);
      }
      
      await fetchTournamentAndMatches();
    } catch (error: any) {
      toast.error("Erreur lors de la génération du bracket");
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

    // Validate input with zod
    try {
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({
        team1_score: team1Score,
        team2_score: team2Score,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }
    } catch (validationError: any) {
      toast.error("Validation error");
      return;
    }

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const winnerId = team1Score > team2Score ? match.team1_id : 
                     team2Score > team1Score ? match.team2_id : null;

    if (!winnerId) {
      toast.error("An elimination match cannot end in a draw");
      return;
    }

    try {
      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: team1Score,
          team2_score: team2Score,
          winner_id: winnerId
        })
        .eq("id", matchId);

      if (error) throw error;

      // Celebration animation
      setRecentlyCompletedMatchId(matchId);
      setRecentlyAdvancedTeamIds([winnerId]);
      
      // Remove animation after delay
      setTimeout(() => {
        setRecentlyCompletedMatchId(null);
        setRecentlyAdvancedTeamIds([]);
      }, 2000);

      toast.success("Score updated");
      setEditingMatchId(null);
      await fetchTournamentAndMatches();
      
      // Check if round is completed and generate next
      await checkAndGenerateNextRound(match.round_number);
    } catch (error: any) {
      toast.error("Error updating score");
      console.error(error);
    }
  };

  const checkAndGenerateNextRound = async (completedRound: number) => {
    try {
      // Get all matches from completed round (non-3rd place)
      const { data: roundMatches, error: matchesError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .eq("round_number", completedRound)
        .eq("is_third_place_match", false)
        .order("created_at", { ascending: true });

      if (matchesError) throw matchesError;
      if (!roundMatches || roundMatches.length === 0) return;

      // If it's the final (1 match only) and it's finished
      if (roundMatches.length === 1 && roundMatches[0].winner_id && completedRound > 0) {
        toast.success("🏆 Tournament finished! Congratulations to the winner!");
        return;
      }

      const teamsCount = tournament?.teams_for_elimination || 0;
      const { bracketSize, numPreliminaryMatches } = computeBracketParams(teamsCount);

      // Check which next round matches already exist
      const { data: existingNextRoundMatches, error: existingError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .eq("round_number", completedRound + 1)
        .order("id", { ascending: true });

      if (existingError) throw existingError;

      const matchesToCreate: any[] = [];

      // SPECIAL: Preliminary round (round 0) completed
      if (completedRound === 0) {
        // Get preliminary winners
        const completedPrelims = roundMatches.filter(m => m.winner_id);
        if (completedPrelims.length !== roundMatches.length) {
          console.log('Not all preliminary matches complete yet');
          return;
        }

        // Get standings to find seeds
        const { data: standings, error: standingsError } = await supabase
          .from("team_stats")
          .select("team_id, team:team_id(id, name)")
          .eq("tournament_id", tournamentId)
          .order("points", { ascending: false })
          .order("goals_for", { ascending: false })
          .limit(teamsCount);

        if (standingsError) throw standingsError;
        if (!standings) return;

        // Build map: seed position → team_id
        // Prelim winners take the slot of the higher-seeded team in their match
        const seedToTeam = new Map<number, string>();

        // Direct seeds (teams not in any prelim match)
        for (let s = 0; s < standings.length; s++) {
          const playedPrelim = roundMatches.some(m =>
            m.team1_id === standings[s].team_id || m.team2_id === standings[s].team_id
          );
          if (!playedPrelim) {
            seedToTeam.set(s + 1, standings[s].team_id);
          }
        }

        // Prelim winners take the high seed's slot
        for (const pm of completedPrelims) {
          const idx1 = standings.findIndex(s => s.team_id === pm.team1_id);
          const idx2 = standings.findIndex(s => s.team_id === pm.team2_id);
          const highSeed = Math.min(idx1, idx2) + 1;
          seedToTeam.set(highSeed, pm.winner_id!);
        }

        // Use standard seeding to create R1 matches
        const seeding = getStandardSeeding(bracketSize);
        for (let i = 0; i < seeding.length; i += 2) {
          const s1 = seeding[i];
          const s2 = seeding[i + 1];
          const team1Id = seedToTeam.get(s1);
          const team2Id = seedToTeam.get(s2);

          if (!team1Id || !team2Id) continue;

          const exists = existingNextRoundMatches?.some(m =>
            (m.team1_id === team1Id && m.team2_id === team2Id) ||
            (m.team1_id === team2Id && m.team2_id === team1Id)
          );

          if (!exists) {
            matchesToCreate.push({
              tournament_id: tournamentId,
              phase: currentPhase as any,
              round_number: 1,
              team1_id: team1Id,
              team2_id: team2Id,
              is_third_place_match: false,
              field_number: matchesToCreate.length + 1,
            });
            console.log(`R1: Seed #${s1} vs Seed #${s2}`);
          }
        }

        if (matchesToCreate.length > 0) {
          const { error: insertError } = await supabase
            .from("matches")
            .insert(matchesToCreate);

          if (insertError) throw insertError;

          toast.success(`${matchesToCreate.length} match(s) de R1 créés !`);
          await fetchTournamentAndMatches();
        }
        return;
      }

      // Get standings to identify bye teams (if any remaining)
      const { data: standings, error: standingsError } = await supabase
        .from("team_stats")
        .select("team_id")
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false })
        .limit(teamsCount);

      if (standingsError) throw standingsError;

      console.log(`Round ${completedRound} completed check: ${roundMatches.length} matches`);

      // Standard progression for R1 and beyond
      // Process matches in pairs to generate next round matches progressively
      for (let i = 0; i < roundMatches.length; i += 2) {
        if (i + 1 >= roundMatches.length) break; // No complete pair

        const match1 = roundMatches[i];
        const match2 = roundMatches[i + 1];

        // Check if both matches in the pair are finished
        if (!match1.winner_id || !match2.winner_id) {
          continue; // This pair is not yet complete
        }

        // Check if a match with these two teams already exists
        const matchAlreadyExists = existingNextRoundMatches?.some(m => 
          !m.is_third_place_match &&
          ((m.team1_id === match1.winner_id && m.team2_id === match2.winner_id) ||
           (m.team1_id === match2.winner_id && m.team2_id === match1.winner_id))
        );

        if (matchAlreadyExists) {
          continue; // This match already exists
        }

        // If it's the semi-finals (only 2 matches in the round)
        if (roundMatches.length === 2 && i === 0) {
          // Get the losers for the 3rd place match
          const loser1 = match1.winner_id === match1.team1_id ? match1.team2_id : match1.team1_id;
          const loser2 = match2.winner_id === match2.team1_id ? match2.team2_id : match2.team1_id;

          // Check if these matches don't already exist
          const finaleExists = existingNextRoundMatches?.some(m => 
            !m.is_third_place_match &&
            ((m.team1_id === match1.winner_id && m.team2_id === match2.winner_id) ||
             (m.team1_id === match2.winner_id && m.team2_id === match1.winner_id))
          );

          const thirdPlaceExists = existingNextRoundMatches?.some(m => 
            m.is_third_place_match &&
            ((m.team1_id === loser1 && m.team2_id === loser2) ||
             (m.team1_id === loser2 && m.team2_id === loser1))
          );

          // If final already exists, do nothing
          if (finaleExists) {
            continue;
          }

          // Prepare final and 3rd place matches
          const finaleMatch = {
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: match1.winner_id,
            team2_id: match2.winner_id,
            is_third_place_match: false,
            field_number: 1,
          };

          const thirdPlaceMatch = {
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: loser1,
            team2_id: loser2,
            is_third_place_match: true,
            field_number: 2,
          };

          // If 3rd place match doesn't exist yet, ask for confirmation
          if (!thirdPlaceExists) {
            setPendingFinalMatches({
              finale: finaleMatch,
              thirdPlace: thirdPlaceMatch,
            });
            setThirdPlaceDialogOpen(true);
            return; // Stop here, creation will be done after user response
          } else {
            // 3rd place match already exists (maybe declined), create just the final
            matchesToCreate.push(finaleMatch);
          }
        } else {
          // For other rounds: create next round match for this pair
          // Assign a court in round-robin
          const fieldNumber = (matchesToCreate.length % numberOfFields) + 1;
          
          matchesToCreate.push({
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: match1.winner_id,
            team2_id: match2.winner_id,
            is_third_place_match: false,
            field_number: fieldNumber,
          });
        }
      }

      // Insert all new matches at once
      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToCreate);

        if (insertError) throw insertError;

        const message = roundMatches.length === 2 
          ? `Final and 3rd place match generated!`
          : `Match(es) generated for round ${completedRound + 1}!`;
        
        toast.success(message);
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error generating next round:", error);
    }
  };

  const autoSendToStation = async (sendThirdPlaceFirst: boolean) => {
    try {
      const { data: stations } = await supabase
        .from("referee_stations")
        .select("id, timer_duration_seconds")
        .eq("tournament_id", tournamentId)
        .eq("is_active", true)
        .is("current_match_id", null)
        .order("station_number")
        .limit(1);

      if (!stations || stations.length === 0) {
        toast.info("Aucune station disponible pour l'envoi automatique");
        return;
      }

      const station = stations[0];
      let matchToSend: string | null = null;

      if (sendThirdPlaceFirst) {
        const { data: tpMatches } = await supabase
          .from("matches")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("phase", currentPhase)
          .eq("is_third_place_match", true)
          .is("winner_id", null)
          .limit(1);

        matchToSend = tpMatches?.[0]?.id || null;
        if (matchToSend) toast.success("🥉 Petite finale envoyée sur la station !");
      } else {
        const { data: finalMatches } = await supabase
          .from("matches")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("phase", currentPhase)
          .eq("is_third_place_match", false)
          .is("winner_id", null)
          .order("round_number", { ascending: false })
          .limit(1);

        matchToSend = finalMatches?.[0]?.id || null;
        if (matchToSend) toast.success("🏆 Grande finale envoyée sur la station !");
      }

      if (matchToSend) {
        await supabase.from("referee_stations").update({
          current_match_id: matchToSend,
          timer_started_at: null,
          timer_paused_at: null,
          timer_elapsed_when_paused: 0,
        } as any).eq("id", station.id);
      }
    } catch (error) {
      console.error("Error auto-sending to station:", error);
    }
  };

  const handleThirdPlaceConfirmation = async (includeThirdPlace: boolean) => {
    if (!pendingFinalMatches) return;

    thirdPlaceDecisionMadeRef.current = true;

    try {
      const matchesToInsert: any[] = [];

      if (pendingFinalMatches.finale) {
        matchesToInsert.push(pendingFinalMatches.finale);
      }

      if (includeThirdPlace && pendingFinalMatches.thirdPlace) {
        matchesToInsert.push(pendingFinalMatches.thirdPlace);
      }

      if (matchesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToInsert);
        if (insertError) throw insertError;
      }

      await autoSendToStation(includeThirdPlace);
      await fetchTournamentAndMatches();
    } catch (error: any) {
      console.error("Error creating matches:", error);
      toast.error("Erreur lors de la création des matchs");
    } finally {
      setThirdPlaceDialogOpen(false);
      setPendingFinalMatches(null);
    }
  };

  const getRoundName = (roundNumber: number, totalTeams: number) => {
    // Preliminary round
    if (roundNumber === 0) return "Preliminary Round";
    
    const { bracketSize } = computeBracketParams(totalTeams);
    const totalRounds = Math.log2(bracketSize);
    const roundsRemaining = totalRounds - roundNumber + 1;
    
    if (roundsRemaining === 1) return "Final";
    if (roundsRemaining === 2) return "Semi-finals";
    if (roundsRemaining === 3) return "Quarter-finals";
    if (roundsRemaining === 4) return "Round of 16";
    return `Round ${roundNumber}`;
  };

  // Generate complete bracket structure (all rounds)
  const generateBracketStructure = () => {
    if (!tournament?.teams_for_elimination) return [];

    const totalTeams = tournament.teams_for_elimination;
    const { bracketSize, numPreliminaryMatches, numByes } = computeBracketParams(totalTeams);
    const totalRounds = Math.log2(bracketSize);
    const hasPreliminary = numPreliminaryMatches > 0;
    const r1ExpectedCount = bracketSize / 2;

    const structure: any[][] = [];

    // Preliminary round (round 0) if it exists
    const preliminaryMatches = matches
      .filter((m) => m.round_number === 0 && !m.is_third_place_match);

    // Determine prelim feed positions in R1 (edges: top for #1, bottom for #2)
    const prelimFeedPositions: number[] = [];
    for (let i = 0; i < numPreliminaryMatches; i++) {
      if (i % 2 === 0) {
        prelimFeedPositions.push(Math.floor(i / 2)); // 0, 1, 2...
      } else {
        prelimFeedPositions.push(r1ExpectedCount - 1 - Math.floor(i / 2)); // last, last-1...
      }
    }
    const prelimFeedSet = new Set(prelimFeedPositions);

    if (hasPreliminary) {
      // Sort prelim matches by field_number (stable, set at generation time)
      const sortedPrelim = [...preliminaryMatches].sort((a, b) => {
        const fn1 = a.field_number || 0;
        const fn2 = b.field_number || 0;
        if (fn1 !== fn2) return fn1 - fn2;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      // Create padded preliminary array (same slot count as R1)
      const paddedPrelim: any[] = Array.from({ length: r1ExpectedCount }, (_, i) => ({
        id: `spacer-prelim-${i}`,
        isSpacer: true,
        round_number: 0,
      }));

      // Place prelim matches at their feed positions
      for (let i = 0; i < sortedPrelim.length && i < prelimFeedPositions.length; i++) {
        paddedPrelim[prelimFeedPositions[i]] = sortedPrelim[i];
      }

      structure.push(paddedPrelim);
    }

    // Standard rounds 1..N
    for (let round = 1; round <= totalRounds; round++) {
      const expectedMatches = bracketSize / Math.pow(2, round);

      const roundMatchesSorted = matches
        .filter((m) => m.round_number === round && !m.is_third_place_match);

      const roundMatches: any[] = [];

      if (round === 1 && hasPreliminary) {
        // Sort R1 matches by field_number then created_at for stable ordering
        const sortedR1 = [...roundMatchesSorted].sort((a, b) => {
          const fn1 = a.field_number || 0;
          const fn2 = b.field_number || 0;
          if (fn1 !== fn2) return fn1 - fn2;
          if ((a.created_at || '') !== (b.created_at || '')) return (a.created_at || '').localeCompare(b.created_at || '');
          return a.id.localeCompare(b.id);
        });

        // Use seeding to show directly qualified teams in QF placeholders
        const seeding = getStandardSeeding(bracketSize);
        const numDirectlyQualified = bracketSize - numPreliminaryMatches;

        for (let i = 0; i < expectedMatches; i++) {
          if (i < sortedR1.length) {
            roundMatches.push(sortedR1[i]);
          } else {
            // Determine which seeds belong in this slot
            const seed1 = seeding[i * 2];     // team1 seed
            const seed2 = seeding[i * 2 + 1]; // team2 seed

            // The directly qualified team is the one with seed <= numDirectlyQualified
            const directSeed = seed1 <= numDirectlyQualified ? seed1 : (seed2 <= numDirectlyQualified ? seed2 : null);
            const prelimSeed = seed1 <= numDirectlyQualified ? seed2 : seed1;

            const directTeam = directSeed ? seedToTeam.get(directSeed) || null : null;

            // Try to find winner from feeder prelim match
            const feederPrelim = structure.length > 0 ? structure[0][i] : null;
            const prelimWinner = feederPrelim && !feederPrelim.isSpacer && feederPrelim.winner_id
              ? (feederPrelim.winner_id === feederPrelim.team1_id ? feederPrelim.team1 : feederPrelim.team2)
              : null;

            // Place directly qualified team as team1, prelim winner/TBD as team2
            // (following seeding order: lower seed = team1)
            const isDirectSeedTeam1 = seed1 <= numDirectlyQualified;
            const team1 = isDirectSeedTeam1 ? directTeam : prelimWinner;
            const team2 = isDirectSeedTeam1 ? prelimWinner : directTeam;

            roundMatches.push({
              id: `placeholder-${round}-${i}`,
              round_number: round,
              team1_id: team1?.id || "",
              team2_id: team2?.id || "",
              team1: team1 || null,
              team2: team2 || null,
              team1_score: null,
              team2_score: null,
              winner_id: null,
              isPlaceholder: true,
              hasAdvancedTeam1: !!prelimWinner && !isDirectSeedTeam1,
              hasAdvancedTeam2: !!prelimWinner && isDirectSeedTeam1,
            });
          }
        }
      } else if (round === 1 && numByes > 0) {
        // Bye case: sort by creation order to maintain standard seeding
        const sorted = [...roundMatchesSorted].sort((a, b) => 
          (a.created_at || '').localeCompare(b.created_at || '')
        );
        for (let i = 0; i < expectedMatches; i++) {
          if (i < sorted.length) {
            roundMatches.push(sorted[i]);
          } else {
            roundMatches.push({
              id: `placeholder-${round}-${i}`,
              round_number: round,
              team1_id: "",
              team2_id: "",
              team1: null,
              team2: null,
              team1_score: null,
              team2_score: null,
              winner_id: null,
              isPlaceholder: true,
            });
          }
        }
      } else {
        // Standard round handling - fill placeholders with known winners from previous round
        const sorted = [...roundMatchesSorted].sort((a, b) => {
          const fn1 = a.field_number || 0;
          const fn2 = b.field_number || 0;
          if (fn1 !== fn2) return fn1 - fn2;
          if ((a.created_at || '') !== (b.created_at || '')) return (a.created_at || '').localeCompare(b.created_at || '');
          return a.id.localeCompare(b.id);
        });
        const prevRound = structure.length > 0 ? structure[structure.length - 1] : [];
        
        for (let i = 0; i < expectedMatches; i++) {
          const existingMatch = sorted[i];
          if (existingMatch) {
            roundMatches.push(existingMatch);
          } else {
            // Try to find winners from the two feeder matches in previous round
            const feederIdx1 = i * 2;
            const feederIdx2 = i * 2 + 1;
            const feeder1 = prevRound[feederIdx1];
            const feeder2 = prevRound[feederIdx2];
            
            const team1Winner = feeder1 && !feeder1.isSpacer && feeder1.winner_id
              ? (feeder1.winner_id === feeder1.team1_id ? feeder1.team1 : feeder1.team2)
              : null;
            const team2Winner = feeder2 && !feeder2.isSpacer && feeder2.winner_id
              ? (feeder2.winner_id === feeder2.team1_id ? feeder2.team1 : feeder2.team2)
              : null;

            roundMatches.push({
              id: `placeholder-${round}-${i}`,
              round_number: round,
              team1_id: team1Winner?.id || "",
              team2_id: team2Winner?.id || "",
              team1: team1Winner || null,
              team2: team2Winner || null,
              team1_score: null,
              team2_score: null,
              winner_id: null,
              isPlaceholder: true,
              hasAdvancedTeam1: !!team1Winner,
              hasAdvancedTeam2: !!team2Winner,
            });
          }
        }
      }

      structure.push(roundMatches);
    }

    return structure;
  };

  // Check if a previous round is completed (all matches have a winner)
  const isPreviousRoundCompleted = (roundNumber: number): boolean => {
    if (roundNumber <= 1) return true; // First round always accessible
    
    const previousRoundMatches = matches.filter(
      m => m.round_number === roundNumber - 1 && !m.is_third_place_match
    );
    
    // If no matches in previous round, they're not yet generated
    if (previousRoundMatches.length === 0) return false;
    
    // All previous round matches must have a winner
    return previousRoundMatches.every(m => m.winner_id !== null);
  };

  // Check if semi-finals are completed (for 3rd place match)
  const areSemiFinalsCompleted = (): boolean => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const bracketSize = Math.pow(2, Math.floor(Math.log2(totalTeams)));
    const totalRounds = Math.log2(bracketSize);
    const semiFinalsRound = totalRounds - 1; // Second to last round
    
    const semiFinalsMatches = matches.filter(
      m => m.round_number === semiFinalsRound && !m.is_third_place_match
    );
    
    return semiFinalsMatches.length === 2 && semiFinalsMatches.every(m => m.winner_id !== null);
  };

  const bracketStructure = generateBracketStructure();
  
  // Get 3rd place match if it exists
  const thirdPlaceMatch = matches.find(m => m.is_third_place_match);

  if (loading) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground animate-pulse">Loading bracket...</p>
      </Card>
    );
  }

  if (generating) {
    return (
      <Card className="glass-card p-8 text-center">
        <Trophy className="h-12 w-12 text-primary mx-auto mb-4 animate-bounce" />
        <p className="text-muted-foreground animate-pulse">Generating bracket...</p>
      </Card>
    );
  }

  // Group matches by round
  const matchesByRound = matches.reduce((acc, match) => {
    if (!acc[match.round_number]) {
      acc[match.round_number] = [];
    }
    acc[match.round_number].push(match);
    return acc;
  }, {} as { [key: number]: Match[] });

  // Build sequential match order from bracket structure for queue badges
  const sequentialMatchOrder: string[] = [];
  for (const round of bracketStructure) {
    for (const match of round) {
      if (match && !match.isSpacer && !match.isPlaceholder && match.id) {
        sequentialMatchOrder.push(match.id);
      }
    }
  }
  // Add 3rd place match at the end if it exists
  if (thirdPlaceMatch) {
    sequentialMatchOrder.push(thirdPlaceMatch.id);
  }

  // Compute On Deck and In the Hole matches using sequential bracket order
  const waitingMatchIds = sequentialMatchOrder.filter(id => {
    const m = matches.find(match => match.id === id);
    return m && !m.winner_id && !activeStationMatches.has(m.id) && m.team1 && m.team2;
  });
  const onDeckMatchId = waitingMatchIds[0];
  const inTheHoleMatchId = waitingMatchIds[1];

  return (
    <Card className="glass-card p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">
            {eliminationType === "single" ? "Single" : "Double"} Elimination Phase
          </h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          {tournament?.teams_for_elimination} qualified teams
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No matches generated</p>
        </div>
      ) : (
        <>
          {/* Main bracket */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 min-w-max px-4">
              {bracketStructure.map((roundMatches, roundIndex) => {
                const roundNumber = roundMatches[0]?.round_number ?? roundIndex + 1;
                const totalTeams = tournament?.teams_for_elimination || 8;
                const isLastRound = roundIndex === bracketStructure.length - 1;
                const hasPreliminaryRound = bracketStructure.length > 0 && bracketStructure[0]?.[0]?.round_number === 0;
                const isPreliminaryRound = roundNumber === 0;
                
                // Dimensions
                const matchHeight = 124;
                const baseGap = 12;
                const unit = matchHeight + baseGap;
                
                // When there's a preliminary round, both prelim and R1 share the same spacing level
                // (they have the same number of slots). Subsequent rounds shift accordingly.
                const spacingLevel = hasPreliminaryRound && roundIndex > 0 
                  ? roundIndex - 1 
                  : roundIndex;
                
                const verticalGap = unit * Math.pow(2, spacingLevel) - matchHeight;
                const topOffset = unit * (Math.pow(2, spacingLevel) - 1) / 2;
                
                // Match number calculation
                const { bracketSize } = computeBracketParams(totalTeams);
                const actualPrelimCount = matches.filter(m => m.round_number === 0 && !m.is_third_place_match).length;

                const matchNumberStart = (() => {
                  if (roundNumber === 0) return 0;
                  let start = actualPrelimCount;
                  for (let r = 1; r < roundNumber; r++) {
                    start += bracketSize / Math.pow(2, r);
                  }
                  return start;
                })();

                // Track non-spacer match index for numbering
                let realMatchCount = 0;
                
                return (
                  <div key={`round-${roundIndex}`} className="flex flex-col" style={{ minWidth: "180px" }}>
                    {/* Round header */}
                    <div className={cn(
                      "text-center mb-4 py-2 px-4 rounded-lg",
                      isLastRound ? "bg-primary/20 border border-primary/30" : "bg-muted/50"
                    )}>
                      <span className={cn(
                        "text-sm font-bold",
                        isLastRound ? "text-primary" : "text-foreground"
                      )}>
                        {getRoundName(roundNumber, totalTeams)}
                      </span>
                    </div>
                    
                    {/* Matches */}
                    <div 
                      className="flex flex-col relative"
                      style={{ 
                        gap: `${verticalGap}px`,
                        marginTop: `${topOffset}px`
                      }}
                    >
                      {/* Connection lines */}
                      {!isLastRound && (
                        <svg
                          className="absolute left-full top-0 pointer-events-none"
                          style={{
                            width: "32px",
                            height: "100%",
                            overflow: "visible",
                          }}
                        >
                          {isPreliminaryRound ? (
                            // Preliminary → R1: 1-to-1 horizontal lines (each prelim connects to its R1 slot)
                            roundMatches.map((m, idx) => {
                              if (m.isSpacer) return null;
                              const totalSlotHeight = matchHeight + verticalGap;
                              const y = idx * totalSlotHeight + matchHeight / 2;
                              return (
                                <g key={idx} className="animate-fade-in">
                                  <line x1="0" y1={y} x2="32" y2={y} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                </g>
                              );
                            })
                          ) : (
                            // Standard pairs merge connection lines
                            roundMatches.map((_, matchIndex) => {
                              if (matchIndex % 2 !== 0) return null;
                              if (matchIndex + 1 >= roundMatches.length) return null;

                              const totalSlotHeight = matchHeight + verticalGap;
                              const baseY = matchIndex * totalSlotHeight;
                              const y1 = baseY + matchHeight / 2;
                              const y2 = baseY + totalSlotHeight + matchHeight / 2;
                              const yMid = (y1 + y2) / 2;

                              return (
                                <g key={matchIndex} className="animate-fade-in">
                                  <line x1="0" y1={y1} x2="16" y2={y1} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                  <line x1="0" y1={y2} x2="16" y2={y2} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                  <line x1="16" y1={y1} x2="16" y2={y2} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                  <line x1="16" y1={yMid} x2="32" y2={yMid} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                </g>
                              );
                            })
                          )}
                        </svg>
                      )}
                      
                      {roundMatches.map((match, matchIndex) => {
                        // Spacer entries: render empty div to preserve vertical alignment
                        if (match.isSpacer) {
                          return <div key={match.id} style={{ height: `${matchHeight}px` }} />;
                        }

                        const canAccessMatch = isPreviousRoundCompleted(roundNumber);
                        const isLocked = !canAccessMatch && !match.winner_id;
                        const isMatchCompleted = !!match.winner_id;
                        const matchNumber = matchNumberStart + (++realMatchCount);

                        return (
                          <BracketMatch
                            key={match.id}
                            match={match}
                            matchNumber={matchNumber}
                            isEditing={editingMatchId === match.id}
                            scores={scores[match.id] || { team1: "", team2: "" }}
                            isClosed={isClosed || isLocked}
                            isFinal={isLastRound}
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
                            onStartEdit={() => {
                              if (isLocked || isMatchCompleted) {
                                if (isMatchCompleted) {
                                  toast.error("This match is finished and can no longer be modified");
                                } else {
                                  toast.error("Complete the previous round matches first");
                                }
                                return;
                              }
                              setEditingMatchId(match.id);
                              setScores({
                                ...scores,
                                [match.id]: {
                                  team1: match.team1_score?.toString() || "0",
                                  team2: match.team2_score?.toString() || "0"
                                }
                              });
                            }}
                            onCancelEdit={() => setEditingMatchId(null)}
                            onSaveScore={() => handleScoreUpdate(match.id)}
                            onScoreChange={(team, value) => setScores({
                              ...scores,
                              [match.id]: { ...scores[match.id], [team]: value }
                            })}
                            onMatchClick={() => {
                              if (isLocked && !isMatchCompleted) {
                                toast.error("Complete the previous round matches first");
                                return;
                              }
                              if (!match.isPlaceholder) {
                                setSelectedMatch(match);
                                if (isMatchCompleted || !isCreator) {
                                  setRecapDialogOpen(true);
                                } else {
                                  setStatsDialogOpen(true);
                                }
                              }
                            }}
                            onSendToStation={() => {
                              const label = `${match.team1?.name || "TBD"} vs ${match.team2?.name || "TBD"}`;
                              setStationMatch({ id: match.id, label });
                              setStationDialogOpen(true);
                            }}
                            onIncrementScore={(teamId, teamName) => {
                              if (isLocked || isMatchCompleted) {
                                if (isMatchCompleted) {
                                  toast.error("This match is finished and can no longer be modified");
                                } else {
                                  toast.error("Complete the previous round matches first");
                                }
                                return;
                              }
                              setScoringTeam({ id: teamId, name: teamName, matchId: match.id });
                              setGoalScorerDialogOpen(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              
              {/* Champion section if final is finished */}
              {bracketStructure.length > 0 && (() => {
                const finalRound = bracketStructure[bracketStructure.length - 1];
                const finalMatch = finalRound?.[0];
                if (finalMatch?.winner_id) {
                  const winner = finalMatch.winner_id === finalMatch.team1_id 
                    ? finalMatch.team1 
                    : finalMatch.team2;
                  return (
                    <div className="flex flex-col items-center justify-center" style={{ minWidth: "160px" }}>
                      <div className="text-center mb-4 py-2 px-4 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
                        <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">
                          🏆 Champion
                        </span>
                      </div>
                      <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 p-4 text-center">
                        <Trophy className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                        <p className="font-bold text-lg">{winner?.name}</p>
                      </Card>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* 3rd place match */}
          {thirdPlaceMatch && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Medal className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-600">
                  3rd Place Match
                </h3>
              </div>
              <div className="max-w-[220px] mx-auto">
                {(() => {
                  const thirdPlaceLocked = !areSemiFinalsCompleted() && !thirdPlaceMatch.winner_id;
                  const isThirdPlaceCompleted = !!thirdPlaceMatch.winner_id;
                  return (
                    <BracketMatch
                      match={thirdPlaceMatch}
                      matchNumber={matches.filter(m => !m.is_third_place_match).length + 1}
                      isEditing={editingMatchId === thirdPlaceMatch.id}
                      scores={scores[thirdPlaceMatch.id] || { team1: "", team2: "" }}
                      isClosed={isClosed || thirdPlaceLocked}
                      isFinal={false}
                      isLocked={thirdPlaceLocked}
                      isCompleted={isThirdPlaceCompleted}
                      isLive={liveMatches.has(thirdPlaceMatch.id)}
                      isOnDeck={onDeckMatchId === thirdPlaceMatch.id}
                      isInTheHole={inTheHoleMatchId === thirdPlaceMatch.id}
                      timerState={matchTimers[thirdPlaceMatch.id] || null}
                      onStartEdit={() => {
                        if (thirdPlaceLocked || isThirdPlaceCompleted) {
                          if (isThirdPlaceCompleted) {
                            toast.error("This match is finished and can no longer be modified");
                          } else {
                            toast.error("Complete the semi-finals first");
                          }
                          return;
                        }
                        setEditingMatchId(thirdPlaceMatch.id);
                        setScores({
                          ...scores,
                          [thirdPlaceMatch.id]: {
                            team1: thirdPlaceMatch.team1_score?.toString() || "0",
                            team2: thirdPlaceMatch.team2_score?.toString() || "0"
                          }
                        });
                      }}
                      onCancelEdit={() => setEditingMatchId(null)}
                      onSaveScore={() => handleScoreUpdate(thirdPlaceMatch.id)}
                      onScoreChange={(team, value) => setScores({
                        ...scores,
                        [thirdPlaceMatch.id]: { ...scores[thirdPlaceMatch.id], [team]: value }
                      })}
                      onMatchClick={() => {
                        if (thirdPlaceLocked && !isThirdPlaceCompleted) {
                          toast.error("Complete the semi-finals first");
                          return;
                        }
                        setSelectedMatch(thirdPlaceMatch);
                        if (isThirdPlaceCompleted || !isCreator) {
                          setRecapDialogOpen(true);
                        } else {
                          setStatsDialogOpen(true);
                        }
                      }}
                      onIncrementScore={(teamId, teamName) => {
                        if (thirdPlaceLocked || isThirdPlaceCompleted) {
                          if (isThirdPlaceCompleted) {
                            toast.error("This match is finished and can no longer be modified");
                          } else {
                            toast.error("Complete the semi-finals first");
                          }
                          return;
                        }
                        setScoringTeam({ id: teamId, name: teamName, matchId: thirdPlaceMatch.id });
                        setGoalScorerDialogOpen(true);
                      }}
                    />
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {selectedMatch && (
        <MatchStatsDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={statsDialogOpen}
          onOpenChange={setStatsDialogOpen}
          onScoreUpdate={async () => {
            await fetchTournamentAndMatches();
            // Check if next round should be generated
            if (selectedMatch) {
              await checkAndGenerateNextRound(selectedMatch.round_number);
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
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          matchId={scoringTeam.matchId}
          tournamentId={tournamentId}
          onGoalRecorded={() => {
            // Refresh if needed
          }}
        />
      )}

      <AlertDialog open={thirdPlaceDialogOpen} onOpenChange={setThirdPlaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-amber-600" />
              Petite finale
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous jouer la petite finale (match pour la 3ème place) ?
              Le match sera envoyé automatiquement sur la station d'arbitrage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleThirdPlaceConfirmation(false)}>
              Non, passer à la finale
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleThirdPlaceConfirmation(true)}>
              Oui, jouer la petite finale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
