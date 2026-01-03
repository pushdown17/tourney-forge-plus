import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BracketMatch } from "./BracketMatch";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsRecapDialog } from "./MatchStatsRecapDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Medal, Shield, Skull } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  bracket_type?: string; // 'winners' | 'losers' | 'grand_final'
  team1?: Team;
  team2?: Team;
  isPlaceholder?: boolean;
}

interface DoubleEliminationBracketProps {
  tournamentId: string;
  currentPhase: string;
  onPhaseChanged: () => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

export const DoubleEliminationBracket = ({ 
  tournamentId, 
  currentPhase,
  onPhaseChanged,
  isClosed = false,
  isCreator = false
}: DoubleEliminationBracketProps) => {
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
  const [activeTab, setActiveTab] = useState("winners");

  // If not yet in elimination phase, show transition component
  if (currentPhase !== "double_elimination") {
    return (
      <PhaseTransition 
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
        isCreator={isCreator}
      />
    );
  }

  useEffect(() => {
    fetchTournamentAndMatches();
  }, [tournamentId]);

  const fetchTournamentAndMatches = async () => {
    setLoading(true);
    try {
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      setTournament(tournamentData);
      setNumberOfFields(tournamentData.number_of_fields || 1);

      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(`
          *,
          team1:teams!matches_team1_id_fkey(id, name),
          team2:teams!matches_team2_id_fkey(id, name)
        `)
        .eq("tournament_id", tournamentId)
        .eq("phase", "double_elimination")
        .order("round_number", { ascending: true });

      if (matchesError) throw matchesError;
      setMatches(matchesData || []);

      if (!matchesData || matchesData.length === 0) {
        await generateBracket(tournamentData.teams_for_elimination);
      }
    } catch (error: any) {
      toast.error("Error loading bracket");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const generateBracket = async (teamsCount: number) => {
    setGenerating(true);
    try {
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
        toast.error(`Not enough qualified teams (${standings?.length || 0}/${teamsCount})`);
        return;
      }

      // Generate first round of winners bracket only
      const allMatches = [];
      const halfCount = teamsCount / 2;
      
      for (let i = 0; i < halfCount; i++) {
        const team1 = standings[i];
        const team2 = standings[teamsCount - 1 - i];
        const fieldNumber = (i % numberOfFields) + 1;
        
        allMatches.push({
          tournament_id: tournamentId,
          phase: "double_elimination" as const,
          round_number: 1,
          team1_id: team1.team_id,
          team2_id: team2.team_id,
          field_number: fieldNumber,
          is_third_place_match: false, // Using this to indicate winners bracket for now
        });
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(allMatches);

      if (insertError) throw insertError;

      toast.success("Double elimination bracket generated!");
      await fetchTournamentAndMatches();
    } catch (error: any) {
      toast.error("Error generating bracket");
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
      toast.error("Please enter valid scores");
      return;
    }

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
      toast.error("Validation error");
      return;
    }

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const winnerId = team1Score > team2Score ? match.team1_id : 
                     team2Score > team1Score ? match.team2_id : null;

    if (!winnerId) {
      toast.error("An elimination match cannot end in a draw");
      return;
    }

    const loserId = winnerId === match.team1_id ? match.team2_id : match.team1_id;

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

      setRecentlyCompletedMatchId(matchId);
      setRecentlyAdvancedTeamIds([winnerId]);
      
      setTimeout(() => {
        setRecentlyCompletedMatchId(null);
        setRecentlyAdvancedTeamIds([]);
      }, 2000);

      toast.success("Score updated");
      setEditingMatchId(null);
      await fetchTournamentAndMatches();
      
      // Handle progression based on bracket type
      await handleDoubleEliminationProgression(match, winnerId, loserId);
    } catch (error: any) {
      toast.error("Error updating score");
      console.error(error);
    }
  };

  const handleDoubleEliminationProgression = async (
    completedMatch: Match, 
    winnerId: string, 
    loserId: string
  ) => {
    try {
      const isLosersBracket = completedMatch.is_third_place_match; // Using this flag for losers bracket
      const roundNumber = completedMatch.round_number;

      // Get all matches of the same round and bracket type
      const { data: roundMatches, error: matchesError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", "double_elimination")
        .eq("round_number", roundNumber)
        .eq("is_third_place_match", isLosersBracket)
        .order("id", { ascending: true });

      if (matchesError) throw matchesError;
      if (!roundMatches) return;

      // Check if this is the grand final
      const totalTeams = tournament?.teams_for_elimination || 8;
      const winnersRounds = Math.log2(totalTeams);
      const isGrandFinal = !isLosersBracket && roundNumber > winnersRounds;

      if (isGrandFinal && completedMatch.winner_id) {
        toast.success("🏆 Tournament finished! Congratulations to the champion!");
        return;
      }

      // Get existing next round matches
      const { data: existingNextRound, error: existingError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", "double_elimination")
        .gte("round_number", roundNumber + 1);

      if (existingError) throw existingError;

      const matchesToCreate: any[] = [];

      // Winners bracket logic
      if (!isLosersBracket) {
        // Move loser to losers bracket
        const losersRound = roundNumber; // Losers bracket rounds align with winners
        
        // Check if losers bracket round exists
        const losersMatchExists = existingNextRound?.some(m => 
          m.is_third_place_match && 
          (m.team1_id === loserId || m.team2_id === loserId)
        );

        if (!losersMatchExists) {
          // Find another loser from same winners round to pair with
          const otherLosers = roundMatches
            .filter(m => m.id !== completedMatch.id && m.winner_id)
            .map(m => m.winner_id === m.team1_id ? m.team2_id : m.team1_id);

          if (otherLosers.length > 0) {
            // Find an unpaired loser
            const pairedLosers = existingNextRound
              ?.filter(m => m.is_third_place_match && m.round_number === losersRound)
              .flatMap(m => [m.team1_id, m.team2_id]) || [];
            
            const unpairedLoser = otherLosers.find(l => !pairedLosers.includes(l));
            
            if (unpairedLoser && !pairedLosers.includes(loserId)) {
              matchesToCreate.push({
                tournament_id: tournamentId,
                phase: "double_elimination",
                round_number: losersRound,
                team1_id: loserId,
                team2_id: unpairedLoser,
                is_third_place_match: true, // Losers bracket
                field_number: 1,
              });
            }
          }
        }

        // Check if winners round is complete for next winners round
        const allRoundComplete = roundMatches.every(m => m.winner_id);
        
        if (allRoundComplete && roundMatches.length >= 2) {
          // Generate next winners round
          const nextWinnersRound = roundNumber + 1;
          const existingWinnersNext = existingNextRound?.filter(
            m => !m.is_third_place_match && m.round_number === nextWinnersRound
          ) || [];

          // Pair winners
          const winners = roundMatches
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(m => m.winner_id);

          for (let i = 0; i < winners.length; i += 2) {
            if (i + 1 >= winners.length) break;
            
            const alreadyExists = existingWinnersNext.some(m =>
              (m.team1_id === winners[i] && m.team2_id === winners[i + 1]) ||
              (m.team1_id === winners[i + 1] && m.team2_id === winners[i])
            );

            if (!alreadyExists && winners[i] && winners[i + 1]) {
              matchesToCreate.push({
                tournament_id: tournamentId,
                phase: "double_elimination",
                round_number: nextWinnersRound,
                team1_id: winners[i],
                team2_id: winners[i + 1],
                is_third_place_match: false,
                field_number: (matchesToCreate.length % numberOfFields) + 1,
              });
            }
          }

          // Check if winners bracket is finished (only 1 winner left) - need grand final
          if (winners.length === 2) {
            // Wait for losers bracket to finish for grand final
          }
        }
      } else {
        // Losers bracket logic
        const allLosersRoundComplete = roundMatches.every(m => m.winner_id);
        
        if (allLosersRoundComplete && roundMatches.length >= 2) {
          const nextLosersRound = roundNumber + 1;
          const existingLosersNext = existingNextRound?.filter(
            m => m.is_third_place_match && m.round_number === nextLosersRound
          ) || [];

          const survivors = roundMatches
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(m => m.winner_id);

          for (let i = 0; i < survivors.length; i += 2) {
            if (i + 1 >= survivors.length) break;
            
            const alreadyExists = existingLosersNext.some(m =>
              (m.team1_id === survivors[i] && m.team2_id === survivors[i + 1]) ||
              (m.team1_id === survivors[i + 1] && m.team2_id === survivors[i])
            );

            if (!alreadyExists && survivors[i] && survivors[i + 1]) {
              matchesToCreate.push({
                tournament_id: tournamentId,
                phase: "double_elimination",
                round_number: nextLosersRound,
                team1_id: survivors[i],
                team2_id: survivors[i + 1],
                is_third_place_match: true,
                field_number: (matchesToCreate.length % numberOfFields) + 1,
              });
            }
          }
        }

        // Check if losers bracket has a single winner (for grand final)
        if (roundMatches.length === 1 && roundMatches[0].winner_id) {
          const losersBracketWinner = roundMatches[0].winner_id;
          
          // Find winners bracket winner
          const winnersMatches = matches.filter(m => !m.is_third_place_match);
          const maxWinnersRound = Math.max(...winnersMatches.map(m => m.round_number));
          const winnersFinal = winnersMatches.find(
            m => m.round_number === maxWinnersRound && m.winner_id
          );

          if (winnersFinal?.winner_id) {
            const grandFinalExists = existingNextRound?.some(m =>
              m.round_number > maxWinnersRound &&
              ((m.team1_id === winnersFinal.winner_id && m.team2_id === losersBracketWinner) ||
               (m.team1_id === losersBracketWinner && m.team2_id === winnersFinal.winner_id))
            );

            if (!grandFinalExists) {
              matchesToCreate.push({
                tournament_id: tournamentId,
                phase: "double_elimination",
                round_number: maxWinnersRound + 1,
                team1_id: winnersFinal.winner_id,
                team2_id: losersBracketWinner,
                is_third_place_match: false, // Grand final is in winners bracket
                field_number: 1,
              });
            }
          }
        }
      }

      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToCreate);

        if (insertError) throw insertError;
        
        toast.success("Next round match(es) generated!");
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error handling progression:", error);
    }
  };

  const getRoundName = (roundNumber: number, totalTeams: number, isLosers: boolean) => {
    const totalRounds = Math.log2(totalTeams);
    
    if (isLosers) {
      const losersRounds = totalRounds; // Losers has same number of rounds
      const roundsRemaining = losersRounds - roundNumber + 1;
      
      if (roundsRemaining === 1) return "Losers Final";
      if (roundsRemaining === 2) return "Losers Semi";
      return `Losers R${roundNumber}`;
    }
    
    const roundsRemaining = totalRounds - roundNumber + 1;
    
    if (roundNumber > totalRounds) return "Grand Final";
    if (roundsRemaining === 1) return "Winners Final";
    if (roundsRemaining === 2) return "Winners Semi";
    if (roundsRemaining === 3) return "Winners Quarter";
    return `Winners R${roundNumber}`;
  };

  // Separate matches by bracket type
  const winnersMatches = matches.filter(m => !m.is_third_place_match);
  const losersMatches = matches.filter(m => m.is_third_place_match);

  const generateBracketStructure = (bracketMatches: Match[], isLosers: boolean) => {
    if (!tournament?.teams_for_elimination) return [];
    
    const totalTeams = tournament.teams_for_elimination;
    const totalRounds = Math.log2(totalTeams);
    const structure: Match[][] = [];
    
    // For winners, include grand final round
    const maxRound = isLosers ? totalRounds : totalRounds + 1;

    for (let round = 1; round <= maxRound; round++) {
      let matchesInRound: number;
      
      if (isLosers) {
        matchesInRound = Math.max(1, totalTeams / Math.pow(2, round));
      } else {
        if (round <= totalRounds) {
          matchesInRound = totalTeams / Math.pow(2, round);
        } else {
          matchesInRound = 1; // Grand final
        }
      }
      
      const roundMatches: Match[] = [];
      const existingRoundMatches = bracketMatches
        .filter(m => m.round_number === round)
        .sort((a, b) => a.id.localeCompare(b.id));
      
      for (let i = 0; i < matchesInRound; i++) {
        const existingMatch = existingRoundMatches[i];
        if (existingMatch) {
          roundMatches.push(existingMatch);
        } else {
          roundMatches.push({
            id: `placeholder-${isLosers ? 'L' : 'W'}-${round}-${i}`,
            round_number: round,
            team1_id: "",
            team2_id: "",
            team1_score: null,
            team2_score: null,
            winner_id: null,
            isPlaceholder: true
          });
        }
      }
      
      if (roundMatches.length > 0) {
        structure.push(roundMatches);
      }
    }
    
    return structure;
  };

  const isPreviousRoundCompleted = (roundNumber: number, bracketMatches: Match[]): boolean => {
    if (roundNumber <= 1) return true;
    
    const previousRoundMatches = bracketMatches.filter(m => m.round_number === roundNumber - 1);
    if (previousRoundMatches.length === 0) return false;
    
    return previousRoundMatches.every(m => m.winner_id !== null);
  };

  const renderBracket = (bracketMatches: Match[], isLosers: boolean) => {
    const structure = generateBracketStructure(bracketMatches, isLosers);
    const totalTeams = tournament?.teams_for_elimination || 8;

    return (
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-8 min-w-max px-4">
          {structure.map((roundMatches, roundIndex) => {
            const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
            const isLastRound = roundIndex === structure.length - 1;
            
            const matchHeight = 124;
            const baseGap = 12;
            const unit = matchHeight + baseGap;
            const verticalGap = unit * Math.pow(2, roundIndex) - matchHeight;
            const topOffset = unit * (Math.pow(2, roundIndex) - 1) / 2;
            
            return (
              <div key={`${isLosers ? 'L' : 'W'}-${roundNumber}`} className="flex flex-col" style={{ minWidth: "180px" }}>
                <div className={cn(
                  "text-center mb-4 py-2 px-4 rounded-lg",
                  isLastRound 
                    ? isLosers 
                      ? "bg-orange-500/20 border border-orange-500/30" 
                      : "bg-primary/20 border border-primary/30"
                    : "bg-muted/50"
                )}>
                  <span className={cn(
                    "text-sm font-bold",
                    isLastRound 
                      ? isLosers 
                        ? "text-orange-500" 
                        : "text-primary"
                      : "text-foreground"
                  )}>
                    {getRoundName(roundNumber, totalTeams, isLosers)}
                  </span>
                </div>
                
                <div 
                  className="flex flex-col relative"
                  style={{ 
                    gap: `${verticalGap}px`,
                    marginTop: `${topOffset}px`
                  }}
                >
                  {!isLastRound && (
                    <svg
                      className="absolute left-full top-0 pointer-events-none"
                      style={{ width: "32px", height: "100%", overflow: "visible" }}
                    >
                      {roundMatches.map((_, matchIndex) => {
                        if (matchIndex % 2 !== 0) return null;
                        if (matchIndex + 1 >= roundMatches.length) return null;

                        const totalHeight = matchHeight + verticalGap;
                        const baseY = matchIndex * totalHeight;
                        const y1 = baseY + matchHeight / 2;
                        const y2 = baseY + totalHeight + matchHeight / 2;
                        const yMid = (y1 + y2) / 2;
                        const color = isLosers ? "hsl(var(--destructive))" : "hsl(var(--primary))";

                        return (
                          <g key={matchIndex} className="animate-fade-in">
                            <line x1="0" y1={y1} x2="16" y2={y1} stroke={color} strokeWidth="2" className="opacity-30" />
                            <line x1="0" y1={y2} x2="16" y2={y2} stroke={color} strokeWidth="2" className="opacity-30" />
                            <line x1="16" y1={y1} x2="16" y2={y2} stroke={color} strokeWidth="2" className="opacity-30" />
                            <line x1="16" y1={yMid} x2="32" y2={yMid} stroke={color} strokeWidth="2" className="opacity-30" />
                          </g>
                        );
                      })}
                    </svg>
                  )}
                  
                  {roundMatches.map((match, matchIndex) => {
                    const canAccessMatch = isPreviousRoundCompleted(roundNumber, bracketMatches);
                    const isLocked = !canAccessMatch && !match.winner_id;
                    const isMatchCompleted = !!match.winner_id;
                    
                    return (
                      <BracketMatch
                        key={match.id}
                        match={match}
                        matchNumber={matchIndex + 1}
                        isEditing={editingMatchId === match.id}
                        scores={scores[match.id] || { team1: "", team2: "" }}
                        isClosed={isClosed || isLocked}
                        isFinal={isLastRound}
                        isRecentlyCompleted={recentlyCompletedMatchId === match.id}
                        advancedTeamId={recentlyAdvancedTeamIds.includes(match.team1_id) ? match.team1_id : 
                                        recentlyAdvancedTeamIds.includes(match.team2_id) ? match.team2_id : undefined}
                        isLocked={isLocked}
                        isCompleted={isMatchCompleted}
                        isCreator={isCreator}
                        onStartEdit={() => {
                          if (match.isPlaceholder) return;
                          if (isLocked || isMatchCompleted) {
                            if (isMatchCompleted) {
                              toast.error("This match is finished");
                            } else {
                              toast.error("Complete the previous round first");
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
                          if (match.isPlaceholder) return;
                          if (isLocked && !isMatchCompleted) {
                            toast.error("Complete the previous round first");
                            return;
                          }
                          setSelectedMatch(match);
                          if (isMatchCompleted) {
                            setRecapDialogOpen(true);
                          } else {
                            setStatsDialogOpen(true);
                          }
                        }}
                        onIncrementScore={(teamId, teamName) => {
                          if (match.isPlaceholder) return;
                          if (isLocked || isMatchCompleted) {
                            toast.error(isMatchCompleted ? "Match finished" : "Complete previous round first");
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
          
          {/* Champion display */}
          {!isLosers && (() => {
            const grandFinal = winnersMatches.find(m => {
              const totalRounds = Math.log2(tournament?.teams_for_elimination || 8);
              return m.round_number > totalRounds && m.winner_id;
            });
            
            if (grandFinal?.winner_id) {
              const winner = grandFinal.winner_id === grandFinal.team1_id 
                ? grandFinal.team1 
                : grandFinal.team2;
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
    );
  };

  if (loading) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground animate-pulse">Loading bracket...</p>
      </Card>
    );
  }

  if (generating) {
    return (
      <Card className="glass-card p-8 text-center">
        <Trophy className="h-12 w-12 text-primary mx-auto mb-4 animate-bounce" />
        <p className="text-muted-foreground animate-pulse">Generating bracket...</p>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">Double Elimination</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          {tournament?.teams_for_elimination} qualified teams - Lose twice to be eliminated
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No matches generated</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="winners" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Winners ({winnersMatches.length})
            </TabsTrigger>
            <TabsTrigger value="losers" className="flex items-center gap-2">
              <Skull className="h-4 w-4" />
              Losers ({losersMatches.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="winners" className="mt-0">
            {renderBracket(winnersMatches, false)}
          </TabsContent>
          
          <TabsContent value="losers" className="mt-0">
            {losersMatches.length > 0 ? (
              renderBracket(losersMatches, true)
            ) : (
              <div className="text-center py-12">
                <Skull className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No losers yet - complete winners bracket matches first</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {selectedMatch && (
        <MatchStatsDialog
          match={selectedMatch}
          tournamentId={tournamentId}
          open={statsDialogOpen}
          onOpenChange={setStatsDialogOpen}
          onScoreUpdate={async () => {
            await fetchTournamentAndMatches();
            if (selectedMatch) {
              const loserId = selectedMatch.winner_id === selectedMatch.team1_id 
                ? selectedMatch.team2_id 
                : selectedMatch.team1_id;
              await handleDoubleEliminationProgression(
                selectedMatch, 
                selectedMatch.winner_id!, 
                loserId
              );
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
          tournamentId={tournamentId}
          matchId={scoringTeam.matchId}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          onGoalRecorded={fetchTournamentAndMatches}
        />
      )}
    </Card>
  );
};
