import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BracketMatch } from "./BracketMatch";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsRecapDialog } from "./MatchStatsRecapDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Medal } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { cn } from "@/lib/utils";
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
  is_third_place_match?: boolean;
  field_number?: number;
  team1?: Team;
  team2?: Team;
}

interface EliminationBracketProps {
  tournamentId: string;
  eliminationType: "single" | "double" | null;
  currentPhase: string;
  onPhaseChanged: () => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

export const EliminationBracket = ({ 
  tournamentId, 
  eliminationType, 
  currentPhase,
  onPhaseChanged,
  isClosed = false,
  isCreator = false
}: EliminationBracketProps) => {
  // Si on n'est pas encore en phase d'élimination, afficher le composant de transition
  if (currentPhase !== "single_elimination" && currentPhase !== "double_elimination") {
    return (
      <PhaseTransition 
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
        isCreator={isCreator}
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
  const [goalScorerDialogOpen, setGoalScorerDialogOpen] = useState(false);
  const [scoringTeam, setScoringTeam] = useState<{ id: string; name: string; matchId: string } | null>(null);
  const [recentlyCompletedMatchId, setRecentlyCompletedMatchId] = useState<string | null>(null);
  const [recentlyAdvancedTeamIds, setRecentlyAdvancedTeamIds] = useState<string[]>([]);
  const [numberOfFields, setNumberOfFields] = useState(1);
  const [recapDialogOpen, setRecapDialogOpen] = useState(false);
  const [thirdPlaceDialogOpen, setThirdPlaceDialogOpen] = useState(false);
  const [pendingFinalMatches, setPendingFinalMatches] = useState<{
    finale: any;
    thirdPlace: any;
  } | null>(null);

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
      setNumberOfFields(tournamentData.number_of_fields || 1);

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
        
        // Affecter un terrain en round-robin
        const fieldNumber = (i % numberOfFields) + 1;
        
        allMatches.push({
          tournament_id: tournamentId,
          phase: currentPhase,
          round_number: 1,
          team1_id: team1.team_id,
          team2_id: team2.team_id,
          field_number: fieldNumber,
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

    // Validate input with zod
    try {
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({
        team1_score: team1Score,
        team2_score: team2Score,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }
    } catch (validationError: any) {
      toast.error("Erreur de validation");
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

      // Animation de célébration
      setRecentlyCompletedMatchId(matchId);
      setRecentlyAdvancedTeamIds([winnerId]);
      
      // Retirer l'animation après un délai
      setTimeout(() => {
        setRecentlyCompletedMatchId(null);
        setRecentlyAdvancedTeamIds([]);
      }, 2000);

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
        .eq("round_number", completedRound)
        .eq("is_third_place_match", false)
        .order("id", { ascending: true });

      if (matchesError) throw matchesError;
      if (!roundMatches || roundMatches.length === 0) return;

      // Si c'est la finale (1 seul match) et qu'elle est terminée
      if (roundMatches.length === 1 && roundMatches[0].winner_id) {
        toast.success("🏆 Tournoi terminé ! Félicitations au vainqueur !");
        return;
      }

      // Vérifier quels matchs du tour suivant existent déjà
      const { data: existingNextRoundMatches, error: existingError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .eq("round_number", completedRound + 1)
        .order("id", { ascending: true });

      if (existingError) throw existingError;

      const matchesToCreate = [];

      // Traiter les matchs par paires pour générer les matchs du tour suivant progressivement
      for (let i = 0; i < roundMatches.length; i += 2) {
        if (i + 1 >= roundMatches.length) break; // Pas de paire complète

        const match1 = roundMatches[i];
        const match2 = roundMatches[i + 1];

        // Vérifier si les deux matchs de la paire sont terminés
        if (!match1.winner_id || !match2.winner_id) {
          continue; // Cette paire n'est pas encore complète
        }

        // Vérifier si un match avec ces deux équipes existe déjà
        const matchAlreadyExists = existingNextRoundMatches?.some(m => 
          !m.is_third_place_match &&
          ((m.team1_id === match1.winner_id && m.team2_id === match2.winner_id) ||
           (m.team1_id === match2.winner_id && m.team2_id === match1.winner_id))
        );

        if (matchAlreadyExists) {
          continue; // Ce match existe déjà
        }

        // Si c'est les demi-finales (2 matchs seulement dans le round)
        if (roundMatches.length === 2 && i === 0) {
          // Récupérer les perdants pour le match de 3ème place
          const loser1 = match1.winner_id === match1.team1_id ? match1.team2_id : match1.team1_id;
          const loser2 = match2.winner_id === match2.team1_id ? match2.team2_id : match2.team1_id;

          // Vérifier si ces matchs n'existent pas déjà
          const finaleExists = existingNextRoundMatches?.some(m => 
            !m.is_third_place_match &&
            ((m.team1_id === match1.winner_id && m.team2_id === match2.winner_id) ||
             (m.team1_id === match2.winner_id && m.team2_id === match1.winner_id))
          );

          const thirdPlaceExists = existingNextRoundMatches?.some(m => 
            m.is_third_place_match &&
            ((m.team1_id === loser1 && m.team2_id === loser2) ||
             (m.team1_id === loser2 && m.team2_id === loser1))
          );

          // Si la finale existe déjà, ne rien faire
          if (finaleExists) {
            continue;
          }

          // Préparer les matchs finale et 3ème place
          const finaleMatch = {
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: match1.winner_id,
            team2_id: match2.winner_id,
            is_third_place_match: false,
            field_number: 1,
          };

          const thirdPlaceMatch = {
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: loser1,
            team2_id: loser2,
            is_third_place_match: true,
            field_number: 2,
          };

          // Si le match de 3ème place n'existe pas encore, demander confirmation
          if (!thirdPlaceExists) {
            setPendingFinalMatches({
              finale: finaleMatch,
              thirdPlace: thirdPlaceMatch,
            });
            setThirdPlaceDialogOpen(true);
            return; // Arrêter ici, la création sera faite après la réponse de l'utilisateur
          } else {
            // Le match de 3ème place existe déjà (peut-être refusé), créer juste la finale
            matchesToCreate.push(finaleMatch);
          }
        } else {
          // Pour les autres tours : créer le match du tour suivant pour cette paire
          // Affecter un terrain en round-robin
          const fieldNumber = (matchesToCreate.length % numberOfFields) + 1;
          
          matchesToCreate.push({
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: match1.winner_id,
            team2_id: match2.winner_id,
            is_third_place_match: false,
            field_number: fieldNumber,
          });
        }
      }

      // Insérer tous les nouveaux matchs en une seule fois
      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToCreate);

        if (insertError) throw insertError;

        const message = roundMatches.length === 2 
          ? `Finale et match pour la 3ème place générés !`
          : `Match(s) généré(s) pour le tour ${completedRound + 1} !`;
        
        toast.success(message);
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Erreur lors de la génération du tour suivant:", error);
    }
  };

  const handleThirdPlaceConfirmation = async (includeThirdPlace: boolean) => {
    if (!pendingFinalMatches) return;
    
    try {
      const matchesToInsert = [pendingFinalMatches.finale];
      
      if (includeThirdPlace) {
        matchesToInsert.push(pendingFinalMatches.thirdPlace);
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(matchesToInsert);

      if (insertError) throw insertError;

      const message = includeThirdPlace 
        ? "Finale et match pour la 3ème place générés !"
        : "Finale générée !";
      
      toast.success(message);
      await fetchTournamentAndMatches();
    } catch (error: any) {
      console.error("Erreur lors de la création des matchs:", error);
      toast.error("Erreur lors de la création des matchs");
    } finally {
      setThirdPlaceDialogOpen(false);
      setPendingFinalMatches(null);
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
      
      // Filtrer et trier les matchs de ce round (exclure le match de 3ème place)
      const roundMatchesSorted = matches
        .filter(m => m.round_number === round && !m.is_third_place_match)
        .sort((a, b) => a.id.localeCompare(b.id)); // Tri stable par ID
      
      for (let i = 0; i < matchesInRound; i++) {
        // Prendre le i-ème match de ce round
        const existingMatch = roundMatchesSorted[i];
        
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

  // Vérifier si un tour précédent est complété (tous les matchs ont un gagnant)
  const isPreviousRoundCompleted = (roundNumber: number): boolean => {
    if (roundNumber <= 1) return true; // Premier tour toujours accessible
    
    const previousRoundMatches = matches.filter(
      m => m.round_number === roundNumber - 1 && !m.is_third_place_match
    );
    
    // Si pas de matchs au tour précédent, c'est qu'ils ne sont pas encore générés
    if (previousRoundMatches.length === 0) return false;
    
    // Tous les matchs du tour précédent doivent avoir un gagnant
    return previousRoundMatches.every(m => m.winner_id !== null);
  };

  // Vérifier si les demi-finales sont terminées (pour le match de 3ème place)
  const areSemiFinalsCompleted = (): boolean => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const totalRounds = Math.log2(totalTeams);
    const semiFinalsRound = totalRounds - 1; // L'avant-dernier tour
    
    const semiFinalsMatches = matches.filter(
      m => m.round_number === semiFinalsRound && !m.is_third_place_match
    );
    
    return semiFinalsMatches.length === 2 && semiFinalsMatches.every(m => m.winner_id !== null);
  };

  const bracketStructure = generateBracketStructure();
  
  // Récupérer le match pour la 3ème place s'il existe
  const thirdPlaceMatch = matches.find(m => m.is_third_place_match);

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
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">
            Phase d'élimination {eliminationType === "single" ? "simple" : "double"}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          {tournament?.teams_for_elimination} équipes qualifiées
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucun match généré</p>
        </div>
      ) : (
        <>
          {/* Bracket principal */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 min-w-max px-4">
              {bracketStructure.map((roundMatches, roundIndex) => {
                const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
                const totalTeams = tournament?.teams_for_elimination || 8;
                const isLastRound = roundIndex === bracketStructure.length - 1;
                
                // Dimensions - calcul pyramidal correct
                // Hauteur réelle d'un match: header(20) + card(68) + button(36) ≈ 124px
                const matchHeight = 124;
                const baseGap = 12; // Écart entre matchs du round 0
                const unit = matchHeight + baseGap; // 136px
                
                // Gap entre matchs de ce round (double à chaque tour)
                const verticalGap = unit * Math.pow(2, roundIndex) - matchHeight;
                
                // Décalage du premier match pour centrer entre les matchs sources
                const topOffset = unit * (Math.pow(2, roundIndex) - 1) / 2;
                
                // Numéro de match
                let matchNumberStart = 1;
                for (let i = 0; i < roundIndex; i++) {
                  matchNumberStart += Math.pow(2, Math.log2(totalTeams) - i - 1);
                }
                
                return (
                  <div key={roundNumber} className="flex flex-col" style={{ minWidth: "180px" }}>
                    {/* Round header */}
                    <div className={cn(
                      "text-center mb-4 py-2 px-4 rounded-lg",
                      isLastRound ? "bg-primary/20 border border-primary/30" : "bg-muted/50"
                    )}>
                      <span className={cn(
                        "text-sm font-bold",
                        isLastRound ? "text-primary" : "text-foreground"
                      )}>
                        {getRoundName(roundNumber, totalTeams)}
                      </span>
                    </div>
                    
                    {/* Matches */}
                    <div 
                      className="flex flex-col relative"
                      style={{ 
                        gap: `${verticalGap}px`,
                        marginTop: `${topOffset}px`
                      }}
                    >
                      {/* Lignes de connexion */}
                      {!isLastRound && (
                        <svg
                          className="absolute left-full top-0 pointer-events-none"
                          style={{
                            width: "32px",
                            height: "100%",
                            overflow: "visible",
                          }}
                        >
                          {roundMatches.map((_, matchIndex) => {
                            if (matchIndex % 2 !== 0) return null;
                            if (matchIndex + 1 >= roundMatches.length) return null;

                            const totalHeight = matchHeight + verticalGap;
                            const baseY = matchIndex * totalHeight;
                            const y1 = baseY + matchHeight / 2;
                            const y2 = baseY + totalHeight + matchHeight / 2;
                            const yMid = (y1 + y2) / 2;

                            return (
                              <g key={matchIndex} className="animate-fade-in">
                                <line x1="0" y1={y1} x2="16" y2={y1} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                <line x1="0" y1={y2} x2="16" y2={y2} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                <line x1="16" y1={y1} x2="16" y2={y2} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                                <line x1="16" y1={yMid} x2="32" y2={yMid} stroke="hsl(var(--primary))" strokeWidth="2" className="opacity-30" />
                              </g>
                            );
                          })}
                        </svg>
                      )}
                      
                      {roundMatches.map((match, matchIndex) => {
                        const canAccessMatch = isPreviousRoundCompleted(roundNumber);
                        const isLocked = !canAccessMatch && !match.winner_id;
                        const isMatchCompleted = !!match.winner_id;
                        
                        return (
                          <BracketMatch
                            key={match.id}
                            match={match}
                            matchNumber={matchNumberStart + matchIndex}
                            isEditing={editingMatchId === match.id}
                            scores={scores[match.id] || { team1: "", team2: "" }}
                            isClosed={isClosed || isLocked}
                            isFinal={isLastRound}
                            isRecentlyCompleted={recentlyCompletedMatchId === match.id}
                            advancedTeamId={recentlyAdvancedTeamIds.includes(match.team1_id) ? match.team1_id : 
                                            recentlyAdvancedTeamIds.includes(match.team2_id) ? match.team2_id : undefined}
                            isLocked={isLocked}
                            isCompleted={isMatchCompleted}
                            onStartEdit={() => {
                              if (isLocked || isMatchCompleted) {
                                if (isMatchCompleted) {
                                  toast.error("Ce match est terminé et ne peut plus être modifié");
                                } else {
                                  toast.error("Terminez d'abord les matchs du tour précédent");
                                }
                                return;
                              }
                              setEditingMatchId(match.id);
                              setScores({
                                ...scores,
                                [match.id]: {
                                  team1: match.team1_score?.toString() || "0",
                                  team2: match.team2_score?.toString() || "0"
                                }
                              });
                            }}
                            onCancelEdit={() => setEditingMatchId(null)}
                            onSaveScore={() => handleScoreUpdate(match.id)}
                            onScoreChange={(team, value) => setScores({
                              ...scores,
                              [match.id]: { ...scores[match.id], [team]: value }
                            })}
                            onMatchClick={() => {
                              if (isLocked && !isMatchCompleted) {
                                toast.error("Terminez d'abord les matchs du tour précédent");
                                return;
                              }
                              if (!match.isPlaceholder) {
                                setSelectedMatch(match);
                                // Si le match est terminé, afficher le récap, sinon le dialog d'édition
                                if (isMatchCompleted) {
                                  setRecapDialogOpen(true);
                                } else {
                                  setStatsDialogOpen(true);
                                }
                              }
                            }}
                            onIncrementScore={(teamId, teamName) => {
                              if (isLocked || isMatchCompleted) {
                                if (isMatchCompleted) {
                                  toast.error("Ce match est terminé et ne peut plus être modifié");
                                } else {
                                  toast.error("Terminez d'abord les matchs du tour précédent");
                                }
                                return;
                              }
                              setScoringTeam({ id: teamId, name: teamName, matchId: match.id });
                              setGoalScorerDialogOpen(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              
              {/* Champion section si finale terminée */}
              {bracketStructure.length > 0 && (() => {
                const finalRound = bracketStructure[bracketStructure.length - 1];
                const finalMatch = finalRound?.[0];
                if (finalMatch?.winner_id) {
                  const winner = finalMatch.winner_id === finalMatch.team1_id 
                    ? finalMatch.team1 
                    : finalMatch.team2;
                  return (
                    <div className="flex flex-col items-center justify-center" style={{ minWidth: "160px" }}>
                      <div className="text-center mb-4 py-2 px-4 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
                        <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">
                          🏆 Champion
                        </span>
                      </div>
                      <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 p-4 text-center">
                        <Trophy className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                        <p className="font-bold text-lg">{winner?.name}</p>
                      </Card>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Match pour la 3ème place */}
          {thirdPlaceMatch && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Medal className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-600">
                  Match pour la 3ème place
                </h3>
              </div>
              <div className="max-w-[220px] mx-auto">
                {(() => {
                  const thirdPlaceLocked = !areSemiFinalsCompleted() && !thirdPlaceMatch.winner_id;
                  const isThirdPlaceCompleted = !!thirdPlaceMatch.winner_id;
                  return (
                    <BracketMatch
                      match={thirdPlaceMatch}
                      matchNumber={matches.filter(m => !m.is_third_place_match).length + 1}
                      isEditing={editingMatchId === thirdPlaceMatch.id}
                      scores={scores[thirdPlaceMatch.id] || { team1: "", team2: "" }}
                      isClosed={isClosed || thirdPlaceLocked}
                      isFinal={false}
                      isLocked={thirdPlaceLocked}
                      isCompleted={isThirdPlaceCompleted}
                      onStartEdit={() => {
                        if (thirdPlaceLocked || isThirdPlaceCompleted) {
                          if (isThirdPlaceCompleted) {
                            toast.error("Ce match est terminé et ne peut plus être modifié");
                          } else {
                            toast.error("Terminez d'abord les demi-finales");
                          }
                          return;
                        }
                        setEditingMatchId(thirdPlaceMatch.id);
                        setScores({
                          ...scores,
                          [thirdPlaceMatch.id]: {
                            team1: thirdPlaceMatch.team1_score?.toString() || "0",
                            team2: thirdPlaceMatch.team2_score?.toString() || "0"
                          }
                        });
                      }}
                      onCancelEdit={() => setEditingMatchId(null)}
                      onSaveScore={() => handleScoreUpdate(thirdPlaceMatch.id)}
                      onScoreChange={(team, value) => setScores({
                        ...scores,
                        [thirdPlaceMatch.id]: { ...scores[thirdPlaceMatch.id], [team]: value }
                      })}
                      onMatchClick={() => {
                        if (thirdPlaceLocked && !isThirdPlaceCompleted) {
                          toast.error("Terminez d'abord les demi-finales");
                          return;
                        }
                        setSelectedMatch(thirdPlaceMatch);
                        if (isThirdPlaceCompleted) {
                          setRecapDialogOpen(true);
                        } else {
                          setStatsDialogOpen(true);
                        }
                      }}
                      onIncrementScore={(teamId, teamName) => {
                        if (thirdPlaceLocked || isThirdPlaceCompleted) {
                          if (isThirdPlaceCompleted) {
                            toast.error("Ce match est terminé et ne peut plus être modifié");
                          } else {
                            toast.error("Terminez d'abord les demi-finales");
                          }
                          return;
                        }
                        setScoringTeam({ id: teamId, name: teamName, matchId: thirdPlaceMatch.id });
                        setGoalScorerDialogOpen(true);
                      }}
                    />
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {selectedMatch && (
        <MatchStatsDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={statsDialogOpen}
          onOpenChange={setStatsDialogOpen}
          onScoreUpdate={async () => {
            await fetchTournamentAndMatches();
            // Vérifier si le tour suivant doit être généré
            if (selectedMatch) {
              await checkAndGenerateNextRound(selectedMatch.round_number);
            }
          }}
        />
      )}

      {selectedMatch && (
        <MatchStatsRecapDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={recapDialogOpen}
          onOpenChange={setRecapDialogOpen}
        />
      )}

      {scoringTeam && (
        <GoalScorerDialog
          open={goalScorerDialogOpen}
          onOpenChange={setGoalScorerDialogOpen}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          matchId={scoringTeam.matchId}
          tournamentId={tournamentId}
          onGoalRecorded={() => {
            // Refresh if needed
          }}
        />
      )}

      <AlertDialog open={thirdPlaceDialogOpen} onOpenChange={setThirdPlaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-amber-600" />
              Match pour la 3ème place
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous organiser un match pour la 3ème place entre les perdants des demi-finales ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleThirdPlaceConfirmation(false)}>
              Non, juste la finale
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleThirdPlaceConfirmation(true)}>
              Oui, organiser le match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
