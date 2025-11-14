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
      .from("teams")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    setTeams(data || []);
    if (data && data.length > 0 && !selectedTeamId) {
      setSelectedTeamId(data[0].id);
    }
  };

  const fetchPlayers = async () => {
    const { data, error } = await supabase
      .from("players")
      .select(`
        *,
        team:team_id(id, name)
      `)
      .in("team_id", teams.map(t => t.id))
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des joueurs");
      return;
    }

    setPlayers(data || []);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !selectedTeamId) return;

    await insertPlayer(playerName.trim(), selectedTeamId);
  };

  const insertPlayer = async (name: string, teamId: string) => {
    setLoading(true);
    try {
      // Validate input
      const { playerSchema } = await import("@/lib/validations");
      const validation = playerSchema.safeParse({
        name,
        team_id: teamId,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const { error } = await supabase
        .from("players")
        .insert({
          name: validation.data.name,
          team_id: validation.data.team_id,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error("Ce joueur existe déjà dans cette équipe");
        } else {
          throw error;
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

  const handleDeletePlayer = async (playerId: string) => {
    try {
      const { error } = await supabase
        .from("players")
        .delete()
        .eq("id", playerId);

      if (error) throw error;

      toast.success("Joueur supprimé");
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
    const newTeamId = over.id as string;

    const player = players.find(p => p.id === playerId);
    if (!player || player.team_id === newTeamId) return;

    // Update player's team
    try {
      const { error } = await supabase
        .from("players")
        .update({ team_id: newTeamId })
        .eq("id", playerId);

      if (error) {
        if (error.code === '23505') {
          toast.error("Un joueur avec ce nom existe déjà dans l'équipe cible");
        } else {
          throw error;
        }
        return;
      }

      const oldTeam = teams.find(t => t.id === player.team_id);
      const newTeam = teams.find(t => t.id === newTeamId);

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
            key={player.id}
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
            onDelete(player.id);
          }}
          disabled={isClosed}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
};
