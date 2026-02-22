import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreInput } from "@/components/ui/score-input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trophy, Lock, Monitor, ClipboardEdit, Radio, Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TimerDisplay } from "./TimerDisplay";

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
  isPlaceholder?: boolean;
  hasAdvancedTeam1?: boolean;
  hasAdvancedTeam2?: boolean;
}

interface TimerState {
  durationSeconds: number;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedWhenPaused: number;
}

interface BracketMatchProps {
  match: Match;
  matchNumber: number;
  isEditing: boolean;
  scores: { team1: string; team2: string };
  isClosed?: boolean;
  isFinal?: boolean;
  isRecentlyCompleted?: boolean;
  advancedTeamId?: string;
  isLocked?: boolean;
  isCompleted?: boolean;
  isCreator?: boolean;
  isLive?: boolean;
  isOnDeck?: boolean;
  isInTheHole?: boolean;
  timerState?: TimerState | null;
  tournamentId?: string;
  team1Players?: string[];
  team2Players?: string[];
  numberOfFields?: number;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveScore: () => void;
  onScoreChange: (team: "team1" | "team2", value: string) => void;
  onMatchClick: () => void;
  onEditScore?: () => void;
  onSendToStation?: () => void;
  onIncrementScore: (teamId: string, teamName: string) => void;
}

export const BracketMatch = ({
  match,
  matchNumber,
  isEditing,
  scores,
  isClosed = false,
  isFinal = false,
  isRecentlyCompleted = false,
  advancedTeamId,
  isLocked = false,
  isCompleted = false,
  isCreator = false,
  isLive = false,
  isOnDeck = false,
  isInTheHole = false,
  timerState,
  tournamentId,
  team1Players = [],
  team2Players = [],
  numberOfFields = 1,
  onStartEdit,
  onCancelEdit,
  onSaveScore,
  onScoreChange,
  onMatchClick,
  onEditScore,
  onSendToStation,
  onIncrementScore,
}: BracketMatchProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isPlaceholder = match.isPlaceholder;
  const isBye = match.team1_id === match.team2_id && match.team1_id !== '';
  const hasTeams = match.team1 && match.team2;
  const hasWinner = !!match.winner_id;
  // A match is locked if it is completed (has a winner) OR if the previous matches are not finished
  const isMatchLocked = isCompleted || isLocked;
  // Only show edit controls if user is the creator
  // Creators can edit completed matches to correct errors
  const canEdit = isCreator && !isClosed && (!isMatchLocked || isCompleted);
  
  return (
    <div className="animate-fade-in flex flex-col">
      {/* Match header */}
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
          M{matchNumber}
        </span>
        {match.field_number && !isBye && numberOfFields > 1 && (
          <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
            C{match.field_number}
          </span>
        )}
        {isLive && timerState?.startedAt && (
          <TimerDisplay
            durationSeconds={timerState.durationSeconds}
            startedAt={timerState.startedAt}
            pausedAt={timerState.pausedAt}
            elapsedWhenPaused={timerState.elapsedWhenPaused}
            compact
          />
        )}
        {isLive && (!timerState || !timerState.startedAt) && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-bold gap-1 border-primary text-primary">
            <Radio className="h-2.5 w-2.5" />
            On Court
          </Badge>
        )}
        {isFinal && (
          <Trophy className="h-3 w-3 text-yellow-500" />
        )}
        {isMatchLocked && !isCompleted && !isLive && (
          <Lock className="h-3 w-3 text-muted-foreground" />
        )}
        {isCompleted && !isLive && (
          <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
            Completed
          </span>
        )}
        {isOnDeck && !isLive && !isCompleted && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-0.5 border-amber-500 text-amber-500">
            <Clock className="h-2.5 w-2.5" />
            On Deck
          </Badge>
        )}
        {isInTheHole && !isLive && !isCompleted && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-0.5 border-muted-foreground text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            In the Hole
          </Badge>
        )}
      </div>

      {/* Match card with Popover */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal={false}>
        <PopoverTrigger asChild>
          <Card
            className={cn(
              "overflow-hidden transition-all duration-300",
              "bg-card/80 backdrop-blur-sm border-border/50",
              !isPlaceholder && "hover:shadow-md hover:border-primary/30 cursor-pointer",
              isMatchLocked && !isCompleted && "opacity-60 cursor-not-allowed",
              hasWinner && "ring-1 ring-primary/30",
              isFinal && "ring-2 ring-yellow-500/50",
              isRecentlyCompleted && "animate-pulse ring-2 ring-primary shadow-lg shadow-primary/30"
            )}
            onClick={(e) => {
              if (isPlaceholder) return;
              if (isMatchLocked && !isCompleted) return;
              // For non-creators, go directly to stats/recap
              if (!isCreator) {
                onMatchClick();
                return;
              }
              // For creators (active or completed matches), show popover
              setPopoverOpen(true);
            }}
          >
            {/* Team 1 */}
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2 border-b border-border/30",
                "transition-all duration-500",
                match.winner_id === match.team1_id && "bg-primary/15",
                advancedTeamId === match.team1_id && "bg-primary/30 animate-[pulse_0.5s_ease-in-out_3]",
                match.hasAdvancedTeam1 && "bg-primary/5"
              )}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {match.winner_id === match.team1_id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  {match.hasAdvancedTeam1 && !match.winner_id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-[pulse_2s_ease-in-out_infinite]" />
                  )}
                  {match.team1?.seed && (
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted/50 px-1 py-0.5 rounded shrink-0">
                      #{match.team1.seed}
                    </span>
                  )}
                  <span className={cn(
                    "text-sm truncate",
                    match.winner_id === match.team1_id && "font-semibold text-primary",
                    match.hasAdvancedTeam1 && !match.winner_id && "font-medium text-primary animate-fade-in",
                    !match.team1?.name && "text-muted-foreground italic"
                  )}>
                    {match.team1?.name || "TBD"}
                  </span>
                </div>
                {team1Players.length > 0 && (
                  <span className="text-[9px] text-muted-foreground leading-tight truncate pl-0.5">
                    {team1Players.join(", ")}
                  </span>
                )}
              </div>
              {match.team1_score !== null && (
                <span className={cn(
                  "text-sm font-mono font-bold ml-2 min-w-[1.5rem] text-center",
                  match.winner_id === match.team1_id && "text-primary"
                )}>
                  {match.team1_score}
                </span>
              )}
            </div>

            {/* Team 2 */}
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2",
                "transition-all duration-500",
                match.winner_id === match.team2_id && "bg-primary/15",
                advancedTeamId === match.team2_id && "bg-primary/30 animate-[pulse_0.5s_ease-in-out_3]",
                match.hasAdvancedTeam2 && "bg-primary/5"
              )}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {!isBye && match.winner_id === match.team2_id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  {match.hasAdvancedTeam2 && !match.winner_id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-[pulse_2s_ease-in-out_infinite]" />
                  )}
                  {!isBye && match.team2?.seed && (
                    <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted/50 px-1 py-0.5 rounded shrink-0">
                      #{match.team2.seed}
                    </span>
                  )}
                  <span className={cn(
                    "text-sm truncate",
                    !isBye && match.winner_id === match.team2_id && "font-semibold text-primary",
                    match.hasAdvancedTeam2 && !match.winner_id && "font-medium text-primary animate-fade-in",
                    isBye ? "text-muted-foreground italic" : (!match.team2?.name && "text-muted-foreground italic")
                  )}>
                    {isBye ? "BYE" : (match.team2?.name || "TBD")}
                  </span>
                </div>
                {team2Players.length > 0 && !isBye && (
                  <span className="text-[9px] text-muted-foreground leading-tight truncate pl-0.5">
                    {team2Players.join(", ")}
                  </span>
                )}
              </div>
              {!isBye && match.team2_score !== null && (
                <span className={cn(
                  "text-sm font-mono font-bold ml-2 min-w-[1.5rem] text-center",
                  match.winner_id === match.team2_id && "text-primary"
                )}>
                  {match.team2_score}
                </span>
              )}
            </div>
          </Card>
        </PopoverTrigger>
        
        {/* Action menu popover */}
        <PopoverContent className="w-48 p-2" align="center">
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                setPopoverOpen(false);
                // Delay to let Radix Popover fully close before opening Dialog
                setTimeout(() => {
                  if (isCompleted && onEditScore) {
                    onEditScore();
                  } else {
                    onMatchClick();
                  }
                }, 100);
              }}
            >
              <ClipboardEdit className="h-4 w-4" />
              {isCompleted ? "Modifier le score" : "Gérer le score"}
            </Button>
            {isCompleted && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setPopoverOpen(false);
                  setTimeout(() => onMatchClick(), 100);
                }}
              >
                <Trophy className="h-4 w-4" />
                Voir le récapitulatif
              </Button>
            )}
            {onSendToStation && !isCompleted && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setPopoverOpen(false);
                  setTimeout(() => onSendToStation(), 100);
                }}
              >
                <Monitor className="h-4 w-4" />
                Envoyer à l'arbitre
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Score edit section - Only display if user is creator and match is not completed */}
      {!isPlaceholder && hasTeams && canEdit && (
        <div className="mt-1.5">
          {isEditing ? (
            <div className="flex gap-1 items-center justify-center bg-muted/30 rounded-md p-1.5">
              <ScoreInput
                compact
                value={parseInt(scores.team1 || "0")}
                onChange={(value) => onScoreChange("team1", value.toString())}
                onIncrement={() => onIncrementScore(match.team1_id, match.team1?.name || "TBD")}
                disabled={!canEdit}
              />
              <span className="text-xs text-muted-foreground font-bold">-</span>
              <ScoreInput
                compact
                value={parseInt(scores.team2 || "0")}
                onChange={(value) => onScoreChange("team2", value.toString())}
                onIncrement={() => onIncrementScore(match.team2_id, match.team2?.name || "TBD")}
                disabled={!canEdit}
              />
              <Button 
                onClick={(e) => { e.stopPropagation(); onSaveScore(); }} 
                size="sm" 
                className="h-6 px-2 text-xs ml-1"
                disabled={!canEdit}
              >
                ✓
              </Button>
              <Button 
                onClick={(e) => { e.stopPropagation(); onCancelEdit(); }} 
                variant="ghost" 
                size="sm" 
                className="h-6 px-1.5 text-xs"
              >
                ✗
              </Button>
            </div>
          ) : (
            <Button
              onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!canEdit}
            >
              {match.team1_score !== null ? "Edit" : "Enter score"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
