import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScoreInput } from "@/components/ui/score-input";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, TrendingUp, ChevronDown, ChevronUp, Users, Target, AlertTriangle, Clock, Zap, Monitor, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { GoalRemoverDialog } from "./GoalRemoverDialog";
import { QuickStatDialog } from "./QuickStatDialog";
import { MatchStatsRecap } from "./MatchStatsRecap";
import { SendToStationDialog } from "./SendToStationDialog";
import { TimerDisplay } from "./TimerDisplay";
import { LiveMatchStatsDialog } from "./LiveMatchStatsDialog";

interface SwissManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  currentPhase?: string;
  isCreator?: boolean;
}

export const SwissManager = ({ tournamentId, isClosed = false, currentPhase, isCreator = false }: SwissManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [maxRound, setMaxRound] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const [numberOfFields, setNumberOfFields] = useState(1);
  const [activeStationMatches, setActiveStationMatches] = useState<Set<string>>(new Set());
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
  const [selectedLiveMatch, setSelectedLiveMatch] = useState<any | null>(null);
  const [matchTimers, setMatchTimers] = useState<{ [matchId: string]: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  }}>({});

  // Fetch matches currently on referee stations with timer data
  const fetchActiveStationMatches = async () => {
    const { data, error } = await supabase
      .from("referee_stations")
      .select("current_match_id, timer_duration_seconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused")
      .eq("tournament_id", tournamentId)
      .eq("is_active", true)
      .not("current_match_id", "is", null);

    if (!error && data) {
      const activeMatchIds = data.map(s => s.current_match_id).filter(Boolean);
      setActiveStationMatches(new Set(activeMatchIds));
      
      // Also populate timer state from database and mark as live if timer started
      const timers: typeof matchTimers = {};
      const liveMatchIds: string[] = [];
      
      data.forEach(station => {
        if (station.current_match_id && station.timer_duration_seconds) {
          timers[station.current_match_id] = {
            durationSeconds: station.timer_duration_seconds,
            startedAt: station.timer_started_at,
            pausedAt: station.timer_paused_at,
            elapsedWhenPaused: station.timer_elapsed_when_paused ?? 0
          };
          
          // If timer has been started, mark match as live
          if (station.timer_started_at) {
            liveMatchIds.push(station.current_match_id);
          }
        }
      });
      
      setMatchTimers(prev => ({ ...prev, ...timers }));
      
      // Set matches with running timers as live
      if (liveMatchIds.length > 0) {
        setLiveMatches(prev => {
          const next = new Set(prev);
          liveMatchIds.forEach(id => next.add(id));
          return next;
        });
      }
    }
  };

  useEffect(() => {
    const initializeRound = async () => {
      // Get the number of fields from the tournament
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("number_of_fields")
        .eq("id", tournamentId)
        .single();
      
      if (tournament?.number_of_fields) {
        setNumberOfFields(tournament.number_of_fields);
      }

      const max = await fetchMaxRound();
      if (!initialized && max > 0) {
        setCurrentRound(max);
        setInitialized(true);
      }
    };
    initializeRound();
  }, [tournamentId, initialized]);

  useEffect(() => {
    if (initialized) {
      fetchMatches();
      fetchActiveStationMatches();
    }
  }, [tournamentId, currentRound, initialized]);

  // Real-time subscription for match updates
  useEffect(() => {
    const matchChannel = supabase
      .channel(`swiss-matches-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`
        },
        (payload) => {
          console.log('Match update received:', payload);
          fetchMatches();
        }
      )
      .subscribe();

    // Real-time subscription for referee station updates
    const stationChannel = supabase
      .channel(`swiss-stations-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referee_stations',
          filter: `tournament_id=eq.${tournamentId}`
        },
        (payload) => {
          console.log('Station update received:', payload);
          fetchActiveStationMatches();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(stationChannel);
    };
  }, [tournamentId, currentRound]);

  // Live broadcast subscription for real-time score updates and timer
  useEffect(() => {
    const liveTimeouts: { [matchId: string]: NodeJS.Timeout } = {};
    
    // Use the shared tournament broadcast channel (same as referee station)
    const channel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on(
        'broadcast',
        { event: 'live_score' },
        (payload) => {
          console.log('Live score received in Swiss:', payload);
          const { matchId, team1_score, team2_score } = payload.payload;
          
          setLiveMatches(prev => new Set(prev).add(matchId));
          
          if (liveTimeouts[matchId]) {
            clearTimeout(liveTimeouts[matchId]);
          }
          
          liveTimeouts[matchId] = setTimeout(() => {
            setLiveMatches(prev => {
              const next = new Set(prev);
              next.delete(matchId);
              return next;
            });
          }, 10000);
          
          setMatches(prevMatches => 
            prevMatches.map(match => {
              if (match.id === matchId) {
                return { ...match, team1_score, team2_score };
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
          const { matchId, action, durationSeconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused } = payload.payload;
          
          if (action === 'start' || action === 'resume') {
            setLiveMatches(prev => new Set(prev).add(matchId));
          }
          
          setMatchTimers(prev => ({
            ...prev,
            [matchId]: {
              durationSeconds: durationSeconds ?? prev[matchId]?.durationSeconds ?? 0,
              startedAt: timer_started_at,
              pausedAt: timer_paused_at,
              elapsedWhenPaused: timer_elapsed_when_paused ?? prev[matchId]?.elapsedWhenPaused ?? 0
            }
          }));
          
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
      .subscribe();

    return () => {
      Object.values(liveTimeouts).forEach(timeout => clearTimeout(timeout));
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const fetchMaxRound = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select("round_number")
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .order("round_number", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      setMaxRound(data[0].round_number);
      return data[0].round_number;
    }
    return 1;
  };

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:team1_id(id, name),
        team2:team2_id(id, name)
      `)
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .eq("round_number", currentRound)
      .order("created_at");

    if (error) {
      toast.error("Error loading matches");
      return;
    }

    setMatches(data || []);
  };

  const generateSwissRound = async () => {
    setLoading(true);
    try {
      // Fetch all teams via tournament_teams
      const { data: tournamentTeams, error: teamsError } = await supabase
        .from("tournament_teams")
        .select(`
          team_id,
          teams (id, name)
        `)
        .eq("tournament_id", tournamentId);

      if (teamsError) throw teamsError;

      const teams = tournamentTeams?.map(tt => tt.teams).filter(Boolean) || [];

      if (!teams || teams.length < 2) {
        toast.error("At least 2 teams are required to create matches");
        return;
      }

      // Determine which round to generate
      const roundToGenerate = matches.length === 0 ? currentRound : currentRound + 1;

      // Fetch all previous matches to avoid rematches when possible
      const { data: previousMatches, error: prevMatchesError } = await supabase
        .from("matches")
        .select("team1_id, team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "swiss");

      if (prevMatchesError) throw prevMatchesError;

      // Create a set of already played matchups
      const playedMatchups = new Set(
        (previousMatches || []).map(m => 
          [m.team1_id, m.team2_id].sort().join("-")
        )
      );

      // Fetch team stats for Swiss pairing
      const { data: stats, error: statsError } = await supabase
        .from("team_stats")
        .select("team_id, points, wins, losses, draws, goals_for, goals_against")
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false });

      if (statsError) throw statsError;

      // Create a map of team stats
      const statsMap = new Map(
        (stats || []).map(s => [s.team_id, s])
      );

      // Sort teams by their stats (Swiss system)
      const sortedTeams = teams.sort((a, b) => {
        const statsA = statsMap.get(a.id) || { points: 0, goals_for: 0, goals_against: 0 };
        const statsB = statsMap.get(b.id) || { points: 0, goals_for: 0, goals_against: 0 };
        
        // Primary: Sort by points
        if (statsA.points !== statsB.points) {
          return statsB.points - statsA.points;
        }
        // Secondary: Sort by goal difference
        const diffA = statsA.goals_for - statsA.goals_against;
        const diffB = statsB.goals_for - statsB.goals_against;
        if (diffA !== diffB) {
          return diffB - diffA;
        }
        // Tertiary: Sort by goals scored
        return statsB.goals_for - statsA.goals_for;
      });

      // Swiss pairing algorithm
      const newMatches = [];
      const paired = new Set();

      for (let i = 0; i < sortedTeams.length; i++) {
        if (paired.has(sortedTeams[i].id)) continue;

        const team1 = sortedTeams[i];
        let team2 = null;

        // Try to find the best opponent (closest in ranking that hasn't played against)
        for (let j = i + 1; j < sortedTeams.length; j++) {
          if (paired.has(sortedTeams[j].id)) continue;

          const matchupKey = [team1.id, sortedTeams[j].id].sort().join("-");
          
          if (!playedMatchups.has(matchupKey)) {
            team2 = sortedTeams[j];
            break;
          }
        }

        // If no suitable opponent found (all have played), pair with the closest available team
        if (!team2) {
          for (let j = i + 1; j < sortedTeams.length; j++) {
            if (!paired.has(sortedTeams[j].id)) {
              team2 = sortedTeams[j];
              break;
            }
          }
        }

        if (team2) {
          paired.add(team1.id);
          paired.add(team2.id);

          // Assign a court in round-robin
          const fieldNumber = (newMatches.length % numberOfFields) + 1;

          newMatches.push({
            tournament_id: tournamentId,
            phase: "swiss",
            round_number: roundToGenerate,
            team1_id: team1.id,
            team2_id: team2.id,
            field_number: fieldNumber,
          });
        }
      }

      if (newMatches.length === 0) {
        toast.error("Unable to generate new matches.");
        return;
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(newMatches);

      if (insertError) throw insertError;

      toast.success(`Round ${roundToGenerate} generated with ${newMatches.length} match${newMatches.length > 1 ? 'es' : ''}!`);
      if (roundToGenerate > currentRound) {
        setCurrentRound(roundToGenerate);
        setMaxRound(roundToGenerate);
      } else {
        fetchMatches();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateScore = async (matchId: string, team1Score: number, team2Score: number) => {
    try {
      // Validate input
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({
        team1_score: team1Score,
        team2_score: team2Score,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const match = matches.find(m => m.id === matchId);
      const winnerId = validation.data.team1_score > validation.data.team2_score ? match.team1_id : 
                      validation.data.team2_score > validation.data.team1_score ? match.team2_id : null;

      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: validation.data.team1_score,
          team2_score: validation.data.team2_score,
          winner_id: winnerId,
        })
        .eq("id", matchId);

      if (error) throw error;

      toast.success("Score saved!");
      
      // Refresh matches and maxRound
      await Promise.all([fetchMatches(), fetchMaxRound()]);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const canGenerateNextRound = () => {
    // Check if all matches in current round are completed
    const allMatchesCompleted = matches.every(m => 
      m.team1_score !== null && m.team2_score !== null
    );
    return matches.length > 0 && allMatchesCompleted;
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Swiss Round {currentRound}
              {currentRound === maxRound && (
                <Badge variant="default" className="gap-1 animate-pulse">
                  <Zap className="h-3 w-3" />
                  Current
                </Badge>
              )}
              {currentRound < maxRound && (
                <Badge variant="secondary" className="gap-1">
                  Completed
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Teams are paired according to their current ranking
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentRound > 1 && (
              <Button 
                variant="outline" 
                onClick={() => setCurrentRound(currentRound - 1)}
                disabled={currentRound === 1}
              >
                Previous Round
              </Button>
            )}
            {currentRound < maxRound && (
              <Button 
                variant="outline"
                onClick={() => setCurrentRound(currentRound + 1)}
              >
                Next Round
              </Button>
            )}
            {currentRound === maxRound && isCreator && (
              <Button 
                onClick={generateSwissRound} 
                disabled={loading || (matches.length > 0 && !canGenerateNextRound()) || isClosed || (currentPhase && currentPhase !== "swiss")}
                className="gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                {matches.length === 0 ? `Generate Round ${currentRound}` : `Generate Round ${currentRound + 1}`}
              </Button>
            )}
          </div>
        </div>

        {matches.length > 0 && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <p className="text-foreground">
                Progress: {matches.filter(m => m.team1_score !== null && m.team2_score !== null).length} / {matches.length} matches completed
              </p>
            </div>
            {canGenerateNextRound() && currentPhase === "swiss" && (
              <span className="text-sm font-semibold text-primary">✓ Ready for next round</span>
            )}
          </div>
        )}
        
        {currentPhase && currentPhase !== "swiss" && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-foreground">
              The tournament is in {currentPhase === "elimination" ? "elimination" : currentPhase} phase. You can no longer generate new Swiss rounds.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Ongoing matches - includes matches without scores OR matches on a referee station */}
          {matches.filter(m => m.team1_score === null || m.team2_score === null || activeStationMatches.has(m.id)).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Ongoing Matches</h3>
              {matches.filter(m => m.team1_score === null || m.team2_score === null || activeStationMatches.has(m.id)).map((match) => {
                // Check if this match is the next to play on its field
                const matchesOnSameField = matches
                  .filter(m => m.field_number === match.field_number)
                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                
                const firstUnfinishedOnField = matchesOnSameField.find(
                  m => m.team1_score === null || m.team2_score === null || activeStationMatches.has(m.id)
                );
                
                const isLockedByPreviousMatch = firstUnfinishedOnField?.id !== match.id;

                return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    tournamentId={tournamentId}
                    onScoreUpdate={updateScore}
                    isClosed={isClosed}
                    isLockedByPreviousMatch={isLockedByPreviousMatch}
                    isCreator={isCreator}
                    isOnRefereeStation={activeStationMatches.has(match.id)}
                    isLive={liveMatches.has(match.id)}
                    timerState={matchTimers[match.id] || null}
                    onViewLiveStats={!isCreator ? () => setSelectedLiveMatch(match) : undefined}
                  />
                );
              })}
            </div>
          )}
          
          {/* Completed matches - only matches with scores AND not on a referee station */}
          {matches.filter(m => m.team1_score !== null && m.team2_score !== null && !activeStationMatches.has(m.id)).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-muted-foreground">Completed Matches</h3>
              <div className="space-y-2 opacity-60">
                {matches.filter(m => m.team1_score !== null && m.team2_score !== null && !activeStationMatches.has(m.id)).map((match) => (
                  <CompletedMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}
          
          {matches.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No matches for this round. Click "Generate" to create matches according to the Swiss system.
            </p>
          )}
        </div>
      </Card>

      {/* Live Match Stats Dialog for visitors */}
      {selectedLiveMatch && (
        <LiveMatchStatsDialog
          matchId={selectedLiveMatch.id}
          team1Id={selectedLiveMatch.team1_id}
          team2Id={selectedLiveMatch.team2_id}
          team1Name={selectedLiveMatch.team1?.name || ""}
          team2Name={selectedLiveMatch.team2?.name || ""}
          team1Score={selectedLiveMatch.team1_score}
          team2Score={selectedLiveMatch.team2_score}
          tournamentId={tournamentId}
          open={!!selectedLiveMatch}
          onOpenChange={(open) => !open && setSelectedLiveMatch(null)}
          isLive={liveMatches.has(selectedLiveMatch.id)}
        />
      )}
    </div>
  );
};

interface MatchCardProps {
  match: any;
  tournamentId: string;
  onScoreUpdate: (matchId: string, team1Score: number, team2Score: number) => void;
  isClosed?: boolean;
  isLockedByPreviousMatch?: boolean;
  isCreator?: boolean;
  isOnRefereeStation?: boolean;
  isLive?: boolean;
  timerState?: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  } | null;
  onViewLiveStats?: () => void;
}

const MatchCard = ({ match, tournamentId, onScoreUpdate, isClosed = false, isLockedByPreviousMatch = false, isCreator = false, isOnRefereeStation = false, isLive = false, timerState, onViewLiveStats }: MatchCardProps) => {
  const [team1Score, setTeam1Score] = useState(match.team1_score ?? 0);
  const [team2Score, setTeam2Score] = useState(match.team2_score ?? 0);
  const [isOpen, setIsOpen] = useState(false);
  const [team1Players, setTeam1Players] = useState<any[]>([]);
  const [team2Players, setTeam2Players] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, any>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [goalScorerDialogOpen, setGoalScorerDialogOpen] = useState(false);
  const [goalRemoverDialogOpen, setGoalRemoverDialogOpen] = useState(false);
  const [scoringTeam, setScoringTeam] = useState<{ id: string; name: string } | null>(null);
  const [removingTeam, setRemovingTeam] = useState<{ id: string; name: string } | null>(null);
  const [quickStatDialogOpen, setQuickStatDialogOpen] = useState(false);
  const [quickStatType, setQuickStatType] = useState<"assists" | "fouls" | "penalty_30s" | "penalty_1m" | "penalty_2m">("assists");
  const [quickStatTeam, setQuickStatTeam] = useState<{ id: string; name: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [sendToStationOpen, setSendToStationOpen] = useState(false);

  // Keep local score inputs in sync with live updates (broadcast/DB)
  // but don't override while the user is actively editing.
  useEffect(() => {
    if (isEditing) return;
    setTeam1Score(match.team1_score ?? 0);
    setTeam2Score(match.team2_score ?? 0);
  }, [isEditing, match.team1_score, match.team2_score]);

  // Load players on mount to calculate scores
  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPlayers();
    }
  }, [isOpen]);

  // Calculate scores from player_stats if match not validated
  useEffect(() => {
    if (team1Players.length > 0 || team2Players.length > 0) {
      fetchPlayerStats();
    }
  }, [team1Players, team2Players, goalScorerDialogOpen]);

  // Calculate scores from player_stats if match not yet validated
  useEffect(() => {
    if (match.team1_score === null && match.team2_score === null) {
      loadScoresFromPlayerStats();
    }
  }, []);

  const loadScoresFromPlayerStats = async () => {
    const { data: allStats } = await supabase
      .from("player_stats")
      .select("player_id, goals")
      .eq("match_id", match.id);

    if (!allStats || allStats.length === 0) return;

    const { data: tt1 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team1_id)
      .maybeSingle();

    const { data: tt2 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team2_id)
      .maybeSingle();

    let team1PlayerIds: string[] = [];
    let team2PlayerIds: string[] = [];

    if (tt1?.id) {
      const { data: p1 } = await supabase
        .from("tournament_team_players")
        .select("player_id")
        .eq("tournament_team_id", tt1.id);
      team1PlayerIds = (p1 || []).map(p => p.player_id);
    }

    if (tt2?.id) {
      const { data: p2 } = await supabase
        .from("tournament_team_players")
        .select("player_id")
        .eq("tournament_team_id", tt2.id);
      team2PlayerIds = (p2 || []).map(p => p.player_id);
    }

    const team1Goals = allStats
      .filter(stat => team1PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    const team2Goals = allStats
      .filter(stat => team2PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    if (team1Goals > 0 || team2Goals > 0) {
      setTeam1Score(team1Goals);
      setTeam2Score(team2Goals);
    }
  };

  const fetchPlayers = async () => {
    // Get tournament_team for team1
    const { data: tt1 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team1_id)
      .maybeSingle();

    // Get tournament_team for team2
    const { data: tt2 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team2_id)
      .maybeSingle();

    if (tt1?.id) {
      const { data: players1 } = await supabase
        .from("tournament_team_players")
        .select("player_id, players:player_id(id, name)")
        .eq("tournament_team_id", tt1.id);
      
      setTeam1Players((players1 || []).map(p => p.players).filter(Boolean));
    }

    if (tt2?.id) {
      const { data: players2 } = await supabase
        .from("tournament_team_players")
        .select("player_id, players:player_id(id, name)")
        .eq("tournament_team_id", tt2.id);
      
      setTeam2Players((players2 || []).map(p => p.players).filter(Boolean));
    }
  };

  const fetchPlayerStats = async () => {
    const allPlayerIds = [...team1Players, ...team2Players].map(p => p.id);
    
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("match_id", match.id)
      .in("player_id", allPlayerIds);

    if (!error && data) {
      const statsMap = data.reduce((acc, stat) => {
        acc[stat.player_id] = stat;
        return acc;
      }, {} as Record<string, any>);
      setPlayerStats(statsMap);
    }
  };

  const updatePlayerStat = async (playerId: string, field: string, value: number) => {
    const existingStat = playerStats[playerId];

    if (existingStat) {
      const { error } = await supabase
        .from("player_stats")
        .update({ [field]: value })
        .eq("id", existingStat.id);

      if (!error) {
        setPlayerStats(prev => ({
          ...prev,
          [playerId]: { ...prev[playerId], [field]: value }
        }));
      }
    } else {
      const { data, error } = await supabase
        .from("player_stats")
        .insert({
          player_id: playerId,
          tournament_id: tournamentId,
          match_id: match.id,
          [field]: value,
        })
        .select()
        .single();

      if (!error && data) {
        setPlayerStats(prev => ({
          ...prev,
          [playerId]: data
        }));
      }
    }

    // If it's a goal, update the match score
    if (field === "goals") {
      await updateMatchScoresFromPlayerStats();
    }
  };

  const updateMatchScoresFromPlayerStats = async () => {
    // Get all player stats for this match
    const { data: allStats, error } = await supabase
      .from("player_stats")
      .select("player_id, goals")
      .eq("match_id", match.id);

    if (error || !allStats) return;

    // Calculate scores for each team
    const team1PlayerIds = team1Players.map(p => p.id);
    const team2PlayerIds = team2Players.map(p => p.id);

    const team1Goals = allStats
      .filter(stat => team1PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    const team2Goals = allStats
      .filter(stat => team2PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    // Update local scores AND in the DB
    setTeam1Score(team1Goals);
    setTeam2Score(team2Goals);
    
    // Update in the database if scores have changed
    if (team1Goals !== match.team1_score || team2Goals !== match.team2_score) {
      const winnerId = team1Goals > team2Goals ? match.team1_id : 
                      team2Goals > team1Goals ? match.team2_id : null;
      
      await supabase
        .from("matches")
        .update({
          team1_score: team1Goals,
          team2_score: team2Goals,
          winner_id: winnerId,
        })
        .eq("id", match.id);
    }
  };

  const handleValidateScore = () => {
    setShowConfirmDialog(true);
  };

  const confirmValidateScore = () => {
    onScoreUpdate(match.id, team1Score, team2Score);
    setShowConfirmDialog(false);
    setIsEditing(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className={`flex flex-col gap-2 p-4 bg-secondary/20 rounded-lg border transition-colors ${isOnRefereeStation ? 'border-primary ring-2 ring-primary/30' : 'border-border/50 hover:border-primary/50'} ${isLockedByPreviousMatch ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-center gap-2 mb-1">
          {match.field_number && (
            <Badge variant="outline" className="text-xs">
              Court {match.field_number}
            </Badge>
          )}
          {isLive && timerState && (
            <TimerDisplay
              durationSeconds={timerState.durationSeconds}
              startedAt={timerState.startedAt}
              pausedAt={timerState.pausedAt}
              elapsedWhenPaused={timerState.elapsedWhenPaused}
              compact
            />
          )}
          {isLive && !timerState && (
            <Badge variant="destructive" className="text-xs animate-pulse gap-1">
              <Radio className="h-3 w-3" />
              LIVE
            </Badge>
          )}
          {isOnRefereeStation && !isLive && (
            <Badge className="text-xs animate-pulse bg-primary">
              <Monitor className="h-3 w-3 mr-1" />
              En arbitrage
            </Badge>
          )}
        </div>
        {isLockedByPreviousMatch && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            🔒 A previous match must be completed on court {match.field_number} before modifying this one
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="flex-1 flex items-center justify-between gap-3">
            <span className="font-medium flex-1">{match.team1?.name || "Team 1"}</span>
            <ScoreInput
              value={team1Score}
              onChange={(value) => {
                setTeam1Score(value);
                if (!isEditing) setIsEditing(true);
              }}
              onIncrement={() => {
                setScoringTeam({ id: match.team1_id, name: match.team1?.name || "Team 1" });
                setGoalScorerDialogOpen(true);
              }}
              onDecrement={() => {
                setRemovingTeam({ id: match.team1_id, name: match.team1?.name || "Team 1" });
                setGoalRemoverDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch || !isCreator}
            />
          </div>
          <span className="text-muted-foreground font-bold">vs</span>
          <div className="flex-1 flex items-center justify-between gap-3">
            <ScoreInput
              value={team2Score}
              onChange={(value) => {
                setTeam2Score(value);
                if (!isEditing) setIsEditing(true);
              }}
              onIncrement={() => {
                setScoringTeam({ id: match.team2_id, name: match.team2?.name || "Team 2" });
                setGoalScorerDialogOpen(true);
              }}
              onDecrement={() => {
                setRemovingTeam({ id: match.team2_id, name: match.team2?.name || "Team 2" });
                setGoalRemoverDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch || !isCreator}
            />
            <span className="font-medium flex-1 text-right">{match.team2?.name || "Team 2"}</span>
          </div>
        </div>

        {/* Button for visitors to view live stats */}
        {!isCreator && onViewLiveStats && (
          <div className="flex justify-center mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onViewLiveStats}
              className="text-xs gap-1"
            >
              <Target className="h-3 w-3" />
              View Live Stats
            </Button>
          </div>
        )}

        {/* Quick stats tabs */}
        {isCreator && (
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("assists");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              Assists
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("fouls");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              Fouls
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("penalty_30s");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              30 sec
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("penalty_1m");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              1 min
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("penalty_2m");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              2 min
            </Button>
          </div>
        )}

        {isCreator && (
          <div className="flex gap-2 justify-between">
              <Button
                onClick={() => setSendToStationOpen(true)}
                size="sm"
                variant="outline"
                disabled={isClosed || isLockedByPreviousMatch}
              >
                <Monitor className="h-4 w-4 mr-2" />
                Send to Court
              </Button>
              <div className="flex gap-2">
                {isEditing && (
                  <Button
                    onClick={() => {
                      setTeam1Score(match.team1_score ?? 0);
                      setTeam2Score(match.team2_score ?? 0);
                      setIsEditing(false);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleValidateScore}
                  size="sm"
                  disabled={isClosed || isLockedByPreviousMatch}
                >
                  Validate
                </Button>
              </div>
            </div>
        )}
      </div>

      {isCreator && (
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-center gap-2"
            disabled={isClosed || isLockedByPreviousMatch}
          >
            <Users className="h-4 w-4" />
            Player Statistics
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      )}

      <CollapsibleContent>
        <Card className="p-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team 1 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match.team1?.name}
              </h4>
              <div className="space-y-2">
                {team1Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                    onEditStart={() => !isEditing && setIsEditing(true)}
                    onEditEnd={() => setIsEditing(false)}
                  />
                ))}
                {team1Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">No players</p>
                )}
              </div>
            </div>

            {/* Team 2 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match.team2?.name}
              </h4>
              <div className="space-y-2">
                {team2Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                    onEditStart={() => !isEditing && setIsEditing(true)}
                    onEditEnd={() => setIsEditing(false)}
                  />
                ))}
                {team2Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">No players</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </CollapsibleContent>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Final Score</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Do you confirm the final score of this match?<br />
                  <strong>{match.team1?.name}</strong>: {team1Score} - {team2Score}: <strong>{match.team2?.name}</strong>
                </p>
                <MatchStatsRecap
                  team1Name={match.team1?.name || "Team 1"}
                  team2Name={match.team2?.name || "Team 2"}
                  team1Players={team1Players}
                  team2Players={team2Players}
                  playerStats={playerStats}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmValidateScore}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scoringTeam && (
        <GoalScorerDialog
          open={goalScorerDialogOpen}
          onOpenChange={(open) => {
            setGoalScorerDialogOpen(open);
            if (!open) {
              // Reload stats when dialog closes
              fetchPlayerStats();
            }
          }}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          matchId={match.id}
          tournamentId={tournamentId}
          onGoalRecorded={() => {
            // Reload immediately after recording
            fetchPlayerStats();
          }}
        />
      )}

      {removingTeam && (
        <GoalRemoverDialog
          open={goalRemoverDialogOpen}
          onOpenChange={(open) => {
            setGoalRemoverDialogOpen(open);
            if (!open) {
              fetchPlayerStats();
            }
          }}
          teamName={removingTeam.name}
          players={(removingTeam.id === match.team1_id ? team1Players : team2Players).map(p => ({
            id: p.id,
            name: p.name,
            goals: playerStats[p.id]?.goals || 0
          }))}
          onSelectPlayer={async (playerId) => {
            const currentGoals = playerStats[playerId]?.goals || 0;
            if (currentGoals > 0) {
              await updatePlayerStat(playerId, "goals", currentGoals - 1);
            }
          }}
        />
      )}

      {quickStatDialogOpen && (
        <QuickStatDialog
          open={quickStatDialogOpen}
          onOpenChange={(open) => {
            setQuickStatDialogOpen(open);
            if (!open) {
              fetchPlayerStats();
            }
          }}
          team1={{ id: match.team1_id, name: match.team1?.name || "Team 1" }}
          team2={{ id: match.team2_id, name: match.team2?.name || "Team 2" }}
          matchId={match.id}
          tournamentId={tournamentId}
          statType={quickStatType}
          statLabel={
            quickStatType === "assists" ? "Assist" :
            quickStatType === "fouls" ? "Foul" :
            quickStatType === "penalty_30s" ? "30 sec Penalty" :
            quickStatType === "penalty_1m" ? "1 min Penalty" :
            "2 min Penalty"
          }
          onStatRecorded={() => {
            fetchPlayerStats();
          }}
        />
      )}
      
      <SendToStationDialog
        open={sendToStationOpen}
        onOpenChange={setSendToStationOpen}
        tournamentId={tournamentId}
        matchId={match.id}
        matchLabel={`${match.team1?.name || "Team 1"} vs ${match.team2?.name || "Team 2"}`}
      />
    </Collapsible>
  );
};

interface PlayerStatsInputProps {
  player: any;
  stats: any;
  onUpdate: (field: string, value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}

const PlayerStatsInput = ({ player, stats, onUpdate, onEditStart, onEditEnd }: PlayerStatsInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      onEditStart();
    } else {
      onEditEnd();
    }
  };
  
  const incrementStat = (field: string, current: number) => {
    onUpdate(field, current + 1);
  };

  const decrementStat = (field: string, current: number) => {
    if (current > 0) {
      onUpdate(field, current - 1);
    }
  };

  const totalStats = (stats.goals || 0) + (stats.assists || 0);
  const hasFouls = (stats.fouls || 0) > 0;
  const hasPenalties = (stats.penalty_30s || 0) > 0 || (stats.penalty_1m || 0) > 0 || (stats.penalty_2m || 0) > 0;
  const hasAnyStats = totalStats > 0 || hasFouls || hasPenalties;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <div className="p-2 bg-background/50 rounded-lg hover:bg-background/70 cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{player.name}</span>
            <div className="flex items-center gap-2">
              {hasAnyStats && (
                <span className="text-xs text-muted-foreground">
                  {stats.goals || 0}G {stats.assists || 0}A
                  {hasFouls && <span className="ml-1">{stats.fouls}F</span>}
                  {hasPenalties && <span className="ml-1 text-destructive">⚠</span>}
                </span>
              )}
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="p-3 bg-background/30 rounded-lg mt-1 space-y-2">
        {/* Goals */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Goals</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("goals", stats.goals || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.goals || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("goals", stats.goals || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Assists */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Assists</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("assists", stats.assists || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.assists || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("assists", stats.assists || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Fouls */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Fouls</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("fouls", stats.fouls || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.fouls || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("fouls", stats.fouls || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 30 seconds */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">30sec</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_30s", stats.penalty_30s || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_30s || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_30s", stats.penalty_30s || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 1 minute */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">1min</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_1m", stats.penalty_1m || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_1m || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_1m", stats.penalty_1m || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 2 minutes */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">2min</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_2m", stats.penalty_2m || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_2m || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_2m", stats.penalty_2m || 0)}
            >
              +
            </Button>
          </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const CompletedMatchCard = ({ match }: { match: any }) => {
  const isTeam1Winner = match.team1_score > match.team2_score;
  const isTeam2Winner = match.team2_score > match.team1_score;
  
  return (
    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className={`font-medium ${isTeam1Winner ? 'text-primary' : ''}`}>
          {match.team1?.name || "Team 1"}
        </span>
        <span className={`text-lg font-bold ${isTeam1Winner ? 'text-primary' : ''}`}>
          {match.team1_score}
        </span>
      </div>
      <span className="text-muted-foreground">-</span>
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className={`text-lg font-bold ${isTeam2Winner ? 'text-primary' : ''}`}>
          {match.team2_score}
        </span>
        <span className={`font-medium text-right ${isTeam2Winner ? 'text-primary' : ''}`}>
          {match.team2?.name || "Team 2"}
        </span>
      </div>
    </div>
  );
};
