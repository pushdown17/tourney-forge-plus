import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Timer, Plus, Minus, Settings2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getSyncedNowMs } from "@/lib/serverTime";

interface MatchTimerProps {
  stationId: string;
  tournamentId: string;
  matchId: string;
  durationSeconds: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedWhenPaused: number;
  canControl?: boolean;
  showMilliseconds?: boolean;
  onTimeEnd?: () => void;
  onDurationChange?: (newDuration: number) => void;
  // Golden Goal props
  isGoldenGoal?: boolean;
  goldenGoalStartedAt?: string | null;
  goldenGoalPausedAt?: string | null;
  onGoldenGoalStart?: () => void;
  onGoldenGoalPause?: () => void;
  onGoldenGoalResume?: () => void;
  isEliminationPhase?: boolean;
  isTied?: boolean;
  goldenGoalFrozen?: boolean;
}

export const MatchTimer = ({
  stationId,
  tournamentId,
  matchId,
  durationSeconds,
  startedAt,
  pausedAt,
  elapsedWhenPaused,
  canControl = false,
  showMilliseconds = false,
  onTimeEnd,
  onDurationChange,
  isGoldenGoal = false,
  goldenGoalStartedAt = null,
  goldenGoalPausedAt = null,
  onGoldenGoalStart,
  onGoldenGoalPause,
  onGoldenGoalResume,
  isEliminationPhase = false,
  isTied = false,
  goldenGoalFrozen = false,
}: MatchTimerProps) => {
  const [remainingMs, setRemainingMs] = useState<number>((durationSeconds || 0) * 1000);
  const [isRunning, setIsRunning] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  // Golden Goal: elapsed seconds since GG started (count-up)
  const [ggElapsedMs, setGgElapsedMs] = useState<number>(0);

  const hasPlayedEndSound = useRef(false);

  const elapsedWhenPausedRef = useRef(elapsedWhenPaused);
  useEffect(() => {
    elapsedWhenPausedRef.current = elapsedWhenPaused;
  }, [elapsedWhenPaused]);

  const startedAtRef = useRef(startedAt);
  const pausedAtRef = useRef(pausedAt);
  useEffect(() => { startedAtRef.current = startedAt; }, [startedAt]);
  useEffect(() => { pausedAtRef.current = pausedAt; }, [pausedAt]);

  const calculateRemainingMs = useCallback(() => {
    if (!durationSeconds) return (durationSeconds || 0) * 1000;
    if (!startedAt) return durationSeconds * 1000;
    if (pausedAt) return Math.max(0, (durationSeconds - elapsedWhenPaused) * 1000);
    const startTime = new Date(startedAt).getTime();
    const now = getSyncedNowMs();
    const elapsedMs = now - startTime + elapsedWhenPaused * 1000;
    return Math.max(0, durationSeconds * 1000 - elapsedMs);
  }, [durationSeconds, startedAt, pausedAt, elapsedWhenPaused]);

  const calculateGgElapsedMs = useCallback(() => {
    if (!goldenGoalStartedAt) return 0;
    if (goldenGoalPausedAt) {
      // Use the frozen elapsed value when paused
      return 0; // will be computed from ref below
    }
    return getSyncedNowMs() - new Date(goldenGoalStartedAt).getTime();
  }, [goldenGoalStartedAt, goldenGoalPausedAt]);

  // Sync state when props change
  useEffect(() => {
    if (isGoldenGoal) return; // GG mode handled separately
    const isCurrentlyRunning = startedAt !== null && pausedAt === null;
    setIsRunning(isCurrentlyRunning);
    setRemainingMs(calculateRemainingMs());
    if (!startedAt) {
      setHasEnded(false);
      hasPlayedEndSound.current = false;
    }
  }, [startedAt, pausedAt, calculateRemainingMs, isGoldenGoal]);

  // Countdown for normal mode
  useEffect(() => {
    if (!isRunning || isGoldenGoal) return;
    const interval = setInterval(() => {
      const remaining = calculateRemainingMs();
      setRemainingMs(remaining);
      if (remaining <= 0 && !hasEnded) {
        setHasEnded(true);
        if (!hasPlayedEndSound.current) {
          hasPlayedEndSound.current = true;
          playEndSound();
          onTimeEnd?.();
        }
      }
    }, showMilliseconds ? 50 : 100);
    return () => clearInterval(interval);
  }, [isRunning, calculateRemainingMs, hasEnded, onTimeEnd, showMilliseconds, isGoldenGoal]);

  // Count-up for Golden Goal mode
  useEffect(() => {
    if (!isGoldenGoal || !goldenGoalStartedAt || goldenGoalFrozen) return;
    setGgElapsedMs(calculateGgElapsedMs());
    const interval = setInterval(() => {
      setGgElapsedMs(calculateGgElapsedMs());
    }, 100);
    return () => clearInterval(interval);
  }, [isGoldenGoal, goldenGoalStartedAt, goldenGoalFrozen, calculateGgElapsedMs]);

  // Freeze GG timer when a goal is scored
  useEffect(() => {
    if (goldenGoalFrozen && goldenGoalStartedAt) {
      setGgElapsedMs(calculateGgElapsedMs());
    }
  }, [goldenGoalFrozen, goldenGoalStartedAt, calculateGgElapsedMs]);

  const playEndSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playBeep = (delay: number, frequency: number = 880) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + delay + 0.3);
        oscillator.start(audioContext.currentTime + delay);
        oscillator.stop(audioContext.currentTime + delay + 0.3);
      };
      playBeep(0, 880);
      playBeep(0.4, 880);
      playBeep(0.8, 1100);
    } catch (error) {
      console.error('Error playing end sound:', error);
    }
  };

  const broadcastTimerUpdate = async (updates: any) => {
    const channel = supabase.channel(`tournament-live-${tournamentId}`);
    await channel.send({
      type: 'broadcast',
      event: 'timer_update',
      payload: { matchId, stationId, durationSeconds, ...updates }
    });
  };

  const startTimer = async () => {
    const now = new Date(getSyncedNowMs()).toISOString();
    const { error } = await supabase
      .from('referee_stations')
      .update({ timer_started_at: now, timer_paused_at: null } as any)
      .eq('id', stationId);
    if (!error) {
      broadcastTimerUpdate({ action: 'start', timer_started_at: now, timer_paused_at: null, timer_elapsed_when_paused: elapsedWhenPaused });
    }
  };

  const pauseTimer = async () => {
    const now = new Date(getSyncedNowMs()).toISOString();
    const currentStartedAt = startedAtRef.current;
    const currentElapsedBase = elapsedWhenPausedRef.current;
    if (!currentStartedAt) return;
    const startTime = new Date(currentStartedAt).getTime();
    const runningElapsed = (getSyncedNowMs() - startTime) / 1000;
    const totalElapsed = runningElapsed + currentElapsedBase;
    const { error } = await supabase
      .from('referee_stations')
      .update({ timer_paused_at: now, timer_elapsed_when_paused: totalElapsed } as any)
      .eq('id', stationId);
    if (!error) {
      elapsedWhenPausedRef.current = totalElapsed;
      broadcastTimerUpdate({ action: 'pause', timer_started_at: currentStartedAt, timer_paused_at: now, timer_elapsed_when_paused: totalElapsed });
    }
  };

  const resumeTimer = async () => {
    const now = new Date(getSyncedNowMs()).toISOString();
    const currentElapsed = elapsedWhenPausedRef.current;
    const { error } = await supabase
      .from('referee_stations')
      .update({ timer_started_at: now, timer_paused_at: null } as any)
      .eq('id', stationId);
    if (!error) {
      startedAtRef.current = now;
      pausedAtRef.current = null;
      broadcastTimerUpdate({ action: 'resume', timer_started_at: now, timer_paused_at: null, timer_elapsed_when_paused: currentElapsed });
    }
  };

  const resetTimer = async () => {
    const { error } = await supabase
      .from('referee_stations')
      .update({ timer_started_at: null, timer_paused_at: null, timer_elapsed_when_paused: 0, timer_total_adjusted: 0 } as any)
      .eq('id', stationId);
    if (!error) {
      hasPlayedEndSound.current = false;
      setHasEnded(false);
      broadcastTimerUpdate({ action: 'reset', timer_started_at: null, timer_paused_at: null, timer_elapsed_when_paused: 0 });
    }
  };

  const adjustTime = async (deltaSeconds: number) => {
    if (!durationSeconds) return;
    const newDuration = Math.max(10, durationSeconds + deltaSeconds);
    const { data: currentStation } = await supabase
      .from('referee_stations')
      .select('timer_total_adjusted')
      .eq('id', stationId)
      .single();
    const currentAdjusted = Number((currentStation as any)?.timer_total_adjusted || 0);
    const newTotalAdjusted = currentAdjusted + deltaSeconds;
    const { error } = await supabase
      .from('referee_stations')
      .update({ timer_duration_seconds: newDuration, timer_total_adjusted: newTotalAdjusted } as any)
      .eq('id', stationId);
    if (!error) {
      onDurationChange?.(newDuration);
      broadcastTimerUpdate({ action: 'adjust', durationSeconds: newDuration, timer_started_at: startedAt, timer_paused_at: pausedAt, timer_elapsed_when_paused: elapsedWhenPaused });
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    if (showMilliseconds) {
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!durationSeconds && !isGoldenGoal) return null;

  const isPaused = startedAt !== null && pausedAt !== null;
  const isNotStarted = startedAt === null;

  // Show Golden Goal mode UI when active
  if (isGoldenGoal) {
    return (
      <div className={cn(
        "flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors",
        "border-accent bg-accent/10 animate-pulse"
      )}>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <Zap className="h-5 w-5 text-accent" />
          <span className="text-4xl font-mono font-bold tabular-nums text-accent">
            {formatTime(ggElapsedMs)}
          </span>
          <Badge className="animate-pulse font-bold tracking-widest bg-accent text-accent-foreground border-transparent">
            ⚡ GOLDEN GOAL
          </Badge>
          {goldenGoalFrozen && (
            <Badge variant="destructive" className="animate-pulse">
              BUT ! 🏆
            </Badge>
          )}
        </div>
        {!goldenGoalStartedAt && canControl && (
          <p className="text-sm text-accent/80 font-medium">En attente du démarrage...</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors",
      hasEnded ? "border-destructive bg-destructive/10 animate-pulse" :
      isRunning ? "border-primary bg-primary/5" :
      "border-muted bg-muted/20"
    )}>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <Timer className={cn(
          "h-5 w-5",
          hasEnded ? "text-destructive" : isRunning ? "text-primary" : "text-muted-foreground"
        )} />
        <span className={cn(
          "text-4xl font-mono font-bold tabular-nums",
          hasEnded ? "text-destructive" : isRunning ? "text-primary" : "text-foreground"
        )}>
          {formatTime(remainingMs)}
        </span>
        {hasEnded && (
          <Badge variant="destructive" className="animate-pulse">
            TEMPS ÉCOULÉ
          </Badge>
        )}
        {isRunning && !hasEnded && (
          <Badge variant="default" className="bg-primary">
            EN COURS
          </Badge>
        )}
        {isPaused && (
          <Badge variant="secondary">
            PAUSE
          </Badge>
        )}
      </div>

      {canControl && (
        <div className="flex flex-col items-center gap-2">
          {startedAt && !hasEnded && <AdjustTimeToggle onAdjust={adjustTime} />}

          <div className="flex gap-2 flex-wrap justify-center">
            {isNotStarted && (
              <Button onClick={startTimer} size="lg" className="gap-2">
                <Play className="h-5 w-5" />
                Démarrer
              </Button>
            )}
            {isRunning && !hasEnded && (
              <Button onClick={pauseTimer} variant="outline" size="lg" className="gap-2">
                <Pause className="h-5 w-5" />
                Pause
              </Button>
            )}
            {isPaused && !hasEnded && (
              <Button onClick={resumeTimer} size="lg" className="gap-2">
                <Play className="h-5 w-5" />
                Reprendre
              </Button>
            )}
            {(isPaused || hasEnded) && (
              <Button onClick={resetTimer} variant="secondary" size="lg" className="gap-2">
                <RotateCcw className="h-5 w-5" />
                Reset
              </Button>
            )}

            {/* Golden Goal trigger: only for elimination phases, after time ended, when tied */}
            {hasEnded && isEliminationPhase && isTied && !isGoldenGoal && onGoldenGoalStart && (
              <Button
                onClick={onGoldenGoalStart}
                size="lg"
                className="gap-2 font-bold bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                <Zap className="h-5 w-5" />
                Démarrer Golden Goal
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AdjustTimeToggle = ({ onAdjust }: { onAdjust: (delta: number) => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => setOpen((v) => !v)}
        variant="ghost"
        size="sm"
        className={cn("text-xs gap-1 h-7 px-2 transition-colors", open ? "text-primary" : "text-muted-foreground")}
      >
        <Settings2 className="h-3.5 w-3.5" />
        {!open && <span>Ajuster</span>}
      </Button>
      {open && (
        <Fragment>
          <Button
            onClick={() => onAdjust(-10)}
            variant="outline"
            size="sm"
            className="text-xs gap-1 h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Minus className="h-3 w-3" />
            10s
          </Button>
          <Button
            onClick={() => onAdjust(10)}
            variant="outline"
            size="sm"
            className="text-xs gap-1 h-7 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Plus className="h-3 w-3" />
            10s
          </Button>
        </Fragment>
      )}
    </div>
  );
};
