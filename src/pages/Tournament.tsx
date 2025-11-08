import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Users, Calendar } from "lucide-react";
import { TeamsManager } from "@/components/tournament/TeamsManager";
import { RoundRobinManager } from "@/components/tournament/RoundRobinManager";
import { EliminationBracket } from "@/components/tournament/EliminationBracket";
import { StandingsTable } from "@/components/tournament/StandingsTable";

const Tournament = () => {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTournament = async () => {
      try {
        const { data, error } = await supabase
          .from("tournaments")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;
        setTournament(data);
      } catch (error: any) {
        toast.error("Erreur lors du chargement du tournoi");
      } finally {
        setLoading(false);
      }
    };

    fetchTournament();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="container mx-auto px-4 pt-32 pb-16">
          <p className="text-center">Chargement...</p>
        </main>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="container mx-auto px-4 pt-32 pb-16">
          <p className="text-center">Tournoi introuvable</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="mb-8">
          <Link to="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-2 glow-text-primary">
                {tournament.name}
              </h1>
              <div className="flex items-center gap-4 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(tournament.start_date).toLocaleDateString("fr-FR")} - {new Date(tournament.end_date).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Phase: {tournament.current_phase === "round_robin" ? "Round Robin" : "Élimination"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="teams" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="teams">Équipes</TabsTrigger>
            <TabsTrigger value="round-robin">Round Robin</TabsTrigger>
            <TabsTrigger value="elimination">Élimination</TabsTrigger>
            <TabsTrigger value="standings">Classement</TabsTrigger>
          </TabsList>

          <TabsContent value="teams">
            <TeamsManager tournamentId={id!} />
          </TabsContent>

          <TabsContent value="round-robin">
            <RoundRobinManager tournamentId={id!} />
          </TabsContent>

          <TabsContent value="elimination">
            <EliminationBracket tournamentId={id!} eliminationType={tournament.elimination_type} />
          </TabsContent>

          <TabsContent value="standings">
            <StandingsTable tournamentId={id!} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Tournament;
