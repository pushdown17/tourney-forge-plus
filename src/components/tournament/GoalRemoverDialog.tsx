import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus } from "lucide-react";

interface Player {
  id: string;
  name: string;
  goals?: number;
}

interface GoalRemoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  players: Player[];
  onSelectPlayer: (playerId: string) => void;
}

export const GoalRemoverDialog = ({
  open,
  onOpenChange,
  teamName,
  players,
  onSelectPlayer,
}: GoalRemoverDialogProps) => {
  // Filter players who have at least 1 goal
  const playersWithGoals = players.filter(p => (p.goals || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove goal from {teamName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {playersWithGoals.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No players with goals to remove
            </p>
          ) : (
            playersWithGoals.map((player) => (
              <Button
                key={player.id}
                variant="outline"
                className="w-full justify-between"
                onClick={() => {
                  onSelectPlayer(player.id);
                  onOpenChange(false);
                }}
              >
                <span>{player.name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span>{player.goals} goals</span>
                  <Minus className="h-4 w-4" />
                </span>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
