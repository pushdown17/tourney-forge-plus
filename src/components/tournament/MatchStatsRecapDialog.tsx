import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trophy, Target, Handshake, AlertTriangle, Timer, Clock } from "lucide-react";
import { MatchTimeline } from "./MatchTimeline";

interface MatchStatsRecapDialogProps {
  match: any;
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PlayerWithStats {
  id: string;
  name: string;
  goals: number;
  assists: number;
  fouls: number;
  penalty_30s: number;
  penalty_1m: number;
  penalty_2m: number;
}

export const MatchStatsRecapDialog = ({ 
  match, 
  tournamentId, 
  open, 
  onOpenChange 
}: MatchStatsRecapDialogProps) => {
  const [team1Players, setTeam1Players] = useState<PlayerWithStats[]>([]);
  const [team2Players, setTeam2Players] = useState<PlayerWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && match) {
      fetchMatchStats();
    }
  }, [open, match]);

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
        .eq("match_id", match.id);

      if (error) throw error;

      // Get tournament_teams to know which player belongs to which team
      const { data: tournamentTeams } = await supabase
        .from("tournament_teams")
        .select("id, team_id")
        .eq("tournament_id", tournamentId)
        .in("team_id", [match.team1_id, match.team2_id]);

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

      const playerToTeam = tournamentPlayers?.reduce((acc, tp) => {
        acc[tp.player_id] = teamMapping[tp.tournament_team_id];
        return acc;
      }, {} as Record<string, string>) || {};

      // Separate stats by team
      const team1Stats: PlayerWithStats[] = [];
      const team2Stats: PlayerWithStats[] = [];

      stats?.forEach(stat => {
        if (!stat.player) return;
        
        const playerStat: PlayerWithStats = {
          id: stat.player.id,
          name: stat.player.name,
          goals: stat.goals || 0,
          assists: stat.assists || 0,
          fouls: stat.fouls || 0,
          penalty_30s: stat.penalty_30s || 0,
          penalty_1m: stat.penalty_1m || 0,
          penalty_2m: stat.penalty_2m || 0,
        };

        const teamId = playerToTeam[stat.player_id];
        if (teamId === match.team1_id) {
          team1Stats.push(playerStat);
        } else if (teamId === match.team2_id) {
          team2Stats.push(playerStat);
        }
      });

      // Sort by goals descending
      team1Stats.sort((a, b) => b.goals - a.goals || b.assists - a.assists);
      team2Stats.sort((a, b) => b.goals - a.goals || b.assists - a.assists);

      setTeam1Players(team1Stats);
      setTeam2Players(team2Stats);
    } catch (error) {
      console.error("Error fetching match stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const isWinner = (teamId: string) => match.winner_id === teamId;

  const getTotalPenalties = (player: PlayerWithStats) => 
    player.penalty_30s + player.penalty_1m + player.penalty_2m;

  const renderPlayerStats = (players: PlayerWithStats[], teamName: string, isWinnerTeam: boolean) => {
    const playersWithStats = players.filter(player => 
      player.goals > 0 || player.assists > 0 || player.fouls > 0 || getTotalPenalties(player) > 0
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h4 className="font-semibold">{teamName}</h4>
          {isWinnerTeam && (
            <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">
              <Trophy className="h-3 w-3 mr-1" />
              Winner
            </Badge>
          )}
        </div>
        
        {playersWithStats.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No statistics recorded</p>
        ) : (
          <div className="space-y-2">
            {playersWithStats.map(player => (
              <div 
                key={player.id} 
                className="p-2 bg-background/50 rounded-lg border border-border/30"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-medium text-sm">{player.name}</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {player.goals > 0 && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Target className="h-3 w-3" />
                        {player.goals}
                      </Badge>
                    )}
                    {player.assists > 0 && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Handshake className="h-3 w-3" />
                        {player.assists}
                      </Badge>
                    )}
                    {player.fouls > 0 && (
                      <Badge variant="outline" className="gap-1 text-xs bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                        <AlertTriangle className="h-3 w-3" />
                        {player.fouls}
                      </Badge>
                    )}
                    {player.penalty_30s > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <Timer className="h-3 w-3" />
                        {player.penalty_30s}×30sec
                      </Badge>
                    )}
                    {player.penalty_1m > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <Timer className="h-3 w-3" />
                        {player.penalty_1m}×1min
                      </Badge>
                    )}
                    {player.penalty_2m > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <Timer className="h-3 w-3" />
                        {player.penalty_2m}×2min
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Match Recap
          </DialogTitle>
        </DialogHeader>

        {/* Final score */}
        <Card className="p-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/10">
          <div className="flex items-center justify-center gap-4">
            <div className={`text-center flex-1 ${isWinner(match.team1_id) ? 'text-primary font-bold' : ''}`}>
              <p className="text-lg">{match?.team1?.name}</p>
            </div>
            <div className="flex items-center gap-3 px-6 py-2 bg-background rounded-lg">
              <span className={`text-3xl font-bold ${isWinner(match.team1_id) ? 'text-primary' : 'text-muted-foreground'}`}>
                {match?.team1_score ?? 0}
              </span>
              <span className="text-2xl text-muted-foreground">-</span>
              <span className={`text-3xl font-bold ${isWinner(match.team2_id) ? 'text-primary' : 'text-muted-foreground'}`}>
                {match?.team2_score ?? 0}
              </span>
            </div>
            <div className={`text-center flex-1 ${isWinner(match.team2_id) ? 'text-primary font-bold' : ''}`}>
              <p className="text-lg">{match?.team2?.name}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Match finished
          </p>
        </Card>

        {/* Player stats */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Card className="p-4 bg-muted/30 space-y-6">
            {/* Match Timeline */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Chronologie du match
              </h4>
              <MatchTimeline
                matchId={match.id}
                team1Id={match.team1_id}
                team2Id={match.team2_id}
                team1Name={match?.team1?.name || "Team 1"}
                team2Name={match?.team2?.name || "Team 2"}
              />
            </div>

            <div className="border-t border-border/50 pt-4">
              <h4 className="font-semibold text-sm mb-3">Statistiques des joueurs</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderPlayerStats(team1Players, match?.team1?.name || "Team 1", isWinner(match.team1_id))}
                {renderPlayerStats(team2Players, match?.team2?.name || "Team 2", isWinner(match.team2_id))}
              </div>
            </div>
            
            {team1Players.length === 0 && team2Players.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No player statistics were recorded for this match.
              </p>
            )}
          </Card>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 justify-center text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Target className="h-3 w-3" /> Goals
          </div>
          <div className="flex items-center gap-1">
            <Handshake className="h-3 w-3" /> Assists
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Fouls
          </div>
          <div className="flex items-center gap-1">
            <Timer className="h-3 w-3" /> Penalties
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
