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
import { PlayersManager } from "@/components/tournament/PlayersManager";
import { RoundRobinManager } from "@/components/tournament/RoundRobinManager";
import { SwissManager } from "@/components/tournament/SwissManager";
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
      <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
        <Navigation />
        <main className="container mx-auto px-4 pt-32 pb-16">
          <div className="flex justify-center items-center min-h-[400px]">
            <p className="text-lg text-muted-foreground animate-pulse">Chargement...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
        <Navigation />
        <main className="container mx-auto px-4 pt-32 pb-16">
          <Card className="glass-card p-8 text-center">
            <p className="text-lg text-muted-foreground">Tournoi introuvable</p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mb-8 animate-fade-in">
          <Link to="/">
            <Button variant="ghost" className="mb-6 hover-scale">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
          </Link>
          
          <Card className="glass-card p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-3 glow-text-primary">
                  {tournament.name}
                </h1>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>
                      {new Date(tournament.start_date).toLocaleDateString("fr-FR")} - {new Date(tournament.end_date).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      Phase: {tournament.current_phase === "round_robin" ? "Round Robin" : 
                              tournament.current_phase === "swiss" ? "Swiss Round" : "Élimination"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="teams" className="space-y-6 animate-scale-in">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1 bg-muted/50">
            <TabsTrigger value="teams" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Équipes
            </TabsTrigger>
            <TabsTrigger value="matches" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {tournament.current_phase === "swiss" ? "Swiss Round" : "Round Robin"}
            </TabsTrigger>
            <TabsTrigger value="elimination" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Élimination
            </TabsTrigger>
            <TabsTrigger value="standings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Classement
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="animate-fade-in">
            <Tabs defaultValue="manage-teams" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 bg-muted/30">
                <TabsTrigger value="manage-teams">Gestion des équipes</TabsTrigger>
                <TabsTrigger value="manage-players">Gestion des joueurs</TabsTrigger>
              </TabsList>
              
              <TabsContent value="manage-teams">
                <TeamsManager tournamentId={id!} />
              </TabsContent>
              
              <TabsContent value="manage-players">
                <PlayersManager tournamentId={id!} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="matches" className="animate-fade-in">
            {tournament.current_phase === "swiss" ? (
              <SwissManager tournamentId={id!} />
            ) : (
              <RoundRobinManager tournamentId={id!} />
            )}
          </TabsContent>

          <TabsContent value="elimination" className="animate-fade-in">
            <EliminationBracket tournamentId={id!} eliminationType={tournament.elimination_type} />
          </TabsContent>

          <TabsContent value="standings" className="animate-fade-in">
            <StandingsTable tournamentId={id!} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Tournament;
