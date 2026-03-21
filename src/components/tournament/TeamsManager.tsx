import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Download, Users, Pencil, Check, X } from "lucide-react";
import { GroupedTeamsManager } from "./GroupedTeamsManager";

interface TeamsManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  isCreator?: boolean;
  numberOfGroups?: number;
  showPlayers?: boolean;
}

export const TeamsManager = ({ tournamentId, isClosed = false, isCreator = false, numberOfGroups = 1, showPlayers = false }: TeamsManagerProps) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<Record<string, string[]>>({});
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTeams();
  }, [tournamentId]);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select(`id, group_name, team:team_id (id, name)`)
      .eq("tournament_id", tournamentId)
      .order("team(name)");

    if (error) {
      toast.error("Error loading teams");
      return;
    }

    const transformedTeams = (data || []).map((tt: any) => ({
      id: tt.team.id,
      tournament_team_id: tt.id,
      name: tt.team.name,
      group_name: tt.group_name,
    }));

    setTeams(transformedTeams);

    if (showPlayers && transformedTeams.length > 0) {
      const ttIds = (data || []).map((tt: any) => tt.id);
      const { data: ttpData } = await supabase
        .from("tournament_team_players")
        .select("tournament_team_id, player:player_id (name)")
        .in("tournament_team_id", ttIds);

      const map: Record<string, string[]> = {};
      (data || []).forEach((tt: any) => {
        map[tt.id] = (ttpData || [])
          .filter((p: any) => p.tournament_team_id === tt.id)
          .map((p: any) => p.player?.name)
          .filter(Boolean);
      });
      setTeamPlayers(map);
    }
  };

  const startEditing = (team: any) => {
    setEditingTeamId(team.id);
    setEditingName(team.name);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const cancelEditing = () => {
    setEditingTeamId(null);
    setEditingName("");
  };

  const handleRenameTeam = async (teamId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;

    // Optimistic update
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, name: trimmed } : t));
    setEditingTeamId(null);

    const { error } = await supabase
      .from("teams")
      .update({ name: trimmed })
      .eq("id", teamId);

    if (error) {
      toast.error("Erreur lors du renommage");
      // Revert on error
      fetchTeams();
    } else {
      toast.success("Équipe renommée avec succès !");
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, teamId: string) => {
    if (e.key === "Enter") handleRenameTeam(teamId);
    if (e.key === "Escape") cancelEditing();
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setLoading(true);
    try {
      const { teamSchema } = await import("@/lib/validations");
      const validation = teamSchema.safeParse({ name: teamName, tournament_id: tournamentId });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const { data: existingTeam } = await supabase
        .from("teams")
        .select("id, name")
        .ilike("name", validation.data.name)
        .maybeSingle();

      if (existingTeam) {
        const { data: existingTournamentTeam } = await supabase
          .from("tournament_teams")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("team_id", existingTeam.id)
          .maybeSingle();

        if (existingTournamentTeam) {
          toast.error("This team already exists in this tournament");
          return;
        }

        const { error: linkError } = await supabase
          .from("tournament_teams")
          .insert({ tournament_id: tournamentId, team_id: existingTeam.id });

        if (linkError) throw linkError;

        toast.success("Team added!");
        setTeamName("");
        await fetchTeams();
        return;
      }

      const { data: newTeam, error: teamError } = await supabase
        .from("teams")
        .insert({ name: validation.data.name })
        .select("id")
        .single();

      if (teamError) {
        if (teamError.code === '23505') {
          toast.error("A team with this name already exists");
        } else {
          throw teamError;
        }
        return;
      }

      const { error: linkError } = await supabase
        .from("tournament_teams")
        .insert({ tournament_id: tournamentId, team_id: newTeam.id });

      if (linkError) throw linkError;

      toast.success("Team added!");
      setTeamName("");
      await fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (tournamentTeamId: string) => {
    try {
      const { error } = await supabase
        .from("tournament_teams")
        .delete()
        .eq("id", tournamentTeamId);

      if (error) throw error;

      toast.success("Team removed from tournament");
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const fetchAllTeams = async () => {
    const { data, error } = await supabase.from("teams").select("id, name").order("name");

    if (error) {
      toast.error("Error loading teams");
      return;
    }

    const { data: currentTeams } = await supabase
      .from("tournament_teams")
      .select("team_id")
      .eq("tournament_id", tournamentId);

    const currentTeamIds = new Set((currentTeams || []).map(tt => tt.team_id));
    const filteredTeams = (data || [])
      .filter(team => !currentTeamIds.has(team.id))
      .map(team => ({ id: team.id, name: team.name, team_id: team.id }));

    const uniqueTeams = filteredTeams.filter((team, index, self) =>
      index === self.findIndex(t => t.name === team.name)
    );

    setAllTeams(uniqueTeams);
    setAvailableTeams(uniqueTeams);
  };

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setAvailableTeams(allTeams);
    } else {
      setAvailableTeams(allTeams.filter(team => team.name.toLowerCase().includes(searchTerm.toLowerCase())));
    }
  }, [searchTerm, allTeams]);

  const handleOpenImportDialog = () => {
    setShowImportDialog(true);
    setSearchTerm("");
    fetchAllTeams();
  };

  const toggleTeamSelection = (teamId: string) => {
    const newSelection = new Set(selectedTeamIds);
    if (newSelection.has(teamId)) newSelection.delete(teamId);
    else newSelection.add(teamId);
    setSelectedTeamIds(newSelection);
  };

  const handleImportTeams = async () => {
    if (selectedTeamIds.size === 0) {
      toast.error("Please select at least one team");
      return;
    }

    setImporting(true);
    try {
      const teamsToImport = availableTeams.filter(team => selectedTeamIds.has(team.id));

      for (const team of teamsToImport) {
        const { data: existingTournamentTeam } = await supabase
          .from("tournament_teams")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("team_id", team.team_id)
          .maybeSingle();

        if (existingTournamentTeam) continue;

        const { error: linkError } = await supabase
          .from("tournament_teams")
          .insert({ tournament_id: tournamentId, team_id: team.team_id });

        if (linkError) throw linkError;
      }

      toast.success(`${selectedTeamIds.size} team(s) imported successfully!`);
      setShowImportDialog(false);
      setSelectedTeamIds(new Set());
      setSearchTerm("");
      await fetchTeams();
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
            <h2 className="text-xl md:text-2xl font-bold">Add Team</h2>
            <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={handleOpenImportDialog} className="w-full sm:w-auto">
                  <Download className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Import existing teams</DialogTitle>
                  <DialogDescription>
                    Select teams to import. Players will need to be added manually.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="search">Search team</Label>
                    <Input id="search" placeholder="Team name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mt-1" />
                  </div>

                  {availableTeams.length > 0 ? (
                    <>
                      <div className="border-t pt-4">
                        <Label className="mb-3 block">Available teams ({availableTeams.length}){searchTerm && ` - Search results`}</Label>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {availableTeams.map((team) => (
                            <div key={team.id} className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-colors">
                              <Checkbox checked={selectedTeamIds.has(team.id)} onCheckedChange={() => toggleTeamSelection(team.id)} />
                              <div className="flex-1"><p className="font-medium">{team.name}</p></div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => { setShowImportDialog(false); setSelectedTeamIds(new Set()); setSearchTerm(""); }}>Cancel</Button>
                        <Button onClick={handleImportTeams} disabled={importing || selectedTeamIds.size === 0 || isClosed}>
                          {importing ? "Importing..." : `Import ${selectedTeamIds.size} team(s)`}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">{searchTerm ? "No teams found" : "No teams available"}</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <form onSubmit={handleAddTeam} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="teamName" className="sr-only">Team Name</Label>
              <Input id="teamName" placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-11" />
            </div>
            <Button type="submit" disabled={loading || isClosed} className="h-11 w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </form>
        </Card>
      )}

      {numberOfGroups >= 2 ? (
        <GroupedTeamsManager
          teams={teams}
          isCreator={isCreator}
          isClosed={isClosed}
          onDeleteTeam={handleDeleteTeam}
          onTeamsUpdated={fetchTeams}
        />
      ) : (
        <Card className="glass-card p-4 md:p-6">
          <h2 className="text-xl md:text-2xl font-bold mb-4">Registered Teams ({teams.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {teams.map((team) => {
              const players = teamPlayers[team.tournament_team_id] || [];
              const isEditing = editingTeamId === team.id;
              return (
                <div key={team.id} className="flex flex-col p-3 md:p-4 bg-secondary/20 rounded-lg gap-2">
                  <div className="flex items-center justify-between min-h-[32px] gap-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          ref={editInputRef}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => handleRenameKeyDown(e, team.id)}
                          className="h-8 text-sm flex-1"
                        />
                        <Button variant="ghost" size="sm" onClick={() => handleRenameTeam(team.id)} className="h-8 w-8 p-0 text-primary hover:text-primary">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEditing} className="h-8 w-8 p-0 text-muted-foreground">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-sm md:text-base truncate">{team.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isCreator && !isClosed && (
                            <Button variant="ghost" size="sm" onClick={() => startEditing(team)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isCreator && (
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteTeam(team.tournament_team_id)} className="h-8 w-8 p-0" disabled={isClosed}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {showPlayers && players.length > 0 && (
                    <ul className="space-y-1 pl-1 border-t border-border/30 pt-2">
                      {players.map((name, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-primary inline-block shrink-0" />
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {teams.length === 0 && <p className="text-muted-foreground text-center py-8">No teams registered yet</p>}
        </Card>
      )}
    </div>
  );
};
