import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BracketNode } from "@/components/BracketNode";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

interface Team {
  id: string;
  name: string;
}

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_id: string | null;
  round_number: number;
  team1?: Team;
  team2?: Team;
}

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
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tournament, setTournament] = useState<any>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [scores, setScores] = useState<{ [key: string]: { team1: string; team2: string } }>({});
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);

  useEffect(() => {
    fetchTournamentAndMatches();
  }, [tournamentId]);

  const fetchTournamentAndMatches = async () => {
    setLoading(true);
    try {
      // Récupérer les infos du tournoi
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      setTournament(tournamentData);

      // Récupérer les matchs d'élimination
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(`
          *,
          team1:teams!matches_team1_id_fkey(id, name),
          team2:teams!matches_team2_id_fkey(id, name)
        `)
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .order("round_number", { ascending: true });

      if (matchesError) throw matchesError;
      setMatches(matchesData || []);

      // Si pas de matchs, proposer de les générer
      if (!matchesData || matchesData.length === 0) {
        // Auto-générer les matchs
        await generateBracket(tournamentData.teams_for_elimination);
      }
    } catch (error: any) {
      toast.error("Erreur lors du chargement du bracket");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const generateBracket = async (teamsCount: number) => {
    setGenerating(true);
    try {
      // Récupérer les équipes qualifiées selon le classement
      const { data: standings, error: standingsError } = await supabase
        .from("team_stats")
        .select(`
          *,
          team:team_id(id, name)
        `)
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false })
        .limit(teamsCount);

      if (standingsError) throw standingsError;

      if (!standings || standings.length < teamsCount) {
        toast.error(`Pas assez d'équipes qualifiées (${standings?.length || 0}/${teamsCount})`);
        return;
      }

      // Créer les matchs du premier tour
      // Appariement: 1 vs dernier, 2 vs avant-dernier, etc.
      const firstRoundMatches = [];
      const halfCount = teamsCount / 2;
      
      for (let i = 0; i < halfCount; i++) {
        const team1 = standings[i];
        const team2 = standings[teamsCount - 1 - i];
        
        firstRoundMatches.push({
          tournament_id: tournamentId,
          phase: currentPhase,
          round_number: 1,
          team1_id: team1.team_id,
          team2_id: team2.team_id,
        });
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(firstRoundMatches);

      if (insertError) throw insertError;

      toast.success("Bracket généré avec succès !");
      await fetchTournamentAndMatches();
    } catch (error: any) {
      toast.error("Erreur lors de la génération du bracket");
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const handleScoreUpdate = async (matchId: string) => {
    const matchScores = scores[matchId];
    if (!matchScores) return;

    const team1Score = parseInt(matchScores.team1);
    const team2Score = parseInt(matchScores.team2);

    if (isNaN(team1Score) || isNaN(team2Score)) {
      toast.error("Veuillez entrer des scores valides");
      return;
    }

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const winnerId = team1Score > team2Score ? match.team1_id : 
                     team2Score > team1Score ? match.team2_id : null;

    try {
      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: team1Score,
          team2_score: team2Score,
          winner_id: winnerId
        })
        .eq("id", matchId);

      if (error) throw error;

      toast.success("Score mis à jour");
      setEditingMatchId(null);
      await fetchTournamentAndMatches();
    } catch (error: any) {
      toast.error("Erreur lors de la mise à jour du score");
      console.error(error);
    }
  };

  const getRoundName = (roundNumber: number, totalTeams: number) => {
    const rounds = Math.log2(totalTeams);
    const roundsRemaining = rounds - roundNumber + 1;
    
    if (roundsRemaining === 1) return "Finale";
    if (roundsRemaining === 2) return "Demi-finales";
    if (roundsRemaining === 3) return "Quarts de finale";
    return `Tour ${roundNumber}`;
  };

  if (loading) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground animate-pulse">Chargement du bracket...</p>
      </Card>
    );
  }

  if (generating) {
    return (
      <Card className="glass-card p-8 text-center">
        <Trophy className="h-12 w-12 text-primary mx-auto mb-4 animate-bounce" />
        <p className="text-muted-foreground animate-pulse">Génération du bracket...</p>
      </Card>
    );
  }

  // Grouper les matchs par round
  const matchesByRound = matches.reduce((acc, match) => {
    if (!acc[match.round_number]) {
      acc[match.round_number] = [];
    }
    acc[match.round_number].push(match);
    return acc;
  }, {} as { [key: number]: Match[] });

  const rounds = Object.keys(matchesByRound).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <Card className="glass-card p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">
          Phase d'élimination {eliminationType === "single" ? "simple" : "double"}
        </h2>
        <p className="text-muted-foreground">
          {tournament?.teams_for_elimination} équipes qualifiées
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucun match généré</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-6 min-w-max items-center px-4">
            {rounds.map((roundNum, roundIndex) => {
              const roundNumber = parseInt(roundNum);
              const roundMatches = matchesByRound[roundNumber];
              const spacing = Math.pow(2, roundIndex) * 60 + 20;
              
              return (
                <div key={roundNumber} className="flex flex-col" style={{ minWidth: '240px' }}>
                  <h3 className="text-sm font-bold text-primary text-center mb-3 sticky top-0 bg-card/95 backdrop-blur py-2 rounded">
                    {getRoundName(roundNumber, tournament?.teams_for_elimination || 8)}
                  </h3>
                  <div className="flex flex-col justify-center" style={{ gap: `${spacing}px` }}>
                    {roundMatches.map((match) => (
                      <div key={match.id} className="space-y-1 animate-fade-in">
                        <div 
                          className="w-60 cursor-pointer"
                          onClick={() => {
                            setSelectedMatch(match);
                            setStatsDialogOpen(true);
                          }}
                        >
                          <BracketNode
                            player1={match.team1?.name}
                            player2={match.team2?.name}
                            score1={match.team1_score ?? undefined}
                            score2={match.team2_score ?? undefined}
                            winner={
                              match.winner_id === match.team1_id ? 1 :
                              match.winner_id === match.team2_id ? 2 :
                              undefined
                            }
                          />
                        </div>
                        {editingMatchId === match.id ? (
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              placeholder="Score 1"
                              value={scores[match.id]?.team1 || ""}
                              onChange={(e) => setScores({
                                ...scores,
                                [match.id]: { ...scores[match.id], team1: e.target.value }
                              })}
                              className="w-16 h-8 text-sm"
                            />
                            <Input
                              type="number"
                              placeholder="Score 2"
                              value={scores[match.id]?.team2 || ""}
                              onChange={(e) => setScores({
                                ...scores,
                                [match.id]: { ...scores[match.id], team2: e.target.value }
                              })}
                              className="w-16 h-8 text-sm"
                            />
                            <Button onClick={() => handleScoreUpdate(match.id)} size="sm" className="h-8 px-2">
                              ✓
                            </Button>
                            <Button onClick={() => setEditingMatchId(null)} variant="ghost" size="sm" className="h-8 px-2">
                              ✗
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => {
                              setEditingMatchId(match.id);
                              setScores({
                                ...scores,
                                [match.id]: {
                                  team1: match.team1_score?.toString() || "",
                                  team2: match.team2_score?.toString() || ""
                                }
                              });
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs"
                          >
                            {match.team1_score !== null ? "Modifier" : "Entrer le score"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedMatch && (
        <MatchStatsDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={statsDialogOpen}
          onOpenChange={setStatsDialogOpen}
          onScoreUpdate={fetchTournamentAndMatches}
        />
      )}
    </Card>
  );
};
