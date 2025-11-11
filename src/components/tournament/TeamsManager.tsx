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
      .from("teams")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    setTeams(data || []);
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

      const { error } = await supabase
        .from("teams")
        .insert({
          name: validation.data.name,
          tournament_id: validation.data.tournament_id,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("Cette équipe existe déjà dans ce tournoi");
        } else {
          throw error;
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

  const handleDeleteTeam = async (teamId: string) => {
    try {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);

      if (error) throw error;

      toast.success("Équipe supprimée");
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
      .from("teams")
      .select(`
        id,
        name,
        players:players(id, name)
      `)
      .eq("tournament_id", sourceTournamentId)
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    setAvailableTeams(data || []);
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
      const teamsToImport = availableTeams.filter(t => selectedTeamIds.has(t.id));

      for (const team of teamsToImport) {
        // Insert team
        const { data: newTeam, error: teamError } = await supabase
          .from("teams")
          .insert({
            name: team.name,
            tournament_id: tournamentId,
          })
          .select()
          .single();

        if (teamError) {
          if (teamError.code === '23505') {
            toast.error(`L'équipe "${team.name}" existe déjà dans ce tournoi`);
            continue;
          }
          throw teamError;
        }

        // Insert players if any
        if (team.players && team.players.length > 0) {
          const playersToInsert = team.players.map((player: any) => ({
            name: player.name,
            team_id: newTeam.id,
          }));

          const { error: playersError } = await supabase
            .from("players")
            .insert(playersToInsert);

          if (playersError) throw playersError;
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
