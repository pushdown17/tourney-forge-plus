import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Users } from "lucide-react";

export const TournamentsList = () => {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      setTournaments(data || []);
    } catch (error) {
      console.error("Error fetching tournaments:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Chargement des tournois...</p>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          Aucun tournoi créé pour le moment
        </p>
        <Link to="/create-tournament">
          <Button variant="hero">Créer le premier tournoi</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {tournaments.map((tournament) => (
        <Link key={tournament.id} to={`/tournament/${tournament.id}`}>
          <Card className="glass-card p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer h-full">
            <h3 className="text-xl font-bold mb-3 glow-text-primary">
              {tournament.name}
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(tournament.start_date).toLocaleDateString("fr-FR")} -{" "}
                  {new Date(tournament.end_date).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>
                  Format: Round Robin
                  {tournament.elimination_type && (
                    <> + {tournament.elimination_type === "single" ? "Simple" : "Double"} Élimination</>
                  )}
                </span>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
};
