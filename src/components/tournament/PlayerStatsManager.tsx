import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Target, AlertTriangle, Clock, Plus, Edit } from "lucide-react";

interface PlayerStatsManagerProps {
  tournamentId: string;
  isClosed?: boolean;
}

interface PlayerWithStats {
  id: string;
  name: string;
  team: { name: string };
  totalGoals: number;
  totalAssists: number;
  totalFouls: number;
  totalPenalty30s: number;
  totalPenalty1m: number;
  totalPenalty2m: number;
}

export const PlayerStatsManager = ({ tournamentId, isClosed = false }: PlayerStatsManagerProps) => {
  const [players, setPlayers] = useState<PlayerWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [matches, setMatches] = useState<any[]>([]);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  
  // Form state
  const [goals, setGoals] = useState(0);
  const [assists, setAssists] = useState(0);
  const [fouls, setFouls] = useState(0);
  const [penalty30s, setPenalty30s] = useState(0);
  const [penalty1m, setPenalty1m] = useState(0);
  const [penalty2m, setPenalty2m] = useState(0);

  useEffect(() => {
    fetchPlayerStats();
    fetchMatches();
    fetchAllPlayers();
  }, [tournamentId]);

  const fetchAllPlayers = async () => {
    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (teamsError || !teamsData) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    const teamIds = teamsData.map(t => t.id);

    const { data, error } = await supabase
      .from("players")
      .select(`
        id,
        name,
        team_id,
        team:team_id(id, name)
      `)
      .in("team_id", teamIds)
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des joueurs");
      return;
    }

    // Filter out players without a team
    const playersWithTeams = (data || []).filter(p => p.team);
    setAllPlayers(playersWithTeams);
  };

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        id,
        round_number,
        phase,
        team1:teams!team1_id(name),
        team2:teams!team2_id(name)
      `)
      .eq("tournament_id", tournamentId)
      .order("round_number");

    if (error) {
      toast.error("Erreur lors du chargement des matchs");
      return;
    }

    setMatches(data || []);
  };

  const fetchPlayerStats = async () => {
    setLoading(true);
    try {
      // Fetch teams for this tournament
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id")
        .eq("tournament_id", tournamentId);

      if (teamsError) throw teamsError;

      const teamIds = (teamsData || []).map(t => t.id);

      // Fetch all players with their teams
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select(`
          id,
          name,
          team_id,
          team:team_id(id, name)
        `)
        .in("team_id", teamIds);

      if (playersError) throw playersError;

      // Filter players with teams only
      const validPlayers = (playersData || []).filter(p => p.team);

      // Fetch all stats for these players
      const playerIds = validPlayers.map(p => p.id);
      
      const { data: statsData, error: statsError } = await supabase
        .from("player_stats")
        .select("*")
        .in("player_id", playerIds)
        .eq("tournament_id", tournamentId);

      if (statsError) throw statsError;

      // Aggregate stats per player
      const playersWithStats: PlayerWithStats[] = validPlayers.map(player => {
        const playerStats = (statsData || []).filter(s => s.player_id === player.id);
        
        return {
          id: player.id,
          name: player.name,
          team: player.team,
          totalGoals: playerStats.reduce((sum, s) => sum + s.goals, 0),
          totalAssists: playerStats.reduce((sum, s) => sum + s.assists, 0),
          totalFouls: playerStats.reduce((sum, s) => sum + s.fouls, 0),
          totalPenalty30s: playerStats.reduce((sum, s) => sum + s.penalty_30s, 0),
          totalPenalty1m: playerStats.reduce((sum, s) => sum + s.penalty_1m, 0),
          totalPenalty2m: playerStats.reduce((sum, s) => sum + s.penalty_2m, 0),
        };
      });

      // Sort by goals descending
      playersWithStats.sort((a, b) => b.totalGoals - a.totalGoals);
      
      setPlayers(playersWithStats);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des statistiques");
    } finally {
      setLoading(false);
    }
  };

  const handleAddStats = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPlayerId) {
      toast.error("Veuillez sélectionner un joueur");
      return;
    }

    try {
      const { error } = await supabase
        .from("player_stats")
        .insert({
          player_id: selectedPlayerId,
          tournament_id: tournamentId,
          match_id: selectedMatchId || null,
          goals,
          assists,
          fouls,
          penalty_30s: penalty30s,
          penalty_1m: penalty1m,
          penalty_2m: penalty2m,
        });

      if (error) throw error;

      toast.success("Statistiques ajoutées !");
      setShowAddDialog(false);
      resetForm();
      fetchPlayerStats();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setSelectedPlayerId("");
    setSelectedMatchId("");
    setGoals(0);
    setAssists(0);
    setFouls(0);
    setPenalty30s(0);
    setPenalty1m(0);
    setPenalty2m(0);
  };

  const getTotalPenaltyMinutes = (player: PlayerWithStats) => {
    return (player.totalPenalty30s * 0.5) + player.totalPenalty1m + (player.totalPenalty2m * 2);
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Statistiques individuelles
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Performances détaillées de chaque joueur
            </p>
          </div>
          
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter des stats
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Ajouter des statistiques</DialogTitle>
                <DialogDescription>
                  Enregistrer les performances d'un joueur
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAddStats} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Joueur *</Label>
                  <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un joueur" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPlayers.map((player) => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.name} - {player.team?.name || "Sans équipe"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Match (optionnel)</Label>
                  <Select value={selectedMatchId} onValueChange={setSelectedMatchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Match général (non spécifié)" />
                    </SelectTrigger>
                    <SelectContent>
                      {matches.map((match) => (
                        <SelectItem key={match.id} value={match.id}>
                          R{match.round_number} - {match.team1?.name} vs {match.team2?.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="goals">
                      <Target className="inline h-4 w-4 mr-1" />
                      Buts
                    </Label>
                    <Input
                      id="goals"
                      type="number"
                      min="0"
                      value={goals}
                      onChange={(e) => setGoals(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assists">
                      <Trophy className="inline h-4 w-4 mr-1" />
                      Passes
                    </Label>
                    <Input
                      id="assists"
                      type="number"
                      min="0"
                      value={assists}
                      onChange={(e) => setAssists(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fouls">
                      <AlertTriangle className="inline h-4 w-4 mr-1" />
                      Fautes
                    </Label>
                    <Input
                      id="fouls"
                      type="number"
                      min="0"
                      value={fouls}
                      onChange={(e) => setFouls(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="penalty30s">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Pénalités 30s
                    </Label>
                    <Input
                      id="penalty30s"
                      type="number"
                      min="0"
                      value={penalty30s}
                      onChange={(e) => setPenalty30s(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="penalty1m">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Pénalités 1 min
                    </Label>
                    <Input
                      id="penalty1m"
                      type="number"
                      min="0"
                      value={penalty1m}
                      onChange={(e) => setPenalty1m(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="penalty2m">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Pénalités 2 min
                    </Label>
                    <Input
                      id="penalty2m"
                      type="number"
                      min="0"
                      value={penalty2m}
                      onChange={(e) => setPenalty2m(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">
                    Enregistrer
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground animate-pulse">Chargement...</p>
          </div>
        ) : players.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Équipe</TableHead>
                  <TableHead className="text-center">
                    <Target className="inline h-4 w-4 mr-1" />
                    Buts
                  </TableHead>
                  <TableHead className="text-center">
                    <Trophy className="inline h-4 w-4 mr-1" />
                    Passes
                  </TableHead>
                  <TableHead className="text-center">
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                    Fautes
                  </TableHead>
                  <TableHead className="text-center">30s</TableHead>
                  <TableHead className="text-center">1min</TableHead>
                  <TableHead className="text-center">2min</TableHead>
                  <TableHead className="text-center">
                    <Clock className="inline h-4 w-4 mr-1" />
                    Total min
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((player, index) => (
                  <TableRow key={player.id} className="hover:bg-secondary/50">
                    <TableCell className="font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{player.name}</TableCell>
                    <TableCell className="text-muted-foreground">{player.team.name}</TableCell>
                    <TableCell className="text-center font-bold text-primary">
                      {player.totalGoals}
                    </TableCell>
                    <TableCell className="text-center">{player.totalAssists}</TableCell>
                    <TableCell className="text-center">{player.totalFouls}</TableCell>
                    <TableCell className="text-center">{player.totalPenalty30s}</TableCell>
                    <TableCell className="text-center">{player.totalPenalty1m}</TableCell>
                    <TableCell className="text-center">{player.totalPenalty2m}</TableCell>
                    <TableCell className="text-center font-medium">
                      {getTotalPenaltyMinutes(player).toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              Aucune statistique enregistrée pour le moment
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
