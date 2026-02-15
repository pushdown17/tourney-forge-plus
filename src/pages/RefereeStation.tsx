import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Wifi, WifiOff, Plus, Minus, Check, Trophy, AlertTriangle, Target, Ban, Clock, LogIn, User as UserIcon, Timer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayerActionPopover } from "@/components/tournament/PlayerActionPopover";
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
import { MatchTimer } from "@/components/tournament/MatchTimer";
import type { User } from "@supabase/supabase-js";

interface PlayerStat {
  id: string;
  player_id: string;
  player_name: string;
  goals: number;
  assists: number;
  fouls: number;
  penalty_30s: number;
  penalty_1m: number;
  penalty_2m: number;
  tournament_team_player_id: string;
}

interface Team {
  id: string;
  name: string;
  score: number;
  players: PlayerStat[];
}

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  team1_score: number | null;
  team2_score: number | null;
  phase: string;
  round_number: number;
}

const RefereeStation = () => {
  const { stationId } = useParams<{ stationId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [station, setStation] = useState<any>(null);
  const [tournament, setTournament] = useState<any>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [team1, setTeam1] = useState<Team | null>(null);
  const [team2, setTeam2] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ teamNumber: 1 | 2; playerId: string } | null>(null);
  const [autoLoadBanner, setAutoLoadBanner] = useState(false);
  const [goalScorerPicker, setGoalScorerPicker] = useState<{ teamNumber: 1 | 2 } | null>(null);
  const [goalRemoverPicker, setGoalRemoverPicker] = useState<{ teamNumber: 1 | 2 } | null>(null);

  // Keep last known match assignment to avoid refetching (and resetting local unsaved stats)
  // on every timer tick/update.
  const stationMatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    stationMatchIdRef.current = station?.current_match_id ?? null;
  }, [station?.current_match_id]);

  // Check authentication
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchStation = useCallback(async () => {
    if (!stationId || !user) return;

    const { data: stationData, error: stationError } = await supabase
      .from("referee_stations")
      .select("*, tournament:tournament_id(id, name, created_by)")
      .eq("id", stationId)
      .single();

    if (stationError) {
      console.error("Error fetching station:", stationError);
      toast.error("Station not found");
      setLoading(false);
      return;
    }

    // Check if user is the tournament creator
    if (stationData.tournament?.created_by !== user.id) {
      setIsAuthorized(false);
      setLoading(false);
      return;
    }

    setIsAuthorized(true);
    setStation(stationData);
    setTournament(stationData.tournament);

    if (stationData.current_match_id) {
      await fetchMatch(stationData.current_match_id, stationData.tournament_id);
    } else {
      setMatch(null);
      setTeam1(null);
      setTeam2(null);
    }

    setLoading(false);
  }, [stationId, user]);

  const fetchMatch = async (matchId: string, tournamentId: string) => {
    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select(`
        *,
        team1:teams!matches_team1_id_fkey(id, name),
        team2:teams!matches_team2_id_fkey(id, name)
      `)
      .eq("id", matchId)
      .single();

    if (matchError) {
      console.error("Error fetching match:", matchError);
      return;
    }

    console.log("Match data fetched:", matchData);
    setMatch(matchData);
    
    // Fetch players for both teams
    await Promise.all([
      fetchTeamPlayers(matchData.team1_id, matchData.team1, matchData.team1_score || 0, matchId, true, tournamentId),
      fetchTeamPlayers(matchData.team2_id, matchData.team2, matchData.team2_score || 0, matchId, false, tournamentId)
    ]);
  };

  const fetchTeamPlayers = async (
    teamId: string, 
    teamData: { id: string; name: string }, 
    score: number,
    matchId: string,
    isTeam1: boolean,
    tournamentId: string
  ) => {
    console.log("Fetching team players for:", teamData?.name, "teamId:", teamId, "tournamentId:", tournamentId);
    
    // Get tournament_team for this team
    const { data: tournamentTeam, error: ttError } = await supabase
      .from("tournament_teams")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", teamId)
      .single();

    if (ttError) {
      console.error("Error fetching tournament_team:", ttError);
    }

    if (!tournamentTeam) return;

    // Get players
    const { data: playersData } = await supabase
      .from("tournament_team_players")
      .select(`
        id,
        player:player_id(id, name)
      `)
      .eq("tournament_team_id", tournamentTeam.id);

    if (!playersData) return;

    // Get stats for this match
    const { data: statsData } = await supabase
      .from("player_stats")
      .select("*")
      .eq("match_id", matchId);

    const players: PlayerStat[] = playersData.map((p: any) => {
      const existingStat = statsData?.find((s: any) => s.player_id === p.player.id);
      return {
        id: existingStat?.id || '',
        player_id: p.player.id,
        player_name: p.player.name,
        goals: existingStat?.goals || 0,
        assists: existingStat?.assists || 0,
        fouls: existingStat?.fouls || 0,
        penalty_30s: existingStat?.penalty_30s || 0,
        penalty_1m: existingStat?.penalty_1m || 0,
        penalty_2m: existingStat?.penalty_2m || 0,
        tournament_team_player_id: p.id
      };
    });

    const teamState: Team = {
      id: teamId,
      name: teamData.name,
      score,
      players
    };

    if (isTeam1) {
      setTeam1(teamState);
    } else {
      setTeam2(teamState);
    }
  };

  // Setup realtime subscription
  useEffect(() => {
    if (!stationId || !user) return;

    fetchStation();

    const channel = supabase
      .channel(`station-${stationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referee_stations',
          filter: `id=eq.${stationId}`
        },
        (payload) => {
          console.log('Station update received:', payload);
          const next = payload.new as any;
          const hasCurrentMatchIdInPayload = Object.prototype.hasOwnProperty.call(next ?? {}, 'current_match_id');

          // Update station timer fields locally to keep timer UI in sync,
          // but avoid re-fetching the whole match/teams on each update.
          setStation((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              ...next,
              // Some realtime payloads may omit unchanged columns; never overwrite the current match id unless provided.
              current_match_id: hasCurrentMatchIdInPayload ? (next?.current_match_id ?? null) : prev.current_match_id,
              // Keep the embedded tournament object from the initial fetch.
              tournament: prev.tournament,
            };
          });

          // Only refetch station/match when the payload *explicitly* includes a match reassignment.
          // Otherwise timer updates can accidentally trigger a refetch that resets in-progress local UI values.
          if (hasCurrentMatchIdInPayload) {
            const prevMatchId = stationMatchIdRef.current;
            const nextMatchId = next?.current_match_id ?? null;
            if (prevMatchId !== nextMatchId) {
              fetchStation();
            }
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stationId, user, fetchStation]);

  // Persistent broadcast channel reference
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Setup broadcast channel when tournament is loaded
  useEffect(() => {
    if (!station?.tournament_id) return;

    // Create and subscribe to the broadcast channel
    const channel = supabase
      .channel(`tournament-live-${station.tournament_id}`)
      .subscribe((status) => {
        console.log('Broadcast channel status:', status);
      });

    broadcastChannelRef.current = channel;

    return () => {
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
    };
  }, [station?.tournament_id]);

  // Broadcast live score to viewers
  const broadcastLiveScore = useCallback((newTeam1Score: number, newTeam2Score: number) => {
    if (!match || !broadcastChannelRef.current) return;
    
    console.log('Broadcasting live score:', newTeam1Score, '-', newTeam2Score, 'for match', match.id);
    
    broadcastChannelRef.current.send({
      type: 'broadcast',
      event: 'live_score',
      payload: {
        matchId: match.id,
        team1_score: newTeam1Score,
        team2_score: newTeam2Score
      }
    });
  }, [match]);

  // Auto-save debounce ref
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Auto-save player stats (debounced per player)
  const playerStatSaveTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  const setPlayerStatRowId = useCallback((playerId: string, rowId: string) => {
    setTeam1((prev) =>
      prev
        ? {
            ...prev,
            players: prev.players.map((p) => (p.player_id === playerId ? { ...p, id: rowId } : p)),
          }
        : prev
    );
    setTeam2((prev) =>
      prev
        ? {
            ...prev,
            players: prev.players.map((p) => (p.player_id === playerId ? { ...p, id: rowId } : p)),
          }
        : prev
    );
  }, []);

  const persistPlayerStat = useCallback(
    async (player: PlayerStat) => {
      if (!match || !station) return;

      const statData = {
        player_id: player.player_id,
        tournament_id: station.tournament_id,
        match_id: match.id,
        goals: player.goals,
        assists: player.assists,
        fouls: player.fouls,
        penalty_30s: player.penalty_30s,
        penalty_1m: player.penalty_1m,
        penalty_2m: player.penalty_2m,
        tournament_team_player_id: player.tournament_team_player_id,
      };

      try {
        // Prefer updating by id when available.
        if (player.id) {
          const { error } = await supabase.from("player_stats").update(statData).eq("id", player.id);
          if (error) throw error;
        } else {
          // Otherwise, find/create the row for this player+match.
          const { data: existing } = await supabase
            .from("player_stats")
            .select("id")
            .eq("match_id", match.id)
            .eq("tournament_team_player_id", player.tournament_team_player_id)
            .maybeSingle();

          if (existing?.id) {
            const { error } = await supabase.from("player_stats").update(statData).eq("id", existing.id);
            if (error) throw error;
            setPlayerStatRowId(player.player_id, existing.id);
          } else {
            const { data: inserted, error } = await supabase
              .from("player_stats")
              .insert(statData)
              .select("id")
              .single();
            if (error) throw error;
            if (inserted?.id) {
              setPlayerStatRowId(player.player_id, inserted.id);
            }
          }
        }

        // Ensure viewers refresh instantly (realtime can lag 200-500ms).
        broadcastChannelRef.current?.send({
          type: "broadcast",
          event: "player_stat_update",
          payload: { matchId: match.id },
        });
      } catch (error) {
        console.error("Error auto-saving player stat:", error);
      }
    },
    [match, station, setPlayerStatRowId]
  );

  const schedulePersistPlayerStat = useCallback(
    (player: PlayerStat) => {
      const key = player.tournament_team_player_id || player.player_id;
      if (!key) return;

      if (playerStatSaveTimeouts.current[key]) {
        clearTimeout(playerStatSaveTimeouts.current[key]);
      }

      playerStatSaveTimeouts.current[key] = setTimeout(() => {
        persistPlayerStat(player);
      }, 500);
    },
    [persistPlayerStat]
  );

  useEffect(() => {
    // Clear pending player-stat saves when switching match.
    Object.values(playerStatSaveTimeouts.current).forEach((t) => clearTimeout(t));
    playerStatSaveTimeouts.current = {};
  }, [match?.id]);

  // Auto-save scores to database
  const autoSaveScores = useCallback(async (t1Score: number, t2Score: number) => {
    if (!match) return;
    
    try {
      await supabase
        .from("matches")
        .update({
          team1_score: t1Score,
          team2_score: t2Score
        })
        .eq("id", match.id);
      console.log("Auto-saved scores:", t1Score, "-", t2Score);
    } catch (error) {
      console.error("Auto-save error:", error);
    }
  }, [match]);

  // Debounced auto-save trigger
  const triggerAutoSave = useCallback((t1Score: number, t2Score: number) => {
    if (autoSaveTimeout.current) {
      clearTimeout(autoSaveTimeout.current);
    }
    autoSaveTimeout.current = setTimeout(() => {
      autoSaveScores(t1Score, t2Score);
    }, 500); // Save 500ms after last change
  }, [autoSaveScores]);

  const updateScore = (teamNumber: 1 | 2, delta: number) => {
    let newTeam1Score = team1?.score || 0;
    let newTeam2Score = team2?.score || 0;
    
    if (teamNumber === 1 && team1) {
      newTeam1Score = Math.max(0, team1.score + delta);
      setTeam1({ ...team1, score: newTeam1Score });
    } else if (teamNumber === 2 && team2) {
      newTeam2Score = Math.max(0, team2.score + delta);
      setTeam2({ ...team2, score: newTeam2Score });
    }
    
    // Broadcast the live score
    broadcastLiveScore(newTeam1Score, newTeam2Score);
    // Auto-save to database
    triggerAutoSave(newTeam1Score, newTeam2Score);
  };

  const updatePlayerStat = (
    teamNumber: 1 | 2, 
    playerId: string, 
    stat: keyof Omit<PlayerStat, 'id' | 'player_id' | 'player_name' | 'tournament_team_player_id'>,
    delta: number
  ) => {
    const updateTeam = (team: Team) => {
      const updatedPlayers = team.players.map(p => 
        p.player_id === playerId 
          ? { ...p, [stat]: Math.max(0, p[stat] + delta) }
          : p
      );
      
      // If updating goals, also update the team score
      const newScore = stat === 'goals' 
        ? Math.max(0, team.score + delta) 
        : team.score;
      
      return {
        ...team,
        score: newScore,
        players: updatedPlayers
      };
    };

    let newTeam1Score = team1?.score || 0;
    let newTeam2Score = team2?.score || 0;

    if (teamNumber === 1 && team1) {
      const updated = updateTeam(team1);
      setTeam1(updated);
      newTeam1Score = updated.score;
      const updatedPlayer = updated.players.find((p) => p.player_id === playerId);
      if (updatedPlayer) schedulePersistPlayerStat(updatedPlayer);
    } else if (teamNumber === 2 && team2) {
      const updated = updateTeam(team2);
      setTeam2(updated);
      newTeam2Score = updated.score;
      const updatedPlayer = updated.players.find((p) => p.player_id === playerId);
      if (updatedPlayer) schedulePersistPlayerStat(updatedPlayer);
    }

    // Broadcast live score when goals change
    if (stat === 'goals') {
      broadcastLiveScore(newTeam1Score, newTeam2Score);
      // Auto-save to database when goals change
      triggerAutoSave(newTeam1Score, newTeam2Score);
    }
  };

  const saveStats = async () => {
    if (!match || !team1 || !team2) return;

    setSaving(true);
    try {
      // Update match scores
      const { error: matchError } = await supabase
        .from("matches")
        .update({
          team1_score: team1.score,
          team2_score: team2.score,
          winner_id: team1.score > team2.score ? team1.id : 
                     team2.score > team1.score ? team2.id : null
        })
        .eq("id", match.id);

      if (matchError) throw matchError;

      // Save player stats for both teams
      const allPlayers = [...team1.players, ...team2.players];
      
      for (const player of allPlayers) {
        const statData = {
          player_id: player.player_id,
          tournament_id: station.tournament_id,
          match_id: match.id,
          goals: player.goals,
          assists: player.assists,
          fouls: player.fouls,
          penalty_30s: player.penalty_30s,
          penalty_1m: player.penalty_1m,
          penalty_2m: player.penalty_2m,
          tournament_team_player_id: player.tournament_team_player_id
        };

        if (player.id) {
          await supabase
            .from("player_stats")
            .update(statData)
            .eq("id", player.id);
        } else {
          await supabase
            .from("player_stats")
            .insert(statData);
        }
      }

      toast.success("Stats saved!");
    } catch (error: any) {
      console.error("Error saving stats:", error);
      toast.error("Error saving stats");
    } finally {
      setSaving(false);
    }
  };

  const validateMatch = async () => {
    if (!match || !station?.tournament_id) return;
    
    await saveStats();

    // Broadcast match ended to bracket viewers
    const channel = supabase.channel(`tournament-live-${station.tournament_id}`);
    await channel.send({
      type: 'broadcast',
      event: 'match_ended',
      payload: {
        matchId: match.id
      }
    });

    const currentPhase = match.phase as any;

    // For elimination phases, generate next round matches if needed
    if (currentPhase === 'single_elimination' || currentPhase === 'double_elimination') {
      try {
        // Get all matches from the completed match's round
        const { data: roundMatches } = await supabase
          .from("matches")
          .select("*")
          .eq("tournament_id", station.tournament_id)
          .eq("phase", currentPhase)
          .eq("round_number", match.round_number)
          .eq("is_third_place_match", false)
          .order("created_at", { ascending: true });

        if (roundMatches && roundMatches.length > 0) {
          // Check existing next round matches
          const { data: existingNextRound } = await supabase
            .from("matches")
            .select("*")
            .eq("tournament_id", station.tournament_id)
            .eq("phase", currentPhase)
            .eq("round_number", match.round_number + 1);

          const matchesToCreate: any[] = [];

          for (let i = 0; i < roundMatches.length; i += 2) {
            if (i + 1 >= roundMatches.length) break;
            const m1 = roundMatches[i];
            const m2 = roundMatches[i + 1];
            if (!m1.winner_id || !m2.winner_id) continue;

            // Check if final already exists
            const exists = existingNextRound?.some(ex =>
              !ex.is_third_place_match &&
              ((ex.team1_id === m1.winner_id && ex.team2_id === m2.winner_id) ||
               (ex.team1_id === m2.winner_id && ex.team2_id === m1.winner_id))
            );
            // Check if 3rd place match already exists
            const thirdPlaceExists = existingNextRound?.some(ex => ex.is_third_place_match);
            if (exists) continue;

            const { data: tournamentData } = await supabase
              .from("tournaments")
              .select("number_of_fields")
              .eq("id", station.tournament_id)
              .single();

            const numFields = tournamentData?.number_of_fields || 1;

            if (roundMatches.length === 2 && i === 0) {
              // Semi-finals → create final + 3rd place
              const loser1 = m1.winner_id === m1.team1_id ? m1.team2_id : m1.team1_id;
              const loser2 = m2.winner_id === m2.team1_id ? m2.team2_id : m2.team1_id;

              matchesToCreate.push({
                tournament_id: station.tournament_id,
                phase: currentPhase,
                round_number: match.round_number + 1,
                team1_id: m1.winner_id,
                team2_id: m2.winner_id,
                is_third_place_match: false,
                field_number: 1,
              });
              if (!thirdPlaceExists) {
                matchesToCreate.push({
                  tournament_id: station.tournament_id,
                  phase: currentPhase,
                  round_number: match.round_number + 1,
                  team1_id: loser1,
                  team2_id: loser2,
                  is_third_place_match: true,
                  field_number: Math.min(2, numFields),
                });
              }
            } else {
              matchesToCreate.push({
                tournament_id: station.tournament_id,
                phase: currentPhase,
                round_number: match.round_number + 1,
                team1_id: m1.winner_id,
                team2_id: m2.winner_id,
                is_third_place_match: false,
                field_number: (matchesToCreate.length % numFields) + 1,
              });
            }
          }

          if (matchesToCreate.length > 0) {
            const { error: insertErr } = await supabase
              .from("matches")
              .insert(matchesToCreate);
            if (insertErr) {
              console.error("Error creating next round matches from station:", insertErr);
            } else {
              console.log(`Created ${matchesToCreate.length} next round match(es) from station`);
            }
          }
        }
      } catch (err) {
        console.error("Error in next round generation from station:", err);
      }
    }

    // Find the next waiting match AFTER generating next round matches
    // so newly created matches (including 3rd place) are picked up
    const { data: allMatches } = await supabase
      .from("matches")
      .select("id, team1_id, team2_id, winner_id")
      .eq("tournament_id", station.tournament_id)
      .eq("phase", currentPhase)
      .is("winner_id", null)
      .neq("id", match.id)
      .order("round_number")
      .order("created_at");

    // Get all active station match assignments (except current station)
    const { data: activeStations } = await supabase
      .from("referee_stations")
      .select("current_match_id")
      .eq("tournament_id", station.tournament_id)
      .eq("is_active", true)
      .not("current_match_id", "is", null)
      .neq("id", stationId!);

    const activeMatchIds = new Set(
      (activeStations || []).map(s => s.current_match_id).filter(Boolean)
    );

    // First waiting match not already on a station (must have both teams, not a bye)
    const nextMatch = (allMatches || []).find(
      m => m.team1_id && m.team2_id && m.team1_id !== m.team2_id && !activeMatchIds.has(m.id)
    );

    // Update station: assign next match or clear
    const timerDuration = station.timer_duration_seconds;
    const { error } = await supabase
      .from("referee_stations")
      .update({ 
        current_match_id: nextMatch?.id || null,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0,
        timer_duration_seconds: nextMatch ? timerDuration : null
      })
      .eq("id", stationId);

    if (error) {
      toast.error("Error validating match");
      return;
    }

    if (nextMatch) {
      toast.success("Match validé ! Prochain match chargé automatiquement.");
      setAutoLoadBanner(true);
      setTimeout(() => setAutoLoadBanner(false), 5000);
    } else {
      toast.success("Match validé !");
    }
    setConfirmDialogOpen(false);
    if (!nextMatch) {
      setMatch(null);
      setTeam1(null);
      setTeam2(null);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <LogIn className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Connexion requise</h1>
          <p className="text-muted-foreground mb-6">
            Vous devez être connecté avec le compte du créateur du tournoi pour accéder à cette station arbitre.
          </p>
          <Button onClick={() => navigate("/auth")}>
            Se connecter
          </Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show unauthorized message if user is not the tournament creator
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Accès non autorisé</h1>
          <p className="text-muted-foreground mb-6">
            Seul le créateur du tournoi peut accéder à cette station arbitre.
          </p>
          <Button variant="outline" onClick={() => navigate("/")}>
            Retour à l'accueil
          </Button>
        </Card>
      </div>
    );
  }

  if (!station) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Station Not Found</h1>
          <p className="text-muted-foreground">This referee station doesn't exist or has been deleted.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{station.station_name} {station.station_number}</h1>
            <p className="text-xs text-muted-foreground">{tournament?.name}</p>
          </div>
          <Badge variant={connected ? "default" : "destructive"} className="gap-1">
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "Live" : "Offline"}
          </Badge>
        </div>
      </header>

      {/* Auto-load notification banner */}
      {autoLoadBanner && (
        <div className="mx-4 mt-3 animate-fade-in">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/15 border border-primary/30 text-primary">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Trophy className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Nouveau match chargé !</p>
              <p className="text-xs opacity-80">Le prochain match a été automatiquement assigné à cette station.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-primary hover:text-primary"
              onClick={() => setAutoLoadBanner(false)}
            >
              OK
            </Button>
          </div>
        </div>
      )}

      <main className="p-4 pb-24">
        {!match ? (
          <Card className="p-8 text-center">
            <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Waiting for match...</h2>
            <p className="text-muted-foreground">
              The tournament manager will assign a match to this station.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Match info */}
            <Card className="p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                {match.phase === 'swiss' ? 'Swiss' : match.phase === 'round_robin' ? 'Round Robin' : 'Elimination'} 
                {' · '}Round {match.round_number}
              </p>
            </Card>

            {/* Timer */}
            {station.timer_duration_seconds ? (
              <MatchTimer
                stationId={stationId!}
                tournamentId={station.tournament_id}
                matchId={match.id}
                durationSeconds={station.timer_duration_seconds}
                startedAt={station.timer_started_at}
                pausedAt={station.timer_paused_at}
                elapsedWhenPaused={station.timer_elapsed_when_paused || 0}
                canControl={true}
                showMilliseconds={true}
              />
            ) : (
              <Card className="p-4">
                <TimerSetup stationId={stationId!} onTimerSet={fetchStation} />
              </Card>
            )}

            {/* Scoreboard */}
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-4 items-center">
                {/* Team 1 */}
                <div className="text-center">
                  <p className="font-bold text-lg truncate">{team1?.name}</p>
                </div>
                
                {/* Scores */}
                <div className="flex items-center justify-center gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => setGoalScorerPicker({ teamNumber: 1 })}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold tabular-nums">{team1?.score || 0}</span>
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => setGoalRemoverPicker({ teamNumber: 1 })}
                      disabled={!team1 || team1.score === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <span className="text-2xl font-light text-muted-foreground">-</span>
                  
                  <div className="flex flex-col items-center gap-2">
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => setGoalScorerPicker({ teamNumber: 2 })}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold tabular-nums">{team2?.score || 0}</span>
                    <Button 
                      size="icon" 
                      variant="outline"
                      onClick={() => setGoalRemoverPicker({ teamNumber: 2 })}
                      disabled={!team2 || team2.score === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Team 2 */}
                <div className="text-center">
                  <p className="font-bold text-lg truncate">{team2?.name}</p>
                </div>
              </div>
            </Card>

            {/* Players - always visible */}
            <div className="grid grid-cols-2 gap-3">
              {/* Team 1 Players */}
              {team1 && (
                <Card className="p-3">
                  <p className="font-semibold text-sm mb-2 text-center truncate">{team1.name}</p>
                  <div className="space-y-1.5">
                    {team1.players.map(player => {
                      const hasStats = player.goals > 0 || player.assists > 0 || player.fouls > 0 || player.penalty_30s > 0 || player.penalty_1m > 0 || player.penalty_2m > 0;
                      return (
                        <button
                          key={player.player_id}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors active:scale-[0.98] ${
                            hasStats 
                              ? "bg-primary/10 border-primary/30 font-medium" 
                              : "bg-card hover:bg-muted border-border"
                          }`}
                          onClick={() => setSelectedPlayer({ teamNumber: 1, playerId: player.player_id })}
                        >
                          <span className="truncate block">{player.player_name}</span>
                          {hasStats && (
                            <span className="text-xs text-muted-foreground flex gap-1.5 mt-0.5">
                              {player.goals > 0 && <span>⚽{player.goals}</span>}
                              {player.assists > 0 && <span>🅰️{player.assists}</span>}
                              {player.fouls > 0 && <span>🟡{player.fouls}</span>}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Team 2 Players */}
              {team2 && (
                <Card className="p-3">
                  <p className="font-semibold text-sm mb-2 text-center truncate">{team2.name}</p>
                  <div className="space-y-1.5">
                    {team2.players.map(player => {
                      const hasStats = player.goals > 0 || player.assists > 0 || player.fouls > 0 || player.penalty_30s > 0 || player.penalty_1m > 0 || player.penalty_2m > 0;
                      return (
                        <button
                          key={player.player_id}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors active:scale-[0.98] ${
                            hasStats 
                              ? "bg-primary/10 border-primary/30 font-medium" 
                              : "bg-card hover:bg-muted border-border"
                          }`}
                          onClick={() => setSelectedPlayer({ teamNumber: 2, playerId: player.player_id })}
                        >
                          <span className="truncate block">{player.player_name}</span>
                          {hasStats && (
                            <span className="text-xs text-muted-foreground flex gap-1.5 mt-0.5">
                              {player.goals > 0 && <span>⚽{player.goals}</span>}
                              {player.assists > 0 && <span>🅰️{player.assists}</span>}
                              {player.fouls > 0 && <span>🟡{player.fouls}</span>}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>

            {/* Player action popup */}
            {selectedPlayer && (() => {
              const team = selectedPlayer.teamNumber === 1 ? team1 : team2;
              const player = team?.players.find(p => p.player_id === selectedPlayer.playerId);
              if (!player) return null;
              return (
                <PlayerActionPopover
                  playerName={player.player_name}
                  open={true}
                  onOpenChange={(open) => { if (!open) setSelectedPlayer(null); }}
                  stats={{
                    goals: player.goals,
                    assists: player.assists,
                    fouls: player.fouls,
                    penalty_30s: player.penalty_30s,
                    penalty_1m: player.penalty_1m,
                    penalty_2m: player.penalty_2m,
                  }}
                  onStatChange={(stat, delta) => updatePlayerStat(selectedPlayer.teamNumber, player.player_id, stat as any, delta)}
                />
              );
            })()}

            {/* Goal Scorer Picker (+ button) */}
            {goalScorerPicker && (() => {
              const team = goalScorerPicker.teamNumber === 1 ? team1 : team2;
              if (!team) return null;
              return (
                <Dialog open={true} onOpenChange={(open) => { if (!open) setGoalScorerPicker(null); }}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Qui a marqué ? ({team.name})</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {team.players.map((player) => (
                        <Button
                          key={player.player_id}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => {
                            updatePlayerStat(goalScorerPicker.teamNumber, player.player_id, 'goals', 1);
                            setGoalScorerPicker(null);
                          }}
                        >
                          <UserIcon className="mr-2 h-4 w-4" />
                          {player.player_name}
                          {player.goals > 0 && <span className="ml-auto text-muted-foreground">⚽{player.goals}</span>}
                        </Button>
                      ))}
                    </div>
                    <Button variant="secondary" onClick={() => {
                      updateScore(goalScorerPicker.teamNumber, 1);
                      setGoalScorerPicker(null);
                    }}>
                      Passer (but anonyme)
                    </Button>
                  </DialogContent>
                </Dialog>
              );
            })()}

            {/* Goal Remover Picker (- button) */}
            {goalRemoverPicker && (() => {
              const team = goalRemoverPicker.teamNumber === 1 ? team1 : team2;
              if (!team) return null;
              const playersWithGoals = team.players.filter(p => p.goals > 0);
              return (
                <Dialog open={true} onOpenChange={(open) => { if (!open) setGoalRemoverPicker(null); }}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Retirer un but ({team.name})</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {playersWithGoals.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">
                          Aucun joueur avec des buts enregistrés
                        </p>
                      ) : (
                        playersWithGoals.map((player) => (
                          <Button
                            key={player.player_id}
                            variant="outline"
                            className="w-full justify-between"
                            onClick={() => {
                              updatePlayerStat(goalRemoverPicker.teamNumber, player.player_id, 'goals', -1);
                              setGoalRemoverPicker(null);
                            }}
                          >
                            <span>{player.player_name}</span>
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <span>⚽{player.goals}</span>
                              <Minus className="h-4 w-4" />
                            </span>
                          </Button>
                        ))
                      )}
                      {playersWithGoals.length === 0 && (
                        <Button variant="secondary" className="w-full" onClick={() => {
                          updateScore(goalRemoverPicker.teamNumber, -1);
                          setGoalRemoverPicker(null);
                        }}>
                          Retirer quand même
                        </Button>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })()}
          </div>
        )}
      </main>

      {/* Bottom Actions */}
      {match && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={saveStats}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
          <Button 
            className="flex-1"
            onClick={() => setConfirmDialogOpen(true)}
          >
            <Check className="h-4 w-4 mr-2" />
            End Match
          </Button>
        </div>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End match?</AlertDialogTitle>
            <AlertDialogDescription>
              Final score: <strong>{team1?.name} {team1?.score} - {team2?.score} {team2?.name}</strong>
              <br /><br />
              This will save all stats and notify the tournament manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={validateMatch}>
              Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RefereeStation;

const TimerSetup = ({ stationId, onTimerSet }: { stationId: string; onTimerSet: () => void }) => {
  const [minutes, setMinutes] = useState("10");
  const [saving, setSaving] = useState(false);

  const handleSetTimer = async () => {
    const mins = parseInt(minutes);
    if (!mins || mins < 1 || mins > 60) return;
    setSaving(true);
    const { error } = await supabase
      .from("referee_stations")
      .update({ timer_duration_seconds: mins * 60 } as any)
      .eq("id", stationId);

    if (error) {
      toast.error("Error setting timer");
    } else {
      toast.success(`Timer set to ${mins} minutes`);
      onTimerSet();
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Timer className="h-5 w-5" />
        <span className="font-medium">No timer configured</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="1"
          max="60"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-20 h-9"
        />
        <span className="text-sm text-muted-foreground">min</span>
        <Button onClick={handleSetTimer} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set Timer"}
        </Button>
      </div>
    </div>
  );
};
