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
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [showPlayersDialog, setShowPlayersDialog] = useState(false);
  const [currentTeamForPlayers, setCurrentTeamForPlayers] = useState<{ id: string; name: string; tournament_team_id: string } | null>(null);
  const [historicalPlayers, setHistoricalPlayers] = useState<any[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [newPlayerName, setNewPlayerName] = useState("");

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
      const { data: newTournamentTeam, error: linkError } = await supabase
        .from("tournament_teams")
        .insert({
          tournament_id: tournamentId,
          team_id: teamId,
        })
        .select("id")
        .single();

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
      await fetchTeams();
      
      // Open players dialog for the newly added team
      await openPlayersDialogForTeam(teamId, validation.data.name, newTournamentTeam.id);
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

  const fetchAllTeams = async () => {
    // Récupérer toutes les équipes de la base de données
    const { data, error } = await supabase
      .from("teams")
      .select(`
        id,
        name,
        players!players_team_id_fkey (
          id,
          name
        )
      `)
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    // Exclure les équipes déjà dans ce tournoi
    const { data: currentTeams } = await supabase
      .from("tournament_teams")
      .select("team_id")
      .eq("tournament_id", tournamentId);

    const currentTeamIds = new Set((currentTeams || []).map(tt => tt.team_id));

  const filteredTeams = (data || [])
    .filter(team => !currentTeamIds.has(team.id))
    .map(team => ({
      id: team.id,
      name: team.name,
      team_id: team.id,
      players: team.players || [],
    }));

  // Remove duplicates by team name, keeping only the first occurrence
  const uniqueTeams = filteredTeams.filter((team, index, self) =>
    index === self.findIndex(t => t.name === team.name)
  );

  setAllTeams(uniqueTeams);
  setAvailableTeams(uniqueTeams);
  };

  useEffect(() => {
    // Filtrer les équipes selon le terme de recherche
    if (searchTerm.trim() === "") {
      setAvailableTeams(allTeams);
    } else {
      const filtered = allTeams.filter(team => 
        team.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setAvailableTeams(filtered);
    }
  }, [searchTerm, allTeams]);

  const handleOpenImportDialog = () => {
    setShowImportDialog(true);
    setSearchTerm("");
    fetchAllTeams();
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

  const openPlayersDialogForTeam = async (teamId: string, teamName: string, tournamentTeamId: string) => {
    try {
      // First, get all tournament_team records for this team in other tournaments
      const { data: tournamentTeams, error: ttError } = await supabase
        .from("tournament_teams")
        .select("id")
        .eq("team_id", teamId)
        .neq("tournament_id", tournamentId);

      if (ttError) throw ttError;

      if (!tournamentTeams || tournamentTeams.length === 0) {
        setHistoricalPlayers([]);
        setCurrentTeamForPlayers({ id: teamId, name: teamName, tournament_team_id: tournamentTeamId });
        setSelectedPlayerIds(new Set());
        setNewPlayerName("");
        setShowPlayersDialog(true);
        return;
      }

      const tournamentTeamIds = tournamentTeams.map(tt => tt.id);

      // Fetch historical players for this team from previous tournaments
      const { data: players, error } = await supabase
        .from("tournament_team_players")
        .select(`
          player:player_id (
            id,
            name
          )
        `)
        .in("tournament_team_id", tournamentTeamIds);

      if (error) throw error;

      // Extract unique players
      const uniquePlayers = Array.from(
        new Map(
          (players || [])
            .filter(p => p.player)
            .map((p: any) => [p.player.id, p.player])
        ).values()
      );

      setHistoricalPlayers(uniquePlayers);
      setCurrentTeamForPlayers({ id: teamId, name: teamName, tournament_team_id: tournamentTeamId });
      setSelectedPlayerIds(new Set());
      setNewPlayerName("");
      setShowPlayersDialog(true);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des joueurs");
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    const newSelection = new Set(selectedPlayerIds);
    if (newSelection.has(playerId)) {
      newSelection.delete(playerId);
    } else {
      newSelection.add(playerId);
    }
    setSelectedPlayerIds(newSelection);
  };

  const handleAddNewPlayer = async () => {
    if (!newPlayerName.trim() || !currentTeamForPlayers) return;

    try {
      // Create new player
      const { data: newPlayer, error: playerError } = await supabase
        .from("players")
        .insert({ name: newPlayerName.trim(), team_id: currentTeamForPlayers.id })
        .select("id, name")
        .single();

      if (playerError) throw playerError;

      // Add to historical players list and select it
      setHistoricalPlayers([...historicalPlayers, newPlayer]);
      setSelectedPlayerIds(new Set([...selectedPlayerIds, newPlayer.id]));
      setNewPlayerName("");
      toast.success("Joueur ajouté !");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleImportSelectedPlayers = async () => {
    if (!currentTeamForPlayers) return;

    try {
      const playersToImport = historicalPlayers.filter(player => selectedPlayerIds.has(player.id));

      for (const player of playersToImport) {
        const { error } = await supabase
          .from("tournament_team_players")
          .insert({
            tournament_team_id: currentTeamForPlayers.tournament_team_id,
            player_id: player.id,
          });

        if (error && error.code !== '23505') {
          throw error;
        }
      }

      if (selectedPlayerIds.size > 0) {
        toast.success(`${selectedPlayerIds.size} joueur(s) ajouté(s) à l'équipe !`);
      }
      
      setShowPlayersDialog(false);
      setCurrentTeamForPlayers(null);
      setHistoricalPlayers([]);
      setSelectedPlayerIds(new Set());
    } catch (error: any) {
      toast.error(error.message);
    }
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
          })
          .select()
          .single();

        if (linkError) throw linkError;

        // Import players if any
        if (team.players && team.players.length > 0) {
          for (const player of team.players) {
            // Link player to tournament team
            const { error: playerLinkError } = await supabase
              .from("tournament_team_players")
              .insert({
                tournament_team_id: newTournamentTeam.id,
                player_id: player.id,
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
      setSearchTerm("");
      await fetchTeams();
      
      // Open players dialog for the first imported team if only one was selected
      if (selectedTeamIds.size === 1) {
        const importedTeam = teamsToImport[0];
        const { data: tournamentTeam } = await supabase
          .from("tournament_teams")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("team_id", importedTeam.team_id)
          .single();
        
        if (tournamentTeam) {
          await openPlayersDialogForTeam(importedTeam.team_id, importedTeam.name, tournamentTeam.id);
        }
      }
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
                    Sélectionnez les équipes (avec leurs joueurs) à importer
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="search">Rechercher une équipe</Label>
                    <Input
                      id="search"
                      placeholder="Nom de l'équipe..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  {availableTeams.length > 0 ? (
                    <>
                      <div className="border-t pt-4">
                        <Label className="mb-3 block">
                          Équipes disponibles ({availableTeams.length})
                          {searchTerm && ` - Résultats de la recherche`}
                        </Label>
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
                            setSearchTerm("");
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
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">
                        {searchTerm ? "Aucune équipe trouvée" : "Aucune équipe disponible"}
                      </p>
                    </div>
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
                  onClick={() => handleDeleteTeam(team.tournament_team_id)}
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

      <Dialog open={showPlayersDialog} onOpenChange={setShowPlayersDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter des joueurs à {currentTeamForPlayers?.name}</DialogTitle>
            <DialogDescription>
              Sélectionnez les joueurs qui ont déjà joué avec cette équipe ou ajoutez-en de nouveaux
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {historicalPlayers.length > 0 && (
              <div className="border-t pt-4">
                <Label className="mb-3 block">
                  Joueurs ayant déjà joué avec cette équipe ({historicalPlayers.length})
                </Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {historicalPlayers.map((player: any) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-colors"
                    >
                      <Checkbox
                        checked={selectedPlayerIds.has(player.id)}
                        onCheckedChange={() => togglePlayerSelection(player.id)}
                      />
                      <p className="font-medium">{player.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <Label className="mb-2 block">Ajouter un nouveau joueur</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nom du joueur"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewPlayer();
                    }
                  }}
                />
                <Button onClick={handleAddNewPlayer} disabled={!newPlayerName.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPlayersDialog(false);
                  setCurrentTeamForPlayers(null);
                  setHistoricalPlayers([]);
                  setSelectedPlayerIds(new Set());
                }}
              >
                Passer
              </Button>
              <Button
                onClick={handleImportSelectedPlayers}
                disabled={selectedPlayerIds.size === 0}
              >
                Valider ({selectedPlayerIds.size} joueur{selectedPlayerIds.size > 1 ? "s" : ""})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
