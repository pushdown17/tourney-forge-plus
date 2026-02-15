import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Timer, Plus, Minus, Settings2 } from "lucide-react";
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
  onTimeEnd
}: MatchTimerProps) => {
  const [remainingMs, setRemainingMs] = useState<number>((durationSeconds || 0) * 1000);
  const [isRunning, setIsRunning] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedEndSound = useRef(false);

  // Calculate remaining time in milliseconds based on timer state
  const calculateRemainingMs = useCallback(() => {
    if (!durationSeconds) return (durationSeconds || 0) * 1000;
    
    if (!startedAt) {
      // Timer not started yet
      return durationSeconds * 1000;
    }
    
    if (pausedAt) {
      // elapsedWhenPaused already contains the TOTAL elapsed time in seconds (set during pause)
      return Math.max(0, (durationSeconds - elapsedWhenPaused) * 1000);
    }
    
    // Timer is running
    const startTime = new Date(startedAt).getTime();
    const now = getSyncedNowMs();
    const elapsedMs = now - startTime + elapsedWhenPaused * 1000;
    return Math.max(0, durationSeconds * 1000 - elapsedMs);
  }, [durationSeconds, startedAt, pausedAt, elapsedWhenPaused]);

  // Update timer state
  useEffect(() => {
    const isCurrentlyRunning = startedAt !== null && pausedAt === null;
    setIsRunning(isCurrentlyRunning);
    setRemainingMs(calculateRemainingMs());
    
    // Reset end state if timer is reset
    if (!startedAt) {
      setHasEnded(false);
      hasPlayedEndSound.current = false;
    }
  }, [startedAt, pausedAt, calculateRemainingMs]);

  // Countdown effect - update more frequently for milliseconds display
  useEffect(() => {
    if (!isRunning) return;
    
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
  }, [isRunning, calculateRemainingMs, hasEnded, onTimeEnd, showMilliseconds]);

  const playEndSound = () => {
    // Create audio context for end sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Play a series of beeps
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
      
      // Triple beep pattern
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
      payload: {
        matchId,
        stationId,
        durationSeconds,
        ...updates
      }
    });
  };

  const startTimer = async () => {
    const now = new Date(getSyncedNowMs()).toISOString();
    
    const { error } = await supabase
      .from('referee_stations')
      .update({
        timer_started_at: now,
        timer_paused_at: null
      } as any)
      .eq('id', stationId);
    
    if (!error) {
      broadcastTimerUpdate({
        action: 'start',
        timer_started_at: now,
        timer_paused_at: null,
        timer_elapsed_when_paused: elapsedWhenPaused
      });
    }
  };

  const pauseTimer = async () => {
    const now = new Date(getSyncedNowMs()).toISOString();
    
    // Calculate total elapsed time including previous pauses
    const startTime = new Date(startedAt!).getTime();
    const currentElapsed = Math.floor((getSyncedNowMs() - startTime) / 1000);
    const totalElapsed = currentElapsed + elapsedWhenPaused;
    
    const { error } = await supabase
      .from('referee_stations')
      .update({
        timer_paused_at: now,
        timer_elapsed_when_paused: totalElapsed
      } as any)
      .eq('id', stationId);
    
    if (!error) {
      broadcastTimerUpdate({
        action: 'pause',
        timer_started_at: startedAt,
        timer_paused_at: now,
        timer_elapsed_when_paused: totalElapsed
      });
    }
  };

  const resumeTimer = async () => {
    const now = new Date(getSyncedNowMs()).toISOString();
    
    // First, get the current elapsed time from DB (set during pause)
    const { data: stationData } = await supabase
      .from('referee_stations')
      .select('timer_elapsed_when_paused')
      .eq('id', stationId)
      .single();
    
    const currentElapsed = stationData?.timer_elapsed_when_paused || elapsedWhenPaused;
    
    const { error } = await supabase
      .from('referee_stations')
      .update({
        timer_started_at: now,
        timer_paused_at: null
      } as any)
      .eq('id', stationId);
    
    if (!error) {
      broadcastTimerUpdate({
        action: 'resume',
        timer_started_at: now,
        timer_paused_at: null,
        timer_elapsed_when_paused: currentElapsed
      });
    }
  };

  const resetTimer = async () => {
    const { error } = await supabase
      .from('referee_stations')
      .update({
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0
      } as any)
      .eq('id', stationId);
    
    if (!error) {
      hasPlayedEndSound.current = false;
      setHasEnded(false);
      broadcastTimerUpdate({
        action: 'reset',
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0
      });
    }
  };

  const adjustTime = async (deltaSeconds: number) => {
    if (!durationSeconds) return;

    const newDuration = Math.max(10, durationSeconds + deltaSeconds);

    const { error } = await supabase
      .from('referee_stations')
      .update({ timer_duration_seconds: newDuration } as any)
      .eq('id', stationId);

    if (!error) {
      broadcastTimerUpdate({
        action: 'adjust',
        durationSeconds: newDuration,
        timer_started_at: startedAt,
        timer_paused_at: pausedAt,
        timer_elapsed_when_paused: elapsedWhenPaused
      });
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

  if (!durationSeconds) {
    return null;
  }

  const isPaused = startedAt !== null && pausedAt !== null;
  const isNotStarted = startedAt === null;

  return (
    <div className={cn(
      "flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors",
      hasEnded ? "border-destructive bg-destructive/10 animate-pulse" : 
      isRunning ? "border-primary bg-primary/5" : 
      "border-muted bg-muted/20"
    )}>
      <div className="flex items-center gap-2">
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
          {/* Time adjustment - hidden behind a toggle to prevent accidental taps */}
          {startedAt && !hasEnded && (
            <AdjustTimeToggle onAdjust={adjustTime} />
          )}

          <div className="flex gap-2">
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
          </div>
        </div>
      )}
    </div>
  );
};

/** Small toggle that reveals -10s / +10s buttons only after tapping a gear icon */
const AdjustTimeToggle = ({ onAdjust }: { onAdjust: (delta: number) => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => setOpen((v) => !v)}
        variant="ghost"
        size="sm"
        className={cn(
          "text-xs gap-1 h-7 px-2 transition-colors",
          open ? "text-primary" : "text-muted-foreground"
        )}
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
