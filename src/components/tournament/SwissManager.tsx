import { useState, useEffect, useMemo, useCallback } from "react";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScoreInput } from "@/components/ui/score-input";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, TrendingUp, ChevronDown, ChevronUp, Users, Target, AlertTriangle, Clock, Zap, Monitor, Radio, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { GoalRemoverDialog } from "./GoalRemoverDialog";
import { QuickStatDialog } from "./QuickStatDialog";
import { MatchStatsRecap } from "./MatchStatsRecap";
import { MatchStatsDialog } from "./MatchStatsDialog";
import { MatchStatsViewDialog } from "./MatchStatsViewDialog";
import { SendToStationDialog } from "./SendToStationDialog";
import { TimerDisplay } from "./TimerDisplay";
import { LiveMatchStatsDialog } from "./LiveMatchStatsDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClipboardEdit, Eye } from "lucide-react";

// Sortable wrapper for drag & drop match reordering
const SortableMatchItem = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      <button
        {...attributes}
        {...listeners}
        className="flex items-center px-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        tabIndex={-1}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};

interface SwissManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  currentPhase?: string;
  isCreator?: boolean;
  numberOfGroups?: number;
}

export const SwissManager = ({ tournamentId, isClosed = false, currentPhase, isCreator = false, numberOfGroups = 1 }: SwissManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [maxRound, setMaxRound] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const [numberOfFields, setNumberOfFields] = useState(1);
  const [activeStationMatches, setActiveStationMatches] = useState<Set<string>>(new Set());
  const [liveMatches, setLiveMatches] = useState<Set<string>>(new Set());
  const [selectedLiveMatch, setSelectedLiveMatch] = useState<any | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [editingMatch, setEditingMatch] = useState<any | null>(null);
  const [matchTimers, setMatchTimers] = useState<{ [matchId: string]: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  }}>({});

  // Group filtering state
  const hasGroups = numberOfGroups >= 2;
  const [selectedGroup, setSelectedGroup] = useState<string>("Morning");
  const [teamGroupMap, setTeamGroupMap] = useState<Map<string, string | null>>(new Map());

  // Fetch team-to-group mapping
  useEffect(() => {
    if (!hasGroups) return;
    const fetchTeamGroups = async () => {
      const { data } = await supabase
        .from("tournament_teams")
        .select("team_id, group_name")
        .eq("tournament_id", tournamentId);
      if (data) {
        const map = new Map<string, string | null>();
        data.forEach(tt => map.set(tt.team_id, tt.group_name));
        setTeamGroupMap(map);
      }
    };
    fetchTeamGroups();
  }, [tournamentId, hasGroups]);

  // Ultimate Round matches (separate fetch for Swiss since it filters by round_number)
  const [ultimateMatches, setUltimateMatches] = useState<any[]>([]);

  const fetchUltimateMatches = async () => {
    if (!hasGroups) return;
    const { data } = await supabase
      .from("matches")
      .select(`*, team1:team1_id(id, name), team2:team2_id(id, name)`)
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .eq("round_number", 99)
      .order("field_number", { ascending: false });
    setUltimateMatches(data || []);
  };

  useEffect(() => {
    if (hasGroups) fetchUltimateMatches();
  }, [tournamentId, hasGroups]);

  // Filter matches by selected group
  const filteredMatches = useMemo(() => {
    if (!hasGroups || teamGroupMap.size === 0) return matches;
    if (selectedGroup === "Ultimate") return ultimateMatches;
    return matches.filter(m => {
      const g1 = teamGroupMap.get(m.team1?.id || m.team1_id);
      const g2 = teamGroupMap.get(m.team2?.id || m.team2_id);
      return g1 === selectedGroup || g2 === selectedGroup;
    });
  }, [matches, ultimateMatches, hasGroups, teamGroupMap, selectedGroup]);

  // Auto-switch: Morning → Afternoon → Ultimate Round
  useEffect(() => {
    if (!hasGroups || teamGroupMap.size === 0 || matches.length === 0) return;
    const morningMatches = matches.filter(m => {
      const g1 = teamGroupMap.get(m.team1?.id || m.team1_id);
      const g2 = teamGroupMap.get(m.team2?.id || m.team2_id);
      return g1 === "Morning" || g2 === "Morning";
    });
    const afternoonMatches = matches.filter(m => {
      const g1 = teamGroupMap.get(m.team1?.id || m.team1_id);
      const g2 = teamGroupMap.get(m.team2?.id || m.team2_id);
      return g1 === "Afternoon" || g2 === "Afternoon";
    });
    const allMorningDone = morningMatches.length > 0 && morningMatches.every(m => m.team1_score !== null && m.team2_score !== null);
    const allAfternoonDone = afternoonMatches.length > 0 && afternoonMatches.every(m => m.team1_score !== null && m.team2_score !== null);
    
    if (allMorningDone && allAfternoonDone) {
      setSelectedGroup("Ultimate");
    } else if (allMorningDone) {
      setSelectedGroup("Afternoon");
    }
  }, [matches, hasGroups, teamGroupMap]);

  // Fetch matches currently on referee stations with timer data
  const fetchActiveStationMatches = async () => {
    const { data, error } = await supabase
      .from("referee_stations")
      .select("current_match_id, timer_duration_seconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused")
      .eq("tournament_id", tournamentId)
      .eq("is_active", true)
      .not("current_match_id", "is", null);

    if (!error && data) {
      const activeMatchIds = data.map(s => s.current_match_id).filter(Boolean);
      setActiveStationMatches(new Set(activeMatchIds));
      
      // Also populate timer state from database and mark as live if timer started
      const timers: typeof matchTimers = {};
      const liveMatchIds: string[] = [];
      
      data.forEach(station => {
        if (station.current_match_id && station.timer_duration_seconds) {
          timers[station.current_match_id] = {
            durationSeconds: station.timer_duration_seconds,
            startedAt: station.timer_started_at,
            pausedAt: station.timer_paused_at,
            elapsedWhenPaused: station.timer_elapsed_when_paused ?? 0
          };
          
          // If timer has been started, mark match as live
          if (station.timer_started_at) {
            liveMatchIds.push(station.current_match_id);
          }
        }
      });
      
      setMatchTimers(prev => ({ ...prev, ...timers }));
      
      // Set matches with running timers as live
      if (liveMatchIds.length > 0) {
        setLiveMatches(prev => {
          const next = new Set(prev);
          liveMatchIds.forEach(id => next.add(id));
          return next;
        });
      }
    }
  };

  useEffect(() => {
    const initializeRound = async () => {
      // Get the number of fields from the tournament
      const { data: tournament } = await supabase
        .from("tournaments")
        .select("number_of_fields")
        .eq("id", tournamentId)
        .single();
      
      if (tournament?.number_of_fields) {
        setNumberOfFields(tournament.number_of_fields);
      }

      const max = await fetchMaxRound();
      if (!initialized && max > 0) {
        setCurrentRound(max);
        setInitialized(true);
      }
    };
    initializeRound();
  }, [tournamentId, initialized]);

  useEffect(() => {
    if (initialized) {
      fetchMatches();
      fetchActiveStationMatches();
    }
  }, [tournamentId, currentRound, initialized]);

  // Re-sync scores & timers when user returns from background/sleep
  usePageVisibility(useCallback(() => {
    if (initialized) {
      fetchMatches();
      fetchActiveStationMatches();
    }
  }, [tournamentId, currentRound, initialized]));

  // Real-time subscription for match updates
  useEffect(() => {
    const matchChannel = supabase
      .channel(`swiss-matches-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`
        },
        (payload) => {
          const updated = payload.new as any;
          // Instant local update — no network re-fetch needed for score changes
          setMatches(prev => prev.map(m =>
            m.id === updated.id
              ? { ...m, team1_score: updated.team1_score, team2_score: updated.team2_score, winner_id: updated.winner_id }
              : m
          ));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`
        },
        () => {
          fetchMatches();
        }
      )
      .subscribe();

    // Real-time subscription for referee station updates
    const stationChannel = supabase
      .channel(`swiss-stations-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referee_stations',
          filter: `tournament_id=eq.${tournamentId}`
        },
        (payload) => {
          console.log('Station update received:', payload);
          fetchActiveStationMatches();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(stationChannel);
    };
  }, [tournamentId, currentRound]);

  // Live broadcast subscription for real-time score updates and timer
  useEffect(() => {
    const liveTimeouts: { [matchId: string]: ReturnType<typeof setTimeout> } = {};
    
    // Use the shared tournament broadcast channel (same as referee station)
    const channel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on(
        'broadcast',
        { event: 'live_score' },
        (payload) => {
          console.log('Live score received in Swiss:', payload);
          const { matchId, team1_score, team2_score } = payload.payload;
          
          setLiveMatches(prev => new Set(prev).add(matchId));
          
          if (liveTimeouts[matchId]) {
            clearTimeout(liveTimeouts[matchId]);
          }
          
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
                return { ...match, team1_score, team2_score };
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
          const { matchId, action, durationSeconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused } = payload.payload;
          
          if (action === 'start' || action === 'resume') {
            setLiveMatches(prev => new Set(prev).add(matchId));
          }
          
          setMatchTimers(prev => ({
            ...prev,
            [matchId]: {
              durationSeconds: durationSeconds ?? prev[matchId]?.durationSeconds ?? 0,
              startedAt: timer_started_at,
              pausedAt: timer_paused_at,
              elapsedWhenPaused: timer_elapsed_when_paused ?? prev[matchId]?.elapsedWhenPaused ?? 0
            }
          }));
          
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
      .subscribe();

    return () => {
      Object.values(liveTimeouts).forEach(timeout => clearTimeout(timeout));
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const fetchMaxRound = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select("round_number")
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .order("round_number", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      setMaxRound(data[0].round_number);
      return data[0].round_number;
    }
    return 1;
  };

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:team1_id(id, name),
        team2:team2_id(id, name)
      `)
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .eq("round_number", currentRound)
      .order("sort_order")
      .order("created_at");

    if (error) {
      toast.error("Error loading matches");
      return;
    }

    setMatches(data || []);
  };

  const generateSwissRound = async () => {
    setLoading(true);
    try {
      // Fetch all teams via tournament_teams
      const { data: tournamentTeams, error: teamsError } = await supabase
        .from("tournament_teams")
        .select(`
          team_id,
          group_name,
          teams (id, name)
        `)
        .eq("tournament_id", tournamentId);

      if (teamsError) throw teamsError;

      // If groups are active, generate matches per group separately
      const teamsByGroup: Map<string | null, any[]> = new Map();
      if (hasGroups) {
        (tournamentTeams || []).forEach(tt => {
          const group = tt.group_name;
          if (!teamsByGroup.has(group)) teamsByGroup.set(group, []);
          teamsByGroup.get(group)!.push(tt.teams);
        });
      } else {
        teamsByGroup.set(null, (tournamentTeams || []).map(tt => tt.teams).filter(Boolean));
      }

      const teams = tournamentTeams?.map(tt => tt.teams).filter(Boolean) || [];

      if (!teams || teams.length < 2) {
        toast.error("At least 2 teams are required to create matches");
        return;
      }

      // Determine which round to generate
      const roundToGenerate = matches.length === 0 ? currentRound : currentRound + 1;

      // Fetch all previous matches to avoid rematches when possible
      const { data: previousMatches, error: prevMatchesError } = await supabase
        .from("matches")
        .select("team1_id, team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "swiss");

      if (prevMatchesError) throw prevMatchesError;

      // Create a set of already played matchups
      const playedMatchups = new Set(
        (previousMatches || []).map(m => 
          [m.team1_id, m.team2_id].sort().join("-")
        )
      );

      // Fetch team stats for Swiss pairing
      const { data: stats, error: statsError } = await supabase
        .from("team_stats")
        .select("team_id, points, wins, losses, draws, goals_for, goals_against")
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false });

      if (statsError) throw statsError;

      // Create a map of team stats
      const statsMap = new Map(
        (stats || []).map(s => [s.team_id, s])
      );

      // Generate pairings per group
      const allNewMatches: { tournament_id: string; phase: "swiss"; round_number: number; team1_id: string; team2_id: string; field_number: number; }[] = [];
      let fieldIdx = 0;

      for (const [, groupTeams] of teamsByGroup) {
        if (!groupTeams || groupTeams.length < 2) continue;

        // Sort teams by their stats (Swiss system)
        const sortedTeams = [...groupTeams].sort((a: any, b: any) => {
          const statsA = statsMap.get(a.id) || { points: 0, goals_for: 0, goals_against: 0 };
          const statsB = statsMap.get(b.id) || { points: 0, goals_for: 0, goals_against: 0 };
          if (statsA.points !== statsB.points) return statsB.points - statsA.points;
          const diffA = statsA.goals_for - statsA.goals_against;
          const diffB = statsB.goals_for - statsB.goals_against;
          if (diffA !== diffB) return diffB - diffA;
          return statsB.goals_for - statsA.goals_for;
        });

        const teamIds = sortedTeams.map((t: any) => t.id);
        
        const findBestPairing = (
          remaining: string[], 
          currentPairs: [string, string][], 
          allowRematches: boolean
        ): [string, string][] | null => {
          if (remaining.length <= 1) return currentPairs;
          const first = remaining[0];
          const rest = remaining.slice(1);
          for (let i = 0; i < rest.length; i++) {
            const opponent = rest[i];
            const matchupKey = [first, opponent].sort().join("-");
            if (!allowRematches && playedMatchups.has(matchupKey)) continue;
            const nextRemaining = rest.filter((_, idx) => idx !== i);
            const result = findBestPairing(nextRemaining, [...currentPairs, [first, opponent]], allowRematches);
            if (result) return result;
          }
          return null;
        };
        
        let pairs = findBestPairing(teamIds, [], false);
        if (!pairs) {
          pairs = findBestPairing(teamIds, [], true);
        }
        
        (pairs || []).forEach((pair) => {
          allNewMatches.push({
            tournament_id: tournamentId,
            phase: "swiss" as const,
            round_number: roundToGenerate,
            team1_id: pair[0],
            team2_id: pair[1],
            field_number: (fieldIdx % numberOfFields) + 1,
          });
          fieldIdx++;
        });
      }

      const newMatches = allNewMatches;

      if (newMatches.length === 0) {
        toast.error("Unable to generate new matches.");
        return;
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(newMatches);

      if (insertError) throw insertError;

      toast.success(`Round ${roundToGenerate} generated with ${newMatches.length} match${newMatches.length > 1 ? 'es' : ''}!`);
      if (roundToGenerate > currentRound) {
        setCurrentRound(roundToGenerate);
        setMaxRound(roundToGenerate);
      } else {
        fetchMatches();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateScore = async (matchId: string, team1Score: number, team2Score: number) => {
    try {
      // Validate input
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({
        team1_score: team1Score,
        team2_score: team2Score,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const match = matches.find(m => m.id === matchId);
      const winnerId = validation.data.team1_score > validation.data.team2_score ? match.team1_id : 
                      validation.data.team2_score > validation.data.team1_score ? match.team2_id : null;

      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: validation.data.team1_score,
          team2_score: validation.data.team2_score,
          winner_id: winnerId,
        })
        .eq("id", matchId);

      if (error) throw error;

      toast.success("Score saved!");
      
      // Refresh matches and maxRound
      await Promise.all([fetchMatches(), fetchMaxRound()]);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const canGenerateNextRound = () => {
    const allMatchesCompleted = matches.every(m => 
      m.team1_score !== null && m.team2_score !== null
    );
    return matches.length > 0 && allMatchesCompleted;
  };

  const generateUltimateRound = async () => {
    setLoading(true);
    try {
      const { data: existing } = await supabase.from("matches").select("id").eq("tournament_id", tournamentId).eq("round_number", 99).limit(1);
      if (existing && existing.length > 0) { toast.error("Ultimate Round matches already exist"); setLoading(false); return; }

      const { data: tournamentTeams } = await supabase.from("tournament_teams").select("team_id, group_name").eq("tournament_id", tournamentId);
      if (!tournamentTeams) throw new Error("No teams found");

      const morningIds = tournamentTeams.filter(t => t.group_name === "Morning").map(t => t.team_id);
      const afternoonIds = tournamentTeams.filter(t => t.group_name === "Afternoon").map(t => t.team_id);

      const { data: stats } = await supabase.from("team_stats").select("team_id, points, goals_for, goals_against").eq("tournament_id", tournamentId);
      const statsMap = new Map((stats || []).map(s => [s.team_id, s]));

      const sortByRank = (ids: string[]) => [...ids].sort((a, b) => {
        const sa = statsMap.get(a) || { points: 0, goals_for: 0, goals_against: 0 };
        const sb = statsMap.get(b) || { points: 0, goals_for: 0, goals_against: 0 };
        if (sb.points !== sa.points) return sb.points - sa.points;
        const diffA = sa.goals_for - sa.goals_against; const diffB = sb.goals_for - sb.goals_against;
        if (diffB !== diffA) return diffB - diffA;
        return sb.goals_for - sa.goals_for;
      });

      const rankedM = sortByRank(morningIds);
      const rankedA = sortByRank(afternoonIds);
      const pairCount = Math.min(rankedM.length, rankedA.length);
      if (pairCount === 0) { toast.error("Not enough teams in both groups"); setLoading(false); return; }

      const newMatches = [];
      for (let i = 0; i < pairCount; i++) {
        newMatches.push({ tournament_id: tournamentId, phase: "swiss" as const, round_number: 99, team1_id: rankedM[i], team2_id: rankedA[i], field_number: i + 1 });
      }

      const { error } = await supabase.from("matches").insert(newMatches);
      if (error) throw error;
      toast.success(`${pairCount} Ultimate Round match${pairCount > 1 ? "es" : ""} generated!`);
      fetchUltimateMatches();
    } catch (error: any) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Swiss Round {currentRound}
              {currentRound === maxRound && (
                <Badge variant="default" className="gap-1 animate-pulse">
                  <Zap className="h-3 w-3" />
                  Current
                </Badge>
              )}
              {currentRound < maxRound && (
                <Badge variant="secondary" className="gap-1">
                  Completed
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Teams are paired according to their current ranking
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentRound > 1 && (
              <Button 
                variant="outline" 
                onClick={() => setCurrentRound(currentRound - 1)}
                disabled={currentRound === 1}
              >
                Previous Round
              </Button>
            )}
            {currentRound < maxRound && (
              <Button 
                variant="outline"
                onClick={() => setCurrentRound(currentRound + 1)}
              >
                Next Round
              </Button>
            )}
            {currentRound === maxRound && isCreator && (
              <Button 
                onClick={generateSwissRound} 
                disabled={loading || (matches.length > 0 && !canGenerateNextRound()) || isClosed || (currentPhase && currentPhase !== "swiss")}
                className="gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                {matches.length === 0 ? `Generate Round ${currentRound}` : `Generate Round ${currentRound + 1}`}
              </Button>
            )}
          </div>
        </div>

        {matches.length > 0 && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <p className="text-foreground">
                Progress: {matches.filter(m => m.team1_score !== null && m.team2_score !== null).length} / {matches.length} matches completed
              </p>
            </div>
            {canGenerateNextRound() && currentPhase === "swiss" && (
              <span className="text-sm font-semibold text-primary">✓ Ready for next round</span>
            )}
          </div>
        )}
        
        {currentPhase && currentPhase !== "swiss" && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-foreground">
              The tournament is in {currentPhase === "elimination" ? "elimination" : currentPhase} phase. You can no longer generate new Swiss rounds.
            </p>
          </div>
        )}

        {/* Group tabs */}
        {hasGroups && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {["Morning", "Afternoon"].map((group) => {
              const nonUltimate = matches.filter(m => m.round_number !== 99);
              const groupMatches = nonUltimate.filter(m => {
                const g1 = teamGroupMap.get(m.team1?.id || m.team1_id);
                const g2 = teamGroupMap.get(m.team2?.id || m.team2_id);
                return g1 === group || g2 === group;
              });
              const completed = groupMatches.filter(m => m.team1_score !== null && m.team2_score !== null).length;
              return (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    selectedGroup === group
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {group} Group ({completed}/{groupMatches.length})
                </button>
              );
            })}
            <button
              onClick={() => setSelectedGroup("Ultimate")}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                selectedGroup === "Ultimate"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              ⚔️ Ultimate Round
            </button>
          </div>
        )}

        {/* Generate Ultimate Round button */}
        {selectedGroup === "Ultimate" && hasGroups && isCreator && ultimateMatches.length === 0 && (
          <div className="mb-4 flex items-center justify-between p-4 border border-dashed border-primary/30 rounded-lg">
            <div>
              <p className="font-medium">⚔️ Ultimate Round — Crossover Matches</p>
              <p className="text-sm text-muted-foreground">Generate crossover matches: 1st Morning vs 1st Afternoon, etc.</p>
            </div>
            <Button
              onClick={generateUltimateRound}
              disabled={loading || isClosed}
            >
              Generate Ultimate Round
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {/* Ongoing matches */}
          {(() => {
            const matchesToShow = hasGroups ? filteredMatches : matches;
            const ongoingMatches = matchesToShow.filter(m => m.team1_score === null || m.team2_score === null || activeStationMatches.has(m.id));
            const waitingMatches = ongoingMatches.filter(m => !activeStationMatches.has(m.id));
            const onDeckMatch = waitingMatches[0];
            const inTheHoleMatch = waitingMatches[1];

            return ongoingMatches.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Ongoing Matches</h3>
                {ongoingMatches.sort((a, b) => {
                  const aLive = liveMatches.has(a.id) ? 0 : activeStationMatches.has(a.id) ? 1 : 2;
                  const bLive = liveMatches.has(b.id) ? 0 : activeStationMatches.has(b.id) ? 1 : 2;
                  return aLive - bLive;
                }).map((match) => {
                  const matchesOnSameField = (selectedGroup === "Ultimate" ? ultimateMatches : matches)
                    .filter(m => m.field_number === match.field_number)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                  
                  const firstUnfinishedOnField = matchesOnSameField.find(
                    m => activeStationMatches.has(m.id)
                  ) || matchesOnSameField.find(
                    m => m.team1_score === null || m.team2_score === null
                  );
                  
                  const isLockedByPreviousMatch = !activeStationMatches.has(match.id) && firstUnfinishedOnField?.id !== match.id;

                  return (
                    <MatchCard
                      key={match.id}
                      match={match}
                      tournamentId={tournamentId}
                      onScoreUpdate={async (matchId: string, s1: number, s2: number) => {
                        await updateScore(matchId, s1, s2);
                        if (selectedGroup === "Ultimate") fetchUltimateMatches();
                      }}
                      isClosed={isClosed}
                      isLockedByPreviousMatch={isLockedByPreviousMatch}
                      isCreator={isCreator}
                      isOnRefereeStation={activeStationMatches.has(match.id)}
                      isLive={liveMatches.has(match.id)}
                      isOnDeck={onDeckMatch?.id === match.id}
                      isInTheHole={inTheHoleMatch?.id === match.id}
                      timerState={matchTimers[match.id] || null}
                      onViewLiveStats={!isCreator && (liveMatches.has(match.id) || activeStationMatches.has(match.id)) ? () => setSelectedLiveMatch(match) : undefined}
                    />
                  );
                })}
              </div>
            );
          })()}
          
          {(() => {
            const matchesToShow = hasGroups ? filteredMatches : matches;
            const completedMatches = matchesToShow.filter(m => m.team1_score !== null && m.team2_score !== null && !activeStationMatches.has(m.id)).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            return completedMatches.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-muted-foreground">Completed Matches</h3>
              <div className="space-y-2 opacity-60">
                {completedMatches.map((match) => (
                  <CompletedMatchCard
                    key={match.id}
                    match={match}
                    isCreator={isCreator}
                    isClosed={isClosed}
                    onEditScore={() => setEditingMatch(match)}
                    onViewStats={() => setSelectedMatch(match)}
                  />
                ))}
              </div>
            </div>
          );
          })()}
          
          {filteredMatches.length === 0 && selectedGroup !== "Ultimate" && (
            <p className="text-muted-foreground text-center py-8">
              No matches for this round. Click "Generate" to create matches according to the Swiss system.
            </p>
          )}
          {selectedGroup === "Ultimate" && ultimateMatches.length === 0 && !isCreator && (
            <p className="text-muted-foreground text-center py-8">
              No Ultimate Round matches yet.
            </p>
          )}
        </div>
      </Card>

      {/* Live Match Stats Dialog for visitors */}
      {selectedLiveMatch && (
        <LiveMatchStatsDialog
          matchId={selectedLiveMatch.id}
          team1Id={selectedLiveMatch.team1_id}
          team2Id={selectedLiveMatch.team2_id}
          team1Name={selectedLiveMatch.team1?.name || ""}
          team2Name={selectedLiveMatch.team2?.name || ""}
          team1Score={selectedLiveMatch.team1_score}
          team2Score={selectedLiveMatch.team2_score}
          tournamentId={tournamentId}
          open={!!selectedLiveMatch}
          onOpenChange={(open) => !open && setSelectedLiveMatch(null)}
          isLive={liveMatches.has(selectedLiveMatch.id)}
        />
      )}

      {/* Match Stats Dialog for editing completed matches (creator only) */}
      {editingMatch && (
        <MatchStatsDialog
          match={editingMatch}
          tournamentId={tournamentId}
          open={!!editingMatch}
          onOpenChange={(open) => !open && setEditingMatch(null)}
          onScoreUpdate={() => {
            fetchMatches();
            fetchMaxRound();
          }}
          isCreator={isCreator}
        />
      )}

      {/* Match Stats View Dialog for viewing completed matches */}
      {selectedMatch && (
        <MatchStatsViewDialog
          matchId={selectedMatch.id}
          team1Id={selectedMatch.team1_id}
          team2Id={selectedMatch.team2_id}
          team1Name={selectedMatch.team1?.name || ""}
          team2Name={selectedMatch.team2?.name || ""}
          team1Score={selectedMatch.team1_score}
          team2Score={selectedMatch.team2_score}
          tournamentId={tournamentId}
          open={!!selectedMatch}
          onOpenChange={(open) => !open && setSelectedMatch(null)}
        />
      )}
    </div>
  );
};

interface MatchCardProps {
  match: any;
  tournamentId: string;
  onScoreUpdate: (matchId: string, team1Score: number, team2Score: number) => void;
  isClosed?: boolean;
  isLockedByPreviousMatch?: boolean;
  isCreator?: boolean;
  isOnRefereeStation?: boolean;
  isLive?: boolean;
  isOnDeck?: boolean;
  isInTheHole?: boolean;
  timerState?: {
    durationSeconds: number;
    startedAt: string | null;
    pausedAt: string | null;
    elapsedWhenPaused: number;
  } | null;
  onViewLiveStats?: () => void;
}

const MatchCard = ({ match, tournamentId, onScoreUpdate, isClosed = false, isLockedByPreviousMatch = false, isCreator = false, isOnRefereeStation = false, isLive = false, isOnDeck = false, isInTheHole = false, timerState, onViewLiveStats }: MatchCardProps) => {
  const [team1Score, setTeam1Score] = useState(match.team1_score ?? 0);
  const [team2Score, setTeam2Score] = useState(match.team2_score ?? 0);
  const [isOpen, setIsOpen] = useState(false);
  const [team1Players, setTeam1Players] = useState<any[]>([]);
  const [team2Players, setTeam2Players] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, any>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [goalScorerDialogOpen, setGoalScorerDialogOpen] = useState(false);
  const [goalRemoverDialogOpen, setGoalRemoverDialogOpen] = useState(false);
  const [scoringTeam, setScoringTeam] = useState<{ id: string; name: string } | null>(null);
  const [removingTeam, setRemovingTeam] = useState<{ id: string; name: string } | null>(null);
  const [quickStatDialogOpen, setQuickStatDialogOpen] = useState(false);
  const [quickStatType, setQuickStatType] = useState<"assists" | "fouls" | "penalty_30s" | "penalty_1m" | "penalty_2m">("assists");
  const [quickStatTeam, setQuickStatTeam] = useState<{ id: string; name: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [sendToStationOpen, setSendToStationOpen] = useState(false);

  // Keep local score inputs in sync with live updates (broadcast/DB)
  // but don't override while the user is actively editing.
  useEffect(() => {
    if (isEditing) return;
    setTeam1Score(match.team1_score ?? 0);
    setTeam2Score(match.team2_score ?? 0);
  }, [isEditing, match.team1_score, match.team2_score]);

  // Load players on mount to calculate scores
  useEffect(() => {
    fetchPlayers();
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPlayers();
    }
  }, [isOpen]);

  // Calculate scores from player_stats if match not validated
  useEffect(() => {
    if (team1Players.length > 0 || team2Players.length > 0) {
      fetchPlayerStats();
    }
  }, [team1Players, team2Players, goalScorerDialogOpen]);

  // Calculate scores from player_stats if match not yet validated
  useEffect(() => {
    if (match.team1_score === null && match.team2_score === null) {
      loadScoresFromPlayerStats();
    }
  }, []);

  const loadScoresFromPlayerStats = async () => {
    const { data: allStats } = await supabase
      .from("player_stats")
      .select("player_id, goals")
      .eq("match_id", match.id);

    if (!allStats || allStats.length === 0) return;

    const { data: tt1 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team1_id)
      .maybeSingle();

    const { data: tt2 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team2_id)
      .maybeSingle();

    let team1PlayerIds: string[] = [];
    let team2PlayerIds: string[] = [];

    if (tt1?.id) {
      const { data: p1 } = await supabase
        .from("tournament_team_players")
        .select("player_id")
        .eq("tournament_team_id", tt1.id);
      team1PlayerIds = (p1 || []).map(p => p.player_id);
    }

    if (tt2?.id) {
      const { data: p2 } = await supabase
        .from("tournament_team_players")
        .select("player_id")
        .eq("tournament_team_id", tt2.id);
      team2PlayerIds = (p2 || []).map(p => p.player_id);
    }

    const team1Goals = allStats
      .filter(stat => team1PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    const team2Goals = allStats
      .filter(stat => team2PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    if (team1Goals > 0 || team2Goals > 0) {
      setTeam1Score(team1Goals);
      setTeam2Score(team2Goals);
    }
  };

  const fetchPlayers = async () => {
    // Get tournament_team for team1
    const { data: tt1 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team1_id)
      .maybeSingle();

    // Get tournament_team for team2
    const { data: tt2 } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", match.team2_id)
      .maybeSingle();

    if (tt1?.id) {
      const { data: players1 } = await supabase
        .from("tournament_team_players")
        .select("player_id, players:player_id(id, name)")
        .eq("tournament_team_id", tt1.id);
      
      setTeam1Players((players1 || []).map(p => p.players).filter(Boolean));
    }

    if (tt2?.id) {
      const { data: players2 } = await supabase
        .from("tournament_team_players")
        .select("player_id, players:player_id(id, name)")
        .eq("tournament_team_id", tt2.id);
      
      setTeam2Players((players2 || []).map(p => p.players).filter(Boolean));
    }
  };

  const fetchPlayerStats = async () => {
    const allPlayerIds = [...team1Players, ...team2Players].map(p => p.id);
    
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("match_id", match.id)
      .in("player_id", allPlayerIds);

    if (!error && data) {
      const statsMap = data.reduce((acc, stat) => {
        acc[stat.player_id] = stat;
        return acc;
      }, {} as Record<string, any>);
      setPlayerStats(statsMap);
    }
  };

  const updatePlayerStat = async (playerId: string, field: string, value: number) => {
    const existingStat = playerStats[playerId];

    if (existingStat) {
      const { error } = await supabase
        .from("player_stats")
        .update({ [field]: value })
        .eq("id", existingStat.id);

      if (!error) {
        setPlayerStats(prev => ({
          ...prev,
          [playerId]: { ...prev[playerId], [field]: value }
        }));
      }
    } else {
      const { data, error } = await supabase
        .from("player_stats")
        .insert({
          player_id: playerId,
          tournament_id: tournamentId,
          match_id: match.id,
          [field]: value,
        })
        .select()
        .single();

      if (!error && data) {
        setPlayerStats(prev => ({
          ...prev,
          [playerId]: data
        }));
      }
    }

    // If it's a goal, update the match score
    if (field === "goals") {
      await updateMatchScoresFromPlayerStats();
    }
  };

  const updateMatchScoresFromPlayerStats = async () => {
    // Get all player stats for this match
    const { data: allStats, error } = await supabase
      .from("player_stats")
      .select("player_id, goals")
      .eq("match_id", match.id);

    if (error || !allStats) return;

    // Calculate scores for each team
    const team1PlayerIds = team1Players.map(p => p.id);
    const team2PlayerIds = team2Players.map(p => p.id);

    const team1Goals = allStats
      .filter(stat => team1PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    const team2Goals = allStats
      .filter(stat => team2PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    // Update local scores AND in the DB
    setTeam1Score(team1Goals);
    setTeam2Score(team2Goals);
    
    // Update in the database if scores have changed
    if (team1Goals !== match.team1_score || team2Goals !== match.team2_score) {
      const winnerId = team1Goals > team2Goals ? match.team1_id : 
                      team2Goals > team1Goals ? match.team2_id : null;
      
      await supabase
        .from("matches")
        .update({
          team1_score: team1Goals,
          team2_score: team2Goals,
          winner_id: winnerId,
        })
        .eq("id", match.id);
    }
  };

  const handleValidateScore = () => {
    setShowConfirmDialog(true);
  };

  const confirmValidateScore = () => {
    onScoreUpdate(match.id, team1Score, team2Score);
    setShowConfirmDialog(false);
    setIsEditing(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className={`flex flex-col gap-2 p-4 bg-secondary/20 rounded-lg border transition-colors ${isOnRefereeStation ? 'border-primary ring-2 ring-primary/30' : 'border-border/50 hover:border-primary/50'} ${isLockedByPreviousMatch ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-center gap-2 mb-1">
          {match.field_number && (
            <Badge variant="outline" className="text-xs">
              Court {match.field_number}
            </Badge>
          )}
          {isLive && timerState && (
            <TimerDisplay
              durationSeconds={timerState.durationSeconds}
              startedAt={timerState.startedAt}
              pausedAt={timerState.pausedAt}
              elapsedWhenPaused={timerState.elapsedWhenPaused}
              compact
            />
          )}
          {isLive && !timerState && (
            <Badge variant="destructive" className="text-xs animate-pulse gap-1">
              <Radio className="h-3 w-3" />
              LIVE
            </Badge>
          )}
          {isOnRefereeStation && !isLive && !timerState && (
            <Badge className="text-xs animate-pulse bg-primary">
              <Monitor className="h-3 w-3" />
            </Badge>
          )}
          {isOnDeck && !isOnRefereeStation && !isLive && (
            <Badge variant="outline" className="text-xs gap-1 border-amber-500 text-amber-500">
              <Clock className="h-3 w-3" />
              On Deck
            </Badge>
          )}
          {isInTheHole && !isOnRefereeStation && !isLive && (
            <Badge variant="outline" className="text-xs gap-1 border-muted-foreground text-muted-foreground">
              <Clock className="h-3 w-3" />
              In the Hole
            </Badge>
          )}
        </div>
        {isLockedByPreviousMatch && (
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            🔒 A previous match must be completed on court {match.field_number} before modifying this one
          </div>
        )}
        {isCreator ? (
          <div className="flex items-center gap-4">
            <div className="flex-1 flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium flex-1">{match.team1?.name || "Team 1"}</span>
                <ScoreInput
                  value={team1Score}
                  onChange={(value) => {
                    setTeam1Score(value);
                    if (!isEditing) setIsEditing(true);
                  }}
                  onIncrement={() => {
                    setScoringTeam({ id: match.team1_id, name: match.team1?.name || "Team 1" });
                    setGoalScorerDialogOpen(true);
                  }}
                  onDecrement={() => {
                    setRemovingTeam({ id: match.team1_id, name: match.team1?.name || "Team 1" });
                    setGoalRemoverDialogOpen(true);
                  }}
                  disabled={isClosed || isLockedByPreviousMatch}
                />
              </div>
              {team1Players.length > 0 && (
                <span className="text-[10px] text-muted-foreground leading-tight truncate">
                  {team1Players.map(p => p.name).join(", ")}
                </span>
              )}
            </div>
            <span className="text-muted-foreground font-bold">vs</span>
            <div className="flex-1 flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3">
                <ScoreInput
                  value={team2Score}
                  onChange={(value) => {
                    setTeam2Score(value);
                    if (!isEditing) setIsEditing(true);
                  }}
                  onIncrement={() => {
                    setScoringTeam({ id: match.team2_id, name: match.team2?.name || "Team 2" });
                    setGoalScorerDialogOpen(true);
                  }}
                  onDecrement={() => {
                    setRemovingTeam({ id: match.team2_id, name: match.team2?.name || "Team 2" });
                    setGoalRemoverDialogOpen(true);
                  }}
                  disabled={isClosed || isLockedByPreviousMatch}
                />
                <span className="font-medium flex-1 text-right">{match.team2?.name || "Team 2"}</span>
              </div>
              {team2Players.length > 0 && (
                <span className="text-[10px] text-muted-foreground leading-tight truncate text-right">
                  {team2Players.map(p => p.name).join(", ")}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-col min-w-0 text-right">
              <span className="font-medium text-sm sm:text-base truncate">{match.team1?.name || "Team 1"}</span>
              {team1Players.length > 0 && (
                <span className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {team1Players.map(p => p.name).join(", ")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-bold text-lg sm:text-xl w-6 text-center">{team1Score}</span>
              <span className="text-muted-foreground text-sm">-</span>
              <span className="font-bold text-lg sm:text-xl w-6 text-center">{team2Score}</span>
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <span className="font-medium text-sm sm:text-base truncate">{match.team2?.name || "Team 2"}</span>
              {team2Players.length > 0 && (
                <span className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {team2Players.map(p => p.name).join(", ")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Button for visitors to view live stats */}
        {!isCreator && onViewLiveStats && (
          <div className="flex justify-center mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onViewLiveStats}
              className="text-xs gap-1"
            >
              <Target className="h-3 w-3" />
              View Live Stats
            </Button>
          </div>
        )}

        {/* Quick stats tabs */}
        {isCreator && (
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("assists");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              Assists
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("fouls");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              Fouls
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("penalty_30s");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              30 sec
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuickStatType("penalty_1m");
                setQuickStatTeam(null);
                setQuickStatDialogOpen(true);
              }}
              disabled={isClosed || isLockedByPreviousMatch}
              className="text-xs"
            >
              1 min
            </Button>
          </div>
        )}

        {isCreator && (
          <div className="flex gap-2 justify-between">
              <Button
                onClick={() => setSendToStationOpen(true)}
                size="sm"
                variant="outline"
                disabled={isClosed || isLockedByPreviousMatch}
              >
                <Monitor className="h-4 w-4 mr-2" />
                Send to Court
              </Button>
              <div className="flex gap-2">
                {isEditing && (
                  <Button
                    onClick={() => {
                      setTeam1Score(match.team1_score ?? 0);
                      setTeam2Score(match.team2_score ?? 0);
                      setIsEditing(false);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={handleValidateScore}
                  size="sm"
                  disabled={isClosed || isLockedByPreviousMatch}
                >
                  Validate
                </Button>
              </div>
            </div>
        )}
      </div>

      {isCreator && (
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-center gap-2"
            disabled={isClosed || isLockedByPreviousMatch}
          >
            <Users className="h-4 w-4" />
            Player Statistics
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      )}

      <CollapsibleContent>
        <Card className="p-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team 1 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match.team1?.name}
              </h4>
              <div className="space-y-2">
                {team1Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                    onEditStart={() => !isEditing && setIsEditing(true)}
                    onEditEnd={() => setIsEditing(false)}
                  />
                ))}
                {team1Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">No players</p>
                )}
              </div>
            </div>

            {/* Team 2 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match.team2?.name}
              </h4>
              <div className="space-y-2">
                {team2Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                    onEditStart={() => !isEditing && setIsEditing(true)}
                    onEditEnd={() => setIsEditing(false)}
                  />
                ))}
                {team2Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">No players</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </CollapsibleContent>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Final Score</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Do you confirm the final score of this match?<br />
                  <strong>{match.team1?.name}</strong>: {team1Score} - {team2Score}: <strong>{match.team2?.name}</strong>
                </p>
                <MatchStatsRecap
                  team1Name={match.team1?.name || "Team 1"}
                  team2Name={match.team2?.name || "Team 2"}
                  team1Players={team1Players}
                  team2Players={team2Players}
                  playerStats={playerStats}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmValidateScore}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scoringTeam && (
        <GoalScorerDialog
          open={goalScorerDialogOpen}
          onOpenChange={(open) => {
            setGoalScorerDialogOpen(open);
            if (!open) {
              // Reload stats when dialog closes
              fetchPlayerStats();
            }
          }}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          matchId={match.id}
          tournamentId={tournamentId}
          onGoalRecorded={() => {
            // Reload immediately after recording
            fetchPlayerStats();
          }}
        />
      )}

      {removingTeam && (
        <GoalRemoverDialog
          open={goalRemoverDialogOpen}
          onOpenChange={(open) => {
            setGoalRemoverDialogOpen(open);
            if (!open) {
              fetchPlayerStats();
            }
          }}
          teamName={removingTeam.name}
          players={(removingTeam.id === match.team1_id ? team1Players : team2Players).map(p => ({
            id: p.id,
            name: p.name,
            goals: playerStats[p.id]?.goals || 0
          }))}
          onSelectPlayer={async (playerId) => {
            const currentGoals = playerStats[playerId]?.goals || 0;
            if (currentGoals > 0) {
              await updatePlayerStat(playerId, "goals", currentGoals - 1);
            }
          }}
        />
      )}

      {quickStatDialogOpen && (
        <QuickStatDialog
          open={quickStatDialogOpen}
          onOpenChange={(open) => {
            setQuickStatDialogOpen(open);
            if (!open) {
              fetchPlayerStats();
            }
          }}
          team1={{ id: match.team1_id, name: match.team1?.name || "Team 1" }}
          team2={{ id: match.team2_id, name: match.team2?.name || "Team 2" }}
          matchId={match.id}
          tournamentId={tournamentId}
          statType={quickStatType}
          statLabel={
            quickStatType === "assists" ? "Assist" :
            quickStatType === "fouls" ? "Foul" :
            quickStatType === "penalty_30s" ? "30 sec Penalty" :
            quickStatType === "penalty_1m" ? "1 min Penalty" :
            "2 min Penalty"
          }
          onStatRecorded={() => {
            fetchPlayerStats();
          }}
        />
      )}
      
      <SendToStationDialog
        open={sendToStationOpen}
        onOpenChange={setSendToStationOpen}
        tournamentId={tournamentId}
        matchId={match.id}
        matchLabel={`${match.team1?.name || "Team 1"} vs ${match.team2?.name || "Team 2"}`}
      />
    </Collapsible>
  );
};

interface PlayerStatsInputProps {
  player: any;
  stats: any;
  onUpdate: (field: string, value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}

const PlayerStatsInput = ({ player, stats, onUpdate, onEditStart, onEditEnd }: PlayerStatsInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      onEditStart();
    } else {
      onEditEnd();
    }
  };
  
  const incrementStat = (field: string, current: number) => {
    onUpdate(field, current + 1);
  };

  const decrementStat = (field: string, current: number) => {
    if (current > 0) {
      onUpdate(field, current - 1);
    }
  };

  const totalStats = (stats.goals || 0) + (stats.assists || 0);
  const hasFouls = (stats.fouls || 0) > 0;
  const hasPenalties = (stats.penalty_30s || 0) > 0 || (stats.penalty_1m || 0) > 0 || (stats.penalty_2m || 0) > 0;
  const hasAnyStats = totalStats > 0 || hasFouls || hasPenalties;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <div className="p-2 bg-background/50 rounded-lg hover:bg-background/70 cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{player.name}</span>
            <div className="flex items-center gap-2">
              {hasAnyStats && (
                <span className="text-xs text-muted-foreground">
                  {stats.goals || 0}G {stats.assists || 0}A
                  {hasFouls && <span className="ml-1">{stats.fouls}F</span>}
                  {hasPenalties && <span className="ml-1 text-destructive">⚠</span>}
                </span>
              )}
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="p-3 bg-background/30 rounded-lg mt-1 space-y-2">
        {/* Goals */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Goals</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("goals", stats.goals || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.goals || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("goals", stats.goals || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Assists */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Assists</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("assists", stats.assists || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.assists || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("assists", stats.assists || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Fouls */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Fouls</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("fouls", stats.fouls || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.fouls || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("fouls", stats.fouls || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 30 seconds */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">30sec</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_30s", stats.penalty_30s || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_30s || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_30s", stats.penalty_30s || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 1 minute */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">1min</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_1m", stats.penalty_1m || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_1m || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_1m", stats.penalty_1m || 0)}
            >
              +
            </Button>
          </div>
        </div>

        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const CompletedMatchCard = ({ match, isCreator = false, isClosed = false, onEditScore, onViewStats }: {
  match: any;
  isCreator?: boolean;
  isClosed?: boolean;
  onEditScore?: () => void;
  onViewStats?: () => void;
}) => {
  const isTeam1Winner = match.team1_score > match.team2_score;
  const isTeam2Winner = match.team2_score > match.team1_score;
  const [team1Players, setTeam1Players] = useState<string[]>([]);
  const [team2Players, setTeam2Players] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data: tt1 } = await supabase
        .from("tournament_teams")
        .select("id")
        .eq("tournament_id", match.tournament_id)
        .eq("team_id", match.team1_id)
        .maybeSingle();
      if (tt1) {
        const { data: players1 } = await supabase
          .from("tournament_team_players")
          .select("players(name)")
          .eq("tournament_team_id", tt1.id);
        setTeam1Players((players1 || []).map((p: any) => p.players?.name).filter(Boolean));
      }
      const { data: tt2 } = await supabase
        .from("tournament_teams")
        .select("id")
        .eq("tournament_id", match.tournament_id)
        .eq("team_id", match.team2_id)
        .maybeSingle();
      if (tt2) {
        const { data: players2 } = await supabase
          .from("tournament_team_players")
          .select("players(name)")
          .eq("tournament_team_id", tt2.id);
        setTeam2Players((players2 || []).map((p: any) => p.players?.name).filter(Boolean));
      }
    };
    fetchPlayers();
  }, [match.tournament_id, match.team1_id, match.team2_id]);
  
  const handleClick = () => {
    if (isCreator && !isClosed) {
      setPopoverOpen(true);
    } else if (onViewStats) {
      onViewStats();
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <div 
          className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={handleClick}
        >
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className={`font-medium ${isTeam1Winner ? 'text-primary' : ''}`}>
                {match.team1?.name || "Team 1"}
              </span>
              <span className={`text-lg font-bold ${isTeam1Winner ? 'text-primary' : ''}`}>
                {match.team1_score}
              </span>
            </div>
            {team1Players.length > 0 && (
              <span className="text-[9px] text-muted-foreground leading-tight truncate">
                {team1Players.join(", ")}
              </span>
            )}
          </div>
          <span className="text-muted-foreground">-</span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className={`text-lg font-bold ${isTeam2Winner ? 'text-primary' : ''}`}>
                {match.team2_score}
              </span>
              <span className={`font-medium text-right ${isTeam2Winner ? 'text-primary' : ''}`}>
                {match.team2?.name || "Team 2"}
              </span>
            </div>
            {team2Players.length > 0 && (
              <span className="text-[9px] text-muted-foreground leading-tight truncate text-right">
                {team2Players.join(", ")}
              </span>
            )}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2">
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => {
              setPopoverOpen(false);
              onEditScore?.();
            }}
          >
            <ClipboardEdit className="h-4 w-4" />
            Modifier le score
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => {
              setPopoverOpen(false);
              onViewStats?.();
            }}
          >
            <Eye className="h-4 w-4" />
            Voir le récapitulatif
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
