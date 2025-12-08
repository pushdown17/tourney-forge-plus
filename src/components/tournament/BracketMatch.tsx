import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreInput } from "@/components/ui/score-input";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

interface Team {
  id: string;
  name: string;
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
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveScore: () => void;
  onScoreChange: (team: "team1" | "team2", value: string) => void;
  onMatchClick: () => void;
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
  onStartEdit,
  onCancelEdit,
  onSaveScore,
  onScoreChange,
  onMatchClick,
  onIncrementScore,
}: BracketMatchProps) => {
  const isPlaceholder = match.isPlaceholder;
  const hasTeams = match.team1 && match.team2;
  const hasWinner = !!match.winner_id;
  
  return (
    <div className="animate-fade-in">
      {/* Match header */}
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
          M{matchNumber}
        </span>
        {match.field_number && (
          <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
            T{match.field_number}
          </span>
        )}
        {isFinal && (
          <Trophy className="h-3 w-3 text-yellow-500" />
        )}
      </div>

      {/* Match card */}
      <Card
        className={cn(
          "overflow-hidden transition-all duration-300",
          "bg-card/80 backdrop-blur-sm border-border/50",
          !isPlaceholder && "hover:shadow-md hover:border-primary/30 cursor-pointer",
          hasWinner && "ring-1 ring-primary/30",
          isFinal && "ring-2 ring-yellow-500/50",
          isRecentlyCompleted && "animate-pulse ring-2 ring-primary shadow-lg shadow-primary/30"
        )}
        onClick={() => !isPlaceholder && onMatchClick()}
      >
        {/* Team 1 */}
        <div
          className={cn(
            "flex items-center justify-between px-3 py-2 border-b border-border/30",
            "transition-all duration-500",
            match.winner_id === match.team1_id && "bg-primary/15",
            advancedTeamId === match.team1_id && "bg-primary/30 animate-[pulse_0.5s_ease-in-out_3]"
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {match.winner_id === match.team1_id && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            )}
            <span className={cn(
              "text-sm truncate",
              match.winner_id === match.team1_id && "font-semibold text-primary",
              !match.team1?.name && "text-muted-foreground italic"
            )}>
              {match.team1?.name || "TBD"}
            </span>
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
            advancedTeamId === match.team2_id && "bg-primary/30 animate-[pulse_0.5s_ease-in-out_3]"
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {match.winner_id === match.team2_id && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            )}
            <span className={cn(
              "text-sm truncate",
              match.winner_id === match.team2_id && "font-semibold text-primary",
              !match.team2?.name && "text-muted-foreground italic"
            )}>
              {match.team2?.name || "TBD"}
            </span>
          </div>
          {match.team2_score !== null && (
            <span className={cn(
              "text-sm font-mono font-bold ml-2 min-w-[1.5rem] text-center",
              match.winner_id === match.team2_id && "text-primary"
            )}>
              {match.team2_score}
            </span>
          )}
        </div>
      </Card>

      {/* Score edit section */}
      {!isPlaceholder && hasTeams && (
        <div className="mt-1.5">
          {isEditing ? (
            <div className="flex gap-1 items-center justify-center bg-muted/30 rounded-md p-1.5">
              <ScoreInput
                compact
                value={parseInt(scores.team1 || "0")}
                onChange={(value) => onScoreChange("team1", value.toString())}
                onIncrement={() => onIncrementScore(match.team1_id, match.team1?.name || "TBD")}
                disabled={isClosed}
              />
              <span className="text-xs text-muted-foreground font-bold">-</span>
              <ScoreInput
                compact
                value={parseInt(scores.team2 || "0")}
                onChange={(value) => onScoreChange("team2", value.toString())}
                onIncrement={() => onIncrementScore(match.team2_id, match.team2?.name || "TBD")}
                disabled={isClosed}
              />
              <Button 
                onClick={(e) => { e.stopPropagation(); onSaveScore(); }} 
                size="sm" 
                className="h-6 px-2 text-xs ml-1"
                disabled={isClosed}
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
              disabled={isClosed}
            >
              {match.team1_score !== null ? "Modifier" : "Entrer score"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
