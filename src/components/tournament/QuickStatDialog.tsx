import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface QuickStatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team1: { id: string; name: string };
  team2: { id: string; name: string };
  matchId: string;
  tournamentId: string;
  statType: "assists" | "fouls" | "penalty_30s" | "penalty_1m" | "penalty_2m";
  statLabel: string;
  onStatRecorded?: () => void;
}

export const QuickStatDialog = ({
  open,
  onOpenChange,
  team1,
  team2,
  matchId,
  tournamentId,
  statType,
  statLabel,
  onStatRecorded
}: QuickStatDialogProps) => {
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedTeam(null);
      setPlayers([]);
    }
  }, [open]);

  // Charger les joueurs quand une équipe est sélectionnée
  useEffect(() => {
    if (selectedTeam && open) {
      loadPlayers(selectedTeam.id);
    }
  }, [selectedTeam, open]);

  const loadPlayers = async (teamId: string) => {
    setLoading(true);
    
    // Récupérer le tournament_team_id
    const { data: tournamentTeam } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", teamId)
      .single();

    if (!tournamentTeam) {
      setLoading(false);
      return;
    }

    // Récupérer les joueurs de l'équipe via tournament_team_players
    const { data: teamPlayers } = await supabase
      .from("tournament_team_players")
      .select(`
        player_id,
        players:player_id (
          id,
          name
        )
      `)
      .eq("tournament_team_id", tournamentTeam.id);

    if (teamPlayers) {
      const playersList = teamPlayers
        .filter(tp => tp.players)
        .map(tp => tp.players);
      setPlayers(playersList);
    }

    setLoading(false);
  };

  const handlePlayerSelect = async (playerId: string) => {
    setSaving(true);

    // Vérifier si une stat existe déjà pour ce joueur dans ce match
    const { data: existingStat } = await supabase
      .from("player_stats")
      .select("*")
      .eq("player_id", playerId)
      .eq("match_id", matchId)
      .maybeSingle();

    if (existingStat) {
      // Mettre à jour la stat existante
      await supabase
        .from("player_stats")
        .update({
          [statType]: (existingStat[statType] || 0) + 1,
        })
        .eq("id", existingStat.id);
    } else {
      // Créer une nouvelle stat
      await supabase
        .from("player_stats")
        .insert({
          player_id: playerId,
          tournament_id: tournamentId,
          match_id: matchId,
          [statType]: 1,
        });
    }

    setSaving(false);
    onStatRecorded?.();
    onOpenChange(false);
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {statLabel}
          </DialogTitle>
        </DialogHeader>

        {!selectedTeam ? (
          // Étape 1: Sélection d'équipe
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              Quelle équipe ?
            </p>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setSelectedTeam(team1)}
            >
              {team1.name}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setSelectedTeam(team2)}
            >
              {team2.name}
            </Button>
            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={handleSkip}
            >
              Annuler
            </Button>
          </div>
        ) : loading ? (
          // Chargement des joueurs
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          // Étape 2: Sélection de joueur
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              Quel joueur de {selectedTeam.name} ?
            </p>
            {players.map((player) => (
              <Button
                key={player.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => handlePlayerSelect(player.id)}
                disabled={saving}
              >
                {player.name}
              </Button>
            ))}
            {players.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun joueur dans cette équipe
              </p>
            )}
            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => setSelectedTeam(null)}
              disabled={saving}
            >
              Retour
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
