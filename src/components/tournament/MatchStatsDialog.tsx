import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScoreInput } from "@/components/ui/score-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, ChevronDown, ChevronUp, Save } from "lucide-react";

interface MatchStatsDialogProps {
  match: any;
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScoreUpdate: () => void;
}

export const MatchStatsDialog = ({ 
  match, 
  tournamentId, 
  open, 
  onOpenChange,
  onScoreUpdate 
}: MatchStatsDialogProps) => {
  const [team1Players, setTeam1Players] = useState<any[]>([]);
  const [team2Players, setTeam2Players] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, any>>({});
  const [tournamentTeamPlayerMap, setTournamentTeamPlayerMap] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [localScores, setLocalScores] = useState({ team1: 0, team2: 0 });
  const [manualScoreMode, setManualScoreMode] = useState(false);

  // Handle dialog close - refresh parent only if there were changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasChanges) {
      onScoreUpdate();
      setHasChanges(false);
    }
    onOpenChange(newOpen);
  };

  useEffect(() => {
    if (open && match) {
      fetchPlayers();
    }
  }, [open, match]);

  useEffect(() => {
    if (team1Players.length > 0 || team2Players.length > 0) {
      fetchPlayerStats();
    }
  }, [team1Players, team2Players]);

  const fetchPlayersForTeam = async (teamId: string) => {
    // First get the tournament_team
    const { data: tournamentTeam } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!tournamentTeam) return [];

    // Then get players via tournament_team_players
    const { data: tournamentPlayers, error } = await supabase
      .from("tournament_team_players")
      .select("id, player:players(id, name)")
      .eq("tournament_team_id", tournamentTeam.id);

    if (error || !tournamentPlayers) return [];

    // Build tournament_team_player_id -> player_id mapping
    const mapping: Record<string, string> = {};
    tournamentPlayers.forEach(tp => {
      if (tp.player) {
        mapping[tp.player.id] = tp.id;
      }
    });
    setTournamentTeamPlayerMap(prev => ({ ...prev, ...mapping }));

    return tournamentPlayers
      .filter(tp => tp.player)
      .map(tp => tp.player)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  };

  const fetchPlayers = async () => {
    const [players1, players2] = await Promise.all([
      fetchPlayersForTeam(match.team1_id),
      fetchPlayersForTeam(match.team2_id)
    ]);

    setTeam1Players(players1);
    setTeam2Players(players2);
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
    const tournamentTeamPlayerId = tournamentTeamPlayerMap[playerId];

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
          tournament_team_player_id: tournamentTeamPlayerId || null,
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

    // Update in database
    const winnerId = team1Goals > team2Goals ? match.team1_id : 
                    team2Goals > team1Goals ? match.team2_id : null;
    
    const { error: updateError } = await supabase
      .from("matches")
      .update({
        team1_score: team1Goals,
        team2_score: team2Goals,
        winner_id: winnerId,
      })
      .eq("id", match.id);

    if (!updateError) {
      // Mark that there were changes (parent will be refreshed on close)
      setHasChanges(true);
      setLocalScores({ team1: team1Goals, team2: team2Goals });
    }
  };

  // Calculate scores from player stats
  const team1GoalsCalc = team1Players.reduce((sum, player) => {
    return sum + (playerStats[player.id]?.goals || 0);
  }, 0);

  const team2GoalsCalc = team2Players.reduce((sum, player) => {
    return sum + (playerStats[player.id]?.goals || 0);
  }, 0);

  // Use local scores if updated, otherwise match scores
  const displayTeam1Score = hasChanges ? localScores.team1 : (match?.team1_score ?? team1GoalsCalc);
  const displayTeam2Score = hasChanges ? localScores.team2 : (match?.team2_score ?? team2GoalsCalc);
  const hasPlayers = team1Players.length > 0 || team2Players.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Match Statistics
          </DialogTitle>
        </DialogHeader>

        {/* Current match score */}
        <Card className="p-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/10">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center flex-1">
              <p className="font-semibold text-lg">{match?.team1?.name}</p>
            </div>
            {manualScoreMode ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-background rounded-lg">
                <ScoreInput
                  value={localScores.team1}
                  onChange={(value) => setLocalScores(prev => ({ ...prev, team1: value }))}
                />
                <span className="text-2xl text-muted-foreground font-bold">-</span>
                <ScoreInput
                  value={localScores.team2}
                  onChange={(value) => setLocalScores(prev => ({ ...prev, team2: value }))}
                />
                <Button
                  size="sm"
                  className="ml-2 gap-1"
                  onClick={async () => {
                    const winnerId = localScores.team1 > localScores.team2 ? match.team1_id :
                                    localScores.team2 > localScores.team1 ? match.team2_id : null;
                    const { error } = await supabase
                      .from("matches")
                      .update({
                        team1_score: localScores.team1,
                        team2_score: localScores.team2,
                        winner_id: winnerId,
                      })
                      .eq("id", match.id);
                    if (error) {
                      toast.error("Erreur lors de la mise à jour du score");
                    } else {
                      toast.success("Score mis à jour");
                      setHasChanges(true);
                      setManualScoreMode(false);
                    }
                  }}
                >
                  <Save className="h-4 w-4" />
                  Valider
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-3 px-6 py-2 bg-background rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setLocalScores({
                    team1: displayTeam1Score,
                    team2: displayTeam2Score,
                  });
                  setManualScoreMode(true);
                }}
                title="Cliquer pour modifier le score"
              >
                <span className="text-3xl font-bold text-primary">{displayTeam1Score}</span>
                <span className="text-2xl text-muted-foreground">-</span>
                <span className="text-3xl font-bold text-primary">{displayTeam2Score}</span>
              </div>
            )}
            <div className="text-center flex-1">
              <p className="font-semibold text-lg">{match?.team2?.name}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {manualScoreMode
              ? "Modifiez le score puis cliquez Valider"
              : hasPlayers
                ? "Le score se met à jour automatiquement via les buts des joueurs"
                : "Cliquez sur le score pour le modifier directement"}
          </p>
        </Card>

        <Card className="p-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team 1 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match?.team1?.name}
              </h4>
              <div className="space-y-2">
                {team1Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                  />
                ))}
                {team1Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">No players registered</p>
                )}
              </div>
            </div>

            {/* Team 2 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match?.team2?.name}
              </h4>
              <div className="space-y-2">
                {team2Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                  />
                ))}
                {team2Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">No players registered</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

interface PlayerStatsInputProps {
  player: any;
  stats: any;
  onUpdate: (field: string, value: number) => void;
}

const PlayerStatsInput = ({ player, stats, onUpdate }: PlayerStatsInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
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
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="p-2 bg-background/50 rounded-lg hover:bg-background/70 cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{player.name}</span>
            <div className="flex items-center gap-2">
              {hasAnyStats && (
                <span className="text-xs text-muted-foreground">
                  {stats.goals || 0}G {stats.assists || 0}A
                  {hasFouls && <span className="ml-1 text-yellow-600">{stats.fouls}F</span>}
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

          {/* 30s Penalty */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium min-w-[50px]">30s Pen.</span>
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

          {/* 1min Penalty */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium min-w-[50px]">1min Pen.</span>
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

          {/* 2min Penalty */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium min-w-[50px]">2min Pen.</span>
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
