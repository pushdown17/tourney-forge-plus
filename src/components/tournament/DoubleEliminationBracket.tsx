import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BracketMatch } from "./BracketMatch";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsRecapDialog } from "./MatchStatsRecapDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Shield, Skull, RefreshCw } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

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
  isPlaceholder?: boolean;
  losers_round?: number; // For tracking position in losers bracket
}

interface DoubleEliminationBracketProps {
  tournamentId: string;
  currentPhase: string;
  onPhaseChanged: () => void;
  isClosed?: boolean;
  isCreator?: boolean;
}

/**
 * Challonge-style Double Elimination Bracket
 * 
 * Structure for 8 teams:
 * - Winners Bracket: W-R1 (4 matchs) → W-R2 (2 matchs) → W-Final (1 match)
 * - Losers Bracket (alternating minor/major rounds):
 *   - L-R1 (Minor): Losers from W-R1 play each other (2 matchs)
 *   - L-R2 (Major): Winners of L-R1 vs Losers from W-R2 (2 matchs)
 *   - L-R3 (Minor): Winners of L-R2 play each other (1 match)
 *   - L-Final: Winner of L-R3 vs Loser of W-Final (1 match)
 * - Grand Final: Winner of W-Final vs Winner of L-Final
 * - Reset (if needed): If L-Final winner beats W-Final winner
 */
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
          is_third_place_match: false,
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
      await handleChallongeProgression(match, winnerId, loserId);
    } catch (error: any) {
      toast.error("Error updating score");
      console.error(error);
    }
  };

  /**
   * Challonge-style progression logic
   * 
   * For 8 teams:
   * - W-R1 losers → L-R1 (Minor: losers play each other)
   * - W-R2 losers → L-R2 (Major: face L-R1 winners)
   * - W-Final loser → L-Final (Major: faces L-R3 winner)
   */
  const handleChallongeProgression = async (
    completedMatch: Match, 
    winnerId: string, 
    loserId: string
  ) => {
    try {
      const isLosersBracket = completedMatch.is_third_place_match;
      const roundNumber = completedMatch.round_number;
      const totalTeams = tournament?.teams_for_elimination || 8;
      const winnersRounds = Math.log2(totalTeams); // For 8 teams: 3 rounds

      // Get ALL existing matches
      const { data: allMatches, error: matchesError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", "double_elimination");

      if (matchesError) throw matchesError;

       const winnersMatches = allMatches?.filter(m => !m.is_third_place_match) || [];
       const losersMatches = allMatches?.filter(m => m.is_third_place_match) || [];

       // ===== Grand Final reset logic (Challonge-style) =====
       const grandFinalRound1 = winnersRounds + 1;
       const grandFinalRound2 = winnersRounds + 2;
       const losersRoundsCount = getLosersRoundsCount(totalTeams);

       // If we just completed a Grand Final match, decide whether we need a reset.
       if (!isLosersBracket && roundNumber >= grandFinalRound1) {
         const winnersFinalWinner = winnersMatches.find(m => m.round_number === winnersRounds)?.winner_id || null;
         const losersFinalWinner = losersMatches.find(m => m.round_number === losersRoundsCount)?.winner_id || null;

         // Only Grand Final #1 can trigger a reset.
         if (roundNumber === grandFinalRound1) {
           if (winnersFinalWinner && losersFinalWinner && winnerId === losersFinalWinner && winnerId !== winnersFinalWinner) {
             // Losers bracket champ won GF1 → create reset GF2
             await createGrandFinalReset(winnersFinalWinner, losersFinalWinner, winnersMatches);
           }
         }

         // Refresh and stop progression: no further bracket matches should be generated from GF.
         await fetchTournamentAndMatches();
         return;
       }

       const matchesToCreate: any[] = [];

      if (!isLosersBracket) {
        // WINNERS BRACKET LOGIC
        
        // Get all matches in this winners round
        const currentRoundMatches = winnersMatches.filter(m => m.round_number === roundNumber);
        const allCompleted = currentRoundMatches.every(m => m.winner_id);

        if (allCompleted) {
          // Generate next winners round
          if (currentRoundMatches.length >= 2) {
            const winners = currentRoundMatches
              .sort((a, b) => a.id.localeCompare(b.id))
              .map(m => m.winner_id);

            const nextRound = roundNumber + 1;
            const existingNextRound = winnersMatches.filter(m => m.round_number === nextRound);

            for (let i = 0; i < winners.length; i += 2) {
              if (i + 1 >= winners.length) break;

              const exists = existingNextRound.some(m =>
                (m.team1_id === winners[i] && m.team2_id === winners[i + 1]) ||
                (m.team1_id === winners[i + 1] && m.team2_id === winners[i])
              );

              if (!exists) {
                matchesToCreate.push({
                  tournament_id: tournamentId,
                  phase: "double_elimination",
                  round_number: nextRound,
                  team1_id: winners[i],
                  team2_id: winners[i + 1],
                  is_third_place_match: false,
                  field_number: 1,
                });
              }
            }
          }

          // LOSERS BRACKET GENERATION (Challonge-style)
          const losers = currentRoundMatches
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(m => m.winner_id === m.team1_id ? m.team2_id : m.team1_id);

          if (roundNumber === 1) {
            // W-R1 losers → L-R1 (Minor round: losers play each other)
            // Flip order to avoid immediate rematches in later rounds
            const flippedLosers = [...losers].reverse();
            
            for (let i = 0; i < flippedLosers.length; i += 2) {
              if (i + 1 >= flippedLosers.length) break;

              const exists = losersMatches.some(m =>
                m.round_number === 1 &&
                ((m.team1_id === flippedLosers[i] && m.team2_id === flippedLosers[i + 1]) ||
                 (m.team1_id === flippedLosers[i + 1] && m.team2_id === flippedLosers[i]))
              );

              if (!exists) {
                matchesToCreate.push({
                  tournament_id: tournamentId,
                  phase: "double_elimination",
                  round_number: 1,
                  team1_id: flippedLosers[i],
                  team2_id: flippedLosers[i + 1],
                  is_third_place_match: true,
                  field_number: (i / 2) % numberOfFields + 1,
                });
              }
            }
          } else {
            // W-R2+ losers → Wait for minor round to complete, then create major round
            // These losers will face winners from the previous losers round
            await generateMajorRound(losersMatches, losers, roundNumber);
          }
        }

        // Check for Grand Final
        if (roundNumber === winnersRounds && winnerId) {
          // This was the Winners Final - check if Losers Final is complete
          const losersFinal = losersMatches.find(m => {
            const lastLosersRound = getLosersRoundsCount(totalTeams);
            return m.round_number === lastLosersRound && m.winner_id;
          });

          if (losersFinal?.winner_id) {
            await createGrandFinal(winnerId, losersFinal.winner_id, winnersMatches);
          }
        }

      } else {
        // LOSERS BRACKET LOGIC

        const currentLosersRound = losersMatches.filter(m => m.round_number === roundNumber);
        const allCompleted = currentLosersRound.every(m => m.winner_id);

        if (allCompleted) {
          const survivors = currentLosersRound
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(m => m.winner_id);

          const isMinorRound = roundNumber % 2 === 1;
          const losersRoundsCount = getLosersRoundsCount(totalTeams);

          if (roundNumber < losersRoundsCount) {
            if (isMinorRound && survivors.length >= 1) {
              // After minor round: Check if we have dropping losers for major round
              const correspondingWinnersRound = Math.ceil(roundNumber / 2) + 1;
              const droppingLosers = winnersMatches
                .filter(m => m.round_number === correspondingWinnersRound && m.winner_id)
                .sort((a, b) => a.id.localeCompare(b.id))
                .map(m => m.winner_id === m.team1_id ? m.team2_id : m.team1_id);

              if (droppingLosers.length === survivors.length) {
                // Create major round: survivors vs dropping losers
                const nextRound = roundNumber + 1;
                const existingNextRound = losersMatches.filter(m => m.round_number === nextRound);

                for (let i = 0; i < survivors.length; i++) {
                  const droppingLoser = droppingLosers[survivors.length - 1 - i]; // Flip for seeding
                  
                  const exists = existingNextRound.some(m =>
                    (m.team1_id === survivors[i] && m.team2_id === droppingLoser) ||
                    (m.team1_id === droppingLoser && m.team2_id === survivors[i])
                  );

                  if (!exists && survivors[i] && droppingLoser) {
                    matchesToCreate.push({
                      tournament_id: tournamentId,
                      phase: "double_elimination",
                      round_number: nextRound,
                      team1_id: droppingLoser, // Dropping loser as team1 (higher seed)
                      team2_id: survivors[i],
                      is_third_place_match: true,
                      field_number: i % numberOfFields + 1,
                    });
                  }
                }
              }
            } else {
              // After major round: survivors play each other (next minor round)
              const nextRound = roundNumber + 1;
              const existingNextRound = losersMatches.filter(m => m.round_number === nextRound);

              for (let i = 0; i < survivors.length; i += 2) {
                if (i + 1 >= survivors.length) break;

                const exists = existingNextRound.some(m =>
                  (m.team1_id === survivors[i] && m.team2_id === survivors[i + 1]) ||
                  (m.team1_id === survivors[i + 1] && m.team2_id === survivors[i])
                );

                if (!exists && survivors[i] && survivors[i + 1]) {
                  matchesToCreate.push({
                    tournament_id: tournamentId,
                    phase: "double_elimination",
                    round_number: nextRound,
                    team1_id: survivors[i],
                    team2_id: survivors[i + 1],
                    is_third_place_match: true,
                    field_number: 1,
                  });
                }
              }
            }
          }

          // Check for Grand Final after Losers Final
          if (survivors.length === 1 && roundNumber === losersRoundsCount) {
            const winnersFinal = winnersMatches.find(m => 
              m.round_number === winnersRounds && m.winner_id
            );

            if (winnersFinal?.winner_id) {
              await createGrandFinal(winnersFinal.winner_id, survivors[0]!, winnersMatches);
            }
          }
        }
      }

      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToCreate);

        if (insertError) throw insertError;
        
        toast.success("Next match(es) generated!");
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error handling progression:", error);
    }
  };

  const generateMajorRound = async (losersMatches: any[], droppingLosers: string[], winnersRound: number) => {
    // For major rounds, dropping losers face winners from previous losers round
    const previousLosersRound = (winnersRound - 1) * 2 - 1; // L-R1 for W-R2, L-R3 for W-R3, etc.
    const previousRoundMatches = losersMatches.filter(m => m.round_number === previousLosersRound);
    
    if (!previousRoundMatches.every(m => m.winner_id)) {
      return; // Previous losers round not complete
    }

    const minorRoundWinners = previousRoundMatches
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(m => m.winner_id);

    if (minorRoundWinners.length !== droppingLosers.length) {
      return;
    }

    const majorRound = previousLosersRound + 1;
    const existingMajorRound = losersMatches.filter(m => m.round_number === majorRound);

    const matchesToCreate: any[] = [];

    for (let i = 0; i < droppingLosers.length; i++) {
      const minorWinner = minorRoundWinners[droppingLosers.length - 1 - i]; // Flip for seeding
      
      const exists = existingMajorRound.some(m =>
        (m.team1_id === droppingLosers[i] && m.team2_id === minorWinner) ||
        (m.team1_id === minorWinner && m.team2_id === droppingLosers[i])
      );

      if (!exists && droppingLosers[i] && minorWinner) {
        matchesToCreate.push({
          tournament_id: tournamentId,
          phase: "double_elimination",
          round_number: majorRound,
          team1_id: droppingLosers[i],
          team2_id: minorWinner,
          is_third_place_match: true,
          field_number: 1,
        });
      }
    }

    if (matchesToCreate.length > 0) {
      const { error } = await supabase.from("matches").insert(matchesToCreate);
      if (error) throw error;
    }
  };

  const createGrandFinal = async (winnersChampion: string, losersChampion: string, winnersMatches: any[]) => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const winnersRounds = Math.log2(totalTeams);
    const grandFinalRound = winnersRounds + 1;

    const exists = winnersMatches.some(m =>
      m.round_number === grandFinalRound &&
      ((m.team1_id === winnersChampion && m.team2_id === losersChampion) ||
       (m.team1_id === losersChampion && m.team2_id === winnersChampion))
    );

    if (!exists) {
      const { error } = await supabase.from("matches").insert({
        tournament_id: tournamentId,
        phase: "double_elimination",
        round_number: grandFinalRound,
        team1_id: winnersChampion,
        team2_id: losersChampion,
        is_third_place_match: false,
        field_number: 1,
      });

      if (error) throw error;
      toast.success("🏆 Grand Final created!");
    }
  };

  // If the Losers Bracket champion beats the Winners Bracket champion in Grand Final,
  // a reset match is required (Challonge-style).
  const createGrandFinalReset = async (winnersChampion: string, losersChampion: string, winnersMatches: any[]) => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    const winnersRounds = Math.log2(totalTeams);
    const resetRound = winnersRounds + 2;

    const exists = winnersMatches.some(m =>
      m.round_number === resetRound &&
      ((m.team1_id === winnersChampion && m.team2_id === losersChampion) ||
       (m.team1_id === losersChampion && m.team2_id === winnersChampion))
    );

    if (!exists) {
      const { error } = await supabase.from("matches").insert({
        tournament_id: tournamentId,
        phase: "double_elimination",
        round_number: resetRound,
        team1_id: winnersChampion,
        team2_id: losersChampion,
        is_third_place_match: false,
        field_number: 1,
      });

      if (error) throw error;
      toast.success("🔁 Grand Final reset created!");
    }
  };

  const getLosersRoundsCount = (totalTeams: number): number => {
    // For 8 teams: L-R1 (minor), L-R2 (major), L-R3 (minor), L-R4 (major/final) = 4 rounds
    // For 16 teams: 6 rounds, etc.
    return (Math.log2(totalTeams) - 1) * 2;
  };

  const getRoundName = (roundNumber: number, totalTeams: number, isLosers: boolean) => {
    const winnersRounds = Math.log2(totalTeams);

    if (isLosers) {
      const losersRoundsCount = getLosersRoundsCount(totalTeams);

      if (roundNumber === losersRoundsCount) return "Losers Final";
      if (roundNumber === losersRoundsCount - 1) return "Losers Semi";

      const isMinor = roundNumber % 2 === 1;
      return `L-R${roundNumber} ${isMinor ? "(Minor)" : "(Major)"}`;
    }

    // Winners bracket rounds + Grand Final (+ optional reset)
    if (roundNumber === winnersRounds + 2) return "Grand Final Reset";
    if (roundNumber === winnersRounds + 1) return "Grand Final";
    if (roundNumber > winnersRounds) return "Grand Final";

    if (roundNumber === winnersRounds) return "Winners Final";
    if (roundNumber === winnersRounds - 1) return "Winners Semi";
    if (roundNumber === winnersRounds - 2) return "Winners Quarter";
    return `W-R${roundNumber}`;
  };

  // Separate matches by bracket type
  const totalTeams = tournament?.teams_for_elimination || 8;
  const winnersRoundsCount = Math.log2(totalTeams); // For 8 teams = 3 (R1, R2, R3)

  // Grand Final(s): round > winnersRoundsCount and not a third_place_match
  const grandFinalMatches = matches
    .filter(m => !m.is_third_place_match && m.round_number > winnersRoundsCount)
    .sort((a, b) => a.round_number - b.round_number);

  // Winners bracket excludes grand final
  const winnersMatches = matches.filter(m =>
    !m.is_third_place_match && m.round_number <= winnersRoundsCount
  );
  const losersMatches = matches.filter(m => m.is_third_place_match);

  // Only show champion if ALL grand final matches are completed
  // If there's a reset match without a winner, tournament is not decided yet
  const allGrandFinalsCompleted = grandFinalMatches.length > 0 && grandFinalMatches.every(m => m.winner_id);
  const decidingFinal = allGrandFinalsCompleted 
    ? grandFinalMatches[grandFinalMatches.length - 1] 
    : null;

  const generateBracketStructure = (bracketMatches: Match[], isLosers: boolean) => {
    if (!tournament?.teams_for_elimination) return [];
    
    const totalTeams = tournament.teams_for_elimination;
    const structure: Match[][] = [];
    
    // Find max round number in this bracket
    const maxExistingRound = bracketMatches.length > 0 
      ? Math.max(...bracketMatches.map(m => m.round_number))
      : 0;

    const maxRound = isLosers 
      ? Math.max(maxExistingRound, getLosersRoundsCount(totalTeams))
      : Math.max(maxExistingRound, Math.log2(totalTeams) + 1);

    for (let round = 1; round <= maxRound; round++) {
      const existingRoundMatches = bracketMatches
        .filter(m => m.round_number === round)
        .sort((a, b) => a.id.localeCompare(b.id));
      
      if (existingRoundMatches.length > 0) {
        structure.push(existingRoundMatches);
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

    if (structure.length === 0) {
      return (
        <div className="text-center py-12">
          <Skull className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">
            {isLosers 
              ? "Complete winners bracket matches to generate losers bracket" 
              : "No matches generated yet"}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-8 min-w-max px-4">
          {structure.map((roundMatches, roundIndex) => {
            const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
            const isLastRound = roundIndex === structure.length - 1;
            
            const matchHeight = 124;
            const baseGap = 16;
            const unit = matchHeight + baseGap;
            const verticalGap = isLosers 
              ? baseGap // Less spacing for losers bracket
              : unit * Math.pow(2, roundIndex) - matchHeight;
            const topOffset = isLosers 
              ? 0 
              : unit * (Math.pow(2, roundIndex) - 1) / 2;
            
            return (
              <div key={`${isLosers ? 'L' : 'W'}-${roundNumber}`} className="flex flex-col" style={{ minWidth: "200px" }}>
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
                  {!isLastRound && !isLosers && (
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
                        const color = "hsl(var(--primary))";

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
          {!isLosers && decidingFinal?.winner_id && (() => {
            const winner = decidingFinal.winner_id === decidingFinal.team1_id
              ? decidingFinal.team1
              : decidingFinal.team2;

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Double Elimination (Challonge-style)</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-9">
            {tournament?.teams_for_elimination} teams - Lose twice to be eliminated
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchTournamentAndMatches}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No matches generated</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Winners Bracket */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Winners Bracket</h3>
              <span className="text-sm text-muted-foreground">({winnersMatches.length} matchs)</span>
            </div>
            {renderBracket(winnersMatches, false)}
          </div>
          
          {/* Losers Bracket */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
              <Skull className="h-5 w-5 text-destructive" />
              <h3 className="text-lg font-semibold">Losers Bracket</h3>
              <span className="text-sm text-muted-foreground">({losersMatches.length} matchs)</span>
            </div>
            {renderBracket(losersMatches, true)}
          </div>
          
          {/* Grand Final */}
          {grandFinalMatches.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-primary">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <h3 className="text-lg font-semibold text-yellow-500">Grande Finale</h3>
              </div>

              <div className="flex flex-col items-center gap-4">
                {grandFinalMatches.map((gf, idx) => {
                  const label = gf.round_number === winnersRoundsCount + 2 ? "Finale 2 (Reset)" : "Finale 1";
                  const isReset = gf.round_number === winnersRoundsCount + 2;
                  const resetLocked = isReset && !grandFinalMatches.some(m => m.round_number === winnersRoundsCount + 1 && m.winner_id);

                  return (
                    <div key={gf.id} className="w-full" style={{ maxWidth: "360px" }}>
                      <div className="text-center text-xs text-muted-foreground mb-2">{label}</div>
                      <BracketMatch
                        match={gf}
                        matchNumber={idx + 1}
                        isEditing={editingMatchId === gf.id}
                        scores={scores[gf.id] || { team1: "", team2: "" }}
                        isClosed={isClosed}
                        isFinal={true}
                        isRecentlyCompleted={recentlyCompletedMatchId === gf.id}
                        advancedTeamId={undefined}
                        isLocked={resetLocked}
                        isCompleted={!!gf.winner_id}
                        isCreator={isCreator}
                        onStartEdit={() => {
                          if (gf.isPlaceholder) return;
                          if (resetLocked) {
                            toast.error("Complete Finale 1 first");
                            return;
                          }
                          if (gf.winner_id) {
                            toast.error("This match is finished");
                            return;
                          }
                          setEditingMatchId(gf.id);
                          setScores({
                            ...scores,
                            [gf.id]: {
                              team1: gf.team1_score?.toString() || "0",
                              team2: gf.team2_score?.toString() || "0",
                            },
                          });
                        }}
                        onSaveScore={() => handleScoreUpdate(gf.id)}
                        onCancelEdit={() => setEditingMatchId(null)}
                        onScoreChange={(team, value) =>
                          setScores({
                            ...scores,
                            [gf.id]: {
                              ...(scores[gf.id] || { team1: "0", team2: "0" }),
                              [team]: value,
                            },
                          })
                        }
                        onMatchClick={() => {
                          if (gf.isPlaceholder) return;
                          if (resetLocked) {
                            toast.error("Complete Finale 1 first");
                            return;
                          }
                          setSelectedMatch(gf);
                          if (gf.winner_id) {
                            setRecapDialogOpen(true);
                          } else {
                            setStatsDialogOpen(true);
                          }
                        }}
                        onIncrementScore={(teamId, teamName) => {
                          if (gf.isPlaceholder) return;
                          if (resetLocked) {
                            toast.error("Complete Finale 1 first");
                            return;
                          }
                          if (gf.winner_id) {
                            toast.error("Match finished");
                            return;
                          }
                          setScoringTeam({ id: teamId, name: teamName, matchId: gf.id });
                          setGoalScorerDialogOpen(true);
                        }}
                      />
                    </div>
                  );
                })}

                {decidingFinal?.winner_id && (
                  <div className="mt-2 text-center p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-lg" style={{ maxWidth: "420px", width: "100%" }}>
                    <Trophy className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <p className="text-lg font-bold text-yellow-500">
                      🏆 Champion: {decidingFinal.winner_id === decidingFinal.team1_id
                        ? decidingFinal.team1?.name
                        : decidingFinal.team2?.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
              await handleChallongeProgression(
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
