import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Shuffle, Trophy, Loader2 } from "lucide-react";

interface ManualBracketComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  eliminationType: "single" | "double";
  teamsCount: number;
  onSubmit: (orderedTeamIds: string[]) => Promise<void>;
}

interface TeamOption {
  id: string;
  name: string;
}

/**
 * Bracket params (mirror of computeBracketParams in EliminationBracket).
 * Returns the main bracketSize (power of 2) and the number of preliminary play-in
 * matches (extra teams beyond bracketSize / 2 that must play to enter R1).
 */
function computeParams(teamsCount: number) {
  if (teamsCount <= 1) return { bracketSize: 2, numPreliminaryMatches: 0, numByes: 2 - teamsCount };
  const lower = Math.pow(2, Math.floor(Math.log2(teamsCount)));
  if (lower === teamsCount) return { bracketSize: lower, numPreliminaryMatches: 0, numByes: 0 };
  const numPrelim = teamsCount - lower;
  if (numPrelim <= lower / 2) return { bracketSize: lower, numPreliminaryMatches: numPrelim, numByes: 0 };
  return { bracketSize: lower * 2, numPreliminaryMatches: 0, numByes: lower * 2 - teamsCount };
}

function getStandardSeeding(size: number): number[] {
  if (size === 1) return [1];
  const prev = getStandardSeeding(size / 2);
  const result: number[] = [];
  for (const s of prev) {
    result.push(s);
    result.push(size + 1 - s);
  }
  return result;
}

export const ManualBracketComposer = ({
  open,
  onOpenChange,
  tournamentId,
  eliminationType,
  teamsCount,
  onSubmit,
}: ManualBracketComposerProps) => {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [assignments, setAssignments] = useState<(string | null)[]>(() =>
    Array.from({ length: teamsCount }, () => null)
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssignments(Array.from({ length: teamsCount }, () => null));
    fetchTeams();
  }, [open, teamsCount]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournament_teams")
        .select("team:teams!tournament_teams_team_id_fkey(id, name)")
        .eq("tournament_id", tournamentId);
      if (error) throw error;
      const opts: TeamOption[] = (data || [])
        .map((row: any) => row.team)
        .filter(Boolean)
        .sort((a: TeamOption, b: TeamOption) => a.name.localeCompare(b.name));
      setTeams(opts);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les équipes");
    } finally {
      setLoading(false);
    }
  };

  const usedIds = useMemo(() => new Set(assignments.filter(Boolean) as string[]), [assignments]);

  const params = useMemo(() => computeParams(teamsCount), [teamsCount]);

  // Compute R1 pairings preview (mirrors generateBracket logic, simplified)
  const pairingsPreview = useMemo(() => {
    const { bracketSize, numPreliminaryMatches, numByes } = params;
    const seedingOrder = getStandardSeeding(bracketSize);
    const nameOf = (seed: number): string => {
      const teamId = assignments[seed - 1];
      if (!teamId) return `Seed #${seed}`;
      return teams.find((t) => t.id === teamId)?.name ?? `Seed #${seed}`;
    };

    type Row = { label: string; left: string; right: string; kind: "prelim" | "r1" | "bye" };
    const rows: Row[] = [];

    if (numByes > 0) {
      // BYE case (single elim only) — top seeds auto-advance
      for (let i = 0; i < seedingOrder.length; i += 2) {
        const s1 = seedingOrder[i];
        const s2 = seedingOrder[i + 1];
        if (s2 > teamsCount) {
          rows.push({ label: `R1 (BYE)`, left: nameOf(s1), right: "BYE", kind: "bye" });
        } else {
          rows.push({ label: `R1`, left: nameOf(s1), right: nameOf(s2), kind: "r1" });
        }
      }
    } else if (numPreliminaryMatches === 0) {
      for (let i = 0; i < seedingOrder.length; i += 2) {
        const s1 = seedingOrder[i];
        const s2 = seedingOrder[i + 1];
        rows.push({ label: `R1`, left: nameOf(s1), right: nameOf(s2), kind: "r1" });
      }
    } else {
      // Hybrid play-in
      const highStart = bracketSize - numPreliminaryMatches + 1; // first high prelim seed
      const lowStart = bracketSize + 1; // first low prelim seed
      for (let i = 0; i < numPreliminaryMatches; i++) {
        const highSeed = highStart + i;
        const lowSeed = lowStart + (numPreliminaryMatches - 1 - i);
        rows.push({ label: `Play-in`, left: nameOf(highSeed), right: nameOf(lowSeed), kind: "prelim" });
      }
      // Direct R1 / waiting R1 matchups
      for (let i = 0; i < seedingOrder.length; i += 2) {
        const s1 = seedingOrder[i];
        const s2 = seedingOrder[i + 1];
        const s1Prelim = s1 >= highStart;
        const s2Prelim = s2 >= highStart;
        if (!s1Prelim && !s2Prelim) {
          rows.push({ label: `R1`, left: nameOf(s1), right: nameOf(s2), kind: "r1" });
        } else if (!s1Prelim && s2Prelim) {
          rows.push({ label: `R1`, left: nameOf(s1), right: `Gagnant Play-in`, kind: "r1" });
        } else if (s1Prelim && !s2Prelim) {
          rows.push({ label: `R1`, left: `Gagnant Play-in`, right: nameOf(s2), kind: "r1" });
        }
      }
    }
    return rows;
  }, [params, assignments, teams, teamsCount]);

  const setSlot = (index: number, teamId: string) => {
    setAssignments((prev) => {
      const next = [...prev];
      // If team is already used elsewhere, clear that slot
      const existingIdx = next.indexOf(teamId);
      if (existingIdx >= 0 && existingIdx !== index) next[existingIdx] = null;
      next[index] = teamId;
      return next;
    });
  };

  const clearSlot = (index: number) => {
    setAssignments((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const autoFill = () => {
    setAssignments((prev) => {
      const used = new Set(prev.filter(Boolean) as string[]);
      const remaining = teams.filter((t) => !used.has(t.id)).map((t) => t.id);
      // Shuffle
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      const next = [...prev];
      let r = 0;
      for (let i = 0; i < next.length && r < remaining.length; i++) {
        if (!next[i]) next[i] = remaining[r++];
      }
      return next;
    });
  };

  const allAssigned = assignments.every(Boolean);

  const handleSubmit = async () => {
    if (!allAssigned) {
      toast.error("Assigne une équipe à chaque seed");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(assignments as string[]);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur lors de la création du tableau");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Composer le tableau {eliminationType === "double" ? "double élimination" : "élimination directe"}
          </DialogTitle>
          <DialogDescription>
            Assigne chaque équipe à un seed. Les paires du Round&nbsp;1 sont construites automatiquement
            selon l'ordre standard (#1 contre #{teamsCount}, #2 dans la moitié opposée, etc.).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement des équipes…
          </div>
        ) : teams.length < teamsCount ? (
          <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm">
            Pas assez d'équipes dans le tournoi&nbsp;: {teams.length}/{teamsCount}. Ajoute des équipes
            dans l'onglet Teams avant de créer le tableau.
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Seed slots */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Seeds
                </h3>
                <Button variant="ghost" size="sm" onClick={autoFill} className="gap-2">
                  <Shuffle className="h-3.5 w-3.5" />
                  Remplir au hasard
                </Button>
              </div>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {assignments.map((teamId, idx) => {
                  const seed = idx + 1;
                  const available = teams.filter((t) => !usedIds.has(t.id) || t.id === teamId);
                  return (
                    <div key={seed} className="flex items-center gap-2">
                      <Badge variant="outline" className="w-12 justify-center shrink-0">
                        #{seed}
                      </Badge>
                      <Select
                        value={teamId ?? ""}
                        onValueChange={(v) => setSlot(idx, v)}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Choisir une équipe" />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {teamId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => clearSlot(idx)}
                          className="shrink-0 px-2 text-muted-foreground"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pairings preview */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Aperçu des affrontements
              </h3>
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                {pairingsPreview.map((row, i) => (
                  <Card key={i} className="p-2.5 text-sm flex items-center gap-2 bg-secondary/30">
                    <Badge
                      variant={row.kind === "prelim" ? "secondary" : row.kind === "bye" ? "outline" : "default"}
                      className="shrink-0 text-[10px]"
                    >
                      {row.label}
                    </Badge>
                    <span className="flex-1 truncate">{row.left}</span>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <span className="flex-1 truncate text-right">{row.right}</span>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!allAssigned || submitting || loading}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Génération…
              </>
            ) : (
              "Générer le tableau"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
