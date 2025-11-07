import { Card } from "@/components/ui/card";

interface BracketNodeProps {
  player1?: string;
  player2?: string;
  score1?: number;
  score2?: number;
  winner?: 1 | 2;
}

export const BracketNode = ({ player1, player2, score1, score2, winner }: BracketNodeProps) => {
  return (
    <Card className="glass-card overflow-hidden w-64 hover:border-primary/50 transition-all duration-300">
      {/* Player 1 */}
      <div className={`p-3 border-b flex justify-between items-center ${
        winner === 1 ? 'bg-primary/20' : 'bg-card'
      }`}>
        <span className={`font-medium ${winner === 1 ? 'text-primary' : ''}`}>
          {player1 || 'TBD'}
        </span>
        {score1 !== undefined && (
          <span className={`font-bold ${winner === 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            {score1}
          </span>
        )}
      </div>
      
      {/* Player 2 */}
      <div className={`p-3 flex justify-between items-center ${
        winner === 2 ? 'bg-primary/20' : 'bg-card'
      }`}>
        <span className={`font-medium ${winner === 2 ? 'text-primary' : ''}`}>
          {player2 || 'TBD'}
        </span>
        {score2 !== undefined && (
          <span className={`font-bold ${winner === 2 ? 'text-primary' : 'text-muted-foreground'}`}>
            {score2}
          </span>
        )}
      </div>
    </Card>
  );
};
