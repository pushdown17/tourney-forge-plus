import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { getSyncedNowMs, syncServerTimeOffset } from "@/lib/serverTime";
import { usePageVisibility } from "@/hooks/usePageVisibility";

interface StationData {
  id: string;
  tournament_id: string;
  current_match_id: string | null;
  timer_duration_seconds: number | null;
  timer_started_at: string | null;
  timer_paused_at: string | null;
  timer_elapsed_when_paused: number | null;
  timer_total_adjusted: number | null;
  station_name: string;
  station_number: number;
}

interface MatchData {
  id: string;
  team1_id: string;
  team2_id: string;
  team1_score: number | null;
  team2_score: number | null;
  phase: string;
  round_number: number;
  is_third_place_match: boolean;
  team1: { id: string; name: string } | null;
  team2: { id: string; name: string } | null;
}

interface GoalAlert {
  id: string;
  playerName: string;
  teamName: string;
}

interface NextMatch {
  team1Name: string;
  team2Name: string;
}

const phaseLabel = (phase: string, roundNumber: number, isThirdPlace: boolean) => {
  if (isThirdPlace) return "3rd Place Match";
  const labels: Record<string, string> = {
    round_robin: `Round Robin – Round ${roundNumber}`,
    swiss: `Swiss – Round ${roundNumber}`,
    elimination: "Elimination",
    single_elimination: roundNumber === 1 ? "Final" : roundNumber === 2 ? "Semi-Final" : roundNumber === 3 ? "Quarter-Final" : `Round of ${Math.pow(2, roundNumber)}`,
    double_elimination: roundNumber === 1 ? "Final" : roundNumber === 2 ? "Semi-Final" : roundNumber === 3 ? "Quarter-Final" : `DE Round ${roundNumber}`,
  };
  return labels[phase] ?? phase;
};

const formatTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const Overlay = () => {
  const { stationId } = useParams<{ stationId: string }>();
  const [station, setStation] = useState<StationData | null>(null);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [tournamentName, setTournamentName] = useState<string>("");
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [goalAlerts, setGoalAlerts] = useState<GoalAlert[]>([]);
  const [nextMatch, setNextMatch] = useState<NextMatch | null>(null);
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [scoreFlash, setScoreFlash] = useState<{ team: 1 | 2 } | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const stationRef = useRef<StationData | null>(null);
  stationRef.current = station;

  // ---- Timer calculation ----
  const calcRemaining = useCallback((s: StationData) => {
    if (!s.timer_duration_seconds) return 0;
    if (!s.timer_started_at) return s.timer_duration_seconds;
    if (s.timer_paused_at) {
      return Math.max(0, s.timer_duration_seconds - (s.timer_elapsed_when_paused ?? 0));
    }
    const startMs = new Date(s.timer_started_at).getTime();
    const now = getSyncedNowMs();
    const elapsed = Math.floor((now - startMs) / 1000) + (s.timer_elapsed_when_paused ?? 0);
    return Math.max(0, s.timer_duration_seconds - elapsed);
  }, []);

  // ---- Tick ----
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      if (stationRef.current) {
        setRemainingSeconds(calcRemaining(stationRef.current));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [timerRunning, calcRemaining]);

  // ---- Fetch match & next match ----
  const fetchMatch = useCallback(async (matchId: string, tournamentId: string) => {
    const { data } = await supabase
      .from("matches")
      .select(`
        *,
        team1:teams!matches_team1_id_fkey(id, name),
        team2:teams!matches_team2_id_fkey(id, name)
      `)
      .eq("id", matchId)
      .single();

    if (data) {
      setMatch(data as MatchData);
      setTeam1Score(data.team1_score ?? 0);
      setTeam2Score(data.team2_score ?? 0);
    }
  }, []);

  const fetchNextMatch = useCallback(async (tournamentId: string) => {
    const { data } = await supabase
      .from("matches")
      .select(`
        *,
        team1:teams!matches_team1_id_fkey(id, name),
        team2:teams!matches_team2_id_fkey(id, name)
      `)
      .eq("tournament_id", tournamentId)
      .is("team1_score", null)
      .is("team2_score", null)
      .order("round_number", { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      const m = data[0] as MatchData;
      setNextMatch({
        team1Name: m.team1?.name ?? "TBD",
        team2Name: m.team2?.name ?? "TBD",
      });
    } else {
      setNextMatch(null);
    }
  }, []);

  const fetchStation = useCallback(async () => {
    if (!stationId) return;
    const { data } = await supabase
      .from("referee_stations")
      .select("*, tournament:tournament_id(id, name)")
      .eq("id", stationId)
      .single();

    if (!data) return;

    const s = data as any;
    const stationData: StationData = {
      id: s.id,
      tournament_id: s.tournament_id,
      current_match_id: s.current_match_id,
      timer_duration_seconds: s.timer_duration_seconds,
      timer_started_at: s.timer_started_at,
      timer_paused_at: s.timer_paused_at,
      timer_elapsed_when_paused: s.timer_elapsed_when_paused,
      timer_total_adjusted: s.timer_total_adjusted,
      station_name: s.station_name,
      station_number: s.station_number,
    };

    setStation(stationData);
    setTournamentName(s.tournament?.name ?? "");
    setRemainingSeconds(calcRemaining(stationData));
    setTimerRunning(!!s.timer_started_at && !s.timer_paused_at);

    if (s.current_match_id) {
      await fetchMatch(s.current_match_id, s.tournament_id);
    } else {
      setMatch(null);
      setTeam1Score(0);
      setTeam2Score(0);
      await fetchNextMatch(s.tournament_id);
    }
  }, [stationId, calcRemaining, fetchMatch, fetchNextMatch]);

  useEffect(() => {
    syncServerTimeOffset().then(() => fetchStation());
  }, [fetchStation]);

  usePageVisibility(useCallback(async () => {
    await syncServerTimeOffset();
    fetchStation();
  }, [fetchStation]));

  // ---- Realtime: station updates ----
  useEffect(() => {
    if (!stationId) return;

    const channel = supabase
      .channel(`overlay-station-${stationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "referee_stations", filter: `id=eq.${stationId}` },
        (payload) => {
          const next = payload.new as any;
          if (!next) return;

          const updated: StationData = {
            id: next.id,
            tournament_id: next.tournament_id,
            current_match_id: next.current_match_id,
            timer_duration_seconds: next.timer_duration_seconds,
            timer_started_at: next.timer_started_at,
            timer_paused_at: next.timer_paused_at,
            timer_elapsed_when_paused: next.timer_elapsed_when_paused,
            timer_total_adjusted: next.timer_total_adjusted,
            station_name: next.station_name ?? stationRef.current?.station_name ?? "",
            station_number: next.station_number ?? stationRef.current?.station_number ?? 1,
          };

          setStation(updated);
          setRemainingSeconds(calcRemaining(updated));
          setTimerRunning(!!next.timer_started_at && !next.timer_paused_at);

          // Match changed
          const prevMatchId = stationRef.current?.current_match_id;
          if (next.current_match_id !== prevMatchId) {
            if (next.current_match_id) {
              fetchMatch(next.current_match_id, next.tournament_id);
            } else {
              setMatch(null);
              fetchNextMatch(next.tournament_id);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [stationId, calcRemaining, fetchMatch, fetchNextMatch]);

  // ---- Realtime: match score updates ----
  useEffect(() => {
    if (!match?.id) return;

    const channel = supabase
      .channel(`overlay-match-${match.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${match.id}` },
        (payload) => {
          const next = payload.new as any;
          if (next.team1_score !== undefined) {
            const newT1 = next.team1_score ?? 0;
            const newT2 = next.team2_score ?? 0;

            setTeam1Score((prev) => {
              if (newT1 > prev) triggerScoreFlash(1);
              return newT1;
            });
            setTeam2Score((prev) => {
              if (newT2 > prev) triggerScoreFlash(2);
              return newT2;
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [match?.id]);

  // ---- Realtime: goal events ----
  useEffect(() => {
    if (!match?.id) return;

    const channel = supabase
      .channel(`overlay-events-${match.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_events", filter: `match_id=eq.${match.id}` },
        (payload) => {
          const evt = payload.new as any;
          if (evt.event_type !== "goal") return;
          if (evt.id === lastEventIdRef.current) return;
          lastEventIdRef.current = evt.id;

          const teamName =
            evt.team_id === match?.team1_id
              ? match?.team1?.name ?? ""
              : match?.team2?.name ?? "";

          const alert: GoalAlert = {
            id: evt.id,
            playerName: evt.player_name,
            teamName,
          };

          setGoalAlerts((prev) => [...prev, alert]);
          setTimeout(() => {
            setGoalAlerts((prev) => prev.filter((a) => a.id !== alert.id));
          }, 5000);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [match?.id, match?.team1_id, match?.team1?.name, match?.team2?.name]);

  const triggerScoreFlash = (team: 1 | 2) => {
    setScoreFlash({ team });
    setTimeout(() => setScoreFlash(null), 800);
  };

  const hasTimer = !!station?.timer_duration_seconds;
  const timerEnded = hasTimer && remainingSeconds <= 0 && !!station?.timer_started_at;
  const isPaused = !!station?.timer_started_at && !!station?.timer_paused_at;

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ background: "transparent", fontFamily: "'Inter', sans-serif" }}
    >
      {/* ───────────── ACTIVE MATCH SCOREBOARD ───────────── */}
      <AnimatePresence>
        {match && (
          <motion.div
            key="scoreboard"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
            style={{ minWidth: 560 }}
          >
            {/* Tournament name + phase chip */}
            <div className="flex items-center gap-2">
              {tournamentName && (
                <span
                  className="text-white text-sm font-semibold uppercase tracking-widest px-3 py-0.5 rounded-full"
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  {tournamentName}
                </span>
              )}
              <span
                className="text-white/80 text-xs font-medium uppercase tracking-widest px-3 py-0.5 rounded-full"
                style={{
                  background: "rgba(0,0,0,0.40)",
                  textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                  backdropFilter: "blur(6px)",
                }}
              >
                {phaseLabel(match.phase, match.round_number, match.is_third_place_match)}
              </span>
            </div>

            {/* Main HUD bar */}
            <div
              className="flex items-stretch rounded-2xl overflow-hidden"
              style={{
                background: "rgba(0,0,0,0.72)",
                backdropFilter: "blur(14px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)",
              }}
            >
              {/* Team 1 */}
              <motion.div
                animate={scoreFlash?.team === 1 ? { backgroundColor: ["rgba(34,197,94,0.35)", "rgba(0,0,0,0)"] } : {}}
                transition={{ duration: 0.6 }}
                className="flex items-center gap-4 px-6 py-4"
                style={{ minWidth: 180 }}
              >
                <span
                  className="text-white font-black text-xl leading-tight text-right flex-1"
                  style={{
                    textShadow: "0 2px 12px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,0.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                >
                  {match.team1?.name}
                </span>
                <motion.span
                  key={`t1-${team1Score}`}
                  initial={{ scale: 1.4, color: "#22c55e" }}
                  animate={{ scale: 1, color: "#ffffff" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="font-black text-4xl tabular-nums"
                  style={{ textShadow: "0 2px 16px rgba(0,0,0,1)" }}
                >
                  {team1Score}
                </motion.span>
              </motion.div>

              {/* Center divider + Timer */}
              <div
                className="flex flex-col items-center justify-center px-4 py-2 gap-1"
                style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", borderRight: "1px solid rgba(255,255,255,0.1)", minWidth: 90 }}
              >
                <span className="text-white/30 font-bold text-lg">VS</span>
                {hasTimer && (
                  <motion.span
                    animate={timerEnded ? { opacity: [1, 0.3, 1] } : {}}
                    transition={timerEnded ? { repeat: Infinity, duration: 0.8 } : {}}
                    className="font-mono font-black tabular-nums text-base"
                    style={{
                      color: timerEnded ? "#ef4444" : isPaused ? "#f59e0b" : "#ffffff",
                      textShadow: "0 2px 12px rgba(0,0,0,1)",
                    }}
                  >
                    {formatTime(remainingSeconds)}
                    {isPaused && <span className="text-xs ml-1 text-yellow-400">▐▐</span>}
                  </motion.span>
                )}
              </div>

              {/* Team 2 */}
              <motion.div
                animate={scoreFlash?.team === 2 ? { backgroundColor: ["rgba(34,197,94,0.35)", "rgba(0,0,0,0)"] } : {}}
                transition={{ duration: 0.6 }}
                className="flex items-center gap-4 px-6 py-4"
                style={{ minWidth: 180 }}
              >
                <motion.span
                  key={`t2-${team2Score}`}
                  initial={{ scale: 1.4, color: "#22c55e" }}
                  animate={{ scale: 1, color: "#ffffff" }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="font-black text-4xl tabular-nums"
                  style={{ textShadow: "0 2px 16px rgba(0,0,0,1)" }}
                >
                  {team2Score}
                </motion.span>
                <span
                  className="text-white font-black text-xl leading-tight flex-1"
                  style={{
                    textShadow: "0 2px 12px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,0.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                >
                  {match.team2?.name}
                </span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───────────── NO MATCH → NEXT MATCH BANNER ───────────── */}
      <AnimatePresence>
        {!match && nextMatch && (
          <motion.div
            key="next-match"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.5 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          >
            <span
              className="text-white/60 text-xs font-semibold uppercase tracking-widest"
              style={{ textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}
            >
              Next Match
            </span>
            <div
              className="flex items-center gap-4 px-8 py-4 rounded-2xl"
              style={{
                background: "rgba(0,0,0,0.65)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              }}
            >
              <span
                className="text-white font-black text-2xl"
                style={{ textShadow: "0 2px 10px rgba(0,0,0,1)" }}
              >
                {nextMatch.team1Name}
              </span>
              <span className="text-white/40 font-bold text-lg">vs</span>
              <span
                className="text-white font-black text-2xl"
                style={{ textShadow: "0 2px 10px rgba(0,0,0,1)" }}
              >
                {nextMatch.team2Name}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───────────── GOAL ALERTS (Lower Third) ───────────── */}
      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {goalAlerts.map((alert) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 250, damping: 22 }}
              className="flex items-center gap-3 px-6 py-3 rounded-xl"
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.9), rgba(21,128,61,0.95))",
                boxShadow: "0 4px 30px rgba(34,197,94,0.5), 0 2px 10px rgba(0,0,0,0.7)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <span className="text-2xl">🟠</span>
              <div className="flex flex-col">
                <span
                  className="text-white font-black text-lg uppercase tracking-wide"
                  style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
                >
                  GOAL!
                </span>
                <span
                  className="text-white/90 font-semibold text-sm"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}
                >
                  {alert.playerName} — {alert.teamName}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Station label (top-right corner) */}
      {station && (
        <div
          className="absolute top-4 right-4 text-white/40 text-xs font-semibold uppercase tracking-widest"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
        >
          {station.station_name} {station.station_number}
        </div>
      )}
    </div>
  );
};

export default Overlay;
