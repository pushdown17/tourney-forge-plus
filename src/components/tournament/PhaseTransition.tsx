import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, ArrowRight, Info, Settings2 } from "lucide-react";

interface PhaseTransitionProps {
  tournamentId: string;
  currentPhase: string;
  onPhaseChanged: () => void;
  isCreator?: boolean;
}

export const PhaseTransition = ({ tournamentId, currentPhase, onPhaseChanged, isCreator = false }: PhaseTransitionProps) => {
  const [bracketType, setBracketType] = useState<"single" | "double">("single");
  const [teamsForElimination, setTeamsForElimination] = useState<string>("12");
  const [includePreliminary, setIncludePreliminary] = useState(true);
  const [loading, setLoading] = useState(false);

  const teamsCount = parseInt(teamsForElimination) || 0;
  const isPowerOf2 = teamsCount > 0 && Number.isInteger(Math.log2(teamsCount));
  const nextPowerOf2 = teamsCount > 0 ? Math.pow(2, Math.ceil(Math.log2(teamsCount))) : 0;
  const byeCount = nextPowerOf2 - teamsCount;
  const preliminaryMatchCount = byeCount > 0 ? teamsCount - (nextPowerOf2 / 2) : 0;
  const seededTeams = nextPowerOf2 / 2 - preliminaryMatchCount + preliminaryMatchCount * 0; // byes
  const byeSeeds = nextPowerOf2 - teamsCount;
  const wildcardSeeds = teamsCount - byeSeeds;

  const handleStartElimination = async () => {
    if (teamsCount < 2) {
      toast.error("At least 2 teams are required");
      return;
    }
    setLoading(true);
    try {
      const targetPhase = bracketType === "single" ? "single_elimination" : "double_elimination";

      const { error } = await supabase
        .from("tournaments")
        .update({
          current_phase: targetPhase,
          elimination_type: bracketType,
          teams_for_elimination: teamsCount,
        })
        .eq("id", tournamentId);

      if (error) throw error;

      toast.success(`${bracketType === "single" ? "Single" : "Double"} elimination phase activated!`);
      onPhaseChanged();
    } catch (error: any) {
      toast.error("Error activating elimination phase");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Guest mode
  if (!isCreator) {
    return (
      <Card className="glass-card p-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Trophy className="h-12 w-12 text-muted-foreground" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Elimination Phase</h2>
            <p className="text-muted-foreground">
              The elimination phase has not started yet.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              The tournament is currently in {currentPhase === "round_robin" ? "Round Robin" : "Swiss Round"} phase.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-primary/10">
              <Trophy className="h-12 w-12 text-primary" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Start Elimination Phase</h2>
            <p className="text-muted-foreground">
              The {currentPhase === "round_robin" ? "Round Robin" : "Swiss Round"} phase is in progress.
              Configure the elimination bracket below.
            </p>
          </div>
        </div>

        <Separator />

        {/* Configuration */}
        <div className="max-w-lg mx-auto space-y-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <Settings2 className="h-4 w-4" />
            Configuration
          </div>

          {/* Bracket Type */}
          <div className="space-y-2">
            <Label>Bracket Type</Label>
            <Select value={bracketType} onValueChange={(val: "single" | "double") => setBracketType(val)}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Elimination</SelectItem>
                <SelectItem value="double">Double Elimination</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {bracketType === "single"
                ? "One loss and you're out. Fast and decisive."
                : "Teams get a second chance through the losers bracket."}
            </p>
          </div>

          {/* Number of teams */}
          <div className="space-y-2">
            <Label>Number of qualifying teams</Label>
            <Input
              type="number"
              min="2"
              max="64"
              placeholder="e.g., 8, 12, 16..."
              value={teamsForElimination}
              onChange={(e) => setTeamsForElimination(e.target.value)}
              className="bg-secondary/50"
            />
            <p className="text-xs text-muted-foreground">
              Teams are seeded automatically from Overall Standings.
            </p>
          </div>

          {/* Preliminary Round Toggle */}
          {teamsCount > 0 && !isPowerOf2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="preliminary" className="flex items-center gap-2">
                  Include Preliminary Round (Wildcards)
                </Label>
                <Switch
                  id="preliminary"
                  checked={includePreliminary}
                  onCheckedChange={setIncludePreliminary}
                />
              </div>

              {includePreliminary && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium text-foreground">
                        Preliminary Round — {preliminaryMatchCount} match{preliminaryMatchCount > 1 ? "es" : ""}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Seeds 1–{byeSeeds}</span> will receive a <span className="font-semibold text-primary">BYE</span> and advance directly to the main bracket.
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold text-foreground">Seeds {byeSeeds + 1}–{teamsCount}</span> will play a knockout match to enter the main bracket.
                      </p>
                      {bracketType === "double" && (
                        <p className="text-muted-foreground mt-1">
                          The {preliminaryMatchCount} winner{preliminaryMatchCount > 1 ? "s" : ""} will join seeds 1–{byeSeeds} in the <span className="font-semibold text-foreground">Winners Bracket</span>.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!includePreliminary && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      {byeCount} team{byeCount > 1 ? "s" : ""} will receive a bye in round 1 to fill the bracket to {nextPowerOf2}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Power of 2 info */}
          {teamsCount > 0 && isPowerOf2 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  ✅ Perfect bracket — {teamsCount} teams, no byes needed.
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Summary */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2 text-sm">
            <p className="font-medium">Summary</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• <span className="text-foreground">{bracketType === "single" ? "Single" : "Double"} Elimination</span></li>
              <li>• <span className="text-foreground">{teamsCount}</span> qualifying teams</li>
              {!isPowerOf2 && teamsCount > 0 && (
                <li>• <span className="text-foreground">{includePreliminary ? `${preliminaryMatchCount} preliminary match${preliminaryMatchCount > 1 ? "es" : ""}` : `${byeCount} bye${byeCount > 1 ? "s" : ""}`}</span></li>
              )}
              <li>• Seeding from <span className="text-foreground">Overall Standings</span></li>
            </ul>
          </div>

          {/* Start Button */}
          <Button
            onClick={handleStartElimination}
            disabled={loading || teamsCount < 2}
            className="w-full"
            size="lg"
          >
            {loading ? (
              "Activating..."
            ) : (
              <>
                Start Elimination Phase
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};
