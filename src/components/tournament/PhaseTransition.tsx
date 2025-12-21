import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, ArrowRight } from "lucide-react";

interface PhaseTransitionProps {
  tournamentId: string;
  currentPhase: string;
  onPhaseChanged: () => void;
  isCreator?: boolean;
}

export const PhaseTransition = ({ tournamentId, currentPhase, onPhaseChanged, isCreator = false }: PhaseTransitionProps) => {
  const [teamsForElimination, setTeamsForElimination] = useState<string>("8");
  const [loading, setLoading] = useState(false);

  const handleStartElimination = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({
          current_phase: "single_elimination",
          elimination_type: "single",
          teams_for_elimination: parseInt(teamsForElimination)
        })
        .eq("id", tournamentId);

      if (error) throw error;

      toast.success("Phase d'élimination simple activée !");
      onPhaseChanged();
    } catch (error: any) {
      toast.error("Erreur lors de l'activation de la phase d'élimination");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Mode invité - afficher un message informatif
  if (!isCreator) {
    return (
      <Card className="glass-card p-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Trophy className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold mb-2">
              Phase d'élimination
            </h2>
            <p className="text-muted-foreground">
              La phase d'élimination n'a pas encore commencé.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Le tournoi est actuellement en phase {currentPhase === "round_robin" ? "Round Robin" : "Swiss Round"}.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-8">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Trophy className="h-12 w-12 text-primary" />
          </div>
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-2">
            Phase d'élimination simple
          </h2>
          <p className="text-muted-foreground">
            La phase {currentPhase === "round_robin" ? "Round Robin" : "Swiss Round"} est en cours. 
            Vous pouvez démarrer la phase d'élimination simple en choisissant le nombre d'équipes qualifiées.
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Nombre d'équipes qualifiées
            </label>
            <Select value={teamsForElimination} onValueChange={setTeamsForElimination}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 équipes</SelectItem>
                <SelectItem value="8">8 équipes</SelectItem>
                <SelectItem value="16">16 équipes</SelectItem>
                <SelectItem value="32">32 équipes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleStartElimination}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              "Activation en cours..."
            ) : (
              <>
                Démarrer la phase d'élimination
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>💡 Les équipes seront sélectionnées selon le classement actuel</p>
        </div>
      </div>
    </Card>
  );
};
