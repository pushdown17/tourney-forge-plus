import { useEffect, useState, useCallback, useRef } from "react";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { syncServerTimeOffset } from "@/lib/serverTime";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Wifi, WifiOff, Plus, Minus, Check, Trophy, AlertTriangle, Target, Ban, Clock, LogIn, User as UserIcon, Timer, Zap } from "lucide-react";
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
import { getSyncedNowMs } from "@/lib/serverTime";

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
  winner_id?: string | null;
  field_number?: number | null;
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
  // Third place decision is handled on the tournament management page, not here

  // Golden Goal state
  const [isGoldenGoal, setIsGoldenGoal] = useState(false);
  const [goldenGoalStartedAt, setGoldenGoalStartedAt] = useState<string | null>(null);
  const [goldenGoalPausedAt, setGoldenGoalPausedAt] = useState<string | null>(null);
  const [goldenGoalElapsedWhenPaused, setGoldenGoalElapsedWhenPaused] = useState<number>(0);
  const [goldenGoalFrozen, setGoldenGoalFrozen] = useState(false);
  // ggMatchId tracks which match the GG was started for (reset on match change)
  const ggMatchIdRef = useRef<string | null>(null);

  // Keep last known match assignment to avoid refetching (and resetting local unsaved stats)
  // on every timer tick/update.
  const stationMatchIdRef = useRef<string | null>(null);
  // Store the original timer duration so adjustments don't leak into the next match
  const initialTimerDurationRef = useRef<number | null>(null);
  useEffect(() => {
    stationMatchIdRef.current = station?.current_match_id ?? null;
    // Capture the initial timer duration when a new match is loaded (elapsed = 0 means fresh match)
    if (station?.timer_duration_seconds && (station?.timer_elapsed_when_paused === 0 || station?.timer_elapsed_when_paused === null) && !station?.timer_started_at) {
      initialTimerDurationRef.current = station.timer_duration_seconds;
    }
  }, [station?.current_match_id, station?.timer_duration_seconds, station?.timer_elapsed_when_paused, station?.timer_started_at]);

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

  // Re-sync station & timer when user returns from background/sleep
  usePageVisibility(useCallback(async () => {
    // Re-calibrate server clock offset (critical for timer accuracy after sleep)
    await syncServerTimeOffset();
    // Then re-fetch station so timer props & match state are fresh
    fetchStation();
  }, [fetchStation]));

  // Persistent broadcast channel reference
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Setup broadcast channel when tournament is loaded
  useEffect(() => {
    if (!station?.tournament_id) return;

    // Create and subscribe to the broadcast channel
    // self: true ensures the sender also receives its own broadcasts (useful for debugging)
    // ack: false gives fire-and-forget behaviour with lower latency
    const channel = supabase
      .channel(`tournament-live-${station.tournament_id}`, {
        config: { broadcast: { self: false, ack: false } }
      })
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

  // Start Golden Goal mode (only for elimination phases, tied score, timer ended)
  const startGoldenGoal = useCallback(async () => {
    if (!match || !stationId) return;
    const now = new Date(getSyncedNowMs()).toISOString();
    setIsGoldenGoal(true);
    setGoldenGoalStartedAt(now);
    setGoldenGoalPausedAt(null);
    setGoldenGoalElapsedWhenPaused(0);
    setGoldenGoalFrozen(false);
    ggMatchIdRef.current = match.id;

    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'golden_goal_start',
      payload: { matchId: match.id, goldenGoalStartedAt: now }
    });

    toast('⚡ Golden Goal activé ! Premier but gagne le match.', { 
      style: { background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' } 
    });
  }, [match, stationId]);

  // Pause GG timer (arrêt de jeu)
  const pauseGoldenGoal = useCallback(() => {
    if (!goldenGoalStartedAt) return;
    const now = new Date(getSyncedNowMs()).toISOString();
    const elapsed = (getSyncedNowMs() - new Date(goldenGoalStartedAt).getTime()) / 1000 + goldenGoalElapsedWhenPaused;
    setGoldenGoalPausedAt(now);
    setGoldenGoalElapsedWhenPaused(elapsed);
    setGoldenGoalStartedAt(null);

    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'golden_goal_pause',
      payload: { matchId: match?.id, elapsedWhenPaused: elapsed }
    });
  }, [goldenGoalStartedAt, goldenGoalElapsedWhenPaused, match?.id]);

  // Resume GG timer after pause
  const resumeGoldenGoal = useCallback(() => {
    const now = new Date(getSyncedNowMs()).toISOString();
    setGoldenGoalStartedAt(now);
    setGoldenGoalPausedAt(null);

    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'golden_goal_resume',
      payload: { matchId: match?.id, goldenGoalStartedAt: now, elapsedWhenPaused: goldenGoalElapsedWhenPaused }
    });
  }, [match?.id, goldenGoalElapsedWhenPaused]);

  // Freeze GG timer when a goal is scored in GG mode
  const freezeGoldenGoal = useCallback(() => {
    setGoldenGoalFrozen(true);
    broadcastChannelRef.current?.send({
      type: 'broadcast',
      event: 'golden_goal_scored',
      payload: { matchId: match?.id }
    });
  }, [match?.id]);

  // Auto-save debounce ref
  const autoSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save player stats (debounced per player)
  const playerStatSaveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
    // Reset Golden Goal state when match changes
    if (match?.id !== ggMatchIdRef.current) {
      setIsGoldenGoal(false);
      setGoldenGoalStartedAt(null);
      setGoldenGoalPausedAt(null);
      setGoldenGoalElapsedWhenPaused(0);
      setGoldenGoalFrozen(false);
      ggMatchIdRef.current = null;
    }
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

  const updateScore = (teamNumber: 1 | 2, delta: number, anonymous = false) => {
    let newTeam1Score = team1?.score || 0;
    let newTeam2Score = team2?.score || 0;
    const team = teamNumber === 1 ? team1 : team2;
    
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

    // If in Golden Goal mode and a goal was just scored, freeze the timer
    if (isGoldenGoal && !goldenGoalFrozen && delta > 0) {
      freezeGoldenGoal();
    }

    // Record anonymous goal event
    if (anonymous && team) {
      const scoreStr = `${newTeam1Score} - ${newTeam2Score}`;
      recordMatchEvent('goal', 'Anonyme', team.id, null, delta, scoreStr);
    }
  };

  // Calculate current elapsed match time (counting up from 00:00)
  // Reads fresh timer state from DB to avoid stale React state issues
  const getElapsedMatchTime = useCallback(async (): Promise<string> => {
    if (!stationId) return "00:00";

    // Read fresh timer values from DB to avoid stale local state
    const { data: freshStation } = await supabase
      .from('referee_stations')
      .select('timer_duration_seconds, timer_started_at, timer_paused_at, timer_elapsed_when_paused, timer_total_adjusted')
      .eq('id', stationId)
      .single();

    const duration = freshStation?.timer_duration_seconds || station?.timer_duration_seconds || 0;
    if (!duration) return "00:00";

    const timerStartedAt = freshStation?.timer_started_at ?? station?.timer_started_at;
    const timerPausedAt = freshStation?.timer_paused_at ?? station?.timer_paused_at;
    const timerElapsed = freshStation?.timer_elapsed_when_paused ?? station?.timer_elapsed_when_paused ?? 0;

    // Calculate remaining time exactly like MatchTimer does (what the referee sees)
    let remainingMs: number;
    
    if (!timerStartedAt) {
      remainingMs = duration * 1000;
    } else if (timerPausedAt) {
      // When paused, elapsedWhenPaused contains TOTAL elapsed time
      remainingMs = Math.max(0, (duration - (timerElapsed || 0)) * 1000);
    } else {
      const startTime = new Date(timerStartedAt).getTime();
      const now = getSyncedNowMs();
      const elapsedMs = now - startTime + (timerElapsed || 0) * 1000;
      remainingMs = Math.max(0, duration * 1000 - elapsedMs);
    }
    
    // Event time = total duration - remaining time (mirrors what the chrono displays)
    const elapsedSeconds = Math.max(0, duration - remainingMs / 1000);
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [stationId, station?.timer_duration_seconds, station?.timer_started_at, station?.timer_paused_at, station?.timer_elapsed_when_paused]);

  // Record a match event to the timeline
  const recordMatchEvent = useCallback(async (
    eventType: string,
    playerName: string,
    teamId: string,
    playerId: string | null,
    delta: number,
    scoreAfter?: string
  ) => {
    if (!match || !station?.tournament_id) return;
    
    try {
      if (delta < 0) {
        // When removing a stat, delete the most recent matching event
        const { data: events } = await (supabase as any)
          .from("match_events")
          .select("id")
          .eq("match_id", match.id)
          .eq("event_type", eventType)
          .eq("team_id", teamId)
          .eq("player_name", playerName)
          .gt("delta", 0)
          .order("created_at", { ascending: false })
          .limit(1);
        
        if (events && events.length > 0) {
          await (supabase as any).from("match_events").delete().eq("id", events[0].id);
        }
      } else {
        const matchTime = await getElapsedMatchTime();
        await (supabase as any).from("match_events").insert({
          match_id: match.id,
          tournament_id: station.tournament_id,
          player_id: playerId,
          player_name: playerName,
          team_id: teamId,
          event_type: eventType,
          match_time: matchTime,
          score_at_event: scoreAfter || null,
          delta,
        });
      }
    } catch (error) {
      console.error("Error recording match event:", error);
    }
  }, [match, station?.tournament_id, getElapsedMatchTime]);

  const updatePlayerStat = (
    teamNumber: 1 | 2, 
    playerId: string, 
    stat: keyof Omit<PlayerStat, 'id' | 'player_id' | 'player_name' | 'tournament_team_player_id'>,
    delta: number
  ) => {
    const team = teamNumber === 1 ? team1 : team2;
    const player = team?.players.find(p => p.player_id === playerId);

    const updateTeam = (t: Team) => {
      const updatedPlayers = t.players.map(p => 
        p.player_id === playerId 
          ? { ...p, [stat]: Math.max(0, p[stat] + delta) }
          : p
      );
      
      const newScore = stat === 'goals' 
        ? Math.max(0, t.score + delta) 
        : t.score;
      
      return {
        ...t,
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
      triggerAutoSave(newTeam1Score, newTeam2Score);
      // Broadcast goal_scored event for overlay alert
      if (delta > 0 && player && team && broadcastChannelRef.current) {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'goal_scored',
          payload: {
            matchId: match?.id,
            playerName: player.player_name,
            teamName: team.name,
          }
        });
      }
      // Freeze GG timer on first goal in Golden Goal mode
      if (isGoldenGoal && !goldenGoalFrozen && delta > 0) {
        freezeGoldenGoal();
      }
    }

    // Record event to timeline
    if (player && team) {
      const scoreStr = stat === 'goals' ? `${newTeam1Score} - ${newTeam2Score}` : undefined;
      recordMatchEvent(stat, player.player_name, team.id, player.player_id, delta, scoreStr);
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
                     team2.score > team1.score ? team2.id : null,
          is_golden_goal: isGoldenGoal
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

  // ── Helper: previous power of 2 ≤ n ──
  const prevPow2Station = (n: number): number => Math.pow(2, Math.floor(Math.log2(n)));

  /**
   * Losers bracket rounds count, aware of hybrid (play-in) formats.
   * For play-in (playInCount > 0): losers rounds = (log2(bracketSize) - 1) * 2.
   * Mirrors getLosersRoundsCount in DoubleEliminationBracket.tsx exactly.
   */
  const getLosersRoundsCountDE = (bracketSize: number, _playInCount: number): number => {
    return (Math.log2(bracketSize) - 1) * 2;
  };

  /**
   * Handle all Double Elimination bracket progressions directly from the station.
   * Supports power-of-2 AND hybrid (bye/play-in) formats (e.g. 12 teams).
   * Mirrors handleChallongeProgression from DoubleEliminationBracket.tsx.
   */
  const handleDoubleEliminationProgression = async (
    completedMatch: Match & { is_third_place_match?: boolean },
    winnerId: string,
    loserId: string
  ) => {
    const tournamentId = station!.tournament_id;
    const { data: tournamentInfo } = await supabase
      .from("tournaments")
      .select("teams_for_elimination")
      .eq("id", tournamentId)
      .single();
    const totalTeams = tournamentInfo?.teams_for_elimination || 8;

    // Use bracketSize (prev power of 2) — critical for hybrid formats like 12 teams
    // For 12 teams: bracketSize=8, playInCount=4 (NOT byeCount=-4 which is wrong for play-in)
    const bracketSize = prevPow2Station(totalTeams);
    const playInCount = totalTeams - bracketSize; // positive for hybrid (e.g. 4 for 12 teams), 0 for standard
    const winnersRounds = Math.log2(bracketSize) + (playInCount > 0 ? 1 : 0);
    const losersRoundsCount = getLosersRoundsCountDE(bracketSize, playInCount);
    const grandFinalRound = winnersRounds + 1;
    const resetRound = grandFinalRound + 1;
    const isLosersBracket = !!(completedMatch as any).is_third_place_match;
    const roundNumber = completedMatch.round_number;

    const { data: allMatches } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("phase", "double_elimination");

    if (!allMatches) return;

    const sortFn = (a: any, b: any) =>
      (a.field_number || 0) - (b.field_number || 0) || (a.created_at || '').localeCompare(b.created_at || '');

    // Exclude sentinel matches (team1===team2 = BYE placeholder) from logical processing
    const winnersBracket = allMatches.filter(m => !m.is_third_place_match && m.team1_id !== m.team2_id).sort(sortFn);
    const winnersBracketAll = allMatches.filter(m => !m.is_third_place_match).sort(sortFn); // includes sentinels
    const losersBracket = allMatches.filter(m => m.is_third_place_match).sort(sortFn);

    const matchExists = (arr: any[], r: number, t1: string, t2: string) =>
      arr.some(m => m.round_number === r && ((m.team1_id === t1 && m.team2_id === t2) || (m.team1_id === t2 && m.team2_id === t1)));
    const teamInRound = (arr: any[], r: number, teamId: string) =>
      arr.some(m => m.round_number === r && (m.team1_id === teamId || m.team2_id === teamId));

    const matchesToCreate: any[] = [];
    let gfPushed = false; // guard: only one Grand Final match created per validateMatch call

    // ── GRAND FINAL M1 completed ──
    if (!isLosersBracket && roundNumber === grandFinalRound) {
      const winnersFinalWinner = winnersBracket.find(m => m.round_number === winnersRounds)?.winner_id;
      const losersFinalWinner = losersBracket.find(m => m.round_number === losersRoundsCount)?.winner_id;
      // Bracket Reset: Losers champion beats Winners champion in GF M1 → create M2
      if (winnersFinalWinner && losersFinalWinner && winnerId === losersFinalWinner && winnerId !== winnersFinalWinner) {
        const resetExists = allMatches.some(m => m.round_number === resetRound && !m.is_third_place_match);
        if (!resetExists) {
          await supabase.from("matches").insert({
            tournament_id: tournamentId, phase: "double_elimination",
            round_number: resetRound, team1_id: winnersFinalWinner, team2_id: losersFinalWinner,
            is_third_place_match: false, field_number: 1,
          });
          toast.success("🔁 Bracket Reset ! Grande Finale M2 créée !", { duration: 5000 });
        }
      }
      return;
    }

    // ── GRAND FINAL M2 (Reset match) completed ──
    if (!isLosersBracket && roundNumber === resetRound) {
      return;
    }

    if (!isLosersBracket) {
      // ══════════════════════════════════════════════════════════════════
      // WINNERS BRACKET
      // ══════════════════════════════════════════════════════════════════

      if (roundNumber === 1 && playInCount > 0) {
        // ── HYBRID: Preliminary Round (R1) ──
        // ABSOLUTE RULE: R1[field_number=K] → R2[field_number=K], team2 slot ONLY.
        // team1 (BYE seed) is PERMANENTLY LOCKED. NO new match creation. Only UPDATE.
        // Prelim losers are ELIMINATED — they do NOT enter the Losers Bracket.
        const thisFieldNum = completedMatch.field_number ?? 1;

        // Find the REAL sentinel for this field_number:
        // Priority 1: match with team1_id === team2_id (untouched sentinel)
        // Priority 2: match with no winner yet and team1_id !== loser (already partially updated)
        const r2CandidatesForField = winnersBracketAll.filter(m => m.round_number === 2 && m.field_number === thisFieldNum);
        const r2Match =
          r2CandidatesForField.find(m => m.team1_id === m.team2_id) ||  // pure sentinel
          r2CandidatesForField.find(m => !m.winner_id && m.team1_id !== loserId && m.team2_id !== winnerId) || // not yet assigned
          r2CandidatesForField.find(m => !m.winner_id && m.team1_id !== loserId); // fallback: any unplayed with correct seed

        if (!r2Match) {
          console.error(`[DE Station] CRITICAL: No R2 sentinel found for field_number=${thisFieldNum}.`);
          return;
        }

        // Protect TOP slot (BYE seed) — never overwrite team1
        if (r2Match.team1_id === winnerId) {
          console.warn(`[DE Station] BLOCKED: winner is already the BYE seed in R2[fn=${thisFieldNum}].`);
          return;
        }

        // Update BOTTOM slot only (team2)
        if (r2Match.team2_id !== winnerId) {
          const { error: updateErr } = await supabase
            .from("matches")
            .update({ team2_id: winnerId })
            .eq("id", r2Match.id);
          if (!updateErr) {
            console.log(`[DE Station] R1[fn=${thisFieldNum}] winner → R2[fn=${thisFieldNum}] team2 slot ✓ (sentinel id=${r2Match.id})`);
          } else {
            console.error("[DE Station] DB update error:", updateErr);
          }
        } else {
          console.log(`[DE Station] R1[fn=${thisFieldNum}] sentinel already updated — skipping.`);
        }
        // Prelim losers are eliminated — no Losers Bracket entry
        return;

      } else if (roundNumber === 1 && playInCount === 0) {
        // ── STANDARD: W-R1 → loser enters L-R1 ──
        const allR1Sorted = winnersBracket.filter(m => m.round_number === 1).sort(sortFn);
        const myPosInR = allR1Sorted.findIndex(m => m.id === completedMatch.id);
        const partnerPos = myPosInR % 2 === 0 ? myPosInR + 1 : myPosInR - 1;
        const partnerMatch = allR1Sorted[partnerPos];

        // Winners advancement to R2
        if (partnerMatch?.winner_id) {
          const w1 = myPosInR % 2 === 0 ? winnerId : partnerMatch.winner_id;
          const w2 = myPosInR % 2 === 0 ? partnerMatch.winner_id : winnerId;
          const nextFieldNumber = Math.floor(Math.min(myPosInR, partnerPos) / 2) + 1;
          if (!matchExists(winnersBracket, 2, w1, w2)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: 2, team1_id: w1, team2_id: w2,
              is_third_place_match: false, field_number: nextFieldNumber,
            });
          }

          // L-R1: pair the two losers
          const l1 = loserId;
          const l2 = partnerMatch.winner_id === partnerMatch.team1_id ? partnerMatch.team2_id : partnerMatch.team1_id;
          const fieldNum = Math.floor(Math.min(myPosInR, partnerPos) / 2) + 1;
          const allLR1 = [...losersBracket, ...matchesToCreate].filter(m => m.is_third_place_match && m.round_number === 1);
          if (l1 && l2 && l1 !== l2 && !teamInRound(allLR1, 1, l1) && !teamInRound(allLR1, 1, l2)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: 1, team1_id: l1, team2_id: l2,
              is_third_place_match: true, field_number: fieldNum,
            });
          }
        }

      } else if (roundNumber === 2 && playInCount > 0) {
        // ── HYBRID: W-QF (R2) loser enters L-R1 ──
        // CRITICAL: use winnersBracketAll (includes sentinels) for position counting
        // so that fn=1..4 positions are 0,1,2,3 even when sentinels are present.
        // Pairs: (fn=1,fn=2) → SF1, (fn=3,fn=4) → SF2
        const allQFSortedAll = winnersBracketAll.filter(m => m.round_number === 2).sort(sortFn);
        const myPosInR = allQFSortedAll.findIndex(m => m.id === completedMatch.id);
        const partnerPos = myPosInR % 2 === 0 ? myPosInR + 1 : myPosInR - 1;
        const partnerMatchRaw = allQFSortedAll[partnerPos];
        // Resolve sentinel: if partner has team1===team2, it's a BYE → treat its winner as team1 (the seed)
        const partnerMatch = partnerMatchRaw;

        // Winners advancement to R3 (Semi-Finals)
        if (partnerMatch?.winner_id) {
          const w1 = myPosInR % 2 === 0 ? winnerId : partnerMatch.winner_id;
          const w2 = myPosInR % 2 === 0 ? partnerMatch.winner_id : winnerId;
          const nextFieldNumber = Math.floor(Math.min(myPosInR, partnerPos) / 2) + 1;
          if (!matchExists(winnersBracket, 3, w1, w2)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: 3, team1_id: w1, team2_id: w2,
              is_third_place_match: false, field_number: nextFieldNumber,
            });
          }

          // L-R1: pair the two QF losers
          const l1 = loserId;
          const l2 = partnerMatch.winner_id === partnerMatch.team1_id ? partnerMatch.team2_id : partnerMatch.team1_id;
          const fieldNum = Math.floor(Math.min(myPosInR, partnerPos) / 2) + 1;
          const allLR1 = [...losersBracket, ...matchesToCreate].filter(m => m.is_third_place_match && m.round_number === 1);
          if (l1 && l2 && l1 !== l2 && !teamInRound(allLR1, 1, l1) && !teamInRound(allLR1, 1, l2)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: 1, team1_id: l1, team2_id: l2,
              is_third_place_match: true, field_number: fieldNum,
            });
          }
        }

      } else {
        // ── W-R(k≥2) standard / W-R(k≥3) play-in: winner advances, loser drops into L major ──
        const currentRoundMatches = winnersBracket.filter(m => m.round_number === roundNumber).sort(sortFn);
        const myIndex = currentRoundMatches.findIndex(m => m.id === completedMatch.id);
        const partnerIndex = myIndex % 2 === 0 ? myIndex + 1 : myIndex - 1;
        const partnerMatch = currentRoundMatches[partnerIndex];

        // Winners advancement
        if (partnerMatch?.winner_id) {
          const nextRound = roundNumber + 1;
          const w1 = myIndex % 2 === 0 ? winnerId : partnerMatch.winner_id;
          const w2 = myIndex % 2 === 0 ? partnerMatch.winner_id : winnerId;
          const nextFieldNumber = Math.floor(myIndex / 2) + 1;
          if (nextRound <= winnersRounds && !matchExists(winnersBracket, nextRound, w1, w2)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: nextRound, team1_id: w1, team2_id: w2,
              is_third_place_match: false, field_number: nextFieldNumber,
            });
          }
        }

        // Grand Final check — use gfPushed flag to avoid duplicating with the Losers path below
        if (roundNumber === winnersRounds && winnerId && !gfPushed) {
          const losersFinal = losersBracket.find(m => m.round_number === losersRoundsCount && m.winner_id);
          if (losersFinal?.winner_id) {
            const grandFinalExists = allMatches.some(m => m.round_number === grandFinalRound && !m.is_third_place_match);
            if (!grandFinalExists) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: grandFinalRound, team1_id: winnerId, team2_id: losersFinal.winner_id,
                is_third_place_match: false, field_number: 1,
              });
              gfPushed = true;
            }
          }
        }

        // Drop loser into Losers major round
        // Play-in: W-R3→L-R2, W-R4→L-R4   formula: (rN - 2) * 2
        // Standard: W-R2→L-R2, W-R3→L-R4  formula: (rN - 1) * 2
        const targetLosersRound = playInCount > 0
          ? (roundNumber - 2) * 2
          : (roundNumber - 1) * 2;
        const prevMinorRound = targetLosersRound - 1;

        const allCurrentRoundLosers = winnersBracket
          .filter(m => m.round_number === roundNumber)
          .sort(sortFn)
          .map(m => m.winner_id ? (m.winner_id === m.team1_id ? m.team2_id : m.team1_id) : null);
        const prevMinorMatches = losersBracket.filter(m => m.round_number === prevMinorRound).sort(sortFn);
        const minorSurvivors = prevMinorMatches.map(m => m.winner_id || null);
        const existingMajor = [...losersBracket, ...matchesToCreate].filter(m => m.round_number === targetLosersRound && m.is_third_place_match);

        for (let i = 0; i < allCurrentRoundLosers.length; i++) {
          const dl = allCurrentRoundLosers[i];
          const ms = minorSurvivors[i];
          if (!dl || !ms) continue;
          if (!matchExists(existingMajor, targetLosersRound, dl, ms) && !matchExists(matchesToCreate, targetLosersRound, dl, ms)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: targetLosersRound, team1_id: dl, team2_id: ms,
              is_third_place_match: true, field_number: i + 1,
            });
          }
        }
      }

    } else {
      // ══════════════════════════════════════════════════════════════════
      // LOSERS BRACKET
      // ══════════════════════════════════════════════════════════════════
      // For play-in: wFeederRound formula → L-R2←W-R3, L-R4←W-R4
      // Standard:    wFeederRound formula → L-R2←W-R2, L-R4←W-R3
      const currentLosersRound = losersBracket.filter(m => m.round_number === roundNumber).sort(sortFn);
      const myIndex = currentLosersRound.findIndex(m => m.id === completedMatch.id);
      const isMinorRound = roundNumber % 2 === 1;
      const nextRound = roundNumber + 1;

      if (roundNumber < losersRoundsCount) {
        if (isMinorRound) {
          // Minor round: winner goes to next major round vs W-dropin
          const nextMajorRound = nextRound;
          const wFeederRound = playInCount > 0
            ? nextMajorRound / 2 + 2  // Play-in: L-R2←W-R3, L-R4←W-R4
            : nextMajorRound / 2 + 1; // Standard: L-R2←W-R2, L-R4←W-R3

          const allMinorMatches = currentLosersRound.sort(sortFn);
          const allMinorWinners = allMinorMatches.map(m => m.id === completedMatch.id ? winnerId : m.winner_id || null);
          const wFeederMatches = winnersBracket.filter(m => m.round_number === wFeederRound).sort(sortFn);
          const wDropinLosers = wFeederMatches.map(m =>
            m.winner_id ? (m.winner_id === m.team1_id ? m.team2_id : m.team1_id) : null
          );
          const existingMajor = losersBracket.filter(m => m.round_number === nextMajorRound);

          for (let i = 0; i < allMinorWinners.length; i++) {
            const ms = allMinorWinners[i];
            const wl = wDropinLosers[i];
            if (!ms || !wl) continue;
            if (!matchExists(existingMajor, nextMajorRound, ms, wl) && !matchExists(matchesToCreate, nextMajorRound, ms, wl)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: nextMajorRound, team1_id: wl, team2_id: ms,
                is_third_place_match: true, field_number: i + 1,
              });
            }
          }
        } else {
          // Major round: winner advances to next minor round (survivors play each other)
          const partnerIndex = myIndex % 2 === 0 ? myIndex + 1 : myIndex - 1;
          const partnerMatch = currentLosersRound[partnerIndex];

          if (partnerMatch?.winner_id) {
            const w1 = myIndex % 2 === 0 ? winnerId : partnerMatch.winner_id;
            const w2 = myIndex % 2 === 0 ? partnerMatch.winner_id : winnerId;
            if (!matchExists(losersBracket, nextRound, w1, w2)) {
              matchesToCreate.push({
                tournament_id: tournamentId, phase: "double_elimination",
                round_number: nextRound, team1_id: w1, team2_id: w2,
                is_third_place_match: true, field_number: Math.floor(myIndex / 2) + 1,
              });
            }
          } else if (currentLosersRound.length === 1) {
            // Single match in major round = Losers Final → check Grand Final
            const winnersFinal = winnersBracket.find(m => m.round_number === winnersRounds && m.winner_id);
            if (winnersFinal?.winner_id) {
              const grandFinalExists = allMatches.some(m => m.round_number === grandFinalRound && !m.is_third_place_match);
              if (!grandFinalExists) {
                matchesToCreate.push({
                  tournament_id: tournamentId, phase: "double_elimination",
                  round_number: grandFinalRound, team1_id: winnersFinal.winner_id, team2_id: winnerId,
                  is_third_place_match: false, field_number: 1,
                });
              }
            }
          }
        }
      }

      // Grand Final check after Losers Final
      if (roundNumber === losersRoundsCount && winnerId && !gfPushed) {
        const winnersFinal = winnersBracket.find(m => m.round_number === winnersRounds && m.winner_id);
        if (winnersFinal?.winner_id) {
          const grandFinalExists = allMatches.some(m => m.round_number === grandFinalRound && !m.is_third_place_match);
          if (!grandFinalExists && !matchesToCreate.some(m => m.round_number === grandFinalRound)) {
            matchesToCreate.push({
              tournament_id: tournamentId, phase: "double_elimination",
              round_number: grandFinalRound, team1_id: winnersFinal.winner_id, team2_id: winnerId,
              is_third_place_match: false, field_number: 1,
            });
            gfPushed = true;
          }
        }
      }
    }

    if (matchesToCreate.length > 0) {
      // Dedup before insert
      const { data: recheck } = await supabase.from("matches")
        .select("id, team1_id, team2_id, round_number, is_third_place_match")
        .eq("tournament_id", tournamentId).eq("phase", "double_elimination");
      const filtered = matchesToCreate.filter(mc =>
        !recheck?.some(ex =>
          ex.round_number === mc.round_number &&
          ex.is_third_place_match === mc.is_third_place_match &&
          ((ex.team1_id === mc.team1_id && ex.team2_id === mc.team2_id) || (ex.team1_id === mc.team2_id && ex.team2_id === mc.team1_id))
        )
      );
      if (filtered.length > 0) {
        const { error } = await supabase.from("matches").insert(filtered);
        if (error) console.error("[DE Station] Insert error:", error);
      }
    }
  };

  const validateMatch = async () => {
    if (!match || !station?.tournament_id) return;
    
    await saveStats();

    const currentPhase = match.phase as any;

    // For double elimination: handle bracket progression directly in the station
    // (broadcast channels created on-the-fly are not subscribed and cannot send messages)
    if (currentPhase === 'double_elimination') {
      const t1Score = team1?.score ?? 0;
      const t2Score = team2?.score ?? 0;
      const winnerId = t1Score > t2Score ? match.team1_id : t2Score > t1Score ? match.team2_id : null;
      const loserId = winnerId ? (winnerId === match.team1_id ? match.team2_id : match.team1_id) : null;

      if (winnerId && loserId) {
        try {
          await handleDoubleEliminationProgression(match, winnerId, loserId);
        } catch (err) {
          console.error("[DE progression] Error:", err);
        }
      }

      // Use the persistent broadcast channel to notify viewers (no new channel creation)
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'match_ended',
          payload: { matchId: match.id }
        });
        if (winnerId && loserId) {
          broadcastChannelRef.current.send({
            type: 'broadcast',
            event: 'de_match_completed',
            payload: {
              matchId: match.id,
              winnerId,
              loserId,
              roundNumber: match.round_number,
              isLosersBracket: (match as any).is_third_place_match ?? false,
            }
          });
        }
      }
    } else {
      // Non-DE phases: use persistent channel for match_ended broadcast
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'match_ended',
          payload: { matchId: match.id }
        });
      }
    }

    let skipAutoAdvance = false;

    // For elimination phases, generate next round matches if needed
    // NOTE: double_elimination progression is fully handled by handleDoubleEliminationProgression above.
    //       Only run the generic pairing logic for single_elimination.
    if (currentPhase === 'single_elimination') {
      try {
        // Get all matches from the completed match's round
        const { data: roundMatches } = await supabase
          .from("matches")
          .select("*")
          .eq("tournament_id", station.tournament_id)
          .eq("phase", currentPhase)
          .eq("round_number", match.round_number)
          .eq("is_third_place_match", false)
          .order("field_number", { ascending: true })
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

          // SPECIAL HANDLING: Preliminary round (round 0)
          // The bracket was generated with "waiting" placeholder QF matches (team1_id === team2_id).
          // When a prelim completes, we UPDATE the waiting match's team2_id with the prelim winner.
          // We never INSERT new QF matches from the station — the bracket component owns that logic.
          if (match.round_number === 0) {
            // Use the winner_id from the freshly-fetched roundMatches (set by saveStats above)
            const completedMatchData = roundMatches?.find((m: any) => m.id === match.id);
            const prelimWinnerId = completedMatchData?.winner_id;
            if (!prelimWinnerId) {
              console.log('Station: No winner for prelim match in roundMatches, skipping QF update');
            } else {
              // Find the "waiting" placeholder QF match for this prelim's field_number
              const waitingQF = existingNextRound?.find((m: any) =>
                m.field_number === match.field_number &&
                m.team1_id === m.team2_id &&
                !m.winner_id
              );

              if (waitingQF) {
                const { error: updateError } = await supabase
                  .from("matches")
                  .update({ team2_id: prelimWinnerId })
                  .eq("id", waitingQF.id);
                if (updateError) {
                  console.error(`Station: Failed to update QF waiting match:`, updateError);
                } else {
                  console.log(`Station: Updated QF waiting match field_number=${match.field_number} with prelim winner ${prelimWinnerId}`);
                }
              } else {
                console.log(`Station: No waiting QF match found for field_number=${match.field_number} (already updated or no placeholder)`);
              }
            }
            // For round 0, we never push to matchesToCreate — fall through without INSERT
          } else {
            // Standard progression for R1 and beyond: pair consecutive matches
            for (let i = 0; i < roundMatches.length; i += 2) {
              if (i + 1 >= roundMatches.length) break;
              const m1 = roundMatches[i];
              const m2 = roundMatches[i + 1];
              if (!m1.winner_id || !m2.winner_id) continue;

              // Check if match already exists
              const exists = existingNextRound?.some(ex =>
                !ex.is_third_place_match &&
                ((ex.team1_id === m1.winner_id && ex.team2_id === m2.winner_id) ||
                 (ex.team1_id === m2.winner_id && ex.team2_id === m1.winner_id))
              );
              const thirdPlaceExists = existingNextRound?.some(ex => ex.is_third_place_match);
              if (exists) continue;

              const { data: tournamentData } = await supabase
                .from("tournaments")
                .select("number_of_fields")
                .eq("id", station.tournament_id)
                .single();

              const numFields = tournamentData?.number_of_fields || 1;

              if (roundMatches.length === 2 && i === 0) {
                // Semi-finals → create the final
                matchesToCreate.push({
                  tournament_id: station.tournament_id,
                  phase: currentPhase,
                  round_number: match.round_number + 1,
                  team1_id: m1.winner_id,
                  team2_id: m2.winner_id,
                  is_third_place_match: false,
                  field_number: 1,
                });
                // Skip auto-advance: 3rd place decision is handled on the tournament management page
                skipAutoAdvance = true;
              } else {
                const existingCount = existingNextRound?.filter(m => !m.is_third_place_match).length || 0;
                matchesToCreate.push({
                  tournament_id: station.tournament_id,
                  phase: currentPhase,
                  round_number: match.round_number + 1,
                  team1_id: m1.winner_id,
                  team2_id: m2.winner_id,
                  is_third_place_match: false,
                  field_number: existingCount + matchesToCreate.length + 1,
                });
              }
            }
          }

          if (matchesToCreate.length > 0) {
            // Re-check for existing matches right before insert to prevent race conditions
            const { data: recheck } = await supabase
              .from("matches")
              .select("id, team1_id, team2_id, is_third_place_match")
              .eq("tournament_id", station.tournament_id)
              .eq("phase", currentPhase)
              .eq("round_number", match.round_number === 0 ? 1 : match.round_number + 1);
            
            const filteredToCreate = matchesToCreate.filter(mc => {
              return !recheck?.some(ex =>
                ex.is_third_place_match === mc.is_third_place_match &&
                ((ex.team1_id === mc.team1_id && ex.team2_id === mc.team2_id) ||
                 (ex.team1_id === mc.team2_id && ex.team2_id === mc.team1_id))
              );
            });

            if (filteredToCreate.length > 0) {
              const { error: insertErr } = await supabase
                .from("matches")
                .insert(filteredToCreate);
              if (insertErr) {
                console.error("Error creating next round matches from station:", insertErr);
              } else {
                console.log(`Created ${filteredToCreate.length} next round match(es) from station`);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error in next round generation from station:", err);
      }
    }

    // If semi-finals just completed, don't auto-advance
    // The tournament dashboard will show a dialog to decide about 3rd place match
    if (skipAutoAdvance) {
      await supabase.from("referee_stations").update({
        current_match_id: null,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0,
        timer_total_adjusted: 0,
        timer_duration_seconds: null
      } as any).eq("id", stationId);

      setConfirmDialogOpen(false);
      setMatch(null);
      setTeam1(null);
      setTeam2(null);
      setSaving(false);
      toast.info("Demi-finales terminées ! Le gestionnaire du tournoi décidera de la petite finale.");
      return;
    }

    // Find the next waiting match AFTER generating next round matches
    // so newly created matches (including 3rd place) are picked up
    // We filter for matches that have NOT been played yet (team1_score IS NULL)
    // This prevents draws (no winner_id but with scores) from being re-selected

    // ── Determine the group of the just-validated match ──
    // For round-robin/swiss with multiple groups (Morning/Afternoon), we must
    // stay within the same group until it is fully played, then move to the next group.
    let currentMatchGroup: string | null = null;
    if (currentPhase === 'round_robin' || currentPhase === 'swiss') {
      const { data: ttRows } = await supabase
        .from("tournament_teams")
        .select("group_name")
        .eq("tournament_id", station.tournament_id)
        .in("team_id", [match.team1_id, match.team2_id])
        .limit(1);
      currentMatchGroup = ttRows?.[0]?.group_name ?? null;
    }

    const { data: allMatches } = await supabase
      .from("matches")
      .select("id, team1_id, team2_id, winner_id, team1_score, team2_score, round_number, field_number, is_third_place_match")
      .eq("tournament_id", station.tournament_id)
      .eq("phase", currentPhase)
      .is("team1_score", null)
      .neq("id", match.id)
      .order("sort_order")
      .order("round_number")
      .order("field_number")
      .order("created_at");

    console.log("[Auto-advance] Validated match:", match.id, "phase:", currentPhase, "group:", currentMatchGroup);
    console.log("[Auto-advance] Unplayed matches from DB:", allMatches?.length, allMatches?.map(m => m.id));

    // ── For multi-group preliminary phases, filter by group ──
    // We resolve the group of each candidate match and stay in the current group
    // until it is entirely finished, then fall through to the next group.
    let groupFilteredMatches = allMatches;
    if (currentMatchGroup && (currentPhase === 'round_robin' || currentPhase === 'swiss') && allMatches && allMatches.length > 0) {
      // Build a map: team_id → group_name for this tournament
      const allTeamIds = [...new Set(allMatches.flatMap(m => [m.team1_id, m.team2_id]))];
      const { data: allTT } = await supabase
        .from("tournament_teams")
        .select("team_id, group_name")
        .eq("tournament_id", station.tournament_id)
        .in("team_id", allTeamIds);
      const teamGroupMap: Record<string, string | null> = {};
      (allTT || []).forEach(tt => { teamGroupMap[tt.team_id] = tt.group_name; });

      // Matches belong to the same group if both teams share it
      const matchesInCurrentGroup = allMatches.filter(m =>
        teamGroupMap[m.team1_id] === currentMatchGroup && teamGroupMap[m.team2_id] === currentMatchGroup
      );

      if (matchesInCurrentGroup.length > 0) {
        // Still matches left in the current group — stay in it
        groupFilteredMatches = matchesInCurrentGroup;
      } else {
        // Current group is finished — check remaining groups in alphabetical order
        // (e.g. "Afternoon" comes before "Morning" alphabetically, adjust if needed)
        const otherGroupMatches = allMatches.filter(m =>
          teamGroupMap[m.team1_id] !== null && teamGroupMap[m.team1_id] === teamGroupMap[m.team2_id]
        );

        if (otherGroupMatches.length > 0) {
          // Pick the next group alphabetically
          const nextGroup = [...new Set(otherGroupMatches.map(m => teamGroupMap[m.team1_id] as string))].sort()[0];
          groupFilteredMatches = otherGroupMatches.filter(m => teamGroupMap[m.team1_id] === nextGroup);
        } else {
          // All group matches done — Ultimate Round or next phase
          groupFilteredMatches = allMatches;
        }
      }
    }

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

    // ── Compute playInCount for this tournament (needed for DE sequencing) ──
    let dePlayInCount = 0;
    if (currentPhase === 'double_elimination') {
      const { data: tiInfo } = await supabase
        .from("tournaments")
        .select("teams_for_elimination")
        .eq("id", station.tournament_id)
        .single();
      const totalTeamsDE = tiInfo?.teams_for_elimination || 8;
      const bracketSizeDE = prevPow2Station(totalTeamsDE);
      dePlayInCount = totalTeamsDE - bracketSizeDE; // positive for hybrid (e.g. 4 for 12 teams)
    }

    // ── Sequence function for Double Elimination ──
    // Uses SEPARATE formulas for play-in (byeCount>0) vs standard (byeCount=0).
    //
    // Standard (8-team example):
    //   W-R1→1, L-R1→2, W-R2→3, L-R2→4, L-R3→5, W-R3→6, L-R4→7, W-R4→8, GF→50+
    //
    // Play-in / hybrid (any byeCount>0: 6,10,12,14,20,24...):
    //   Strict order: W-R1(Prelim)→1, W-R2→2, L-R1→3, W-R3→4, L-R2→5, L-R3→6,
    //                 W-R4→7, L-R4→8, L-R5→9, W-R5→10, L-R6→11, W-R6→12, …, GF→50+
    //
    // Hybrid formula derivation:
    //   wSeqHybrid(k): k=1→1, k=2→2, k≥3→ 3k-5   (e.g. k=3→4, k=4→7, k=5→10)
    //   lSeqHybrid(r): pairIdx=ceil(r/2), wFeed=pairIdx+2
    //     minor (r odd) → wSeqHybrid(wFeed) - 1
    //     major (r even)→ wSeqHybrid(wFeed) + 1
    //
    const getDeSeq = (m: any): number => {
      const r = m.round_number;
      const isL = !!m.is_third_place_match;

      // GF rounds use high sentinel values regardless of bracket type
      if (r >= 10 && !isL) return 50 + r;

      if (dePlayInCount > 0) {
        // ── Hybrid (play-in) formula — works for ALL sizes (6,10,12,14,20,24…) ──
        const wSeqH = (k: number): number =>
          k === 1 ? 1 : k === 2 ? 2 : 3 * k - 5;

        if (!isL) {
          return wSeqH(r); // W-R1=1, W-R2=2, W-R3=4, W-R4=7, W-R5=10…
        } else {
          const pairIdx = Math.ceil(r / 2);     // which (minor,major) pair
          const wFeed = pairIdx + 2;             // which Winners round feeds this pair
          const base = wSeqH(wFeed);
          return r % 2 === 1 ? base - 1 : base + 1; // minor = before W, major = after W
        }
      } else {
        // ── Standard (power-of-2) formula ──
        // W-Rk: k=1→1, k≥2→3*(k-1)
        // L-Rr minor (odd): wSeq(ceil(r/2)+1) - 1
        // L-Rr major (even): wSeq(r/2+1) + 1
        const wSeq = (k: number): number => k === 1 ? 1 : 3 * (k - 1);
        if (!isL) {
          return wSeq(r);
        } else {
          const isMinor = r % 2 === 1;
          const k = Math.ceil(r / 2);
          if (isMinor) return wSeq(k + 1) - 1;
          else return wSeq(r / 2 + 1) + 1;
        }
      }
    };

    // Double-safety: also filter client-side to exclude any match with scores already set
    const availableMatches = (groupFilteredMatches || []).filter(
      m => m.team1_id && m.team2_id && m.team1_id !== m.team2_id 
        && !activeMatchIds.has(m.id)
        && m.team1_score === null && m.team2_score === null
    ).sort((a: any, b: any) => {
      // For Ultimate Round (round 99), sort by field_number descending (6th vs 6th first, 1st vs 1st last)
      if (a.round_number === 99 && b.round_number === 99) {
        return (b.field_number || 0) - (a.field_number || 0);
      }
      if (currentPhase === 'double_elimination') {
        const aSeq = getDeSeq(a);
        const bSeq = getDeSeq(b);
        if (aSeq !== bSeq) return aSeq - bSeq;
        return (a.field_number || 0) - (b.field_number || 0);
      }
      return 0; // preserve DB order for other phases
    });

    // ── FRONTIER BLOCKING ──
    // Only propose matches from the current "frontier" (lowest sequence number).
    // This prevents a future-round match from being proposed when the current round
    // is not yet fully completed.
    let nextMatch = null;
    if (currentPhase === 'double_elimination' && availableMatches.length > 0) {
      const minSeq = getDeSeq(availableMatches[0]); // already sorted, first = lowest seq
      const frontierMatches = availableMatches.filter(m => getDeSeq(m) === minSeq);
      nextMatch = frontierMatches[0] || null;
      console.log("[Auto-advance] DE frontier seq:", minSeq, "matches in frontier:", frontierMatches.length);
    } else {
      nextMatch = availableMatches[0] || null;
    }
    console.log("[Auto-advance] Next match selected:", nextMatch?.id || "none");

    // Use the original configured duration (not the adjusted one from the current match)
    // Priority: stored initial duration > localStorage > current (possibly adjusted) duration
    const savedDuration = localStorage.getItem('last_timer_duration');
    const originalDuration = initialTimerDurationRef.current 
      || (savedDuration ? parseInt(savedDuration, 10) * 60 : null) 
      || station.timer_duration_seconds;
    const { error } = await supabase
      .from("referee_stations")
      .update({ 
        current_match_id: nextMatch?.id || null,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0,
        timer_total_adjusted: 0,
        timer_duration_seconds: nextMatch ? originalDuration : null
      })
      .eq("id", stationId);

    if (error) {
      toast.error("Error validating match");
      return;
    }

    setConfirmDialogOpen(false);

    if (nextMatch) {
      // Update the ref immediately so the incoming realtime event won't trigger a redundant fetchStation
      stationMatchIdRef.current = nextMatch.id;
      // Update local station state to reflect the new match id and reset timer
      setStation((prev: any) => prev ? { 
        ...prev, 
        current_match_id: nextMatch.id,
        timer_duration_seconds: originalDuration,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0,
        timer_total_adjusted: 0,
      } : prev);
      // Load the next match data directly – no full page reload needed
      await fetchMatch(nextMatch.id, station.tournament_id);
      toast.success("Match validé ! Prochain match chargé automatiquement.");
      setAutoLoadBanner(true);
      setTimeout(() => setAutoLoadBanner(false), 5000);
    } else {
      stationMatchIdRef.current = null;
      setStation((prev: any) => prev ? { ...prev, current_match_id: null } : prev);
      setMatch(null);
      setTeam1(null);
      setTeam2(null);
      toast.success("Match validé !");
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
                onDurationChange={(newDuration) => {
                  setStation((prev: any) => prev ? { ...prev, timer_duration_seconds: newDuration } : prev);
                }}
                isGoldenGoal={isGoldenGoal}
                goldenGoalStartedAt={goldenGoalStartedAt}
                goldenGoalPausedAt={goldenGoalPausedAt}
                onGoldenGoalStart={startGoldenGoal}
                onGoldenGoalPause={pauseGoldenGoal}
                onGoldenGoalResume={resumeGoldenGoal}
                isEliminationPhase={match.phase === 'single_elimination' || match.phase === 'double_elimination'}
                isTied={(team1?.score ?? 0) === (team2?.score ?? 0)}
                goldenGoalFrozen={goldenGoalFrozen}
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
                      updateScore(goalScorerPicker.teamNumber, 1, true);
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
                          updateScore(goalRemoverPicker.teamNumber, -1, true);
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
            disabled={saving || (isGoldenGoal && !goldenGoalFrozen)}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
          <Button 
            className="flex-1"
            onClick={() => setConfirmDialogOpen(true)}
            disabled={isGoldenGoal && !goldenGoalFrozen}
            title={isGoldenGoal && !goldenGoalFrozen ? "Un but doit être marqué avant de terminer le match (Golden Goal)" : undefined}
          >
            <Check className="h-4 w-4 mr-2" />
            End Match
            {isGoldenGoal && !goldenGoalFrozen && (
              <span className="ml-1 text-xs opacity-70">⚡ GG</span>
            )}
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
