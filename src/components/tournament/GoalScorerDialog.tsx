import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User } from "lucide-react";

interface GoalScorerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  teamName: string;
  matchId: string;
  tournamentId: string;
  onGoalRecorded: () => void;
}

export const GoalScorerDialog = ({
  open,
  onOpenChange,
  teamId,
  teamName,
  matchId,
  tournamentId,
  onGoalRecorded,
}: GoalScorerDialogProps) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && teamId) {
      fetchPlayers();
    }
  }, [open, teamId]);

  const fetchPlayers = async () => {
    try {
      // First get the tournament_team_id from the tournament_teams table
      const { data: tournamentTeam, error: ttError } = await supabase
        .from("tournament_teams")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("team_id", teamId)
        .single();

      if (ttError) throw ttError;
      if (!tournamentTeam) {
        toast.error("Équipe introuvable dans ce tournoi");
        return;
      }

      const { data, error } = await supabase
        .from("tournament_team_players")
        .select(`
          id,
          player:players(id, name)
        `)
        .eq("tournament_team_id", tournamentTeam.id);

      if (error) throw error;
      setPlayers(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des joueurs:", error);
      toast.error("Erreur lors du chargement des joueurs");
    }
  };

  const handlePlayerSelect = async (playerId: string, tournamentTeamPlayerId: string) => {
    setLoading(true);
    try {
      // Chercher si une stat existe déjà pour ce joueur dans ce match
      const { data: existingStat, error: fetchError } = await supabase
        .from("player_stats")
        .select("*")
        .eq("player_id", playerId)
        .eq("match_id", matchId)
        .eq("tournament_id", tournamentId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingStat) {
        // Incrémenter les buts
        const { error: updateError } = await supabase
          .from("player_stats")
          .update({ goals: existingStat.goals + 1 })
          .eq("id", existingStat.id);

        if (updateError) throw updateError;
      } else {
        // Créer une nouvelle stat
        const { error: insertError } = await supabase
          .from("player_stats")
          .insert({
            player_id: playerId,
            match_id: matchId,
            tournament_id: tournamentId,
            tournament_team_player_id: tournamentTeamPlayerId,
            goals: 1,
            assists: 0,
            fouls: 0,
            penalty_30s: 0,
            penalty_1m: 0,
            penalty_2m: 0,
          });

        if (insertError) throw insertError;
      }

      toast.success("But enregistré");
      onGoalRecorded();
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement du but:", error);
      toast.error("Erreur lors de l'enregistrement du but");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onGoalRecorded();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qui a marqué le but ?</DialogTitle>
          <DialogDescription>
            Sélectionnez le joueur de {teamName} qui a marqué le but, ou passez cette étape.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun joueur dans cette équipe
            </p>
          ) : (
            players.map((player) => (
              <Button
                key={player.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => handlePlayerSelect(player.player.id, player.id)}
                disabled={loading}
              >
                <User className="mr-2 h-4 w-4" />
                {player.player.name}
              </Button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={handleSkip} disabled={loading}>
            Passer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
