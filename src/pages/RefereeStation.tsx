import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wifi, WifiOff, Plus, Minus, Check, Trophy, AlertTriangle, Target, Ban, Clock } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";
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

interface PlayerStat {
  id: string;
  player_id: string;
  player_name: string;
  goals: number;
  assists: number;
  fouls: number;
  penalty_30s: number;
  penalty_1m: number;
  penalty_2m: number;
  tournament_team_player_id: string;
}

interface Team {
  id: string;
  name: string;
  score: number;
  players: PlayerStat[];
}

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  team1_score: number | null;
  team2_score: number | null;
  phase: string;
  round_number: number;
}

const RefereeStation = () => {
  const { stationId } = useParams<{ stationId: string }>();
  const [station, setStation] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [team1, setTeam1] = useState<Team | null>(null);
  const [team2, setTeam2] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchStation = useCallback(async () => {
    if (!stationId) return;

    const { data: stationData, error: stationError } = await supabase
      .from("referee_stations")
      .select("*, tournament:tournament_id(id, name)")
      .eq("id", stationId)
      .single();

    if (stationError) {
      console.error("Error fetching station:", stationError);
      toast.error("Station not found");
      setLoading(false);
      return;
    }

    setStation(stationData);
    setTournament(stationData.tournament);

    if (stationData.current_match_id) {
      await fetchMatch(stationData.current_match_id);
    } else {
      setMatch(null);
      setTeam1(null);
      setTeam2(null);
    }

    setLoading(false);
  }, [stationId]);

  const fetchMatch = async (matchId: string) => {
    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select(`
        *,
        team1:teams!matches_team1_id_fkey(id, name),
        team2:teams!matches_team2_id_fkey(id, name)
      `)
      .eq("id", matchId)
      .single();

    if (matchError) {
      console.error("Error fetching match:", matchError);
      return;
    }

    setMatch(matchData);
    
    // Fetch players for both teams
    await Promise.all([
      fetchTeamPlayers(matchData.team1_id, matchData.team1, matchData.team1_score || 0, matchId, true),
      fetchTeamPlayers(matchData.team2_id, matchData.team2, matchData.team2_score || 0, matchId, false)
    ]);
  };

  const fetchTeamPlayers = async (
    teamId: string, 
    teamData: { id: string; name: string }, 
    score: number,
    matchId: string,
    isTeam1: boolean
  ) => {
    // Get tournament_team for this team
    const { data: tournamentTeam } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", station?.tournament_id || tournament?.id)
      .eq("team_id", teamId)
      .single();

    if (!tournamentTeam) return;

    // Get players
    const { data: playersData } = await supabase
      .from("tournament_team_players")
      .select(`
        id,
        player:player_id(id, name)
      `)
      .eq("tournament_team_id", tournamentTeam.id);

    if (!playersData) return;

    // Get stats for this match
    const { data: statsData } = await supabase
      .from("player_stats")
      .select("*")
      .eq("match_id", matchId);

    const players: PlayerStat[] = playersData.map((p: any) => {
      const existingStat = statsData?.find((s: any) => s.player_id === p.player.id);
      return {
        id: existingStat?.id || '',
        player_id: p.player.id,
        player_name: p.player.name,
        goals: existingStat?.goals || 0,
        assists: existingStat?.assists || 0,
        fouls: existingStat?.fouls || 0,
        penalty_30s: existingStat?.penalty_30s || 0,
        penalty_1m: existingStat?.penalty_1m || 0,
        penalty_2m: existingStat?.penalty_2m || 0,
        tournament_team_player_id: p.id
      };
    });

    const teamState: Team = {
      id: teamId,
      name: teamData.name,
      score,
      players
    };

    if (isTeam1) {
      setTeam1(teamState);
    } else {
      setTeam2(teamState);
    }
  };

  // Setup realtime subscription
  useEffect(() => {
    if (!stationId) return;

    fetchStation();

    const channel = supabase
      .channel(`station-${stationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referee_stations',
          filter: `id=eq.${stationId}`
        },
        (payload) => {
          console.log('Station update received:', payload);
          fetchStation();
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stationId, fetchStation]);

  const updateScore = (teamNumber: 1 | 2, delta: number) => {
    if (teamNumber === 1 && team1) {
      setTeam1({ ...team1, score: Math.max(0, team1.score + delta) });
    } else if (teamNumber === 2 && team2) {
      setTeam2({ ...team2, score: Math.max(0, team2.score + delta) });
    }
  };

  const updatePlayerStat = (
    teamNumber: 1 | 2, 
    playerId: string, 
    stat: keyof Omit<PlayerStat, 'id' | 'player_id' | 'player_name' | 'tournament_team_player_id'>,
    delta: number
  ) => {
    const updateTeam = (team: Team) => ({
      ...team,
      players: team.players.map(p => 
        p.player_id === playerId 
          ? { ...p, [stat]: Math.max(0, p[stat] + delta) }
          : p
      )
    });

    if (teamNumber === 1 && team1) {
      setTeam1(updateTeam(team1));
    } else if (teamNumber === 2 && team2) {
      setTeam2(updateTeam(team2));
    }
  };

  const saveStats = async () => {
    if (!match || !team1 || !team2) return;

    setSaving(true);
    try {
      // Update match scores
      const { error: matchError } = await supabase
        .from("matches")
        .update({
          team1_score: team1.score,
          team2_score: team2.score,
          winner_id: team1.score > team2.score ? team1.id : 
                     team2.score > team1.score ? team2.id : null
        })
        .eq("id", match.id);

      if (matchError) throw matchError;

      // Save player stats for both teams
      const allPlayers = [...team1.players, ...team2.players];
      
      for (const player of allPlayers) {
        const statData = {
          player_id: player.player_id,
          tournament_id: station.tournament_id,
          match_id: match.id,
          goals: player.goals,
          assists: player.assists,
          fouls: player.fouls,
          penalty_30s: player.penalty_30s,
          penalty_1m: player.penalty_1m,
          penalty_2m: player.penalty_2m,
          tournament_team_player_id: player.tournament_team_player_id
        };

        if (player.id) {
          await supabase
            .from("player_stats")
            .update(statData)
            .eq("id", player.id);
        } else {
          await supabase
            .from("player_stats")
            .insert(statData);
        }
      }

      toast.success("Stats saved!");
    } catch (error: any) {
      console.error("Error saving stats:", error);
      toast.error("Error saving stats");
    } finally {
      setSaving(false);
    }
  };

  const validateMatch = async () => {
    await saveStats();

    // Clear the station's current match
    const { error } = await supabase
      .from("referee_stations")
      .update({ current_match_id: null })
      .eq("id", stationId);

    if (error) {
      toast.error("Error validating match");
      return;
    }

    toast.success("Match validated and sent!");
    setConfirmDialogOpen(false);
    setMatch(null);
    setTeam1(null);
    setTeam2(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!station) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Station Not Found</h1>
          <p className="text-muted-foreground">This referee station doesn't exist or has been deleted.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{station.station_name} {station.station_number}</h1>
            <p className="text-xs text-muted-foreground">{tournament?.name}</p>
          </div>
          <Badge variant={connected ? "default" : "destructive"} className="gap-1">
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "Live" : "Offline"}
          </Badge>
        </div>
      </header>

      <main className="p-4 pb-24">
        {!match ? (
          <Card className="p-8 text-center">
            <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Waiting for match...</h2>
            <p className="text-muted-foreground">
              The tournament manager will assign a match to this station.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Match info */}
            <Card className="p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                {match.phase === 'swiss' ? 'Swiss' : match.phase === 'round_robin' ? 'Round Robin' : 'Elimination'} 
                {' · '}Round {match.round_number}
              </p>
            </Card>

            {/* Scoreboard */}
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-4 items-center">
                {/* Team 1 */}
                <div className="text-center">
                  <p className="font-bold text-lg truncate">{team1?.name}</p>
                </div>
                
                {/* Scores */}
                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => updateScore(1, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold tabular-nums">{team1?.score || 0}</span>
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => updateScore(1, -1)}
                      disabled={!team1 || team1.score === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <span className="text-2xl font-light text-muted-foreground">-</span>
                  
                  <div className="flex flex-col items-center gap-2">
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => updateScore(2, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold tabular-nums">{team2?.score || 0}</span>
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => updateScore(2, -1)}
                      disabled={!team2 || team2.score === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Team 2 */}
                <div className="text-center">
                  <p className="font-bold text-lg truncate">{team2?.name}</p>
                </div>
              </div>
            </Card>

            {/* Team 1 Players */}
            {team1 && (
              <Collapsible 
                open={expandedTeam === 'team1'} 
                onOpenChange={(open) => setExpandedTeam(open ? 'team1' : null)}
              >
                <Card>
                  <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
                    <span className="font-semibold">{team1.name} - Players</span>
                    {expandedTeam === 'team1' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t divide-y">
                      {team1.players.map(player => (
                        <PlayerStatRow 
                          key={player.player_id}
                          player={player}
                          onStatChange={(stat, delta) => updatePlayerStat(1, player.player_id, stat, delta)}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Team 2 Players */}
            {team2 && (
              <Collapsible 
                open={expandedTeam === 'team2'} 
                onOpenChange={(open) => setExpandedTeam(open ? 'team2' : null)}
              >
                <Card>
                  <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
                    <span className="font-semibold">{team2.name} - Players</span>
                    {expandedTeam === 'team2' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t divide-y">
                      {team2.players.map(player => (
                        <PlayerStatRow 
                          key={player.player_id}
                          player={player}
                          onStatChange={(stat, delta) => updatePlayerStat(2, player.player_id, stat, delta)}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </div>
        )}
      </main>

      {/* Bottom Actions */}
      {match && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={saveStats}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
          <Button 
            className="flex-1"
            onClick={() => setConfirmDialogOpen(true)}
          >
            <Check className="h-4 w-4 mr-2" />
            End Match
          </Button>
        </div>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End match?</AlertDialogTitle>
            <AlertDialogDescription>
              Final score: <strong>{team1?.name} {team1?.score} - {team2?.score} {team2?.name}</strong>
              <br /><br />
              This will save all stats and notify the tournament manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={validateMatch}>
              Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface PlayerStatRowProps {
  player: PlayerStat;
  onStatChange: (stat: keyof Omit<PlayerStat, 'id' | 'player_id' | 'player_name' | 'tournament_team_player_id'>, delta: number) => void;
}

const PlayerStatRow = ({ player, onStatChange }: PlayerStatRowProps) => {
  return (
    <div className="p-4">
      <p className="font-medium mb-3">{player.player_name}</p>
      <div className="grid grid-cols-3 gap-3">
        {/* Goals */}
        <StatCounter 
          icon={<Target className="h-4 w-4" />}
          label="Goals"
          value={player.goals}
          onIncrement={() => onStatChange('goals', 1)}
          onDecrement={() => onStatChange('goals', -1)}
        />
        
        {/* Assists */}
        <StatCounter 
          icon={<Trophy className="h-4 w-4" />}
          label="Assists"
          value={player.assists}
          onIncrement={() => onStatChange('assists', 1)}
          onDecrement={() => onStatChange('assists', -1)}
        />
        
        {/* Fouls */}
        <StatCounter 
          icon={<Ban className="h-4 w-4" />}
          label="Fouls"
          value={player.fouls}
          onIncrement={() => onStatChange('fouls', 1)}
          onDecrement={() => onStatChange('fouls', -1)}
        />
      </div>
      
      {/* Penalties */}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>Penalties:</span>
        <button 
          className={`px-2 py-1 rounded ${player.penalty_30s > 0 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-muted'}`}
          onClick={() => onStatChange('penalty_30s', player.penalty_30s > 0 ? -1 : 1)}
        >
          30s: {player.penalty_30s}
        </button>
        <button 
          className={`px-2 py-1 rounded ${player.penalty_1m > 0 ? 'bg-orange-500/20 text-orange-500' : 'bg-muted'}`}
          onClick={() => onStatChange('penalty_1m', player.penalty_1m > 0 ? -1 : 1)}
        >
          1m: {player.penalty_1m}
        </button>
        <button 
          className={`px-2 py-1 rounded ${player.penalty_2m > 0 ? 'bg-red-500/20 text-red-500' : 'bg-muted'}`}
          onClick={() => onStatChange('penalty_2m', player.penalty_2m > 0 ? -1 : 1)}
        >
          2m: {player.penalty_2m}
        </button>
      </div>
    </div>
  );
};

interface StatCounterProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

const StatCounter = ({ icon, label, value, onIncrement, onDecrement }: StatCounterProps) => (
  <div className="flex flex-col items-center gap-1">
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <Button 
        size="icon" 
        variant="ghost" 
        className="h-8 w-8"
        onClick={onDecrement}
        disabled={value === 0}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="text-lg font-bold tabular-nums w-6 text-center">{value}</span>
      <Button 
        size="icon" 
        variant="ghost" 
        className="h-8 w-8"
        onClick={onIncrement}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  </div>
);

export default RefereeStation;
