import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BracketNode } from "@/components/BracketNode";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { ScoreInput } from "@/components/ui/score-input";
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
  is_third_place_match?: boolean;
  team1?: Team;
  team2?: Team;
}

interface EliminationBracketProps {
  tournamentId: string;
  eliminationType: "single" | "double" | null;
  currentPhase: string;
  onPhaseChanged: () => void;
  isClosed?: boolean;
}

export const EliminationBracket = ({ 
  tournamentId, 
  eliminationType, 
  currentPhase,
  onPhaseChanged,
  isClosed = false
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

          if (!finaleExists) {
            matchesToCreate.push({
              tournament_id: tournamentId,
              phase: currentPhase as any,
              round_number: completedRound + 1,
              team1_id: match1.winner_id,
              team2_id: match2.winner_id,
              is_third_place_match: false,
            });
          }

          if (!thirdPlaceExists) {
            matchesToCreate.push({
              tournament_id: tournamentId,
              phase: currentPhase as any,
              round_number: completedRound + 1,
              team1_id: loser1,
              team2_id: loser2,
              is_third_place_match: true,
            });
          }
        } else {
          // Pour les autres tours : créer le match du tour suivant pour cette paire
          matchesToCreate.push({
            tournament_id: tournamentId,
            phase: currentPhase as any,
            round_number: completedRound + 1,
            team1_id: match1.winner_id,
            team2_id: match2.winner_id,
            is_third_place_match: false,
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
        <>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 min-w-max items-start px-2 relative">
            {bracketStructure.map((roundMatches, roundIndex) => {
              const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
              const totalTeams = tournament?.teams_for_elimination || 8;
              const matchHeight = 60; // Hauteur d'un match + espacement
              const matchCardHeight = 38; // Hauteur réelle de la carte de match
              
              // Calculer l'espacement et l'offset pour créer l'alignement pyramidal
              const verticalSpacing = matchHeight * Math.pow(2, roundIndex);
              const topOffset = (matchHeight * Math.pow(2, roundIndex) - matchHeight) / 2;
              
              // Calculer le numéro de match global
              let matchNumberStart = 1;
              for (let i = 0; i < roundIndex; i++) {
                matchNumberStart += Math.pow(2, Math.log2(totalTeams) - i - 1);
              }
              
              return (
                <div key={roundNumber} className="relative flex flex-col" style={{ minWidth: '160px' }}>
                  <div className="text-xs font-bold text-primary text-center mb-3 h-5 flex items-center justify-center">
                    {getRoundName(roundNumber, totalTeams)}
                  </div>
                  <div className="flex flex-col relative" style={{ gap: `${verticalSpacing}px`, marginTop: `${topOffset}px` }}>
                    {/* SVG pour les lignes de connexion */}
                    {roundIndex < bracketStructure.length - 1 && (
                      <svg 
                        className="absolute left-full top-0 pointer-events-none"
                        style={{ 
                          width: '24px',
                          height: '100%',
                          overflow: 'visible'
                        }}
                      >
                        {roundMatches.map((match, matchIndex) => {
                          if (matchIndex % 2 === 0 && matchIndex + 1 < roundMatches.length) {
                            // Hauteur totale d'un élément de match (numéro + carte + bouton + espacement)
                            const totalMatchElementHeight = 48; // hauteur approximative de tout l'élément
                            const matchCenterOffset = 19; // centre de la carte de match
                            
                            // Position Y du premier match (du haut)
                            const y1 = matchIndex * (verticalSpacing + totalMatchElementHeight) + matchCenterOffset;
                            // Position Y du deuxième match (celui en dessous)
                            const y2 = (matchIndex + 1) * (verticalSpacing + totalMatchElementHeight) + matchCenterOffset;
                            // Point milieu pour la connexion vers le prochain tour
                            const yMid = (y1 + y2) / 2;
                            
                            return (
                              <g key={matchIndex} className="animate-fade-in">
                                {/* Ligne horizontale du match 1 */}
                                <line
                                  x1="0"
                                  y1={y1}
                                  x2="12"
                                  y2={y1}
                                  stroke="hsl(var(--primary))"
                                  strokeWidth="2"
                                  opacity="0.3"
                                />
                                {/* Ligne horizontale du match 2 */}
                                <line
                                  x1="0"
                                  y1={y2}
                                  x2="12"
                                  y2={y2}
                                  stroke="hsl(var(--primary))"
                                  strokeWidth="2"
                                  opacity="0.3"
                                />
                                {/* Ligne verticale de connexion */}
                                <line
                                  x1="12"
                                  y1={y1}
                                  x2="12"
                                  y2={y2}
                                  stroke="hsl(var(--primary))"
                                  strokeWidth="2"
                                  opacity="0.3"
                                />
                                {/* Ligne horizontale vers le match suivant */}
                                <line
                                  x1="12"
                                  y1={yMid}
                                  x2="24"
                                  y2={yMid}
                                  stroke="hsl(var(--primary))"
                                  strokeWidth="2"
                                  opacity="0.3"
                                />
                              </g>
                            );
                          }
                          return null;
                        })}
                      </svg>
                    )}
                    {roundMatches.map((match, matchIndex) => (
                      <div key={match.id} className="animate-fade-in">
                        <div className="text-center mb-0.5">
                          <span className="text-[9px] font-semibold text-muted-foreground">
                            M{matchNumberStart + matchIndex}
                          </span>
                        </div>
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
                          <div className="mt-0.5">
                            {editingMatchId === match.id ? (
                              <div className="flex gap-0.5 items-center justify-center">
                                <ScoreInput
                                  compact
                                  value={parseInt(scores[match.id]?.team1 || "0")}
                                  onChange={(value) => setScores({
                                    ...scores,
                                    [match.id]: { ...scores[match.id], team1: value.toString() }
                                  })}
                                  disabled={isClosed}
                                />
                                <span className="text-[8px] text-muted-foreground">-</span>
                                <ScoreInput
                                  compact
                                  value={parseInt(scores[match.id]?.team2 || "0")}
                                  onChange={(value) => setScores({
                                    ...scores,
                                    [match.id]: { ...scores[match.id], team2: value.toString() }
                                  })}
                                  disabled={isClosed}
                                />
                                <Button onClick={() => handleScoreUpdate(match.id)} size="sm" className="h-5 px-1.5 text-[10px]" disabled={isClosed}>
                                  ✓
                                </Button>
                                <Button onClick={() => setEditingMatchId(null)} variant="ghost" size="sm" className="h-5 px-1 text-[10px]">
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
                                className="w-full h-5 text-[10px] py-0"
                                disabled={isClosed}
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

          {/* Match pour la 3ème place */}
          {thirdPlaceMatch && (
            <div className="mt-8 pt-6 border-t border-border">
              <h3 className="text-sm font-bold text-primary text-center mb-4">
                🥉 Match pour la 3ème place
              </h3>
              <div className="max-w-[200px] mx-auto">
                <div className="text-center mb-0.5">
                  <span className="text-[9px] font-semibold text-muted-foreground">
                    M{matches.filter(m => !m.is_third_place_match).length + 1}
                  </span>
                </div>
                <div 
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedMatch(thirdPlaceMatch);
                    setStatsDialogOpen(true);
                  }}
                >
                  <BracketNode
                    player1={thirdPlaceMatch.team1?.name || 'TBD'}
                    player2={thirdPlaceMatch.team2?.name || 'TBD'}
                    score1={thirdPlaceMatch.team1_score ?? undefined}
                    score2={thirdPlaceMatch.team2_score ?? undefined}
                    winner={
                      thirdPlaceMatch.winner_id === thirdPlaceMatch.team1_id ? 1 :
                      thirdPlaceMatch.winner_id === thirdPlaceMatch.team2_id ? 2 :
                      undefined
                    }
                  />
                </div>
                {thirdPlaceMatch.team1 && thirdPlaceMatch.team2 && (
                  <div className="mt-0.5">
                    {editingMatchId === thirdPlaceMatch.id ? (
                      <div className="flex gap-0.5 items-center justify-center">
                        <ScoreInput
                          compact
                          value={parseInt(scores[thirdPlaceMatch.id]?.team1 || "0")}
                          onChange={(value) => setScores({
                            ...scores,
                            [thirdPlaceMatch.id]: { ...scores[thirdPlaceMatch.id], team1: value.toString() }
                          })}
                          disabled={isClosed}
                        />
                        <span className="text-[8px] text-muted-foreground">-</span>
                        <ScoreInput
                          compact
                          value={parseInt(scores[thirdPlaceMatch.id]?.team2 || "0")}
                          onChange={(value) => setScores({
                            ...scores,
                            [thirdPlaceMatch.id]: { ...scores[thirdPlaceMatch.id], team2: value.toString() }
                          })}
                          disabled={isClosed}
                        />
                        <Button onClick={() => handleScoreUpdate(thirdPlaceMatch.id)} size="sm" className="h-5 px-1.5 text-[10px]" disabled={isClosed}>
                          ✓
                        </Button>
                        <Button onClick={() => setEditingMatchId(null)} variant="ghost" size="sm" className="h-5 px-1 text-[10px]">
                          ✗
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => {
                          setEditingMatchId(thirdPlaceMatch.id);
                          setScores({
                            ...scores,
                            [thirdPlaceMatch.id]: {
                              team1: thirdPlaceMatch.team1_score?.toString() || "",
                              team2: thirdPlaceMatch.team2_score?.toString() || ""
                            }
                          });
                        }}
                        variant="outline"
                        size="sm"
                        className="w-full h-5 text-[10px] py-0"
                        disabled={isClosed}
                      >
                        {thirdPlaceMatch.team1_score !== null ? "Modifier" : "Score"}
                      </Button>
                    )}
                  </div>
                )}
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
          onScoreUpdate={fetchTournamentAndMatches}
        />
      )}
    </Card>
  );
};
