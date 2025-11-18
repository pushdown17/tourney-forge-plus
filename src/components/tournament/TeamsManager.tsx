import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Download, Users } from "lucide-react";

interface TeamsManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  isCreator?: boolean;
}

export const TeamsManager = ({ tournamentId, isClosed = false, isCreator = false }: TeamsManagerProps) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, [tournamentId]);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select(`
        id,
        group_name,
        team:team_id (
          id,
          name
        )
      `)
      .eq("tournament_id", tournamentId)
      .order("team(name)");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    // Transform data to match expected format
    const transformedTeams = (data || []).map((tt: any) => ({
      id: tt.team.id,
      tournament_team_id: tt.id,
      name: tt.team.name,
      group_name: tt.group_name,
    }));

    setTeams(transformedTeams);
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setLoading(true);
    try {
      // Validate input
      const { teamSchema } = await import("@/lib/validations");
      const validation = teamSchema.safeParse({
        name: teamName,
        tournament_id: tournamentId,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      // Check if team already exists in this tournament
      const { data: existingTournamentTeam } = await supabase
        .from("tournament_teams")
        .select("id, team:team_id(name)")
        .eq("tournament_id", tournamentId)
        .eq("team.name", validation.data.name)
        .maybeSingle();

      if (existingTournamentTeam) {
        toast.error("Cette équipe existe déjà dans ce tournoi");
        return;
      }

      // Check if team exists globally
      const { data: existingTeam } = await supabase
        .from("teams")
        .select("id")
        .eq("name", validation.data.name)
        .maybeSingle();

      let teamId: string;

      if (existingTeam) {
        // Reuse existing team
        teamId = existingTeam.id;
      } else {
        // Create new global team
        const { data: newTeam, error: teamError } = await supabase
          .from("teams")
          .insert({ name: validation.data.name, tournament_id: null })
          .select("id")
          .single();

        if (teamError) throw teamError;
        teamId = newTeam.id;
      }

      // Link team to tournament
      const { error: linkError } = await supabase
        .from("tournament_teams")
        .insert({
          tournament_id: tournamentId,
          team_id: teamId,
        });

      if (linkError) {
        if (linkError.code === '23505') {
          toast.error("Cette équipe existe déjà dans ce tournoi");
        } else {
          throw linkError;
        }
        return;
      }

      toast.success("Équipe ajoutée !");
      setTeamName("");
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (tournamentTeamId: string) => {
    try {
      // Delete from tournament_teams (not from global teams table)
      const { error } = await supabase
        .from("tournament_teams")
        .delete()
        .eq("id", tournamentTeamId);

      if (error) throw error;

      toast.success("Équipe retirée du tournoi");
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const fetchTournamentsForImport = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, start_date")
      .eq("created_by", session.user.id)
      .neq("id", tournamentId)
      .order("start_date", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement des tournois");
      return;
    }

    setTournaments(data || []);
    if (data && data.length > 0) {
      setSelectedTournamentId(data[0].id);
    }
  };

  const fetchTeamsFromTournament = async (sourceTournamentId: string) => {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select(`
        id,
        group_name,
        team:team_id (
          id,
          name
        ),
        tournament_team_players!inner (
          player:player_id (
            id,
            name
          )
        )
      `)
      .eq("tournament_id", sourceTournamentId)
      .order("team(name)");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    // Transform to expected format
    const transformedTeams = (data || []).map((tt: any) => ({
      id: tt.id,
      name: tt.team.name,
      team_id: tt.team.id,
      group_name: tt.group_name,
      players: tt.tournament_team_players.map((ttp: any) => ttp.player),
    }));

    setAvailableTeams(transformedTeams);
  };

  useEffect(() => {
    if (selectedTournamentId) {
      fetchTeamsFromTournament(selectedTournamentId);
    }
  }, [selectedTournamentId]);

  const handleOpenImportDialog = () => {
    setShowImportDialog(true);
    fetchTournamentsForImport();
  };

  const toggleTeamSelection = (teamId: string) => {
    const newSelection = new Set(selectedTeamIds);
    if (newSelection.has(teamId)) {
      newSelection.delete(teamId);
    } else {
      newSelection.add(teamId);
    }
    setSelectedTeamIds(newSelection);
  };

  const handleImportTeams = async () => {
    if (selectedTeamIds.size === 0) {
      toast.error("Veuillez sélectionner au moins une équipe");
      return;
    }

    setImporting(true);
    try {
      const teamsToImport = availableTeams.filter(team => selectedTeamIds.has(team.id));

      for (const team of teamsToImport) {
        // Check if team already exists in this tournament
        const { data: existingTournamentTeam } = await supabase
          .from("tournament_teams")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("team_id", team.team_id)
          .maybeSingle();

        if (existingTournamentTeam) {
          toast.error(`L'équipe ${team.name} existe déjà dans ce tournoi`);
          continue;
        }

        // Link team to tournament
        const { data: newTournamentTeam, error: linkError } = await supabase
          .from("tournament_teams")
          .insert({
            tournament_id: tournamentId,
            team_id: team.team_id,
            group_name: team.group_name,
          })
          .select()
          .single();

        if (linkError) throw linkError;

        // Import players if any
        if (team.players && team.players.length > 0) {
          for (const player of team.players) {
            // Check if player exists globally
            const { data: existingPlayer } = await supabase
              .from("players")
              .select("id")
              .eq("name", player.name)
              .maybeSingle();

            let playerId: string;

            if (existingPlayer) {
              playerId = existingPlayer.id;
            } else {
              // Create new global player
              const { data: newPlayer, error: playerError } = await supabase
                .from("players")
                .insert({ name: player.name, team_id: null })
                .select("id")
                .single();

              if (playerError) throw playerError;
              playerId = newPlayer.id;
            }

            // Link player to tournament team
            const { error: playerLinkError } = await supabase
              .from("tournament_team_players")
              .insert({
                tournament_team_id: newTournamentTeam.id,
                player_id: playerId,
              });

            if (playerLinkError && playerLinkError.code !== '23505') {
              throw playerLinkError;
            }
          }
        }
      }

      toast.success(`${selectedTeamIds.size} équipe(s) importée(s) avec succès !`);
      setShowImportDialog(false);
      setSelectedTeamIds(new Set());
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {isCreator && (
        <Card className="glass-card p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-xl md:text-2xl font-bold">Ajouter une équipe</h2>
            <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={handleOpenImportDialog} className="w-full sm:w-auto">
                  <Download className="h-4 w-4 mr-2" />
                  Importer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Importer des équipes existantes</DialogTitle>
                  <DialogDescription>
                    Sélectionnez un tournoi et les équipes (avec leurs joueurs) à importer
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {tournaments.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">
                        Aucun autre tournoi trouvé
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>Sélectionner un tournoi</Label>
                        <Select value={selectedTournamentId} onValueChange={setSelectedTournamentId}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {tournaments.map((tournament) => (
                              <SelectItem key={tournament.id} value={tournament.id}>
                                {tournament.name} - {new Date(tournament.start_date).toLocaleDateString("fr-FR")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {availableTeams.length > 0 ? (
                        <>
                          <div className="border-t pt-4">
                            <Label className="mb-3 block">Équipes disponibles ({availableTeams.length})</Label>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                              {availableTeams.map((team) => (
                                <div
                                  key={team.id}
                                  className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-colors"
                                >
                                  <Checkbox
                                    checked={selectedTeamIds.has(team.id)}
                                    onCheckedChange={() => toggleTeamSelection(team.id)}
                                  />
                                  <div className="flex-1">
                                    <p className="font-medium">{team.name}</p>
                                    {team.players && team.players.length > 0 && (
                                      <p className="text-sm text-muted-foreground">
                                        {team.players.length} joueur{team.players.length > 1 ? "s" : ""}: {team.players.map((p: any) => p.name).join(", ")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowImportDialog(false);
                                setSelectedTeamIds(new Set());
                              }}
                            >
                              Annuler
                            </Button>
                            <Button
                              onClick={handleImportTeams}
                              disabled={importing || selectedTeamIds.size === 0 || isClosed}
                            >
                              {importing ? "Import en cours..." : `Importer ${selectedTeamIds.size} équipe(s)`}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground">
                            Aucune équipe dans ce tournoi
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <form onSubmit={handleAddTeam} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="teamName" className="sr-only">Nom de l'équipe</Label>
              <Input
                id="teamName"
                placeholder="Nom de l'équipe"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" disabled={loading || isClosed} className="h-11 w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </form>
        </Card>
      )}

      <Card className="glass-card p-4 md:p-6">
        <h2 className="text-xl md:text-2xl font-bold mb-4">Équipes inscrites ({teams.length})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between p-3 md:p-4 bg-secondary/20 rounded-lg min-h-[56px]"
            >
              <span className="font-medium text-sm md:text-base">{team.name}</span>
              {isCreator && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTeam(team.id)}
                  className="h-10 w-10 p-0"
                  disabled={isClosed}
                >
                  <Trash2 className="h-5 w-5 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {teams.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Aucune équipe inscrite pour le moment
          </p>
        )}
      </Card>
    </div>
  );
};
