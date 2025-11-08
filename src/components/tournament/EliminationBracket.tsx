import { Card } from "@/components/ui/card";
import { PhaseTransition } from "./PhaseTransition";

interface EliminationBracketProps {
  tournamentId: string;
  eliminationType: "single" | "double" | null;
  currentPhase: string;
  onPhaseChanged: () => void;
}

export const EliminationBracket = ({ 
  tournamentId, 
  eliminationType, 
  currentPhase,
  onPhaseChanged 
}: EliminationBracketProps) => {
  // Si on n'est pas encore en phase d'élimination, afficher le composant de transition
  if (currentPhase !== "single_elimination" && currentPhase !== "double_elimination") {
    return (
      <PhaseTransition 
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
      />
    );
  }

  // Si on est en phase d'élimination mais pas de type défini
  if (!eliminationType) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground">
          Erreur de configuration du tournoi.
        </p>
      </Card>
    );
  }

  // Phase d'élimination active
  return (
    <Card className="glass-card p-8">
      <h2 className="text-2xl font-bold mb-4">
        Phase d'élimination {eliminationType === "single" ? "simple" : "double"}
      </h2>
      <p className="text-muted-foreground mb-8">
        Le bracket d'élimination sera généré automatiquement.
      </p>
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Fonctionnalité en cours de développement
        </p>
      </div>
    </Card>
  );
};
