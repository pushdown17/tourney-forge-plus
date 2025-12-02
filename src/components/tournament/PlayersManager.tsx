import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerAutocomplete } from "@/components/ui/player-autocomplete";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Users, GripVertical } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, closestCenter } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

interface PlayersManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  isCreator?: boolean;
}

export const PlayersManager = ({ tournamentId, isClosed = false, isCreator = false }: PlayersManagerProps) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [activePlayer, setActivePlayer] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchTeams();
  }, [tournamentId]);

  useEffect(() => {
    if (teams.length > 0) {
      fetchPlayers();
    }
  }, [teams.length]);

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

    // Transform to expected format
    const transformedTeams = (data || []).map((tt: any) => ({
      id: tt.id,
      name: tt.team.name,
      team_id: tt.team.id,
    }));

    setTeams(transformedTeams);
    if (transformedTeams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(transformedTeams[0].id);
    }
  };

  const fetchPlayers = async () => {
    const { data, error } = await supabase
      .from("tournament_team_players")
      .select(`
        id,
        tournament_team_id,
        player:player_id (
          id,
          name
        ),
        tournament_team:tournament_team_id (
          id,
          team:team_id (
            id,
            name
          )
        )
      `)
      .in("tournament_team_id", teams.map(t => t.id))
      .order("player(name)");

    if (error) {
      toast.error("Erreur lors du chargement des joueurs");
      return;
    }

    // Transform to expected format
    const transformedPlayers = (data || []).map((ttp: any) => ({
      id: ttp.player.id,
      tournament_team_player_id: ttp.id,
      name: ttp.player.name,
      team_id: ttp.tournament_team_id,
      team: {
        id: ttp.tournament_team.team.id,
        name: ttp.tournament_team.team.name,
      },
    }));

    setPlayers(transformedPlayers);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !selectedTeamId) return;

    await insertPlayer(playerName.trim(), selectedTeamId);
  };

  const insertPlayer = async (name: string, tournamentTeamId: string) => {
    setLoading(true);
    try {
      // Validate input
      const { playerSchema } = await import("@/lib/validations");
      const validation = playerSchema.safeParse({
        name,
        team_id: tournamentTeamId, // Using team_id field for validation even though it's tournament_team_id
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      console.log("Checking for existing player in team:", { name: validation.data.name, tournamentTeamId });

      // Check if player exists globally (case-insensitive)
      const { data: existingPlayer } = await supabase
        .from("players")
        .select("id, name")
        .ilike("name", validation.data.name)
        .maybeSingle();

      console.log("Existing player found:", existingPlayer);

      let playerId: string;

      if (existingPlayer) {
        // Reuse existing player - now check if already in this team
        playerId = existingPlayer.id;
        
        const { data: existingLink } = await supabase
          .from("tournament_team_players")
          .select("id")
          .eq("tournament_team_id", tournamentTeamId)
          .eq("player_id", playerId)
          .maybeSingle();

        console.log("Existing link in team:", existingLink);

        if (existingLink) {
          toast.error("Ce joueur existe déjà dans cette équipe");
          return;
        }
      } else {
        // Create new global player
        const { data: newPlayer, error: playerError } = await supabase
          .from("players")
          .insert({ name: validation.data.name, team_id: null })
          .select("id")
          .single();

        if (playerError) {
          if (playerError.code === '23505') {
            toast.error("Un joueur avec ce nom existe déjà");
          } else {
            throw playerError;
          }
          return;
        }
        playerId = newPlayer.id;
      }

      console.log("Linking player to team:", { playerId, tournamentTeamId });

      // Link player to tournament team
      const { error: linkError } = await supabase
        .from("tournament_team_players")
        .insert({
          tournament_team_id: tournamentTeamId,
          player_id: playerId,
        });

      if (linkError) {
        if (linkError.code === '23505') {
          toast.error("Ce joueur existe déjà dans cette équipe");
        } else {
          throw linkError;
        }
        return;
      }

      toast.success("Joueur ajouté !");
      setPlayerName("");
      fetchPlayers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlayer = async (tournamentTeamPlayerId: string) => {
    try {
      // Delete from tournament_team_players (not from global players table)
      const { error } = await supabase
        .from("tournament_team_players")
        .delete()
        .eq("id", tournamentTeamPlayerId);

      if (error) throw error;

      toast.success("Joueur retiré de l'équipe");
      fetchPlayers();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getPlayersByTeam = (teamId: string) => {
    return players.filter(p => p.team_id === teamId);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const player = players.find(p => p.id === active.id);
    setActivePlayer(player);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePlayer(null);

    if (!over || active.id === over.id) return;

    const playerId = active.id as string;
    const newTournamentTeamId = over.id as string;

    const player = players.find(p => p.id === playerId);
    if (!player || player.team_id === newTournamentTeamId) return;

    // Update player's tournament team
    try {
      // Check if player already exists in target team
      const { data: existingLink } = await supabase
        .from("tournament_team_players")
        .select("id")
        .eq("tournament_team_id", newTournamentTeamId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (existingLink) {
        toast.error("Ce joueur existe déjà dans l'équipe cible");
        return;
      }

      // Delete old link
      const { error: deleteError } = await supabase
        .from("tournament_team_players")
        .delete()
        .eq("id", player.tournament_team_player_id);

      if (deleteError) throw deleteError;

      // Create new link
      const { error: insertError } = await supabase
        .from("tournament_team_players")
        .insert({
          tournament_team_id: newTournamentTeamId,
          player_id: playerId,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error("Un joueur avec ce nom existe déjà dans l'équipe cible");
        } else {
          throw insertError;
        }
        return;
      }

      const oldTeam = teams.find(t => t.id === player.team_id);
      const newTeam = teams.find(t => t.id === newTournamentTeamId);

      toast.success(`${player.name} transféré de ${oldTeam?.name} vers ${newTeam?.name}`);
      fetchPlayers();
    } catch (error: any) {
      toast.error("Erreur lors du transfert du joueur");
    }
  };

  if (teams.length === 0) {
    return (
      <Card className="glass-card p-8 text-center">
        <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">
          Vous devez d'abord créer des équipes avant d'ajouter des joueurs.
        </p>
      </Card>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {isCreator && (
          <>
            <Card className="glass-card p-6">
              <h2 className="text-2xl font-bold mb-4">Ajouter un joueur</h2>
              <form onSubmit={handleAddPlayer} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="teamSelect">Équipe</Label>
                    <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                      <SelectTrigger id="teamSelect">
                        <SelectValue placeholder="Sélectionner une équipe" />
                      </SelectTrigger>
                      <SelectContent className="bg-background/95 backdrop-blur-sm border-border/50">
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="playerName">Nom du joueur</Label>
                    <div className="flex gap-2">
                      <PlayerAutocomplete
                        value={playerName}
                        onChange={setPlayerName}
                        placeholder="Nom Prénom"
                        disabled={loading || isClosed}
                      />
                      <Button type="submit" disabled={loading || isClosed}>
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            </Card>

            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm text-foreground flex items-center gap-2">
                <GripVertical className="h-4 w-4" />
                Astuce : Glissez-déposez un joueur sur une autre équipe pour le transférer
              </p>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {teams.map((team) => {
            const teamPlayers = getPlayersByTeam(team.id);
            return (
              <TeamCard
                key={team.id}
                team={team}
                players={teamPlayers}
                onDeletePlayer={handleDeletePlayer}
                isClosed={isClosed}
                isCreator={isCreator}
              />
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activePlayer ? (
          <div className="flex items-center gap-3 p-3 bg-primary/20 border-2 border-primary rounded-lg shadow-lg">
            <GripVertical className="h-4 w-4 text-primary" />
            <span className="font-medium">{activePlayer.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

interface TeamCardProps {
  team: any;
  players: any[];
  onDeletePlayer: (playerId: string) => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

const TeamCard = ({ team, players, onDeletePlayer, isClosed = false, isCreator = false }: TeamCardProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: team.id,
  });

  return (
    <Card
      ref={setNodeRef}
      className={`glass-card p-6 transition-all ${
        isOver ? "ring-2 ring-primary bg-primary/5 scale-105" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">{team.name}</h3>
        <span className="text-sm text-muted-foreground">
          {players.length} joueur{players.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-2">
        {players.map((player, index) => (
          <DraggablePlayer
            key={player.tournament_team_player_id}
            player={player}
            index={index}
            onDelete={onDeletePlayer}
            isClosed={isClosed}
            isCreator={isCreator}
          />
        ))}
        {players.length === 0 && (
          <p className="text-muted-foreground text-center py-4 text-sm">
            Aucun joueur dans cette équipe
          </p>
        )}
      </div>
    </Card>
  );
};

interface DraggablePlayerProps {
  player: any;
  index: number;
  onDelete: (playerId: string) => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

const DraggablePlayer = ({ player, index, onDelete, isClosed = false, isCreator = false }: DraggablePlayerProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: player.id,
    disabled: !isCreator,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-secondary/20 rounded-lg hover:bg-secondary/30 transition-all ${
        isCreator ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-50 scale-95" : ""}`}
      {...(isCreator ? attributes : {})}
      {...(isCreator ? listeners : {})}
    >
      <div className="flex items-center gap-3">
        {isCreator && <GripVertical className="h-4 w-4 text-muted-foreground" />}
        <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
        <span className="font-medium">{player.name}</span>
      </div>
      {isCreator && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(player.tournament_team_player_id);
          }}
          disabled={isClosed}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
};
