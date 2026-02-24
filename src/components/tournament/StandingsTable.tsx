import { useEffect, useState, useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StandingsTableProps {
  tournamentId: string;
  numberOfGroups?: number;
}

export const StandingsTable = ({ tournamentId, numberOfGroups = 1 }: StandingsTableProps) => {
  const [standings, setStandings] = useState<any[]>([]);
  const [teamGroupMap, setTeamGroupMap] = useState<Map<string, string>>(new Map());
  const [selectedTab, setSelectedTab] = useState<string>("Morning");
  const [matches, setMatches] = useState<any[]>([]);
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
        .select("team1_id, team2_id, team1_score, team2_score")
        .eq("tournament_id", tournamentId)
        .in("phase", ["round_robin", "swiss"]);
      setMatches(data || []);
    };
    fetchMatches();
  }, [tournamentId, hasGroups]);

  // Auto-switch to Afternoon if all Morning matches completed
  useEffect(() => {
    if (!hasGroups || teamGroupMap.size === 0 || matches.length === 0) return;
    const morningMatches = matches.filter(m => {
      const g1 = teamGroupMap.get(m.team1_id);
      const g2 = teamGroupMap.get(m.team2_id);
      return g1 === "Morning" || g2 === "Morning";
    });
    if (morningMatches.length > 0 && morningMatches.every(m => m.team1_score !== null && m.team2_score !== null)) {
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

  const filteredStandings = useMemo(() => {
    if (!hasGroups || selectedTab === "Overall") return standings;
    return standings.filter(s => teamGroupMap.get(s.team_id) === selectedTab);
  }, [standings, hasGroups, selectedTab, teamGroupMap]);

  const showGroupColumn = hasGroups && selectedTab === "Overall";

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
          <TableHead className="text-center">GF</TableHead>
          <TableHead className="text-center">GA</TableHead>
          <TableHead className="text-center">GD</TableHead>
          <TableHead className="text-center font-bold">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((stat, index) => {
          const change = positionChanges.get(stat.team_id);
          const hasChange = change !== undefined;
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
                </div>
              </TableCell>
              <TableCell className="font-bold">{stat.team?.name}</TableCell>
              {showGroupColumn && (
                <TableCell className="text-muted-foreground text-sm">{teamGroupMap.get(stat.team_id) || "—"}</TableCell>
              )}
              <TableCell className="text-center">{stat.wins + stat.draws + stat.losses}</TableCell>
              <TableCell className="text-center">{stat.wins}</TableCell>
              <TableCell className="text-center">{stat.draws}</TableCell>
              <TableCell className="text-center">{stat.losses}</TableCell>
              <TableCell className="text-center">{stat.goals_for}</TableCell>
              <TableCell className="text-center">{stat.goals_against}</TableCell>
              <TableCell className="text-center">
                {stat.goals_for - stat.goals_against > 0 ? "+" : ""}
                {stat.goals_for - stat.goals_against}
              </TableCell>
              <TableCell className="text-center font-bold text-primary">{stat.points}</TableCell>
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
        <div className="flex gap-2 mb-6">
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

      {renderTable(filteredStandings)}

      {filteredStandings.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No statistics available yet
        </p>
      )}
    </Card>
  );
};
