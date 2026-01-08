import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BracketMatch } from "./BracketMatch";
import { PhaseTransition } from "./PhaseTransition";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsRecapDialog } from "./MatchStatsRecapDialog";
import { DoubleEliminationBracket } from "./DoubleEliminationBracket";
import { SendToStationDialog } from "./SendToStationDialog";
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
  seed?: number;
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
  // If double elimination, use dedicated component
  if (eliminationType === "double" || currentPhase === "double_elimination") {
    return (
      <DoubleEliminationBracket
        tournamentId={tournamentId}
        currentPhase={currentPhase}
        onPhaseChanged={onPhaseChanged}
        isClosed={isClosed}
        isCreator={isCreator}
      />
    );
  }

  // If not yet in elimination phase, show transition component
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

  // If in elimination phase but no type defined
  if (!eliminationType) {
    return (
      <Card className="glass-card p-8 text-center">
        <p className="text-muted-foreground">
          Tournament configuration error.
        </p>
      </Card>
    );
  }

  // Active elimination phase
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tournament, setTournament] = useState<any>(null);
  const [byeTeams, setByeTeams] = useState<Team[]>([]);
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
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [stationMatch, setStationMatch] = useState<{ id: string; label: string } | null>(null);
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
  const [matchTimers, setMatchTimers] = useState<{ [matchId: string]: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  }}>({});
  const [pendingFinalMatches, setPendingFinalMatches] = useState<{
    finale: any;
    thirdPlace: any;
  } | null>(null);

  useEffect(() => {
    fetchTournamentAndMatches();
  }, [tournamentId]);

  // Realtime subscription for saved score updates (database changes)
  useEffect(() => {
    console.log('Setting up realtime DB subscription for tournament:', tournamentId);
    
    const channel = supabase
      .channel(`matches-realtime-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches'
        },
        (payload) => {
          console.log('Realtime DB event received:', payload);
          
          // Only process updates for this tournament
          if (payload.new && (payload.new as any).tournament_id === tournamentId) {
            console.log('Match updated in realtime:', payload.new);
            
            setMatches(prevMatches => 
              prevMatches.map(match => {
                if (match.id === (payload.new as any).id) {
                  return {
                    ...match,
                    team1_score: (payload.new as any).team1_score,
                    team2_score: (payload.new as any).team2_score,
                    winner_id: (payload.new as any).winner_id,
                  };
                }
                return match;
              })
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime DB subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime DB subscription');
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  // Live broadcast subscription for real-time score updates (before save) and timer updates
  useEffect(() => {
    console.log('Setting up live broadcast subscription for tournament:', tournamentId);
    
    const liveTimeouts: { [matchId: string]: NodeJS.Timeout } = {};
    
    const channel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on(
        'broadcast',
        { event: 'live_score' },
        (payload) => {
          console.log('Live score broadcast received:', payload);
          
          const { matchId, team1_score, team2_score } = payload.payload;
          
          // Mark match as live
          setLiveMatches(prev => new Set(prev).add(matchId));
          
          // Clear existing timeout for this match
          if (liveTimeouts[matchId]) {
            clearTimeout(liveTimeouts[matchId]);
          }
          
          // Set timeout to remove live status after 10 seconds of inactivity
          liveTimeouts[matchId] = setTimeout(() => {
            setLiveMatches(prev => {
              const next = new Set(prev);
              next.delete(matchId);
              return next;
            });
          }, 10000);
          
          setMatches(prevMatches => 
            prevMatches.map(match => {
              if (match.id === matchId) {
                return {
                  ...match,
                  team1_score,
                  team2_score,
                };
              }
              return match;
            })
          );
        }
      )
      .on(
        'broadcast',
        { event: 'timer_update' },
        (payload) => {
          console.log('Timer update broadcast received:', payload);
          
          const { matchId, action, timer_started_at, timer_paused_at, timer_elapsed_when_paused } = payload.payload;
          
          // Mark match as live when timer is running
          if (action === 'start' || action === 'resume') {
            setLiveMatches(prev => new Set(prev).add(matchId));
          }
          
          // Update timer state
          setMatchTimers(prev => ({
            ...prev,
            [matchId]: {
              ...prev[matchId],
              startedAt: timer_started_at,
              pausedAt: timer_paused_at,
              elapsedWhenPaused: timer_elapsed_when_paused ?? prev[matchId]?.elapsedWhenPaused ?? 0
            }
          }));
          
          // If timer is reset, remove live status after a delay
          if (action === 'reset') {
            setTimeout(() => {
              setLiveMatches(prev => {
                const next = new Set(prev);
                next.delete(matchId);
                return next;
              });
              setMatchTimers(prev => {
                const next = { ...prev };
                delete next[matchId];
                return next;
              });
            }, 2000);
          }
        }
      )
      .subscribe((status) => {
        console.log('Live broadcast subscription status:', status);
      });

    return () => {
      console.log('Cleaning up live broadcast subscription');
      // Clear all timeouts
      Object.values(liveTimeouts).forEach(timeout => clearTimeout(timeout));
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const fetchTournamentAndMatches = async () => {
    setLoading(true);
    try {
      // Get tournament info
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      setTournament(tournamentData);
      setNumberOfFields(tournamentData.number_of_fields || 1);

      // Fetch matches and standings in parallel
      const [matchesResult, standingsResult] = await Promise.all([
        supabase
          .from("matches")
          .select(`
            *,
            team1:teams!matches_team1_id_fkey(id, name),
            team2:teams!matches_team2_id_fkey(id, name)
          `)
          .eq("tournament_id", tournamentId)
          .eq("phase", currentPhase)
          .order("round_number", { ascending: true }),
        supabase
          .from("team_stats")
          .select("team_id, points, goals_for, goals_against, team:teams!team_stats_team_id_fkey(id, name)")
          .eq("tournament_id", tournamentId)
          .order("points", { ascending: false })
          .order("goals_for", { ascending: false })
      ]);

      if (matchesResult.error) throw matchesResult.error;
      
      // Build seed map from standings
      const seedMap = new Map<string, number>();
      if (standingsResult.data) {
        standingsResult.data.forEach((stat, index) => {
          seedMap.set(stat.team_id, index + 1);
        });
      }

      // Compute bye teams (top seeds) when qualified teams isn't a power of 2
      const qualifiedTeamsCount = tournamentData.teams_for_elimination || 0;
      const bracketSize = qualifiedTeamsCount > 0
        ? Math.pow(2, Math.ceil(Math.log2(qualifiedTeamsCount)))
        : 0;
      const numberOfByes = bracketSize - qualifiedTeamsCount;

      if (numberOfByes > 0 && standingsResult.data) {
        const topSeeds = standingsResult.data.slice(0, numberOfByes) as any[];
        setByeTeams(
          topSeeds.map((stat, index) => ({
            id: stat.team_id,
            name: stat.team?.name || `Seed ${index + 1}`,
            seed: index + 1,
          }))
        );
      } else {
        setByeTeams([]);
      }

      // Attach seed to teams
      const matchesWithSeeds = (matchesResult.data || []).map(match => ({
        ...match,
        team1: match.team1 ? { ...match.team1, seed: seedMap.get(match.team1.id) } : match.team1,
        team2: match.team2 ? { ...match.team2, seed: seedMap.get(match.team2.id) } : match.team2,
      }));

      setMatches(matchesWithSeeds);
      if (!matchesResult.data || matchesResult.data.length === 0) {
        // Auto-generate matches
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
      // Get qualified teams according to ranking
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

      // Calculate bracket size (next power of 2)
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(teamsCount)));
      const numberOfByes = bracketSize - teamsCount;
      
      console.log(`Generating bracket: ${teamsCount} teams, bracket size ${bracketSize}, ${numberOfByes} byes`);
      
      // Standard tournament seeding:
      // In a bracket of 16: seed 1 vs 16, 2 vs 15, 3 vs 14, etc.
      // With byes, the missing seeds (15, 16 if only 14 teams) give byes to top seeds
      
      // Create seeding matchups for round 1
      const allMatches = [];
      const byeTeams: string[] = [];
      const firstRoundMatchCount = bracketSize / 2;
      let matchIndex = 0;
      
      for (let i = 0; i < firstRoundMatchCount; i++) {
        // Seed positions: match i has seed (i+1) vs seed (bracketSize - i)
        const seed1 = i + 1;  // 1, 2, 3, ... 8
        const seed2 = bracketSize - i;  // 16, 15, 14, ... 9
        
        // Convert seeds to array indices (0-based)
        const team1Index = seed1 - 1;  // 0, 1, 2, ... 7
        const team2Index = seed2 - 1;  // 15, 14, 13, ... 8
        
        // Check if teams exist (teams are ranked 0 to teamsCount-1)
        const team1 = team1Index < teamsCount ? standings[team1Index] : null;
        const team2 = team2Index < teamsCount ? standings[team2Index] : null;
        
        console.log(`Match slot ${i}: seed ${seed1} (idx ${team1Index}) vs seed ${seed2} (idx ${team2Index})`);
        console.log(`  Team1: ${team1?.team?.name || 'BYE'}, Team2: ${team2?.team?.name || 'BYE'}`);
        
        if (team1 && team2) {
          // Normal match - both teams present
          const fieldNumber = (matchIndex % numberOfFields) + 1;
          
          allMatches.push({
            tournament_id: tournamentId,
            phase: currentPhase,
            round_number: 1,
            team1_id: team1.team_id,
            team2_id: team2.team_id,
            field_number: fieldNumber,
          });
          matchIndex++;
        } else if (team1 && !team2) {
          // Team 1 gets a bye (their opponent doesn't exist)
          byeTeams.push(team1.team?.name || `Seed ${seed1}`);
          console.log(`  → ${team1.team?.name} gets a BYE`);
        } else if (!team1 && team2) {
          // Team 2 gets a bye (shouldn't happen with proper seeding)
          byeTeams.push(team2.team?.name || `Seed ${seed2}`);
          console.log(`  → ${team2.team?.name} gets a BYE`);
        }
      }

      // Insert first round matches
      if (allMatches.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(allMatches);

        if (insertError) throw insertError;
      }

      // If there are byes, show a message
      if (byeTeams.length > 0) {
        toast.success(`Bracket generated! ${byeTeams.length} bye(s): ${byeTeams.join(", ")}`);
      } else {
        toast.success("Bracket generated successfully!");
      }
      
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

      // Celebration animation
      setRecentlyCompletedMatchId(matchId);
      setRecentlyAdvancedTeamIds([winnerId]);
      
      // Remove animation after delay
      setTimeout(() => {
        setRecentlyCompletedMatchId(null);
        setRecentlyAdvancedTeamIds([]);
      }, 2000);

      toast.success("Score updated");
      setEditingMatchId(null);
      await fetchTournamentAndMatches();
      
      // Check if round is completed and generate next
      await checkAndGenerateNextRound(match.round_number);
    } catch (error: any) {
      toast.error("Error updating score");
      console.error(error);
    }
  };

  const checkAndGenerateNextRound = async (completedRound: number) => {
    try {
      // Get all matches from completed round (non-3rd place)
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

      // If it's the final (1 match only) and it's finished
      if (roundMatches.length === 1 && roundMatches[0].winner_id) {
        toast.success("🏆 Tournament finished! Congratulations to the winner!");
        return;
      }

      // Check which next round matches already exist
      const { data: existingNextRoundMatches, error: existingError } = await supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("phase", currentPhase)
        .eq("round_number", completedRound + 1)
        .order("id", { ascending: true });

      if (existingError) throw existingError;

      const teamsCount = tournament?.teams_for_elimination || 0;
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(teamsCount)));
      const numberOfByes = bracketSize - teamsCount;

      // Get standings to identify bye teams
      const { data: standings, error: standingsError } = await supabase
        .from("team_stats")
        .select("team_id")
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false })
        .limit(teamsCount);

      if (standingsError) throw standingsError;

      // Identify teams that had byes (top N seeds where N = numberOfByes)
      const byeTeamIds = numberOfByes > 0 && standings 
        ? standings.slice(0, numberOfByes).map(s => s.team_id)
        : [];

      console.log(`Round ${completedRound} completed check: ${roundMatches.length} matches, ${numberOfByes} byes`);
      console.log('Bye team IDs:', byeTeamIds);

      const matchesToCreate: any[] = [];

      // Special handling for round 1 with byes
      if (completedRound === 1 && numberOfByes > 0) {
        // For round 1 with byes, we need to pair:
        // - Bye teams with winners from specific R1 matches
        // - Winners from other R1 matches with each other
        
        // Get all winners from round 1
        const r1Winners = roundMatches
          .filter(m => m.winner_id)
          .map(m => m.winner_id);
        
        // Check if all R1 matches are complete
        if (r1Winners.length !== roundMatches.length) {
          console.log('Not all R1 matches complete yet');
          return; // Wait for all matches to complete
        }

        // Calculate expected R2 matches
        const expectedR2Matches = bracketSize / 4; // For 16: 4 matches in R2
        
        // Proper bracket seeding for R2:
        // In a 16-team bracket with 2 byes:
        // - R2 match 1: Seed 1 (bye) vs Winner of R1 match where seed 8 vs 9 played
        // - R2 match 2: Winner(5v12) vs Winner(4v13)
        // - R2 match 3: Winner(3v14) vs Winner(6v11)
        // - R2 match 4: Seed 2 (bye) vs Winner of R1 match where seed 7 vs 10 played
        
        // For simplicity, we'll use position-based pairing:
        // Bye teams fill slots 0 and expectedR2Matches-1 (first and last)
        // R1 winners fill the remaining slots in order
        
        const r2Slots: (string | null)[] = new Array(expectedR2Matches * 2).fill(null);
        
        // Place bye teams at their seeded positions (positions 0 and 1 for top 2 seeds)
        for (let i = 0; i < byeTeamIds.length && i < r2Slots.length; i++) {
          r2Slots[i * 2] = byeTeamIds[i]; // Position 0, 2, 4... (every other slot for team1)
        }
        
        // Place R1 winners in remaining slots
        let winnerIdx = 0;
        for (let i = 0; i < r2Slots.length && winnerIdx < r1Winners.length; i++) {
          if (r2Slots[i] === null) {
            r2Slots[i] = r1Winners[winnerIdx];
            winnerIdx++;
          }
        }
        
        console.log('R2 slots:', r2Slots);
        
        // Create R2 matches from slots
        for (let i = 0; i < expectedR2Matches; i++) {
          const team1Id = r2Slots[i * 2];
          const team2Id = r2Slots[i * 2 + 1];
          
          if (!team1Id || !team2Id) continue;
          
          // Check if match already exists
          const exists = existingNextRoundMatches?.some(m =>
            !m.is_third_place_match &&
            ((m.team1_id === team1Id && m.team2_id === team2Id) ||
             (m.team1_id === team2Id && m.team2_id === team1Id))
          );
          
          if (!exists) {
            const fieldNumber = (matchesToCreate.length % numberOfFields) + 1;
            matchesToCreate.push({
              tournament_id: tournamentId,
              phase: currentPhase as any,
              round_number: completedRound + 1,
              team1_id: team1Id,
              team2_id: team2Id,
              is_third_place_match: false,
              field_number: fieldNumber,
            });
          }
        }
      } else {
        // Standard progression without byes (or rounds after R1)
        // Process matches in pairs to generate next round matches progressively
        for (let i = 0; i < roundMatches.length; i += 2) {
          if (i + 1 >= roundMatches.length) break; // No complete pair

          const match1 = roundMatches[i];
          const match2 = roundMatches[i + 1];

          // Check if both matches in the pair are finished
          if (!match1.winner_id || !match2.winner_id) {
            continue; // This pair is not yet complete
          }

          // Check if a match with these two teams already exists
          const matchAlreadyExists = existingNextRoundMatches?.some(m => 
            !m.is_third_place_match &&
            ((m.team1_id === match1.winner_id && m.team2_id === match2.winner_id) ||
             (m.team1_id === match2.winner_id && m.team2_id === match1.winner_id))
          );

          if (matchAlreadyExists) {
            continue; // This match already exists
          }

          // If it's the semi-finals (only 2 matches in the round)
          if (roundMatches.length === 2 && i === 0) {
            // Get the losers for the 3rd place match
            const loser1 = match1.winner_id === match1.team1_id ? match1.team2_id : match1.team1_id;
            const loser2 = match2.winner_id === match2.team1_id ? match2.team2_id : match2.team1_id;

            // Check if these matches don't already exist
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

            // If final already exists, do nothing
            if (finaleExists) {
              continue;
            }

            // Prepare final and 3rd place matches
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

            // If 3rd place match doesn't exist yet, ask for confirmation
            if (!thirdPlaceExists) {
              setPendingFinalMatches({
                finale: finaleMatch,
                thirdPlace: thirdPlaceMatch,
              });
              setThirdPlaceDialogOpen(true);
              return; // Stop here, creation will be done after user response
            } else {
              // 3rd place match already exists (maybe declined), create just the final
              matchesToCreate.push(finaleMatch);
            }
          } else {
            // For other rounds: create next round match for this pair
            // Assign a court in round-robin
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
      }

      // Insert all new matches at once
      if (matchesToCreate.length > 0) {
        const { error: insertError } = await supabase
          .from("matches")
          .insert(matchesToCreate);

        if (insertError) throw insertError;

        const message = roundMatches.length === 2 
          ? `Final and 3rd place match generated!`
          : `Match(es) generated for round ${completedRound + 1}!`;
        
        toast.success(message);
        await fetchTournamentAndMatches();
      }
    } catch (error: any) {
      console.error("Error generating next round:", error);
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
        ? "Final and 3rd place match generated!"
        : "Final generated!";
      
      toast.success(message);
      await fetchTournamentAndMatches();
    } catch (error: any) {
      console.error("Error creating matches:", error);
      toast.error("Error creating matches");
    } finally {
      setThirdPlaceDialogOpen(false);
      setPendingFinalMatches(null);
    }
  };

  const getRoundName = (roundNumber: number, totalTeams: number) => {
    // Use bracket size (next power of 2) for proper round naming
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(totalTeams)));
    const totalRounds = Math.log2(bracketSize);
    const roundsRemaining = totalRounds - roundNumber + 1;
    
    if (roundsRemaining === 1) return "Final";
    if (roundsRemaining === 2) return "Semi-finals";
    if (roundsRemaining === 3) return "Quarter-finals";
    if (roundsRemaining === 4) return "Round of 16";
    return `R${roundNumber}`;
  };

  // Generate complete bracket structure (all rounds)
  const generateBracketStructure = () => {
    if (!tournament?.teams_for_elimination) return [];
    
    const totalTeams = tournament.teams_for_elimination;
    // Use bracket size (next power of 2) for structure
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(totalTeams)));
    const numberOfByes = bracketSize - totalTeams;
    const totalRounds = Math.log2(bracketSize);
    const structure: any[][] = [];

    for (let round = 1; round <= totalRounds; round++) {
      // Filter and sort matches of this round (exclude 3rd place match)
      const roundMatchesSorted = matches
        .filter(m => m.round_number === round && !m.is_third_place_match)
        .sort((a, b) => a.id.localeCompare(b.id)); // Stable sort by ID
      
      if (round === 1) {
        // For round 1 with byes: only show actual matches (not placeholders)
        // The number of actual R1 matches = (bracketSize / 2) - numberOfByes
        const expectedR1Matches = (bracketSize / 2) - numberOfByes;
        
        if (roundMatchesSorted.length > 0) {
          // Show only the actual matches that exist
          structure.push(roundMatchesSorted);
        } else {
          // No matches yet - show expected number of placeholders
          const placeholders = [];
          for (let i = 0; i < expectedR1Matches; i++) {
            placeholders.push({
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
          structure.push(placeholders);
        }
      } else {
        // For rounds 2+: calculate expected matches normally
        const matchesInRound = bracketSize / Math.pow(2, round);
        const roundMatches = [];
        
        for (let i = 0; i < matchesInRound; i++) {
          const existingMatch = roundMatchesSorted[i];
          
          if (existingMatch) {
            roundMatches.push(existingMatch);
          } else {
            // Create a placeholder match for future rounds
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
    }
    
    return structure;
  };

  // Check if a previous round is completed (all matches have a winner)
  const isPreviousRoundCompleted = (roundNumber: number): boolean => {
    if (roundNumber <= 1) return true; // First round always accessible
    
    const previousRoundMatches = matches.filter(
      m => m.round_number === roundNumber - 1 && !m.is_third_place_match
    );
    
    // If no matches in previous round, they're not yet generated
    if (previousRoundMatches.length === 0) return false;
    
    // All previous round matches must have a winner
    return previousRoundMatches.every(m => m.winner_id !== null);
  };

  // Check if semi-finals are completed (for 3rd place match)
  const areSemiFinalsCompleted = (): boolean => {
    const totalTeams = tournament?.teams_for_elimination || 8;
    // Use bracket size (next power of 2)
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(totalTeams)));
    const totalRounds = Math.log2(bracketSize);
    const semiFinalsRound = totalRounds - 1; // Second to last round
    
    const semiFinalsMatches = matches.filter(
      m => m.round_number === semiFinalsRound && !m.is_third_place_match
    );
    
    return semiFinalsMatches.length === 2 && semiFinalsMatches.every(m => m.winner_id !== null);
  };

  const bracketStructure = generateBracketStructure();
  
  // Get 3rd place match if it exists
  const thirdPlaceMatch = matches.find(m => m.is_third_place_match);

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

  // Group matches by round
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
            {eliminationType === "single" ? "Single" : "Double"} Elimination Phase
          </h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          {tournament?.teams_for_elimination} qualified teams
        </p>
      </div>

      {/* Byes section - Teams qualified directly for quarter-finals */}
      {byeTeams.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-primary/30 bg-primary/10">
          <div className="flex items-center gap-2 mb-3">
            <Medal className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              Byes — qualifiés directement pour les quarts
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {byeTeams.map(team => (
              <div
                key={team.id}
                className="px-3 py-1.5 rounded-full border border-primary/20 bg-background/60 text-sm font-medium text-foreground"
              >
                {team.seed ? `#${team.seed} ` : ""}{team.name}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Ces équipes sont exemptées du 1er tour grâce à leur classement.
          </p>
        </div>
      )}
      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No matches generated</p>
        </div>
      ) : (
        <>
          {/* Main bracket */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-8 min-w-max px-4">
              {bracketStructure.map((roundMatches, roundIndex) => {
                const roundNumber = roundMatches[0]?.round_number || roundIndex + 1;
                const totalTeams = tournament?.teams_for_elimination || 8;
                const isLastRound = roundIndex === bracketStructure.length - 1;
                
                // Dimensions - correct pyramid calculation
                // Real height of a match: header(20) + card(68) + button(36) ≈ 124px
                const matchHeight = 124;
                const baseGap = 12; // Gap between round 0 matches
                const unit = matchHeight + baseGap; // 136px
                
                // Gap between matches of this round (doubles each round)
                const verticalGap = unit * Math.pow(2, roundIndex) - matchHeight;
                
                // First match offset to center between source matches
                const topOffset = unit * (Math.pow(2, roundIndex) - 1) / 2;
                
                // Match number
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
                      {/* Connection lines */}
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
                            isCreator={isCreator}
                            isLive={liveMatches.has(match.id)}
                            timerState={matchTimers[match.id] || null}
                            tournamentId={tournamentId}
                            onStartEdit={() => {
                              if (isLocked || isMatchCompleted) {
                                if (isMatchCompleted) {
                                  toast.error("This match is finished and can no longer be modified");
                                } else {
                                  toast.error("Complete the previous round matches first");
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
                                toast.error("Complete the previous round matches first");
                                return;
                              }
                              if (!match.isPlaceholder) {
                                setSelectedMatch(match);
                                // If match is finished, show recap, otherwise editing dialog
                                if (isMatchCompleted) {
                                  setRecapDialogOpen(true);
                                } else {
                                  setStatsDialogOpen(true);
                                }
                              }
                            }}
                            onSendToStation={() => {
                              const label = `${match.team1?.name || "TBD"} vs ${match.team2?.name || "TBD"}`;
                              setStationMatch({ id: match.id, label });
                              setStationDialogOpen(true);
                            }}
                            onIncrementScore={(teamId, teamName) => {
                              if (isLocked || isMatchCompleted) {
                                if (isMatchCompleted) {
                                  toast.error("This match is finished and can no longer be modified");
                                } else {
                                  toast.error("Complete the previous round matches first");
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
              
              {/* Champion section if final is finished */}
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

          {/* 3rd place match */}
          {thirdPlaceMatch && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Medal className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-600">
                  3rd Place Match
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
                      isLive={liveMatches.has(thirdPlaceMatch.id)}
                      timerState={matchTimers[thirdPlaceMatch.id] || null}
                      onStartEdit={() => {
                        if (thirdPlaceLocked || isThirdPlaceCompleted) {
                          if (isThirdPlaceCompleted) {
                            toast.error("This match is finished and can no longer be modified");
                          } else {
                            toast.error("Complete the semi-finals first");
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
                          toast.error("Complete the semi-finals first");
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
                            toast.error("This match is finished and can no longer be modified");
                          } else {
                            toast.error("Complete the semi-finals first");
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
            // Check if next round should be generated
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
              3rd Place Match
            </AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to organize a 3rd place match between the semi-final losers?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleThirdPlaceConfirmation(false)}>
              No, just the final
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleThirdPlaceConfirmation(true)}>
              Yes, organize the match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {stationMatch && (
        <SendToStationDialog
          open={stationDialogOpen}
          onOpenChange={setStationDialogOpen}
          tournamentId={tournamentId}
          matchId={stationMatch.id}
          matchLabel={stationMatch.label}
        />
      )}
    </Card>
  );
};
