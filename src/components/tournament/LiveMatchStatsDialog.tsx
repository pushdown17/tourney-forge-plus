import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Target, Users, AlertTriangle, Radio } from "lucide-react";
import { TimerDisplay } from "./TimerDisplay";

interface LiveMatchStatsDialogProps {
  matchId: string;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLive?: boolean;
}

interface PlayerMatchStat {
  player_id: string;
  player_name: string;
  team_name: string;
  goals: number;
  assists: number;
  fouls: number;
  penalty_30s: number;
  penalty_1m: number;
  penalty_2m: number;
}

export const LiveMatchStatsDialog = ({
  matchId,
  team1Id,
  team2Id,
  team1Name,
  team2Name,
  team1Score: initialTeam1Score,
  team2Score: initialTeam2Score,
  tournamentId,
  open,
  onOpenChange,
  isLive = false,
}: LiveMatchStatsDialogProps) => {
  const [team1Stats, setTeam1Stats] = useState<PlayerMatchStat[]>([]);
  const [team2Stats, setTeam2Stats] = useState<PlayerMatchStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [team1Score, setTeam1Score] = useState(initialTeam1Score);
  const [team2Score, setTeam2Score] = useState(initialTeam2Score);
  const [playerToTeam, setPlayerToTeam] = useState<Record<string, string>>({});
  const [timerData, setTimerData] = useState<{
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  } | null>(null);

  // Update scores when props change
  useEffect(() => {
    setTeam1Score(initialTeam1Score);
    setTeam2Score(initialTeam2Score);
  }, [initialTeam1Score, initialTeam2Score]);

  // Fetch initial data and setup mappings
  useEffect(() => {
    if (open && matchId) {
      fetchMatchStats();
      fetchTimerData();
    }
  }, [open, matchId]);

  const fetchTimerData = async () => {
    try {
      const { data: stationData } = await supabase
        .from("referee_stations")
        .select("timer_duration_seconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused")
        .eq("tournament_id", tournamentId)
        .eq("current_match_id", matchId)
        .eq("is_active", true)
        .maybeSingle();

      if (stationData && stationData.timer_duration_seconds) {
        setTimerData({
          durationSeconds: stationData.timer_duration_seconds,
          startedAt: stationData.timer_started_at,
          pausedAt: stationData.timer_paused_at,
          elapsedWhenPaused: stationData.timer_elapsed_when_paused || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching timer data:", error);
    }
  };

  // Real-time subscription for live updates
  useEffect(() => {
    if (!open || !matchId) return;

    // Subscribe to player_stats changes for this match
    const statsChannel = supabase
      .channel(`live-match-stats-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_stats',
          filter: `match_id=eq.${matchId}`
        },
        (payload) => {
          console.log('Player stats update received:', payload);
          fetchMatchStats();
        }
      )
      .subscribe();

    // Subscribe to referee_stations for timer updates
    const stationChannel = supabase
      .channel(`live-match-station-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'referee_stations',
          filter: `current_match_id=eq.${matchId}`
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData.timer_duration_seconds) {
            setTimerData({
              durationSeconds: newData.timer_duration_seconds,
              startedAt: newData.timer_started_at,
              pausedAt: newData.timer_paused_at,
              elapsedWhenPaused: newData.timer_elapsed_when_paused || 0,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to broadcast for live score updates
    const liveChannel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on(
        'broadcast',
        { event: 'live_score' },
        (payload) => {
          const { matchId: updatedMatchId, team1_score, team2_score } = payload.payload;
          if (updatedMatchId === matchId) {
            setTeam1Score(team1_score);
            setTeam2Score(team2_score);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'player_stat_update' },
        (payload) => {
          if (payload.payload.matchId === matchId) {
            fetchMatchStats();
          }
        }
      )
      .on(
        'broadcast',
        { event: 'timer_update' },
        (payload) => {
          if (payload.payload.matchId === matchId) {
            setTimerData({
              durationSeconds: payload.payload.durationSeconds,
              startedAt: payload.payload.startedAt,
              pausedAt: payload.payload.pausedAt,
              elapsedWhenPaused: payload.payload.elapsedWhenPaused || 0,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statsChannel);
      supabase.removeChannel(stationChannel);
      supabase.removeChannel(liveChannel);
    };
  }, [open, matchId, tournamentId]);

  const fetchMatchStats = async () => {
    setLoading(true);
    try {
      // Get all player stats for this match
      const { data: stats, error } = await supabase
        .from("player_stats")
        .select(`
          *,
          player:players(id, name)
        `)
        .eq("match_id", matchId);

      if (error) throw error;

      // Get tournament_teams to know which player belongs to which team
      const { data: tournamentTeams } = await supabase
        .from("tournament_teams")
        .select("id, team_id")
        .eq("tournament_id", tournamentId)
        .in("team_id", [team1Id, team2Id]);

      const teamMapping = tournamentTeams?.reduce((acc, tt) => {
        acc[tt.id] = tt.team_id;
        return acc;
      }, {} as Record<string, string>) || {};

      // Get tournament_team_players to map players to teams
      const tournamentTeamIds = tournamentTeams?.map(tt => tt.id) || [];
      const { data: tournamentPlayers } = await supabase
        .from("tournament_team_players")
        .select("id, player_id, tournament_team_id")
        .in("tournament_team_id", tournamentTeamIds);

      const newPlayerToTeam = tournamentPlayers?.reduce((acc, tp) => {
        acc[tp.player_id] = teamMapping[tp.tournament_team_id];
        return acc;
      }, {} as Record<string, string>) || {};
      
      setPlayerToTeam(newPlayerToTeam);

      // Separate stats by team
      const team1StatsArr: PlayerMatchStat[] = [];
      const team2StatsArr: PlayerMatchStat[] = [];

      stats?.forEach(stat => {
        if (!stat.player) return;
        
        const playerStat: PlayerMatchStat = {
          player_id: stat.player.id,
          player_name: stat.player.name,
          team_name: "",
          goals: stat.goals || 0,
          assists: stat.assists || 0,
          fouls: stat.fouls || 0,
          penalty_30s: stat.penalty_30s || 0,
          penalty_1m: stat.penalty_1m || 0,
          penalty_2m: stat.penalty_2m || 0,
        };

        const teamId = newPlayerToTeam[stat.player_id];
        if (teamId === team1Id) {
          playerStat.team_name = team1Name;
          team1StatsArr.push(playerStat);
        } else if (teamId === team2Id) {
          playerStat.team_name = team2Name;
          team2StatsArr.push(playerStat);
        }
      });

      // Sort by goals descending
      team1StatsArr.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
      team2StatsArr.sort((a, b) => b.goals - a.goals || b.assists - a.assists);

      setTeam1Stats(team1StatsArr);
      setTeam2Stats(team2StatsArr);
    } catch (error) {
      console.error("Error fetching match stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const scorers1 = team1Stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals);
  const scorers2 = team2Stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals);
  const assisters1 = team1Stats.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists);
  const assisters2 = team2Stats.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists);
  const foulers1 = team1Stats.filter((s) => s.fouls > 0 || s.penalty_30s > 0 || s.penalty_1m > 0 || s.penalty_2m > 0);
  const foulers2 = team2Stats.filter((s) => s.fouls > 0 || s.penalty_30s > 0 || s.penalty_1m > 0 || s.penalty_2m > 0);

  const hasAnyStats = team1Stats.length > 0 || team2Stats.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            Match Details
            {isLive && (
              <Badge variant="destructive" className="animate-pulse flex items-center gap-1">
                <Radio className="h-3 w-3" />
                LIVE
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Match statistics and timer display
          </DialogDescription>
        </DialogHeader>

        {/* Timer Display */}
        {isLive && timerData && (
          <div className="flex justify-center mb-4">
            <TimerDisplay
              durationSeconds={timerData.durationSeconds}
              startedAt={timerData.startedAt}
              pausedAt={timerData.pausedAt}
              elapsedWhenPaused={timerData.elapsedWhenPaused}
            />
          </div>
        )}

        {/* Score */}
        <Card className={`p-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 ${isLive ? 'ring-2 ring-destructive/50' : ''}`}>
          <div className="flex items-center justify-center gap-4">
            <div className="text-center flex-1">
              <p className={`font-semibold text-lg ${team1Score !== null && team2Score !== null && team1Score > team2Score ? "text-primary" : ""}`}>
                {team1Name}
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 py-2 bg-background rounded-lg">
              <span className="text-3xl font-bold text-primary">{team1Score ?? "-"}</span>
              <span className="text-2xl text-muted-foreground">-</span>
              <span className="text-3xl font-bold text-primary">{team2Score ?? "-"}</span>
            </div>
            <div className="text-center flex-1">
              <p className={`font-semibold text-lg ${team1Score !== null && team2Score !== null && team2Score > team1Score ? "text-primary" : ""}`}>
                {team2Name}
              </p>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground animate-pulse">
            Loading statistics...
          </div>
        ) : !hasAnyStats ? (
          <div className="py-8 text-center text-muted-foreground">
            {isLive ? "Waiting for statistics..." : "No statistics recorded for this match"}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Scorers */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Scorers
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  {scorers1.length > 0 ? (
                    scorers1.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{s.player_name}</span>
                        <Badge variant="default" className="text-xs">
                          {s.goals} {s.goals > 1 ? "goals" : "goal"}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}
                </div>
                <div className="space-y-2">
                  {scorers2.length > 0 ? (
                    scorers2.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{s.player_name}</span>
                        <Badge variant="default" className="text-xs">
                          {s.goals} {s.goals > 1 ? "goals" : "goal"}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Assisters */}
            {(assisters1.length > 0 || assisters2.length > 0) && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Assist Providers
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {assisters1.length > 0 ? (
                      assisters1.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{s.player_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {s.assists} {s.assists > 1 ? "assists" : "assist"}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {assisters2.length > 0 ? (
                      assisters2.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{s.player_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {s.assists} {s.assists > 1 ? "assists" : "assist"}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Fouls and penalties */}
            {(foulers1.length > 0 || foulers2.length > 0) && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Fouls & Penalties
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {foulers1.length > 0 ? (
                      foulers1.map((s, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium">{s.player_name}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.fouls > 0 && (
                              <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">
                                {s.fouls}F
                              </Badge>
                            )}
                            {s.penalty_30s > 0 && (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                                {s.penalty_30s}×30s
                              </Badge>
                            )}
                            {s.penalty_1m > 0 && (
                              <Badge variant="outline" className="text-xs text-red-500 border-red-500">
                                {s.penalty_1m}×1min
                              </Badge>
                            )}
                            {s.penalty_2m > 0 && (
                              <Badge variant="outline" className="text-xs text-red-700 border-red-700">
                                {s.penalty_2m}×2min
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {foulers2.length > 0 ? (
                      foulers2.map((s, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium">{s.player_name}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.fouls > 0 && (
                              <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">
                                {s.fouls}F
                              </Badge>
                            )}
                            {s.penalty_30s > 0 && (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                                {s.penalty_30s}×30s
                              </Badge>
                            )}
                            {s.penalty_1m > 0 && (
                              <Badge variant="outline" className="text-xs text-red-500 border-red-500">
                                {s.penalty_1m}×1min
                              </Badge>
                            )}
                            {s.penalty_2m > 0 && (
                              <Badge variant="outline" className="text-xs text-red-700 border-red-700">
                                {s.penalty_2m}×2min
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
