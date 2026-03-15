import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Wand2, CheckCircle, Clock } from "lucide-react";

interface RefereesTabProps {
  tournamentId: string;
  isCreator?: boolean;
  isClosed?: boolean;
  numberOfGroups?: number;
}

interface MatchWithReferee {
  id: string;
  round_number: number;
  team1_id: string;
  team2_id: string;
  team1_score: number | null;
  team2_score: number | null;
  group_name: string | null;
  team1_name: string;
  team2_name: string;
  referee_id: string | null;
  referee_db_id: string | null;
  referee_team_name: string | null;
  referee_status: "pending" | "present" | null;
  match_index: number; // global order index within group
}

// ── Algorithm ──────────────────────────────────────────────────────────────────
/**
 * Assigns a referee team (from the opposite group) to each match.
 * Constraints:
 *  - Cross-group: referee must be from the opposite group
 *  - Rest: a team cannot referee the match immediately before or after its own match
 *  - Fair rotation: distribute assignments as evenly as possible (max diff = 1)
 */
function assignReferees(
  matches: { id: string; team1_id: string; team2_id: string; group_name: string | null }[],
  groupedTeams: Record<string, string[]> // groupName -> teamId[]
): Record<string, string> {
  // We only handle exactly 2 groups
  const groupNames = Object.keys(groupedTeams);
  if (groupNames.length !== 2) return {};

  const [groupA, groupB] = groupNames;
  const matchesA = matches.filter(m => m.group_name === groupA);
  const matchesB = matches.filter(m => m.group_name === groupB);

  const result: Record<string, string> = {}; // matchId -> refereeTeamId

  function assignGroup(
    targetMatches: typeof matches,
    candidateTeams: string[]
  ) {
    // Count assignments per candidate team
    const counts: Record<string, number> = {};
    candidateTeams.forEach(t => (counts[t] = 0));

    for (let i = 0; i < targetMatches.length; i++) {
      const match = targetMatches[i];
      const prevMatch = i > 0 ? targetMatches[i - 1] : null;
      const nextMatch = i < targetMatches.length - 1 ? targetMatches[i + 1] : null;

      // Build list of teams "busy" around this slot (playing prev or next match)
      const busyTeams = new Set<string>();
      if (prevMatch) {
        busyTeams.add(prevMatch.team1_id);
        busyTeams.add(prevMatch.team2_id);
      }
      if (nextMatch) {
        busyTeams.add(nextMatch.team1_id);
        busyTeams.add(nextMatch.team2_id);
      }

      // Filter available candidates: not busy, from opposite group
      const available = candidateTeams.filter(t => !busyTeams.has(t));

      if (available.length === 0) {
        // Fallback: relax rest constraint, pick least-assigned
        const sorted = [...candidateTeams].sort((a, b) => counts[a] - counts[b]);
        const pick = sorted[0];
        result[match.id] = pick;
        counts[pick]++;
      } else {
        // Pick the least-assigned available team
        available.sort((a, b) => counts[a] - counts[b]);
        const pick = available[0];
        result[match.id] = pick;
        counts[pick]++;
      }
    }
  }

  assignGroup(matchesA, groupedTeams[groupB]);
  assignGroup(matchesB, groupedTeams[groupA]);

  return result;
}

// ───────────────────────────────────────────────────────────────────────────────

export const RefereesTab = ({
  tournamentId,
  isCreator = false,
  isClosed = false,
  numberOfGroups = 1,
}: RefereesTabProps) => {
  const [matches, setMatches] = useState<MatchWithReferee[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch tournament teams with group info
      const { data: ttData, error: ttError } = await supabase
        .from("tournament_teams")
        .select("id, team_id, group_name, team:teams(id, name)")
        .eq("tournament_id", tournamentId);

      if (ttError) throw ttError;

      // Build groupName -> teamIds map
      const groupedTeams: Record<string, string[]> = {};
      const teamNameMap: Record<string, string> = {};

      (ttData || []).forEach((tt: any) => {
        const gName = tt.group_name || "Default";
        if (!groupedTeams[gName]) groupedTeams[gName] = [];
        groupedTeams[gName].push(tt.team_id);
        if (tt.team) teamNameMap[tt.team_id] = tt.team.name;
      });

      // 2. Fetch round-robin matches (phase = round_robin), ordered by round then created_at
      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("id, round_number, team1_id, team2_id, team1_score, team2_score, tournament_team1_id, tournament_team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin")
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (matchError) throw matchError;

      // 3. Fetch existing referee assignments
      const { data: refData, error: refError } = await supabase
        .from("match_referees")
        .select("id, match_id, referee_team_id, status, team:teams(id, name)")
        .eq("tournament_id", tournamentId);

      if (refError) throw refError;

      const refMap: Record<string, { id: string; teamId: string; teamName: string; status: "pending" | "present" }> = {};
      (refData || []).forEach((r: any) => {
        refMap[r.match_id] = {
          id: r.id,
          teamId: r.referee_team_id,
          teamName: r.team?.name || "Unknown",
          status: r.status,
        };
      });

      // 4. Determine group per match via tournament_team lookup
      const ttGroupMap: Record<string, string> = {};
      (ttData || []).forEach((tt: any) => {
        ttGroupMap[tt.team_id] = tt.group_name || "Default";
      });

      // 5. Build enriched matches, grouped by group_name
      const groupIndexCounters: Record<string, number> = {};
      const enriched: MatchWithReferee[] = (matchData || []).map((m: any) => {
        const groupName = ttGroupMap[m.team1_id] || "Default";
        if (!groupIndexCounters[groupName]) groupIndexCounters[groupName] = 0;
        const idx = groupIndexCounters[groupName]++;
        const ref = refMap[m.id];
        return {
          id: m.id,
          round_number: m.round_number,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
          team1_score: m.team1_score,
          team2_score: m.team2_score,
          group_name: groupName,
          team1_name: teamNameMap[m.team1_id] || "TBD",
          team2_name: teamNameMap[m.team2_id] || "TBD",
          referee_id: ref?.teamId || null,
          referee_db_id: ref?.id || null,
          referee_team_name: ref?.teamName || null,
          referee_status: ref?.status || null,
          match_index: idx,
        };
      });

      setMatches(enriched);
    } catch (err: any) {
      toast.error("Erreur lors du chargement des arbitres");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Re-fetch fresh match + team data for the algorithm
      const { data: ttData } = await supabase
        .from("tournament_teams")
        .select("team_id, group_name")
        .eq("tournament_id", tournamentId);

      const { data: matchData } = await supabase
        .from("matches")
        .select("id, team1_id, team2_id, tournament_team1_id, tournament_team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin")
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (!ttData || !matchData) throw new Error("Missing data");

      const ttGroupMap: Record<string, string> = {};
      const groupedTeams: Record<string, string[]> = {};
      ttData.forEach((tt: any) => {
        const g = tt.group_name || "Default";
        ttGroupMap[tt.team_id] = g;
        if (!groupedTeams[g]) groupedTeams[g] = [];
        groupedTeams[g].push(tt.team_id);
      });

      const matchesWithGroup = matchData.map((m: any) => ({
        ...m,
        group_name: ttGroupMap[m.team1_id] || "Default",
      }));

      const assignments = assignReferees(matchesWithGroup, groupedTeams);

      // Upsert all assignments
      const upsertRows = Object.entries(assignments).map(([matchId, refTeamId]) => ({
        tournament_id: tournamentId,
        match_id: matchId,
        referee_team_id: refTeamId,
        status: "pending" as const,
      }));

      // Delete existing then insert fresh
      await supabase
        .from("match_referees")
        .delete()
        .eq("tournament_id", tournamentId);

      if (upsertRows.length > 0) {
        const { error } = await supabase.from("match_referees").insert(upsertRows);
        if (error) throw error;
      }

      toast.success(`${upsertRows.length} arbitres assignés automatiquement`);
      await fetchData();
    } catch (err: any) {
      toast.error("Erreur lors de la génération des arbitres");
    } finally {
      setGenerating(false);
    }
  };

  const toggleStatus = async (referee: MatchWithReferee) => {
    if (!isCreator || isClosed || !referee.referee_db_id) return;
    const newStatus = referee.referee_status === "present" ? "pending" : "present";
    const { error } = await supabase
      .from("match_referees")
      .update({ status: newStatus })
      .eq("id", referee.referee_db_id);

    if (error) {
      toast.error("Erreur lors de la mise à jour");
    } else {
      setMatches(prev =>
        prev.map(m =>
          m.id === referee.id ? { ...m, referee_status: newStatus } : m
        )
      );
    }
  };

  // Group matches by group_name
  const groupedMatches: Record<string, MatchWithReferee[]> = {};
  matches.forEach(m => {
    const g = m.group_name || "Default";
    if (!groupedMatches[g]) groupedMatches[g] = [];
    groupedMatches[g].push(m);
  });

  const groupNames = Object.keys(groupedMatches).sort();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <p className="text-muted-foreground animate-pulse">Chargement…</p>
      </div>
    );
  }

  const hasAssignments = matches.some(m => m.referee_id !== null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Arbitrage croisé</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chaque groupe arbitre les matchs du groupe adverse
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Rafraîchir
          </Button>
          {isCreator && !isClosed && (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-primary text-primary-foreground"
            >
              <Wand2 className="h-4 w-4 mr-1.5" />
              {generating ? "Génération…" : hasAssignments ? "Régénérer" : "Générer"}
            </Button>
          )}
        </div>
      </div>

      {!hasAssignments && (
        <Card className="p-6 text-center border-dashed">
          <p className="text-muted-foreground text-sm">
            {isCreator
              ? "Aucun arbitre assigné. Cliquez sur « Générer » pour lancer l'assignation automatique."
              : "Aucune assignation d'arbitre pour l'instant."}
          </p>
        </Card>
      )}

      {groupNames.map(groupName => {
        const groupMatches = groupedMatches[groupName];
        const oppositeGroup = groupNames.find(g => g !== groupName) || "";
        return (
          <Card key={groupName} className="overflow-hidden">
            <div className="px-4 py-3 bg-muted/40 border-b flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">{groupName}</span>
                {oppositeGroup && (
                  <span className="text-xs text-muted-foreground ml-2">
                    — arbitré par {oppositeGroup}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{groupMatches.length} matchs</span>
                <span>
                  {groupMatches.filter(m => m.referee_status === "present").length} présents
                </span>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {groupMatches.map((match, idx) => (
                <div
                  key={match.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  {/* Match info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground shrink-0">
                        M{idx + 1}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {match.team1_name}
                        <span className="text-muted-foreground mx-1.5">vs</span>
                        {match.team2_name}
                      </span>
                    </div>
                    {(match.team1_score !== null && match.team2_score !== null) && (
                      <span className="text-xs text-muted-foreground ml-6">
                        {match.team1_score} – {match.team2_score}
                      </span>
                    )}
                  </div>

                  <Separator orientation="vertical" className="hidden sm:block h-8" />

                  {/* Referee info */}
                  <div className="flex items-center gap-3 sm:w-64">
                    {match.referee_team_name ? (
                      <>
                        <span className="text-sm truncate flex-1">{match.referee_team_name}</span>
                        {isCreator && !isClosed ? (
                          <button
                            onClick={() => toggleStatus(match)}
                            className="shrink-0"
                            title="Changer le statut"
                          >
                            <Badge
                              variant={match.referee_status === "present" ? "default" : "secondary"}
                              className={`cursor-pointer select-none transition-colors ${
                                match.referee_status === "present"
                                  ? "bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {match.referee_status === "present" ? (
                                <><CheckCircle className="h-3 w-3 mr-1" />Présent</>
                              ) : (
                                <><Clock className="h-3 w-3 mr-1" />En attente</>
                              )}
                            </Badge>
                          </button>
                        ) : (
                          <Badge
                            variant={match.referee_status === "present" ? "default" : "secondary"}
                            className={
                              match.referee_status === "present"
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : ""
                            }
                          >
                            {match.referee_status === "present" ? (
                              <><CheckCircle className="h-3 w-3 mr-1" />Présent</>
                            ) : (
                              <><Clock className="h-3 w-3 mr-1" />En attente</>
                            )}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Non assigné</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* Summary footer */}
      {hasAssignments && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {groupNames.map(g => {
            const gMatches = groupedMatches[g] || [];
            const present = gMatches.filter(m => m.referee_status === "present").length;
            return (
              <Card key={g} className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{g}</p>
                <p className="text-lg font-bold mt-0.5">
                  {present}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{gMatches.length}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">arbitres présents</p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
