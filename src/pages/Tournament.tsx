import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Users, Calendar, Lock, Unlock, Settings, Save, Trash2, RotateCcw, Trophy } from "lucide-react";
import { Separator } from "@/components/ui/separator";
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
import { RefereeStationsManager } from "@/components/tournament/RefereeStationsManager";
import { RefereesTab } from "@/components/tournament/RefereesTab";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

const Tournament = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournament, setTournament] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [teamsForElimination, setTeamsForElimination] = useState("");
  const [savingTeams, setSavingTeams] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearStationsDialogOpen, setClearStationsDialogOpen] = useState(false);
  const [bracketResetDialogOpen, setBracketResetDialogOpen] = useState(false);
  const [bracketResetTrigger, setBracketResetTrigger] = useState(0);
  const [bracketGenerateTrigger, setBracketGenerateTrigger] = useState(0);
  
  const activeTab = searchParams.get("tab") || "teams";
  const activeSubTab = searchParams.get("subtab") || "manage-teams";
  
  const setActiveTab = (tab: string) => {
    setSearchParams(prev => {
      prev.set("tab", tab);
      return prev;
    });
  };
  
  const setActiveSubTab = (subtab: string) => {
    setSearchParams(prev => {
      prev.set("subtab", subtab);
      return prev;
    });
  };

  const fetchTournament = async () => {
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setTournament(data);
      setTeamsForElimination(data.teams_for_elimination?.toString() || "8");
      
      // Check if current user is the creator
      const { data: { user } } = await supabase.auth.getUser();
      setIsCreator(user?.id === data.created_by);
    } catch (error: any) {
      toast.error("Error loading tournament");
    } finally {
      setLoading(false);
    }
  };

  const saveTeamsForElimination = async () => {
    const teamsCount = parseInt(teamsForElimination);
    if (isNaN(teamsCount) || teamsCount < 2 || teamsCount > 64) {
      toast.error("Please enter a number between 2 and 64");
      return;
    }

    setSavingTeams(true);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({ teams_for_elimination: teamsCount })
        .eq("id", id);

      if (error) throw error;
      
      toast.success(`Teams for elimination updated to ${teamsCount}`);
      setSettingsOpen(false);
      await fetchTournament();
    } catch (error: any) {
      toast.error("Error updating settings");
    } finally {
      setSavingTeams(false);
    }
  };

  const handleCloseClick = () => {
    if (tournament.is_closed) {
      toggleTournamentStatus();
    } else {
      setCloseDialogOpen(true);
    }
  };

  const clearAllStationMatches = async () => {
    setClearStationsDialogOpen(false);
    const { error } = await supabase
      .from("referee_stations")
      .update({
        current_match_id: null,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0,
      })
      .eq("tournament_id", id!)
      .not("current_match_id", "is", null);

    if (error) {
      toast.error("Erreur lors du nettoyage des stations");
    } else {
      toast.success("Tous les matchs ont été retirés des stations");
    }
    setSettingsOpen(false);
  };

  const toggleTournamentStatus = async () => {
    if (!isCreator) return;
    
    setUpdatingStatus(true);
    setCloseDialogOpen(false);
    try {
      const isReopening = tournament.is_closed;
      const updatePayload: Record<string, any> = { is_closed: !tournament.is_closed };

      // When manually reopening, set is_manually_closed = true so auto-close won't re-close it
      if (isReopening) {
        updatePayload.is_manually_closed = true;
        updatePayload.auto_closed_at = null;
      }

      const { error } = await supabase
        .from("tournaments")
        .update(updatePayload)
        .eq("id", id);

      if (error) throw error;
      
      toast.success(
        isReopening 
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
                              tournament.current_phase === "swiss" ? "Swiss Round" :
                              tournament.current_phase === "single_elimination" ? "Single Elimination" :
                              tournament.current_phase === "double_elimination" ? "Double Elimination" : "Elimination"}
                    </span>
                  </div>
                </div>
              </div>
              {isCreator && (
                <div className="flex items-center gap-2">
                  <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72">
                       <div className="space-y-4">
                         <Button
                           variant="destructive"
                           size="sm"
                           className="w-full"
                           onClick={() => setClearStationsDialogOpen(true)}
                         >
                           <Trash2 className="h-4 w-4 mr-2" />
                           Clear station matches
                         </Button>
                         {tournament.elimination_type && !tournament.is_closed && (
                           <>
                             <Separator />
                             <Button
                               variant="destructive"
                               size="sm"
                               className="w-full"
                               onClick={() => { setSettingsOpen(false); setBracketResetDialogOpen(true); }}
                             >
                               <RotateCcw className="h-4 w-4 mr-2" />
                               Réinitialiser le bracket
                             </Button>
                           </>
                         )}
                      </div>
                    </PopoverContent>
                  </Popover>
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
                </div>
              )}
            </div>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 animate-scale-in">
          <div className="overflow-x-auto -mx-4 px-4">
          {/* Determine if the tournament has a preliminary phase (round robin or swiss) */}
          {(() => {
            const hasPrePhase = tournament.initial_phase === "round_robin" || tournament.initial_phase === "swiss" || (!tournament.initial_phase && tournament.current_phase !== "single_elimination" && tournament.current_phase !== "double_elimination");
            const colCount = (hasPrePhase ? 1 : 0) + (tournament.elimination_type ? 1 : 0) + 4; // teams + matches? + elim? + standings + stats + history
            const gridColsClass = colCount === 6 ? 'md:grid-cols-6' : colCount === 5 ? 'md:grid-cols-5' : 'md:grid-cols-4';
            return (
            <TabsList className={`inline-flex w-auto min-w-full md:grid md:w-full h-auto p-1 bg-muted/50 ${gridColsClass}`}>
              <TabsTrigger 
                value="teams" 
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
              >
                Teams
              </TabsTrigger>
              {hasPrePhase && (
                <TabsTrigger 
                  value="matches" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap px-4 py-2.5 text-sm md:text-base"
                >
                  {tournament.initial_phase === "swiss" ? "Swiss" : "Round Robin"}
                </TabsTrigger>
              )}
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
                Ranking
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
            );
          })()}
          </div>

          <TabsContent value="teams" className="animate-fade-in">
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
              <div className="overflow-x-auto -mx-4 px-4">
                {isCreator ? (
                  <TabsList className={`inline-flex w-auto min-w-full md:grid md:w-full bg-muted/30 ${tournament.number_of_groups >= 2 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                    <TabsTrigger value="manage-teams" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Teams</TabsTrigger>
                    <TabsTrigger value="manage-players" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Players</TabsTrigger>
                    <TabsTrigger value="player-stats" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Player Stats</TabsTrigger>
                    {tournament.number_of_groups >= 2 && (
                      <TabsTrigger value="referees" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Referees</TabsTrigger>
                    )}
                    <TabsTrigger value="referee-stations" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Stations</TabsTrigger>
                  </TabsList>
                ) : (
                  <TabsList className={`inline-flex w-auto min-w-full md:grid md:w-full bg-muted/30 ${tournament.number_of_groups >= 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                    <TabsTrigger value="manage-teams" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Teams</TabsTrigger>
                    <TabsTrigger value="player-stats" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Player Stats</TabsTrigger>
                    {tournament.number_of_groups >= 2 && (
                      <TabsTrigger value="referees" className="whitespace-nowrap px-3 py-2 text-sm md:text-base">Referees</TabsTrigger>
                    )}
                  </TabsList>
                )}
              </div>
              
              <TabsContent value="manage-teams">
                <TeamsManager tournamentId={id!} isClosed={tournament.is_closed} isCreator={isCreator} numberOfGroups={tournament.number_of_groups || 1} showPlayers={!isCreator} />
              </TabsContent>
              
              {isCreator && (
                <TabsContent value="manage-players">
                  <PlayersManager tournamentId={id!} isClosed={tournament.is_closed} isCreator={isCreator} />
                </TabsContent>
              )}

              <TabsContent value="player-stats">
                <PlayerStatsManager tournamentId={id!} isClosed={tournament.is_closed} isCreator={isCreator} />
              </TabsContent>

              {tournament.number_of_groups >= 2 && (
                <TabsContent value="referees">
                  <RefereesTab
                    tournamentId={id!}
                    isCreator={isCreator}
                    isClosed={tournament.is_closed}
                    numberOfGroups={tournament.number_of_groups || 2}
                  />
                </TabsContent>
              )}

              {isCreator && (
                <TabsContent value="referee-stations">
                  <RefereeStationsManager tournamentId={id!} isCreator={isCreator} />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>

          <TabsContent value="matches" className="animate-fade-in">
            {(tournament.initial_phase === "swiss" || tournament.current_phase === "swiss") ? (
              <SwissManager tournamentId={id!} isClosed={tournament.is_closed} currentPhase={tournament.current_phase} isCreator={isCreator} numberOfGroups={tournament.number_of_groups || 1} />
            ) : (
              <RoundRobinManager tournamentId={id!} isClosed={tournament.is_closed} currentPhase={tournament.current_phase} isCreator={isCreator} numberOfGroups={tournament.number_of_groups || 1} />
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
                resetTrigger={bracketResetTrigger}
                generateTrigger={bracketGenerateTrigger}
              />
            </TabsContent>
          )}

          <TabsContent value="standings" className="animate-fade-in">
            <StandingsTable tournamentId={id!} numberOfGroups={tournament?.number_of_groups || 1} initialPhase={tournament?.initial_phase || tournament?.current_phase || "round_robin"} />
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

        {/* Clear Station Matches Confirmation Dialog */}
        <AlertDialog open={clearStationsDialogOpen} onOpenChange={setClearStationsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retirer les matchs des stations ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action va retirer tous les matchs actuellement assignés aux stations d'arbitrage. Les timers seront également réinitialisés.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={clearAllStationMatches} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bracket Reset Confirmation Dialog */}
        <AlertDialog open={bracketResetDialogOpen} onOpenChange={setBracketResetDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>⚠️ Réinitialiser le bracket ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cela va <strong>supprimer définitivement tous les matchs</strong> de la double élimination et régénérer le bracket depuis zéro. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { setBracketResetDialogOpen(false); setBracketResetTrigger(t => t + 1); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Réinitialiser
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default Tournament;
