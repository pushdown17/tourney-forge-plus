import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BracketNodeProps {
  player1?: string;
  player2?: string;
  score1?: number;
  score2?: number;
  winner?: 1 | 2;
}

export const BracketNode = ({ player1, player2, score1, score2, winner }: BracketNodeProps) => {
  return (
    <Card className={cn(
      "w-full transition-all duration-200 hover:shadow-md",
      "bg-card/50 backdrop-blur-sm border-border/50"
    )}>
      <div className="space-y-0.5 p-1">
        <div className={cn(
          "flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] transition-colors",
          winner === 1 ? "bg-primary/20 font-semibold" : "bg-background/50"
        )}>
          <span className="truncate flex-1">{player1 || 'TBD'}</span>
          {score1 !== undefined && (
            <span className="ml-1 font-mono font-bold min-w-[1rem] text-center">{score1}</span>
          )}
        </div>
        <div className={cn(
          "flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] transition-colors",
          winner === 2 ? "bg-primary/20 font-semibold" : "bg-background/50"
        )}>
          <span className="truncate flex-1">{player2 || 'TBD'}</span>
          {score2 !== undefined && (
            <span className="ml-1 font-mono font-bold min-w-[1rem] text-center">{score2}</span>
          )}
        </div>
      </div>
    </Card>
  );
};
