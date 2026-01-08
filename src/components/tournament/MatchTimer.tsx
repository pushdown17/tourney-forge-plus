import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface MatchTimerProps {
  stationId: string;
  tournamentId: string;
  matchId: string;
  durationSeconds: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedWhenPaused: number;
  canControl?: boolean;
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
  onTimeEnd
}: MatchTimerProps) => {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationSeconds || 0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedEndSound = useRef(false);

  // Calculate remaining time based on timer state
  const calculateRemaining = useCallback(() => {
    if (!durationSeconds) return durationSeconds || 0;
    
    if (!startedAt) {
      // Timer not started yet
      return durationSeconds;
    }
    
    if (pausedAt) {
      // Timer is paused - calculate based on when it was paused
      const startTime = new Date(startedAt).getTime();
      const pauseTime = new Date(pausedAt).getTime();
      const elapsed = Math.floor((pauseTime - startTime) / 1000) + elapsedWhenPaused;
      return Math.max(0, durationSeconds - elapsed);
    }
    
    // Timer is running
    const startTime = new Date(startedAt).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000) + elapsedWhenPaused;
    return Math.max(0, durationSeconds - elapsed);
  }, [durationSeconds, startedAt, pausedAt, elapsedWhenPaused]);

  // Update timer state
  useEffect(() => {
    const isCurrentlyRunning = startedAt !== null && pausedAt === null;
    setIsRunning(isCurrentlyRunning);
    setRemainingSeconds(calculateRemaining());
    
    // Reset end state if timer is reset
    if (!startedAt) {
      setHasEnded(false);
      hasPlayedEndSound.current = false;
    }
  }, [startedAt, pausedAt, calculateRemaining]);

  // Countdown effect
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);
      
      if (remaining <= 0 && !hasEnded) {
        setHasEnded(true);
        if (!hasPlayedEndSound.current) {
          hasPlayedEndSound.current = true;
          playEndSound();
          onTimeEnd?.();
        }
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [isRunning, calculateRemaining, hasEnded, onTimeEnd]);

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
    const now = new Date().toISOString();
    
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
    const now = new Date().toISOString();
    
    // Calculate total elapsed time including previous pauses
    const startTime = new Date(startedAt!).getTime();
    const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
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
        timer_paused_at: now,
        timer_elapsed_when_paused: totalElapsed
      });
    }
  };

  const resumeTimer = async () => {
    const now = new Date().toISOString();
    
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
        timer_elapsed_when_paused: elapsedWhenPaused
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
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
          {formatTime(remainingSeconds)}
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
      )}
    </div>
  );
};
