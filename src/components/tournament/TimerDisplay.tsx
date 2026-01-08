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
}

export const TimerDisplay = ({
  durationSeconds,
  startedAt,
  pausedAt,
  elapsedWhenPaused,
  compact = false
}: TimerDisplayProps) => {
  const safeDuration = durationSeconds || 0;
  const [remainingSeconds, setRemainingSeconds] = useState<number>(safeDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  // Don't render if no duration is set
  if (!durationSeconds) {
    return null;
  }

  const calculateRemaining = useCallback(() => {
    if (!startedAt) {
      return durationSeconds;
    }
    
    if (pausedAt) {
      // elapsedWhenPaused already contains the TOTAL elapsed time (set during pause)
      return Math.max(0, durationSeconds - elapsedWhenPaused);
    }
    
    const startTime = new Date(startedAt).getTime();
    const now = getSyncedNowMs();
    const elapsed = Math.floor((now - startTime) / 1000) + elapsedWhenPaused;
    return Math.max(0, durationSeconds - elapsed);
  }, [durationSeconds, startedAt, pausedAt, elapsedWhenPaused]);

  useEffect(() => {
    const isCurrentlyRunning = startedAt !== null && pausedAt === null;
    setIsRunning(isCurrentlyRunning);
    setRemainingSeconds(calculateRemaining());
    
    if (!startedAt) {
      setHasEnded(false);
    }
  }, [startedAt, pausedAt, calculateRemaining]);

  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);
      
      if (remaining <= 0) {
        setHasEnded(true);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isRunning, calculateRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
