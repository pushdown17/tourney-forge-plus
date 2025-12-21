import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Target, Users, AlertTriangle } from "lucide-react";

interface MatchStatsViewDialogProps {
  matchId: string;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  tournamentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PlayerMatchStat {
  player_name: string;
  team_name: string;
  goals: number;
  assists: number;
  fouls: number;
  penalty_30s: number;
  penalty_1m: number;
  penalty_2m: number;
}

export const MatchStatsViewDialog = ({
  matchId,
  team1Name,
  team2Name,
  team1Score,
  team2Score,
  tournamentId,
  open,
  onOpenChange,
}: MatchStatsViewDialogProps) => {
  const [stats, setStats] = useState<PlayerMatchStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && matchId) {
      fetchMatchStats();
    }
  }, [open, matchId]);

  const fetchMatchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("player_stats")
        .select(`
          goals, assists, fouls, penalty_30s, penalty_1m, penalty_2m,
          player:player_id(name),
          tournament_team_player:tournament_team_player_id(
            tournament_team:tournament_team_id(
              team:team_id(name)
            )
          )
        `)
        .eq("match_id", matchId);

      if (error) throw error;

      const formattedStats: PlayerMatchStat[] = (data || [])
        .filter((s: any) => s.goals > 0 || s.assists > 0 || s.fouls > 0 || s.penalty_30s > 0 || s.penalty_1m > 0 || s.penalty_2m > 0)
        .map((s: any) => ({
          player_name: s.player?.name || "Joueur inconnu",
          team_name: s.tournament_team_player?.tournament_team?.team?.name || "",
          goals: s.goals || 0,
          assists: s.assists || 0,
          fouls: s.fouls || 0,
          penalty_30s: s.penalty_30s || 0,
          penalty_1m: s.penalty_1m || 0,
          penalty_2m: s.penalty_2m || 0,
        }));

      setStats(formattedStats);
    } catch (error) {
      console.error("Error fetching match stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const team1Stats = stats.filter((s) => s.team_name === team1Name);
  const team2Stats = stats.filter((s) => s.team_name === team2Name);

  const scorers1 = team1Stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals);
  const scorers2 = team2Stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals);
  const assisters1 = team1Stats.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists);
  const assisters2 = team2Stats.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists);
  const foulers1 = team1Stats.filter((s) => s.fouls > 0 || s.penalty_30s > 0 || s.penalty_1m > 0 || s.penalty_2m > 0);
  const foulers2 = team2Stats.filter((s) => s.fouls > 0 || s.penalty_30s > 0 || s.penalty_1m > 0 || s.penalty_2m > 0);

  const hasAnyStats = stats.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Détails du match</DialogTitle>
        </DialogHeader>

        {/* Score */}
        <Card className="p-4 bg-gradient-to-r from-primary/10 via-transparent to-primary/10">
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
            Chargement des statistiques...
          </div>
        ) : !hasAnyStats ? (
          <div className="py-8 text-center text-muted-foreground">
            Aucune statistique enregistrée pour ce match
          </div>
        ) : (
          <div className="space-y-4">
            {/* Buteurs */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Buteurs
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  {scorers1.length > 0 ? (
                    scorers1.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{s.player_name}</span>
                        <Badge variant="default" className="text-xs">
                          {s.goals} {s.goals > 1 ? "buts" : "but"}
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
                          {s.goals} {s.goals > 1 ? "buts" : "but"}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">-</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Passeurs */}
            {(assisters1.length > 0 || assisters2.length > 0) && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Passeurs décisifs
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {assisters1.length > 0 ? (
                      assisters1.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{s.player_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {s.assists} {s.assists > 1 ? "passes" : "passe"}
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
                            {s.assists} {s.assists > 1 ? "passes" : "passe"}
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

            {/* Fautes et pénalités */}
            {(foulers1.length > 0 || foulers2.length > 0) && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Fautes & Pénalités
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
