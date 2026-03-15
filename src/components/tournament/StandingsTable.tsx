import { useEffect, useState, useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StandingsTableProps {
  tournamentId: string;
  numberOfGroups?: number;
  initialPhase?: string;
}

export const StandingsTable = ({ tournamentId, numberOfGroups = 1, initialPhase = "round_robin" }: StandingsTableProps) => {
  const [standings, setStandings] = useState<any[]>([]);
  const [teamGroupMap, setTeamGroupMap] = useState<Map<string, string>>(new Map());
  const [selectedTab, setSelectedTab] = useState<string>("Morning");
  const [matches, setMatches] = useState<any[]>([]);
  const [ultimateMatches, setUltimateMatches] = useState<any[]>([]);
  const previousPositions = useRef<Map<string, number>>(new Map());
  const [positionChanges, setPositionChanges] = useState<Map<string, number>>(new Map());

  const hasGroups = numberOfGroups > 1;

  // Fetch team group assignments
  useEffect(() => {
    if (!hasGroups) return;
    const fetchGroups = async () => {
      const { data } = await supabase
        .from("tournament_teams")
        .select("team_id, group_name")
        .eq("tournament_id", tournamentId);
      const map = new Map<string, string>();
      data?.forEach(t => { if (t.group_name) map.set(t.team_id, t.group_name); });
      setTeamGroupMap(map);
    };
    fetchGroups();
  }, [tournamentId, hasGroups]);

  // Fetch matches to determine auto-switch logic
  useEffect(() => {
    if (!hasGroups) return;
    const fetchMatches = async () => {
      const { data } = await supabase
        .from("matches")
        .select("team1_id, team2_id, team1_score, team2_score, round_number")
        .eq("tournament_id", tournamentId)
        .in("phase", ["round_robin", "swiss"]);
      const nonUltimate = (data || []).filter(m => m.round_number !== 99);
      setMatches(nonUltimate);
    };
    fetchMatches();
  }, [tournamentId, hasGroups]);

  // Fetch Ultimate Round matches
  useEffect(() => {
    if (!hasGroups) return;
    const fetchUltimate = async () => {
      const { data } = await supabase
        .from("matches")
        .select("*, team1:team1_id(id, name), team2:team2_id(id, name)")
        .eq("tournament_id", tournamentId)
        .eq("round_number", 99)
        .order("field_number", { ascending: true });
      setUltimateMatches(data || []);
    };
    fetchUltimate();

    // Subscribe to real-time updates for ultimate round matches
    const channel = supabase
      .channel('ultimate-standings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, () => fetchUltimate())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, hasGroups]);

  // Auto-switch to Afternoon if all Morning matches completed, then Overall if all done
  useEffect(() => {
    if (!hasGroups || teamGroupMap.size === 0 || matches.length === 0) return;
    const morningMatches = matches.filter(m => {
      const g1 = teamGroupMap.get(m.team1_id);
      const g2 = teamGroupMap.get(m.team2_id);
      return g1 === "Morning" || g2 === "Morning";
    });
    const afternoonMatches = matches.filter(m => {
      const g1 = teamGroupMap.get(m.team1_id);
      const g2 = teamGroupMap.get(m.team2_id);
      return g1 === "Afternoon" || g2 === "Afternoon";
    });
    const allMorningDone = morningMatches.length > 0 && morningMatches.every(m => m.team1_score !== null && m.team2_score !== null);
    const allAfternoonDone = afternoonMatches.length > 0 && afternoonMatches.every(m => m.team1_score !== null && m.team2_score !== null);

    if (allMorningDone && allAfternoonDone) {
      setSelectedTab("Overall");
    } else if (allMorningDone) {
      setSelectedTab("Afternoon");
    }
  }, [hasGroups, teamGroupMap, matches]);

  useEffect(() => {
    fetchStandings();

    const matchesChannel = supabase
      .channel('matches-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, () => fetchStandings())
      .subscribe();

    const statsChannel = supabase
      .channel('stats-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_stats', filter: `tournament_id=eq.${tournamentId}` }, () => fetchStandings())
      .subscribe();

    return () => {
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(statsChannel);
    };
  }, [tournamentId]);

  const fetchStandings = async () => {
    const { data, error } = await supabase
      .from("team_stats")
      .select(`*, team:team_id(name)`)
      .eq("tournament_id", tournamentId);

    if (error) { toast.error("Error loading standings"); return; }

    const sortedData = (data || []).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const diffA = a.goals_for - a.goals_against;
      const diffB = b.goals_for - b.goals_against;
      if (diffB !== diffA) return diffB - diffA;
      return b.goals_for - a.goals_for;
    });

    const changes = new Map<string, number>();
    sortedData.forEach((stat, newIndex) => {
      const oldPosition = previousPositions.current.get(stat.team_id);
      if (oldPosition !== undefined) {
        const change = oldPosition - newIndex;
        if (change !== 0) changes.set(stat.team_id, change);
      }
    });
    sortedData.forEach((stat, index) => { previousPositions.current.set(stat.team_id, index); });

    setPositionChanges(changes);
    setStandings(sortedData);

    if (changes.size > 0) {
      setTimeout(() => setPositionChanges(new Map()), 3000);
    }
  };

  // Compute Overall Standings with Ultimate Round logic
  const overallStandings = useMemo(() => {
    if (!hasGroups) return standings;

    // Separate standings by group
    const morningStandings = standings
      .filter(s => teamGroupMap.get(s.team_id) === "Morning")
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.goals_for - a.goals_against;
        const diffB = b.goals_for - b.goals_against;
        if (diffB !== diffA) return diffB - diffA;
        return b.goals_for - a.goals_for;
      });
    const afternoonStandings = standings
      .filter(s => teamGroupMap.get(s.team_id) === "Afternoon")
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.goals_for - a.goals_against;
        const diffB = b.goals_for - b.goals_against;
        if (diffB !== diffA) return diffB - diffA;
        return b.goals_for - a.goals_for;
      });

    // Check if any Ultimate Round matches have results
    const completedUltimate = ultimateMatches.filter(
      m => m.team1_score !== null && m.team2_score !== null
    );

    if (completedUltimate.length > 0) {
      // Phase 2: Sort all teams by stats (pts, GD, GF), preserving Ultimate Round result badge
      const ultimateResultMap = new Map<string, "win" | "loss" | "pending">();
      ultimateMatches.forEach((match) => {
        const isCompleted = match.team1_score !== null && match.team2_score !== null;
        if (isCompleted) {
          const winnerId = match.winner_id;
          const loserId = match.team1_id === winnerId ? match.team2_id : match.team1_id;
          ultimateResultMap.set(winnerId, "win");
          ultimateResultMap.set(loserId, "loss");
        } else {
          ultimateResultMap.set(match.team1_id, "pending");
          ultimateResultMap.set(match.team2_id, "pending");
        }
      });

      return [...standings]
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const diffA = a.goals_for - a.goals_against;
          const diffB = b.goals_for - b.goals_against;
          if (diffB !== diffA) return diffB - diffA;
          return b.goals_for - a.goals_for;
        })
        .map(s => ({ ...s, _ultimateResult: ultimateResultMap.get(s.team_id) }));
    }

    // Phase 1: Provisional ranking — all teams sorted by stats (pts, GD, GF)
    return [...standings].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const diffA = a.goals_for - a.goals_against;
      const diffB = b.goals_for - b.goals_against;
      if (diffB !== diffA) return diffB - diffA;
      return b.goals_for - a.goals_for;
    });
  }, [standings, hasGroups, teamGroupMap, ultimateMatches]);

  const filteredStandings = useMemo(() => {
    if (!hasGroups || selectedTab === "Overall") return overallStandings;
    return standings.filter(s => teamGroupMap.get(s.team_id) === selectedTab);
  }, [standings, overallStandings, hasGroups, selectedTab, teamGroupMap]);

  const showGroupColumn = hasGroups && selectedTab === "Overall";

  const isUltimateActive = hasGroups && ultimateMatches.some(m => m.team1_score !== null && m.team2_score !== null);

  const renderTable = (data: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Team</TableHead>
          {showGroupColumn && <TableHead>Group</TableHead>}
          <TableHead className="text-center">P</TableHead>
          <TableHead className="text-center">W</TableHead>
          <TableHead className="text-center">D</TableHead>
          <TableHead className="text-center">L</TableHead>
          <TableHead className="text-center font-bold">Pts</TableHead>
          <TableHead className="text-center">GF</TableHead>
          <TableHead className="text-center">GA</TableHead>
          <TableHead className="text-center">GD</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((stat, index) => {
          const change = positionChanges.get(stat.team_id);
          const hasChange = change !== undefined;
          const ultimateResult = stat._ultimateResult;
          return (
            <TableRow
              key={stat.id}
              className={`transition-all duration-500 ${hasChange ? 'animate-fade-in bg-primary/5' : ''}`}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>{index + 1}</span>
                  {hasChange && change > 0 && <TrendingUp className="h-4 w-4 text-green-500 animate-in slide-in-from-bottom-2" />}
                  {hasChange && change < 0 && <TrendingDown className="h-4 w-4 text-red-500 animate-in slide-in-from-top-2" />}
                  {showGroupColumn && ultimateResult === "win" && <Crown className="h-4 w-4 text-primary" />}
                </div>
              </TableCell>
              <TableCell className="font-bold">
                <div className="flex items-center gap-2">
                  {stat.team?.name}
                  {showGroupColumn && ultimateResult === "pending" && (
                    <Badge variant="outline" className="text-xs">Provisional</Badge>
                  )}
                </div>
              </TableCell>
              {showGroupColumn && (
                <TableCell className="text-muted-foreground text-sm">{teamGroupMap.get(stat.team_id) || "—"}</TableCell>
              )}
              <TableCell className="text-center">{stat.wins + stat.draws + stat.losses}</TableCell>
              <TableCell className="text-center">{stat.wins}</TableCell>
              <TableCell className="text-center">{stat.draws}</TableCell>
              <TableCell className="text-center">{stat.losses}</TableCell>
              <TableCell className="text-center font-bold text-primary text-lg">{stat.points}</TableCell>
              <TableCell className="text-center">{stat.goals_for}</TableCell>
              <TableCell className="text-center">{stat.goals_against}</TableCell>
              <TableCell className="text-center">
                {stat.goals_for - stat.goals_against > 0 ? "+" : ""}
                {stat.goals_for - stat.goals_against}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Overall Ranking</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>Real-time updates</span>
        </div>
      </div>

      {hasGroups && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {["Morning", "Afternoon", "Overall"].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedTab === tab
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {tab === "Overall" ? "Overall Standings" : `${tab} Group`}
            </button>
          ))}
        </div>
      )}

      {selectedTab === "Overall" && hasGroups && (
        <div className="mb-4 p-3 rounded-lg text-sm border">
          {isUltimateActive ? (
            <div className="flex items-center gap-2 text-primary">
              <Crown className="h-4 w-4" />
              <span className="font-medium">Final ranking based on Ultimate Round results</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>⏳ Provisional ranking — interleaving group standings. Final positions will be determined by the Ultimate Round.</span>
            </div>
          )}
        </div>
      )}

      {renderTable(filteredStandings)}

      {filteredStandings.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No statistics available yet
        </p>
      )}
    </Card>
  );
};
