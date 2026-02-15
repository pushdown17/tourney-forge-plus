import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Target, Trophy, Ban, Clock, Minus } from "lucide-react";

interface PlayerActionPopoverProps {
  playerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: {
    goals: number;
    assists: number;
    fouls: number;
    penalty_30s: number;
    penalty_1m: number;
    penalty_2m: number;
  };
  onStatChange: (stat: string, delta: number) => void;
}

export const PlayerActionPopover = ({
  playerName,
  open,
  onOpenChange,
  stats,
  onStatChange,
}: PlayerActionPopoverProps) => {
  const actions = [
    { key: "goals", label: "But", icon: <Target className="h-5 w-5" />, value: stats.goals, color: "text-primary" },
    { key: "assists", label: "Passe", icon: <Trophy className="h-5 w-5" />, value: stats.assists, color: "text-blue-500" },
    { key: "fouls", label: "Faute", icon: <Ban className="h-5 w-5" />, value: stats.fouls, color: "text-orange-500" },
  ];

  const penalties = [
    { key: "penalty_30s", label: "30s", value: stats.penalty_30s, color: "bg-yellow-500/20 text-yellow-600" },
    { key: "penalty_1m", label: "1min", value: stats.penalty_1m, color: "bg-orange-500/20 text-orange-600" },
    { key: "penalty_2m", label: "2min", value: stats.penalty_2m, color: "bg-red-500/20 text-red-600" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px] p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-center text-lg">{playerName}</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2 space-y-3">
          {/* Main actions */}
          <div className="grid grid-cols-3 gap-2">
            {actions.map((action) => (
              <div key={action.key} className="flex flex-col items-center gap-1">
                <button
                  className={`w-full flex flex-col items-center gap-1 p-3 rounded-lg border bg-card hover:bg-muted transition-colors active:scale-95 ${action.color}`}
                  onClick={() => {
                    onStatChange(action.key, 1);
                  }}
                >
                  {action.icon}
                  <span className="text-xs font-medium">{action.label}</span>
                </button>
                {action.value > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold">{action.value}</span>
                    <button
                      className="p-0.5 rounded hover:bg-muted"
                      onClick={() => onStatChange(action.key, -1)}
                    >
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Penalties */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Pénalités</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {penalties.map((pen) => (
                <div key={pen.key} className="flex flex-col items-center gap-1">
                  <button
                    className={`w-full text-center py-2 px-3 rounded-lg border text-sm font-medium transition-colors active:scale-95 ${
                      pen.value > 0 ? pen.color : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => onStatChange(pen.key, 1)}
                  >
                    {pen.label}
                  </button>
                  {pen.value > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold">{pen.value}</span>
                      <button
                        className="p-0.5 rounded hover:bg-muted"
                        onClick={() => onStatChange(pen.key, -1)}
                      >
                        <Minus className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 pt-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
