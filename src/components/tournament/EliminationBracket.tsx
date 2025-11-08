import { Card } from "@/components/ui/card";

interface EliminationBracketProps {
  tournamentId: string;
  eliminationType: "single" | "double" | null;
}

export const EliminationBracket = ({ tournamentId, eliminationType }: EliminationBracketProps) => {
  if (!eliminationType) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground">
          Ce tournoi utilise uniquement le format Round Robin.
        </p>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-8">
      <h2 className="text-2xl font-bold mb-4">
        Phase d'élimination {eliminationType === "single" ? "simple" : "double"}
      </h2>
      <p className="text-muted-foreground mb-8">
        La phase d'élimination sera disponible une fois la phase Round Robin terminée.
      </p>
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Fonctionnalité en cours de développement
        </p>
      </div>
    </Card>
  );
};
