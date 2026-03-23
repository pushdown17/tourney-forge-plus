import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Wand2, CheckCircle, Clock, AlertTriangle } from "lucide-react";

interface RefereesTabProps {
  tournamentId: string;
  isCreator?: boolean;
  isClosed?: boolean;
  numberOfGroups?: number;
}

interface TeamInfo {
  id: string;
  name: string;
  group: string;
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
  match_index: number;
}

// ── Algorithm ──────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns the match index (in the TARGET group) just BEFORE the given slot,
// where the referee team plays in its OWN group.
// We need the round_number of each target match and the referee team's own matches
// to detect if they played the immediately preceding match (cross-group timeline).
// For simplicity: we just check if the referee team PLAYS in an adjacent match
// within the TARGET group (same-field adjacency check).
function playsInTargetMatch(
  match: { team1_id: string; team2_id: string },
  teamId: string
): boolean {
  return match.team1_id === teamId || match.team2_id === teamId;
}

function assignReferees(
  matches: { id: string; team1_id: string; team2_id: string; group_name: string | null }[],
  groupedTeams: Record<string, string[]>
): Record<string, string> {
  const groupNames = Object.keys(groupedTeams);
  if (groupNames.length !== 2) return {};

  const [groupA, groupB] = groupNames;
  const matchesA = matches.filter(m => m.group_name === groupA);
  const matchesB = matches.filter(m => m.group_name === groupB);
  const result: Record<string, string> = {};

  // Assigns consecutive blocks of matches to each referee team.
  // Before assigning a block, skips 1 slot if the team plays in the match
  // immediately preceding the block start (rest constraint).
  function assignGroupBlocked(
    targetMatches: typeof matches,
    candidateTeams: string[],
    ownGroupMatches: typeof matches
  ) {
    const n = targetMatches.length;
    const k = candidateTeams.length;
    if (k === 0 || n === 0) return;

    const teams = shuffle(candidateTeams);
    const baseSize = Math.floor(n / k);
    const extras = n % k;

    // Build an ordered list of slots (indices into targetMatches) to fill
    // Each team gets a contiguous block; if the block would start immediately
    // after a match the referee team plays in their own group, shift by 1.
    let matchIdx = 0;

    for (let ti = 0; ti < k; ti++) {
      const blockSize = ti < extras ? baseSize + 1 : baseSize;
      const team = teams[ti];

      // Check if this team played the match that immediately precedes the
      // current slot in their OWN group (cross-timeline rest check).
      // We approximate by checking if the referee team appears in the match
      // at position matchIdx - 1 of targetMatches (same sequential position).
      if (matchIdx > 0) {
        const preceding = targetMatches[matchIdx - 1];
        if (playsInTargetMatch(preceding, team)) {
          // Try to push the block start by 1 if there are enough remaining slots
          if (matchIdx < n) matchIdx++;
        }
      }

      for (let j = 0; j < blockSize && matchIdx < n; j++) {
        // Also skip if referee plays THIS specific match (shouldn't happen in cross-group, but safety)
        if (playsInTargetMatch(targetMatches[matchIdx], team)) {
          matchIdx++;
          if (matchIdx >= n) break;
        }
        result[targetMatches[matchIdx].id] = team;
        matchIdx++;
      }
    }

    // Fill any unassigned matches (edge case) by cycling teams
    let fallbackTeamIdx = 0;
    targetMatches.forEach(m => {
      if (!result[m.id]) {
        result[m.id] = teams[fallbackTeamIdx % teams.length];
        fallbackTeamIdx++;
      }
    });
  }

  assignGroupBlocked(matchesA, groupedTeams[groupB], matchesB);
  assignGroupBlocked(matchesB, groupedTeams[groupA], matchesA);
  return result;
}

// Detect if referee plays adjacent match within same group
function hasConflict(
  matchIndex: number,
  refereeTeamId: string,
  groupMatches: MatchWithReferee[]
): boolean {
  const prev = matchIndex > 0 ? groupMatches[matchIndex - 1] : null;
  const next = matchIndex < groupMatches.length - 1 ? groupMatches[matchIndex + 1] : null;
  const adjacent = [prev, next].filter(Boolean) as MatchWithReferee[];
  return adjacent.some(m => m.team1_id === refereeTeamId || m.team2_id === refereeTeamId);
}

// ───────────────────────────────────────────────────────────────────────────────

export const RefereesTab = ({
  tournamentId,
  isCreator = false,
  isClosed = false,
}: RefereesTabProps) => {
  const [matches, setMatches] = useState<MatchWithReferee[]>([]);
  const [allTeams, setAllTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>("");
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ttData, error: ttError } = await supabase
        .from("tournament_teams")
        .select("id, team_id, group_name, team:teams(id, name)")
        .eq("tournament_id", tournamentId);
      if (ttError) throw ttError;

      const groupedTeams: Record<string, string[]> = {};
      const teamNameMap: Record<string, string> = {};
      const teamsList: TeamInfo[] = [];

      (ttData || []).forEach((tt: any) => {
        const gName = tt.group_name || "Default";
        if (!groupedTeams[gName]) groupedTeams[gName] = [];
        groupedTeams[gName].push(tt.team_id);
        if (tt.team) {
          teamNameMap[tt.team_id] = tt.team.name;
          teamsList.push({ id: tt.team_id, name: tt.team.name, group: gName });
        }
      });

      // Sort teams by group then name
      teamsList.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
      setAllTeams(teamsList);

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("id, round_number, team1_id, team2_id, team1_score, team2_score, tournament_team1_id, tournament_team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin")
        .neq("round_number", 99)
        .order("round_number", { ascending: true })
        .order("created_at", { ascending: true });
      if (matchError) throw matchError;

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

      const ttGroupMap: Record<string, string> = {};
      (ttData || []).forEach((tt: any) => { ttGroupMap[tt.team_id] = tt.group_name || "Default"; });

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: ttData } = await supabase
        .from("tournament_teams")
        .select("team_id, group_name")
        .eq("tournament_id", tournamentId);

      const { data: matchData } = await supabase
        .from("matches")
        .select("id, team1_id, team2_id, tournament_team1_id, tournament_team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin")
        .neq("round_number", 99)
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
      const upsertRows = Object.entries(assignments).map(([matchId, refTeamId]) => ({
        tournament_id: tournamentId,
        match_id: matchId,
        referee_team_id: refTeamId,
        status: "pending" as const,
      }));

      await supabase.from("match_referees").delete().eq("tournament_id", tournamentId);
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

  // Manual override: change a single match's referee
  const handleRefereeChange = async (match: MatchWithReferee, newTeamId: string) => {
    setSavingMatchId(match.id);
    try {
      const newTeam = allTeams.find(t => t.id === newTeamId);
      if (match.referee_db_id) {
        // Update existing
        const { error } = await supabase
          .from("match_referees")
          .update({ referee_team_id: newTeamId, status: "pending" })
          .eq("id", match.referee_db_id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("match_referees")
          .insert({ tournament_id: tournamentId, match_id: match.id, referee_team_id: newTeamId, status: "pending" });
        if (error) throw error;
      }

      // Optimistic update
      setMatches(prev => prev.map(m =>
        m.id === match.id
          ? { ...m, referee_id: newTeamId, referee_team_name: newTeam?.name || null, referee_status: "pending" }
          : m
      ));
      toast.success(`Arbitre mis à jour : ${newTeam?.name}`);
      // Refresh to get DB id if newly inserted
      if (!match.referee_db_id) await fetchData();
    } catch (err: any) {
      toast.error("Erreur lors de la modification de l'arbitre");
    } finally {
      setSavingMatchId(null);
    }
  };

  const toggleStatus = async (match: MatchWithReferee) => {
    if (!isCreator || isClosed || !match.referee_db_id) return;
    const newStatus = match.referee_status === "present" ? "pending" : "present";
    const { error } = await supabase
      .from("match_referees")
      .update({ status: newStatus })
      .eq("id", match.referee_db_id);
    if (error) {
      toast.error("Erreur lors de la mise à jour");
    } else {
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, referee_status: newStatus } : m));
    }
  };

  // Group matches
  const groupedMatches: Record<string, MatchWithReferee[]> = {};
  matches.forEach(m => {
    const g = m.group_name || "Default";
    if (!groupedMatches[g]) groupedMatches[g] = [];
    groupedMatches[g].push(m);
  });

  const groupNames = Object.keys(groupedMatches).sort((a, b) => {
    const order = (s: string) => s.toLowerCase().startsWith("morning") ? 0 : s.toLowerCase().startsWith("afternoon") ? 1 : 2;
    return order(a) - order(b);
  });

  const effectiveTab = activeGroup || groupNames[0] || "";
  const hasAssignments = matches.some(m => m.referee_id !== null);

  // Per-team summary (updates in real-time from state)
  const refCountByTeam: Record<string, number> = {};
  matches.forEach(m => {
    if (m.referee_id) {
      refCountByTeam[m.referee_id] = (refCountByTeam[m.referee_id] || 0) + 1;
    }
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <p className="text-muted-foreground animate-pulse">Chargement…</p>
      </div>
    );
  }

  const renderGroupList = (groupName: string) => {
    const groupMatches = groupedMatches[groupName] || [];
    const oppositeGroup = groupNames.find(g => g !== groupName) || "";
    const oppositeTeams = allTeams.filter(t => t.group === oppositeGroup);
    const sameGroupTeams = allTeams.filter(t => t.group === groupName);

    return (
      <div className="space-y-4">
        {/* Sub-header */}
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          {oppositeGroup && (
            <span>Refereed by: <span className="font-medium text-foreground">{oppositeGroup}</span></span>
          )}
          <span>{groupMatches.filter(m => m.referee_status === "present").length}/{groupMatches.length} present</span>
        </div>

        <Card className="overflow-hidden">
          <div className="divide-y divide-border/50">
            {groupMatches.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun match pour ce groupe.</div>
            )}
            {groupMatches.map((match, idx) => {
              const conflict = match.referee_id ? hasConflict(idx, match.referee_id, groupMatches) : false;
              const isSaving = savingMatchId === match.id;

              return (
                <div key={match.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  {/* Match info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground shrink-0">M{idx + 1}</span>
                      <span className="text-sm font-medium truncate">
                        {match.team1_name}
                        <span className="text-muted-foreground mx-1.5">vs</span>
                        {match.team2_name}
                      </span>
                    </div>
                    {match.team1_score !== null && match.team2_score !== null && (
                      <span className="text-xs text-muted-foreground ml-6">{match.team1_score} – {match.team2_score}</span>
                    )}
                  </div>

                  <Separator orientation="vertical" className="hidden sm:block h-8" />

                  {/* Referee: editable select for creator, read-only badge for visitors */}
                  <div className="flex items-center gap-2 sm:w-72">
                    {isCreator && !isClosed ? (
                      <>
                        <Select
                          value={match.referee_id || ""}
                          onValueChange={(val) => handleRefereeChange(match, val)}
                          disabled={isSaving}
                        >
                          <SelectTrigger className="h-8 text-sm flex-1">
                            <SelectValue placeholder="— Choisir —" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Opposite group (recommended) */}
                            {oppositeTeams.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">{oppositeGroup}</div>
                                {oppositeTeams.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </>
                            )}
                            {/* Same group (override, will trigger conflict warning if adjacent) */}
                            {sameGroupTeams.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs text-muted-foreground font-medium mt-1 border-t">{groupName} (override)</div>
                                {sameGroupTeams
                                  .filter(t => t.id !== match.team1_id && t.id !== match.team2_id)
                                  .map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name} ⚠</SelectItem>
                                  ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>

                        {/* Conflict warning */}
                        {conflict && (
                          <span title="Cette équipe joue un match adjacent — conflit potentiel">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                          </span>
                        )}

                        {/* Status toggle */}
                        {match.referee_id && (
                          <button onClick={() => toggleStatus(match)} title="Changer le statut" className="shrink-0">
                            <Badge
                              variant={match.referee_status === "present" ? "default" : "secondary"}
                              className={`cursor-pointer select-none transition-colors text-xs ${
                                match.referee_status === "present"
                                  ? "bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {match.referee_status === "present"
                                ? <><CheckCircle className="h-3 w-3 mr-1" />Present</>
                                : <><Clock className="h-3 w-3 mr-1" />Pending</>}
                            </Badge>
                          </button>
                        )}
                      </>
                    ) : (
                      /* Visitor: read-only */
                      match.referee_team_name ? (
                        <>
                          <span className="text-sm truncate flex-1">{match.referee_team_name}</span>
                          {conflict && <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
                          <Badge
                            variant={match.referee_status === "present" ? "default" : "secondary"}
                            className={match.referee_status === "present" ? "bg-green-500/20 text-green-400 border-green-500/30 text-xs" : "text-xs"}
                          >
                            {match.referee_status === "present"
                              ? <><CheckCircle className="h-3 w-3 mr-1" />Present</>
                              : <><Clock className="h-3 w-3 mr-1" />Pending</>}
                          </Badge>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Non assigné</span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Per-team summary for this group's referee teams (opposite group) */}
        {hasAssignments && oppositeTeams.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2 px-1">Refereeing load — {oppositeGroup}</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {oppositeTeams.map(t => {
                const count = refCountByTeam[t.id] || 0;
                return (
                  <Card key={t.id} className="p-2 text-center">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    <p className="text-lg font-bold leading-none mt-1">{count}</p>
                    <p className="text-[10px] text-muted-foreground">match{count > 1 ? "s" : ""}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Cross Refereeing</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Each group referees the matches of the opposing group</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          {isCreator && !isClosed && (
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              <Wand2 className="h-4 w-4 mr-1.5" />
              {generating ? "Generating…" : hasAssignments ? "Regenerate" : "Generate"}
            </Button>
          )}
        </div>
      </div>

      {!hasAssignments && (
        <Card className="p-6 text-center border-dashed">
          <p className="text-muted-foreground text-sm">
            {isCreator ? "Aucun arbitre assigné. Cliquez sur « Générer » pour lancer l'assignation automatique." : "Aucune assignation d'arbitre pour l'instant."}
          </p>
        </Card>
      )}

      {groupNames.length > 0 && (
        <Tabs value={effectiveTab} onValueChange={setActiveGroup}>
          <TabsList className={`grid w-full grid-cols-${groupNames.length} bg-muted/50`}>
            {groupNames.map(g => (
              <TabsTrigger key={g} value={g} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {g}
              </TabsTrigger>
            ))}
          </TabsList>
          {groupNames.map(g => (
            <TabsContent key={g} value={g} className="mt-4">
              {renderGroupList(g)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};
