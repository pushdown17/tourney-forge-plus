import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ChevronDown, ChevronUp, Users, Target, Trophy, AlertTriangle, Clock, Monitor, Radio } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { GoalRemoverDialog } from "./GoalRemoverDialog";
import { QuickStatDialog } from "./QuickStatDialog";
import { MatchStatsRecap } from "./MatchStatsRecap";
import { MatchStatsViewDialog } from "./MatchStatsViewDialog";
import { SendToStationDialog } from "./SendToStationDialog";
import { TimerDisplay } from "./TimerDisplay";

interface RoundRobinManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  currentPhase?: string;
  isCreator?: boolean;
}

export const RoundRobinManager = ({ tournamentId, isClosed = false, currentPhase, isCreator = false }: RoundRobinManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [activeStationMatches, setActiveStationMatches] = useState<Set<string>>(new Set());
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
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

  const handleTeamClick = (teamName: string) => {
    setSelectedTeam(selectedTeam === teamName ? null : teamName);
  };

  const isMatchHighlighted = (match: any) => {
    if (!selectedTeam) return false;
    return match.team1?.name === selectedTeam || match.team2?.name === selectedTeam;
  };

  useEffect(() => {
    fetchMatches();
    fetchActiveStationMatches();
  }, [tournamentId]);

  // Real-time subscription for match updates
  useEffect(() => {
    const matchChannel = supabase
      .channel(`round-robin-matches-${tournamentId}`)
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
      .channel(`round-robin-stations-${tournamentId}`)
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
  }, [tournamentId]);

  // Live broadcast subscription for real-time score updates and timer
  useEffect(() => {
    const liveTimeouts: { [matchId: string]: NodeJS.Timeout } = {};
    
    const channel = supabase
      .channel(`tournament-live-rr-${tournamentId}`)
      .on(
        'broadcast',
        { event: 'live_score' },
        (payload) => {
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

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:team1_id(id, name),
        team2:team2_id(id, name)
      `)
      .eq("tournament_id", tournamentId)
      .eq("phase", "round_robin")
      .order("created_at");

    if (error) {
      toast.error("Error loading matches");
      return;
    }

    setMatches(data || []);
  };

  const generateAllMatches = async () => {
    setLoading(true);
    try {
      // Fetch all teams via tournament_teams
      const { data: tournamentTeams, error: teamsError } = await supabase
        .from("tournament_teams")
        .select("team_id")
        .eq("tournament_id", tournamentId);
      
      const teams = (tournamentTeams || []).map(tt => ({ id: tt.team_id }));

      if (teamsError) throw teamsError;

      if (!teams || teams.length < 2) {
        toast.error("At least 2 teams are required to create matches");
        return;
      }

      // Check if matches already exist
      const { data: existingMatches, error: existingError } = await supabase
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin")
        .limit(1);

      if (existingError) throw existingError;

      if (existingMatches && existingMatches.length > 0) {
        toast.error("Matches have already been generated for this tournament");
        return;
      }

      // Use circle method algorithm for balanced scheduling
      // This ensures teams don't wait too long between matches
      const teamIds = teams.map(t => t.id);
      const n = teamIds.length;
      
      // If odd number of teams, add a "bye" placeholder
      const hasBye = n % 2 === 1;
      if (hasBye) {
        teamIds.push("BYE");
      }
      
      const totalTeams = teamIds.length;
      const rounds = totalTeams - 1;
      const matchesPerRound = totalTeams / 2;
      
      const allMatches: { 
        tournament_id: string; 
        phase: "round_robin"; 
        round_number: number; 
        team1_id: string; 
        team2_id: string; 
      }[] = [];
      
      // Create a copy of teams for rotation (excluding first team which stays fixed)
      const rotatingTeams = [...teamIds];
      
      for (let round = 0; round < rounds; round++) {
        for (let match = 0; match < matchesPerRound; match++) {
          const home = match === 0 ? rotatingTeams[0] : rotatingTeams[match];
          const away = rotatingTeams[totalTeams - 1 - match];
          
          // Skip matches with the "BYE" placeholder
          if (home !== "BYE" && away !== "BYE") {
            allMatches.push({
              tournament_id: tournamentId,
              phase: "round_robin" as const,
              round_number: 1,
              team1_id: home,
              team2_id: away,
            });
          }
        }
        
        // Rotate teams: keep first team fixed, rotate the rest
        const lastTeam = rotatingTeams.pop()!;
        rotatingTeams.splice(1, 0, lastTeam);
      }

      if (allMatches.length === 0) {
        toast.error("Unable to generate matches");
        return;
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(allMatches);

      if (insertError) throw insertError;

      const totalMatches = allMatches.length;
      toast.success(`${totalMatches} match${totalMatches > 1 ? 'es' : ''} generated!`);
      fetchMatches();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Check if any match has a score entered
  const hasAnyScore = matches.some(m => m.team1_score !== null || m.team2_score !== null);

  const regenerateMatches = async () => {
    if (hasAnyScore) {
      toast.error("Cannot regenerate: scores have already been entered");
      return;
    }
    
    setLoading(true);
    try {
      // Delete all existing round robin matches
      const { error: deleteError } = await supabase
        .from("matches")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin");

      if (deleteError) throw deleteError;

      // Also delete associated player_stats
      const { error: statsError } = await supabase
        .from("player_stats")
        .delete()
        .eq("tournament_id", tournamentId);

      if (statsError) throw statsError;

      setMatches([]);
      toast.success("Matches deleted. Click 'Generate All Matches' to regenerate.");
      fetchMatches();
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
      setEditingMatchId(null);
      fetchMatches();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Round Robin</h2>
          <div className="flex gap-2">
            {isCreator && matches.length === 0 && (
              <Button 
                onClick={generateAllMatches} 
                disabled={loading || isClosed || (currentPhase && currentPhase !== "round_robin")}
              >
                Generate All Matches
              </Button>
            )}
            {isCreator && matches.length > 0 && (
              <Button 
                onClick={regenerateMatches} 
                variant="outline"
                disabled={loading || isClosed || hasAnyScore || (currentPhase && currentPhase !== "round_robin")}
                title={hasAnyScore ? "Cannot regenerate: scores have been entered" : "Regenerate all matches"}
              >
                Regenerate
              </Button>
            )}
          </div>
        </div>

        {currentPhase && currentPhase !== "round_robin" && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-foreground">
              The tournament is in {currentPhase === "elimination" ? "elimination" : currentPhase} phase. You can no longer generate new Round Robin rounds.
            </p>
          </div>
        )}

        {/* Matchs en cours - includes matches without scores OR matches on a referee station */}
        {matches.filter(m => m.team1_score === null || m.team2_score === null || activeStationMatches.has(m.id)).length > 0 && (
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold text-muted-foreground">Ongoing Matches</h3>
            {matches.filter(m => m.team1_score === null || m.team2_score === null || activeStationMatches.has(m.id)).map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                tournamentId={tournamentId}
                onScoreUpdate={updateScore}
                editingMatchId={editingMatchId}
                setEditingMatchId={setEditingMatchId}
                isClosed={isClosed}
                isCreator={isCreator}
                isOnRefereeStation={activeStationMatches.has(match.id)}
                isLive={liveMatches.has(match.id)}
                timerState={matchTimers[match.id] || null}
              />
            ))}
          </div>
        )}

        {/* Matchs terminés - only matches with scores AND not on a referee station */}
        {matches.filter(m => m.team1_score !== null && m.team2_score !== null && !activeStationMatches.has(m.id)).length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Completed Matches
            </h3>
            {matches.filter(m => m.team1_score !== null && m.team2_score !== null && !activeStationMatches.has(m.id)).map((match) => {
              const highlighted = isMatchHighlighted(match);
              return (
                <Card 
                  key={match.id} 
                  className={`p-4 transition-all ${
                    highlighted 
                      ? "bg-primary/30 ring-2 ring-primary shadow-lg" 
                      : selectedTeam 
                        ? "bg-muted/20 opacity-50" 
                        : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <button
                        onClick={() => handleTeamClick(match.team1?.name)}
                        className={`font-medium hover:text-primary hover:underline transition-colors cursor-pointer ${
                          match.team1?.name === selectedTeam ? "text-primary font-bold underline" : ""
                        } ${match.winner_id === match.team1_id ? 'text-primary font-bold' : ''}`}
                      >
                        {match.team1?.name}
                      </button>
                      <button
                        onClick={() => setSelectedMatch(match)}
                        className="flex items-center gap-2 px-4 py-2 bg-background rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                        title="View match details"
                      >
                        <span className={`text-xl font-bold ${match.winner_id === match.team1_id ? 'text-primary' : ''}`}>
                          {match.team1_score}
                        </span>
                        <span className="text-muted-foreground">-</span>
                        <span className={`text-xl font-bold ${match.winner_id === match.team2_id ? 'text-primary' : ''}`}>
                          {match.team2_score}
                        </span>
                      </button>
                      <button
                        onClick={() => handleTeamClick(match.team2?.name)}
                        className={`font-medium hover:text-primary hover:underline transition-colors cursor-pointer ${
                          match.team2?.name === selectedTeam ? "text-primary font-bold underline" : ""
                        } ${match.winner_id === match.team2_id ? 'text-primary font-bold' : ''}`}
                      >
                        {match.team2?.name}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {matches.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            No matches for this round. Click "Generate" to create matches.
          </p>
        )}
      </Card>

      {/* Match Stats Dialog */}
      {selectedMatch && (
        <MatchStatsViewDialog
          matchId={selectedMatch.id}
          team1Name={selectedMatch.team1?.name || ""}
          team2Name={selectedMatch.team2?.name || ""}
          team1Score={selectedMatch.team1_score}
          team2Score={selectedMatch.team2_score}
          tournamentId={tournamentId}
          open={!!selectedMatch}
          onOpenChange={(open) => !open && setSelectedMatch(null)}
        />
      )}
    </div>
  );
};

interface MatchCardProps {
  match: any;
  tournamentId: string;
  onScoreUpdate: (matchId: string, team1Score: number, team2Score: number) => void;
  editingMatchId: string | null;
  setEditingMatchId: (id: string | null) => void;
  isClosed?: boolean;
  isCreator?: boolean;
  isOnRefereeStation?: boolean;
  isLive?: boolean;
  timerState?: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  } | null;
}

const MatchCard = ({ match, tournamentId, onScoreUpdate, editingMatchId, setEditingMatchId, isClosed = false, isCreator = false, isOnRefereeStation = false, isLive = false, timerState }: MatchCardProps) => {
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
  const [sendToStationOpen, setSendToStationOpen] = useState(false);
  
  const isLocked = editingMatchId !== null && editingMatchId !== match.id;
  const isEditing = editingMatchId === match.id;

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

    // We need to get the players to know who belongs to which team
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

    // Si c'est un but, mettre à jour le score du match
    if (field === "goals") {
      await updateMatchScoresFromPlayerStats();
    }
  };

  const updateMatchScoresFromPlayerStats = async () => {
    // Récupérer tous les stats des joueurs pour ce match
    const { data: allStats, error } = await supabase
      .from("player_stats")
      .select("player_id, goals")
      .eq("match_id", match.id);

    if (error || !allStats) return;

    // Calculer les scores pour chaque équipe
    const team1PlayerIds = team1Players.map(p => p.id);
    const team2PlayerIds = team2Players.map(p => p.id);

    const team1Goals = allStats
      .filter(stat => team1PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    const team2Goals = allStats
      .filter(stat => team2PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    // Mettre à jour les scores locaux UNIQUEMENT (pas la DB)
    setTeam1Score(team1Goals);
    setTeam2Score(team2Goals);
  };

  const handleValidateScore = () => {
    setShowConfirmDialog(true);
  };

  const confirmValidateScore = () => {
    onScoreUpdate(match.id, team1Score, team2Score);
    setShowConfirmDialog(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className={`flex flex-col gap-2 p-4 bg-secondary/20 rounded-lg border transition-colors ${isOnRefereeStation ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'} ${isLocked ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-center gap-2 mb-1">
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
        {isLocked && (
          <div className="text-xs text-muted-foreground mb-2">
            🔒 Please validate the current match before modifying this one
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="flex-1 flex items-center justify-between">
            <span className="font-medium">{match.team1?.name || "Team 1"}</span>
            <ScoreInput
              value={team1Score}
              onChange={(value) => {
                setTeam1Score(value);
                if (!isEditing) setEditingMatchId(match.id);
              }}
              onIncrement={() => {
                setScoringTeam({ id: match.team1_id, name: match.team1?.name || "Team 1" });
                setGoalScorerDialogOpen(true);
              }}
              onDecrement={() => {
                setRemovingTeam({ id: match.team1_id, name: match.team1?.name || "Team 1" });
                setGoalRemoverDialogOpen(true);
              }}
              disabled={isLocked || isClosed || !isCreator}
            />
          </div>
          <span className="text-muted-foreground">vs</span>
          <div className="flex-1 flex items-center justify-between">
            <ScoreInput
              value={team2Score}
              onChange={(value) => {
                setTeam2Score(value);
                if (!isEditing) setEditingMatchId(match.id);
              }}
              onIncrement={() => {
                setScoringTeam({ id: match.team2_id, name: match.team2?.name || "Team 2" });
                setGoalScorerDialogOpen(true);
              }}
              onDecrement={() => {
                setRemovingTeam({ id: match.team2_id, name: match.team2?.name || "Team 2" });
                setGoalRemoverDialogOpen(true);
              }}
              disabled={isLocked || isClosed || !isCreator}
            />
            <span className="font-medium">{match.team2?.name || "Team 2"}</span>
          </div>
        </div>

        {/* Onglets stats rapides */}
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
              disabled={isLocked || isClosed}
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
              disabled={isLocked || isClosed}
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
              disabled={isLocked || isClosed}
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
              disabled={isLocked || isClosed}
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
              disabled={isLocked || isClosed}
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
              disabled={isLocked || isClosed}
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
                    setEditingMatchId(null);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleValidateScore}
                disabled={isLocked || isClosed}
              >
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
            disabled={isLocked || isClosed}
          >
            <Users className="h-4 w-4" />
            Player Stats
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
                    onEditStart={() => !isEditing && setEditingMatchId(match.id)}
                    onEditEnd={() => setEditingMatchId(null)}
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
                    onEditStart={() => !isEditing && setEditingMatchId(match.id)}
                    onEditEnd={() => setEditingMatchId(null)}
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
            <AlertDialogTitle>Confirm final score</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Do you confirm the final score of this match?<br />
                  <strong>{match.team1?.name}</strong> : {team1Score} - {team2Score} : <strong>{match.team2?.name}</strong>
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
              // Recharger les stats quand le dialog se ferme
              fetchPlayerStats();
            }
          }}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          matchId={match.id}
          tournamentId={tournamentId}
          onGoalRecorded={() => {
            // Recharger immédiatement après l'enregistrement
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
            quickStatType === "penalty_30s" ? "30 sec penalty" :
            quickStatType === "penalty_1m" ? "1 min penalty" :
            "2 min penalty"
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
        {/* Buts */}
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

        {/* Passes */}
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

        {/* Fautes */}
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

        {/* 30 secondes */}
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
