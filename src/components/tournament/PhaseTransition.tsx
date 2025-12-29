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

      toast.success("Single elimination phase activated!");
      onPhaseChanged();
    } catch (error: any) {
      toast.error("Error activating elimination phase");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Guest mode - show informative message
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
              Elimination Phase
            </h2>
            <p className="text-muted-foreground">
              The elimination phase has not started yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              The tournament is currently in {currentPhase === "round_robin" ? "Round Robin" : "Swiss Round"} phase.
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
            Single Elimination Phase
          </h2>
          <p className="text-muted-foreground">
            The {currentPhase === "round_robin" ? "Round Robin" : "Swiss Round"} phase is in progress. 
            You can start the single elimination phase by choosing the number of qualifying teams.
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Number of qualifying teams
            </label>
            <Select value={teamsForElimination} onValueChange={setTeamsForElimination}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 teams</SelectItem>
                <SelectItem value="8">8 teams</SelectItem>
                <SelectItem value="16">16 teams</SelectItem>
                <SelectItem value="32">32 teams</SelectItem>
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
              "Activating..."
            ) : (
              <>
                Start Elimination Phase
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          <p>💡 Teams will be selected based on current standings</p>
        </div>
      </div>
    </Card>
  );
};
