import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Trophy, MapPin } from "lucide-react";

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

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "swiss": return "Swiss Round";
      case "round_robin": return "Round Robin";
      case "elimination": return "Elimination";
      case "single_elimination": return "Single Elim.";
      case "double_elimination": return "Double Elim.";
      default: return phase;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-primary/20" />
          <p className="text-muted-foreground">Loading tournaments...</p>
        </div>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="text-center py-12 glass-card rounded-lg">
        <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">
          No tournaments created yet
        </p>
        <Link to="/create-tournament">
          <Button variant="hero">Create the first tournament</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {tournaments.map((tournament) => (
        <Link key={tournament.id} to={`/tournament/${tournament.id}`}>
          <Card className="glass-card p-6 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 cursor-pointer h-full group">
            {/* Header with status */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold truncate group-hover:text-primary transition-colors">
                  {tournament.name}
                </h3>
              </div>
              <Badge 
                variant={tournament.is_closed ? "secondary" : "default"}
                className="ml-2 shrink-0"
              >
                {tournament.is_closed ? "Completed" : "In Progress"}
              </Badge>
            </div>
            
            {/* Tournament info */}
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0 text-primary/70" />
                <span>
                  {formatDate(tournament.start_date)} — {formatDate(tournament.end_date)}
                </span>
              </div>
              
              <div className="flex items-center gap-3 text-muted-foreground">
                <Trophy className="h-4 w-4 shrink-0 text-primary/70" />
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    {getPhaseLabel(tournament.initial_phase)}
                  </Badge>
                  {tournament.elimination_type && (
                    <Badge variant="outline" className="text-xs">
                      {tournament.elimination_type === "single" ? "Single" : "Double"} Elim.
                    </Badge>
                  )}
                </div>
              </div>
              
              {tournament.number_of_fields && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 text-primary/70" />
                  <span>{tournament.number_of_fields} field{tournament.number_of_fields > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            
          </Card>
        </Link>
      ))}
    </div>
  );
};
