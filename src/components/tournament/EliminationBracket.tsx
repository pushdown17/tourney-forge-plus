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

      // Calculer le nombre de tours nécessaires
      const totalRounds = Math.log2(teamsCount);
      
      // Créer TOUS les tours d'avance
      const allMatches = [];
      
      // Premier tour : avec les vraies équipes
      const halfCount = teamsCount / 2;
      for (let i = 0; i < halfCount; i++) {
        const team1 = standings[i];
        const team2 = standings[teamsCount - 1 - i];
        
        allMatches.push({
          tournament_id: tournamentId,
          phase: currentPhase,
          round_number: 1,
          team1_id: team1.team_id,
          team2_id: team2.team_id,
        });
      }

      // Tours suivants : créer des matchs vides (seront remplis par les gagnants)
      // On doit créer des équipes "TBD" temporaires pour ces matchs
      // En fait, on va juste créer les structures, les équipes seront ajoutées plus tard
      // Pour l'instant, on génère juste le premier tour
      // Les tours suivants seront créés automatiquement quand les matchs sont terminés

      const { error: insertError } = await supabase
        .from("matches")
        .insert(allMatches);

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

    if (!winnerId) {
      toast.error("Un match d'élimination ne peut pas se terminer par un match nul");
      return;
    }

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
      
      // Vérifier si le tour est complété et générer le suivant
      await checkAndGenerateNextRound(match.round_number);
    } catch (error: any) {
      toast.error("Erreur lors de la mise à jour du score");
      console.error(error);
    }
  };

  const checkAndGenerateNextRound = async (completedRound: number) => {
    try {
      // Récupérer tous les matchs du tour complété
      const { data: roundMatches, error: matchesError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .eq("round_number", completedRound);

      if (matchesError) throw matchesError;

      // Vérifier si tous les matchs ont un gagnant
      const allMatchesCompleted = roundMatches?.every(m => m.winner_id !== null);
      
      if (!allMatchesCompleted) {
        return; // Pas encore tous les matchs terminés
      }

      // Vérifier si le prochain tour existe déjà
      const { data: existingNextRound, error: nextRoundError } = await supabase
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .eq("round_number", completedRound + 1)
        .limit(1);

      if (nextRoundError) throw nextRoundError;

      if (existingNextRound && existingNextRound.length > 0) {
        return; // Le prochain tour existe déjà
      }

      // Si c'est la finale (1 seul match), pas de tour suivant
      if (roundMatches.length === 1) {
        toast.success("🏆 Tournoi terminé ! Félicitations au vainqueur !");
        return;
      }

      // Générer le prochain tour avec les gagnants
      const winners = roundMatches
        .filter(m => m.winner_id)
        .map(m => m.winner_id);

      if (winners.length < 2) {
        return; // Pas assez de gagnants
      }

      // Créer les matchs par paires
      const nextRoundMatches = [];
      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
          nextRoundMatches.push({
            tournament_id: tournamentId,
            phase: currentPhase,
            round_number: completedRound + 1,
            team1_id: winners[i],
            team2_id: winners[i + 1],
          });
        }
      }

      if (nextRoundMatches.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(nextRoundMatches);

        if (insertError) throw insertError;

        toast.success(`Tour ${completedRound + 1} généré automatiquement !`);
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Erreur lors de la génération du tour suivant:", error);
    }
  };

  const getRoundName = (roundNumber: number, totalTeams: number) => {
    const totalRounds = Math.log2(totalTeams);
    const roundsRemaining = totalRounds - roundNumber + 1;
    
    if (roundsRemaining === 1) return "Finale";
    if (roundsRemaining === 2) return "1/2";
    if (roundsRemaining === 3) return "1/4";
    if (roundsRemaining === 4) return "1/8";
    return `R${roundNumber}`;
  };

  // Générer la structure complète du bracket (tous les tours)
  const generateBracketStructure = () => {
    if (!tournament?.teams_for_elimination) return [];
    
    const totalTeams = tournament.teams_for_elimination;
    const totalRounds = Math.log2(totalTeams);
    const structure: any[][] = [];

    for (let round = 1; round <= totalRounds; round++) {
      const matchesInRound = totalTeams / Math.pow(2, round);
      const roundMatches = [];
      
      for (let i = 0; i < matchesInRound; i++) {
        // Chercher si un vrai match existe
        const existingMatch = matches.find(m => 
          m.round_number === round && 
          matches.filter(x => x.round_number === round).indexOf(m) === i
        );
        
        if (existingMatch) {
          roundMatches.push(existingMatch);
        } else {
          // Créer un match placeholder
          roundMatches.push({
            id: `placeholder-${round}-${i}`,
            round_number: round,
            team1: null,
            team2: null,
            team1_score: null,
            team2_score: null,
            winner_id: null,
            isPlaceholder: true
          });
        }
      }
      structure.push(roundMatches);
    }
    
    return structure;
  };

  const bracketStructure = generateBracketStructure();

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

  return (
    <Card className="glass-card p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-1">
          Phase d'élimination {eliminationType === "single" ? "simple" : "double"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tournament?.teams_for_elimination} équipes qualifiées
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucun match généré</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-8 min-w-max items-start px-2">
            {bracketStructure.map((roundMatches, roundIndex) => {
              const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
              const totalTeams = tournament?.teams_for_elimination || 8;
              const matchHeight = 80; // Hauteur d'un match + espacement
              const initialSpacing = 0;
              
              // Calculer l'espacement et l'offset pour créer l'alignement pyramidal
              const verticalSpacing = matchHeight * Math.pow(2, roundIndex);
              const topOffset = (matchHeight * Math.pow(2, roundIndex) - matchHeight) / 2;
              
              return (
                <div key={roundNumber} className="flex flex-col" style={{ minWidth: '200px' }}>
                  <div className="text-xs font-bold text-primary text-center mb-4 h-6 flex items-center justify-center">
                    {getRoundName(roundNumber, totalTeams)}
                  </div>
                  <div className="flex flex-col" style={{ gap: `${verticalSpacing}px`, marginTop: `${topOffset}px` }}>
                    {roundMatches.map((match, matchIndex) => (
                      <div key={match.id} className="animate-fade-in">
                        <div 
                          className="w-full"
                          onClick={() => {
                            if (!match.isPlaceholder) {
                              setSelectedMatch(match);
                              setStatsDialogOpen(true);
                            }
                          }}
                          style={{ 
                            cursor: match.isPlaceholder ? 'default' : 'pointer',
                            opacity: match.isPlaceholder ? 0.5 : 1
                          }}
                        >
                          <BracketNode
                            player1={match.team1?.name || 'TBD'}
                            player2={match.team2?.name || 'TBD'}
                            score1={match.team1_score ?? undefined}
                            score2={match.team2_score ?? undefined}
                            winner={
                              match.winner_id === match.team1_id ? 1 :
                              match.winner_id === match.team2_id ? 2 :
                              undefined
                            }
                          />
                        </div>
                        {!match.isPlaceholder && match.team1 && match.team2 && (
                          <div className="mt-1">
                            {editingMatchId === match.id ? (
                              <div className="flex gap-1">
                                <Input
                                  type="number"
                                  placeholder="0"
                                  value={scores[match.id]?.team1 || ""}
                                  onChange={(e) => setScores({
                                    ...scores,
                                    [match.id]: { ...scores[match.id], team1: e.target.value }
                                  })}
                                  className="w-10 h-6 text-xs p-1 text-center"
                                />
                                <Input
                                  type="number"
                                  placeholder="0"
                                  value={scores[match.id]?.team2 || ""}
                                  onChange={(e) => setScores({
                                    ...scores,
                                    [match.id]: { ...scores[match.id], team2: e.target.value }
                                  })}
                                  className="w-10 h-6 text-xs p-1 text-center"
                                />
                                <Button onClick={() => handleScoreUpdate(match.id)} size="sm" className="h-6 px-2 text-xs">
                                  ✓
                                </Button>
                                <Button onClick={() => setEditingMatchId(null)} variant="ghost" size="sm" className="h-6 px-1 text-xs">
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
                                className="w-full h-6 text-xs py-0"
                              >
                                {match.team1_score !== null ? "Modifier" : "Score"}
                              </Button>
                            )}
                          </div>
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
