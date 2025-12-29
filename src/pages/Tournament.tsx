import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Users, Calendar, Lock, Unlock } from "lucide-react";
import { TeamsManager } from "@/components/tournament/TeamsManager";
import { PlayersManager } from "@/components/tournament/PlayersManager";
import { PlayerStatsManager } from "@/components/tournament/PlayerStatsManager";
import { RoundRobinManager } from "@/components/tournament/RoundRobinManager";
import { SwissManager } from "@/components/tournament/SwissManager";
import { EliminationBracket } from "@/components/tournament/EliminationBracket";
import { StandingsTable } from "@/components/tournament/StandingsTable";
import { TeamHistory } from "@/components/tournament/TeamHistory";
import { PlayerRankings } from "@/components/tournament/PlayerRankings";
import { ClosedTournamentSummary } from "@/components/tournament/ClosedTournamentSummary";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Tournament = () => {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const fetchTournament = async () => {
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setTournament(data);
      
      // Check if current user is the creator
      const { data: { user } } = await supabase.auth.getUser();
      setIsCreator(user?.id === data.created_by);
    } catch (error: any) {
      toast.error("Error loading tournament");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseClick = () => {
    if (tournament.is_closed) {
      // Reopen directly
      toggleTournamentStatus();
    } else {
      // Show confirmation dialog
      setCloseDialogOpen(true);
    }
  };

  const toggleTournamentStatus = async () => {
    if (!isCreator) return;
    
    setUpdatingStatus(true);
    setCloseDialogOpen(false);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({ is_closed: !tournament.is_closed })
        .eq("id", id);

      if (error) throw error;
      
      toast.success(
        tournament.is_closed 
          ? "Tournament reopened successfully" 
          : "Tournament closed successfully"
      );
      
      await fetchTournament();
    } catch (error: any) {
      toast.error("Error updating status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  useEffect(() => {
    fetchTournament();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
        <Navigation />
        <main className="container mx-auto px-4 pt-32 pb-16">
          <div className="flex justify-center items-center min-h-[400px]">
            <p className="text-lg text-muted-foreground animate-pulse">Loading...</p>
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
            <p className="text-lg text-muted-foreground">Tournament not found</p>
          </Card>
        </main>
      </div>
    );
  }

  // Show summary view for closed tournaments (for non-creators)
  if (tournament.is_closed && !isCreator) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <Link to="/">
            <Button variant="ghost" className="mb-6 hover-scale">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <ClosedTournamentSummary tournament={tournament} />
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
              Back
            </Button>
          </Link>
          
          <Card className="glass-card p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-3xl md:text-4xl font-bold glow-text-primary">
                    {tournament.name}
                  </h1>
                  {tournament.is_closed && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-muted rounded-full text-sm">
                      <Lock className="h-3 w-3" />
                      <span>Closed</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>
                      {new Date(tournament.start_date).toLocaleDateString("en-US")} - {new Date(tournament.end_date).toLocaleDateString("en-US")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      Phase: {tournament.current_phase === "round_robin" ? "Round Robin" : 
                              tournament.current_phase === "swiss" ? "Swiss Round" : "Elimination"}
                    </span>
                  </div>
                </div>
              </div>
              {isCreator && (
                <Button
                  onClick={handleCloseClick}
                  disabled={updatingStatus}
                  variant={tournament.is_closed ? "default" : "destructive"}
                  className="whitespace-nowrap"
                >
                  {tournament.is_closed ? (
                    <>
                      <Unlock className="mr-2 h-4 w-4" />
                      Reopen
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Close
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>
        </div>

        <Tabs defaultValue="teams" className="space-y-6 animate-scale-in">
          <div className="overflow-x-auto -mx-4 px-4">
            <TabsList className={`inline-flex w-auto min-w-full md:grid md:w-full h-auto p-1 bg-muted/50 ${tournament.elimination_type ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
              <TabsTrigger 
                value="teams" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
              >
                Teams
              </TabsTrigger>
              <TabsTrigger 
                value="matches" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
              >
                {tournament.initial_phase === "swiss" ? "Swiss" : "Round Robin"}
              </TabsTrigger>
              {tournament.elimination_type && (
                <TabsTrigger 
                  value="elimination" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
                >
                  Elimination
                </TabsTrigger>
              )}
              <TabsTrigger 
                value="standings" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
              >
                Standings
              </TabsTrigger>
              <TabsTrigger 
                value="stats" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
              >
                Stats
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
              >
                History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="teams" className="animate-fade-in">
            <Tabs defaultValue="manage-teams" className="space-y-4">
              <div className="overflow-x-auto -mx-4 px-4">
                <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-3 bg-muted/30">
                  <TabsTrigger value="manage-teams" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Teams</TabsTrigger>
                  <TabsTrigger value="manage-players" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Players</TabsTrigger>
                  <TabsTrigger value="player-stats" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Player Stats</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="manage-teams">
                <TeamsManager tournamentId={id!} isClosed={tournament.is_closed} isCreator={isCreator} />
              </TabsContent>
              
              <TabsContent value="manage-players">
                <PlayersManager tournamentId={id!} isClosed={tournament.is_closed} isCreator={isCreator} />
              </TabsContent>

              <TabsContent value="player-stats">
                <PlayerStatsManager tournamentId={id!} isClosed={tournament.is_closed} isCreator={isCreator} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="matches" className="animate-fade-in">
            {(tournament.initial_phase === "swiss" || tournament.current_phase === "swiss") ? (
              <SwissManager tournamentId={id!} isClosed={tournament.is_closed} currentPhase={tournament.current_phase} isCreator={isCreator} />
            ) : (
              <RoundRobinManager tournamentId={id!} isClosed={tournament.is_closed} currentPhase={tournament.current_phase} isCreator={isCreator} />
            )}
          </TabsContent>

          {tournament.elimination_type && (
            <TabsContent value="elimination" className="animate-fade-in">
              <EliminationBracket 
                tournamentId={id!} 
                eliminationType={tournament.elimination_type}
                currentPhase={tournament.current_phase}
                onPhaseChanged={fetchTournament}
                isClosed={tournament.is_closed}
                isCreator={isCreator}
              />
            </TabsContent>
          )}

          <TabsContent value="standings" className="animate-fade-in">
            <StandingsTable tournamentId={id!} />
          </TabsContent>

          <TabsContent value="stats" className="animate-fade-in">
            <PlayerRankings tournamentId={id!} />
          </TabsContent>

          <TabsContent value="history" className="animate-fade-in">
            <TeamHistory tournamentId={id!} />
          </TabsContent>
        </Tabs>

        {/* Close Tournament Confirmation Dialog */}
        <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close tournament?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will permanently close the tournament. The tournament will then be read-only and displayed as a summary for visitors.
                <br /><br />
                You can still reopen the tournament if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={toggleTournamentStatus} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Close
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default Tournament;
