import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSyncedNowMs } from "@/lib/serverTime";

interface TimerDisplayProps {
  durationSeconds: number;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedWhenPaused: number;
  compact?: boolean;
  isGoldenGoal?: boolean;
  goldenGoalStartedAt?: string | null;
  goldenGoalElapsedWhenPaused?: number;
}

export const TimerDisplay = ({
  durationSeconds,
  startedAt,
  pausedAt,
  elapsedWhenPaused,
  compact = false,
  isGoldenGoal = false,
  goldenGoalStartedAt = null,
  goldenGoalElapsedWhenPaused = 0,
}: TimerDisplayProps) => {
  const safeDuration = durationSeconds || 0;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(safeDuration);
  const [ggElapsedSeconds, setGgElapsedSeconds] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  // Don't render if no duration is set
  if (!durationSeconds) {
    return null;
  }

  // ─── Golden Goal count-up calculation ───────────────────────────────────────
  const calculateGgElapsed = useCallback(() => {
    if (!goldenGoalStartedAt) {
      // GG paused or not yet started: return accumulated time
      return goldenGoalElapsedWhenPaused;
    }
    const elapsed = (getSyncedNowMs() - new Date(goldenGoalStartedAt).getTime()) / 1000
      + goldenGoalElapsedWhenPaused;
    return Math.max(0, elapsed);
  }, [goldenGoalStartedAt, goldenGoalElapsedWhenPaused]);

  // ─── Countdown calculation ───────────────────────────────────────────────────
  const calculateRemaining = useCallback(() => {
    if (!startedAt) {
      return durationSeconds;
    }
    
    if (pausedAt) {
      return Math.max(0, durationSeconds - elapsedWhenPaused);
    }
    
    const startTime = new Date(startedAt).getTime();
    const now = getSyncedNowMs();
    const elapsed = Math.floor((now - startTime) / 1000) + elapsedWhenPaused;
    return Math.max(0, durationSeconds - elapsed);
  }, [durationSeconds, startedAt, pausedAt, elapsedWhenPaused]);

  // ─── Sync on prop changes ────────────────────────────────────────────────────
  useEffect(() => {
    if (isGoldenGoal) {
      setGgElapsedSeconds(calculateGgElapsed());
    } else {
      const isCurrentlyRunning = startedAt !== null && pausedAt === null;
      setIsRunning(isCurrentlyRunning);
      setRemainingSeconds(calculateRemaining());
      if (!startedAt) setHasEnded(false);
    }
  }, [startedAt, pausedAt, calculateRemaining, isGoldenGoal, goldenGoalStartedAt, goldenGoalElapsedWhenPaused, calculateGgElapsed]);

  // ─── Countdown interval ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isGoldenGoal || !isRunning) return;
    
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);
      if (remaining <= 0) setHasEnded(true);
    }, 100);
    
    return () => clearInterval(interval);
  }, [isRunning, calculateRemaining, isGoldenGoal]);

  // ─── Golden Goal count-up interval ──────────────────────────────────────────
  useEffect(() => {
    if (!isGoldenGoal || !goldenGoalStartedAt) return;

    const interval = setInterval(() => {
      setGgElapsedSeconds(calculateGgElapsed());
    }, 100);

    return () => clearInterval(interval);
  }, [isGoldenGoal, goldenGoalStartedAt, calculateGgElapsed]);

  const formatTime = (seconds: number) => {
    const totalSecs = Math.floor(Math.abs(seconds));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ─── Golden Goal compact badge ───────────────────────────────────────────────
  if (isGoldenGoal && compact) {
    const ggRunning = !!goldenGoalStartedAt;
    return (
      <Badge
        className={cn(
          "font-mono gap-1 border-amber-500/70 text-amber-500 bg-amber-500/10",
          ggRunning && "animate-pulse"
        )}
        variant="outline"
      >
        <Timer className="h-3 w-3" />
        {formatTime(ggElapsedSeconds)}
      </Badge>
    );
  }

  // ─── Countdown compact badge ─────────────────────────────────────────────────
  if (compact) {
    return (
      <Badge 
        variant={hasEnded ? "destructive" : isRunning ? "default" : "secondary"}
        className={cn(
          "font-mono gap-1",
          hasEnded && "animate-pulse"
        )}
      >
        <Timer className="h-3 w-3" />
        {formatTime(remainingSeconds)}
      </Badge>
    );
  }

  const isPaused = startedAt !== null && pausedAt !== null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-md border",
      hasEnded ? "border-destructive bg-destructive/10 animate-pulse" : 
      isRunning ? "border-primary bg-primary/10" : 
      "border-muted bg-muted/20"
    )}>
      <Timer className={cn(
        "h-4 w-4",
        hasEnded ? "text-destructive" : isRunning ? "text-primary" : "text-muted-foreground"
      )} />
      <span className={cn(
        "font-mono font-bold tabular-nums",
        hasEnded ? "text-destructive" : isRunning ? "text-primary" : "text-foreground"
      )}>
        {formatTime(remainingSeconds)}
      </span>
      {isPaused && !hasEnded && (
        <Badge variant="secondary" className="text-xs">
          PAUSE
        </Badge>
      )}
    </div>
  );
};
