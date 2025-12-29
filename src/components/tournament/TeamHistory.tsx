import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, TrendingUp, TrendingDown, Minus, History, Target, Award } from "lucide-react";

interface TeamHistoryProps {
  tournamentId: string;
}

interface Match {
  id: string;
  round_number: number;
  phase: string;
  team1_score: number | null;
  team2_score: number | null;
  team1_id: string;
  team2_id: string;
  team1: { name: string };
  team2: { name: string };
  created_at: string;
}

interface TeamStats {
  round: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  goals_for: number;
  goals_against: number;
}

export const TeamHistory = ({ tournamentId }: TeamHistoryProps) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [statsEvolution, setStatsEvolution] = useState<TeamStats[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTeams(); }, [tournamentId]);
  useEffect(() => { if (selectedTeamId) fetchTeamHistory(); }, [selectedTeamId]);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("tournament_teams")
      .select(`team_id, teams!inner (id, name)`)
      .eq("tournament_id", tournamentId);

    if (error) { toast.error("Error loading teams"); return; }

    const teamsData = (data || []).map((item: any) => ({ id: item.teams.id, name: item.teams.name })).sort((a, b) => a.name.localeCompare(b.name));
    setTeams(teamsData);
    if (teamsData.length > 0) setSelectedTeamId(teamsData[0].id);
  };

  const fetchTeamHistory = async () => {
    setLoading(true);
    try {
      const { data: matchesData, error } = await supabase
        .from("matches")
        .select(`id, round_number, phase, team1_score, team2_score, team1_id, team2_id, created_at, team1:teams!team1_id(name), team2:teams!team2_id(name)`)
        .eq("tournament_id", tournamentId)
        .or(`team1_id.eq.${selectedTeamId},team2_id.eq.${selectedTeamId}`)
        .not("team1_score", "is", null)
        .not("team2_score", "is", null)
        .order("round_number")
        .order("created_at");

      if (error) throw error;
      setMatches(matchesData || []);

      const evolution: TeamStats[] = [];
      let cumulativeStats = { points: 0, wins: 0, losses: 0, draws: 0, goals_for: 0, goals_against: 0 };
      const matchesByRound = (matchesData || []).reduce((acc, match) => { if (!acc[match.round_number]) acc[match.round_number] = []; acc[match.round_number].push(match); return acc; }, {} as Record<number, Match[]>);
      const rounds = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);

      for (const round of rounds) {
        for (const match of matchesByRound[round]) {
          const isTeam1 = match.team1_id === selectedTeamId;
          const teamScore = isTeam1 ? match.team1_score! : match.team2_score!;
          const opponentScore = isTeam1 ? match.team2_score! : match.team1_score!;
          cumulativeStats.goals_for += teamScore;
          cumulativeStats.goals_against += opponentScore;
          if (teamScore > opponentScore) { cumulativeStats.wins += 1; cumulativeStats.points += 3; }
          else if (teamScore < opponentScore) { cumulativeStats.losses += 1; }
          else { cumulativeStats.draws += 1; cumulativeStats.points += 1; }
        }
        evolution.push({ round, ...cumulativeStats });
      }
      setStatsEvolution(evolution);
    } catch (error: any) { toast.error("Error loading history"); }
    finally { setLoading(false); }
  };

  const getMatchResult = (match: Match) => {
    const isTeam1 = match.team1_id === selectedTeamId;
    const teamScore = isTeam1 ? match.team1_score! : match.team2_score!;
    const opponentScore = isTeam1 ? match.team2_score! : match.team1_score!;
    if (teamScore > opponentScore) return "win";
    if (teamScore < opponentScore) return "loss";
    return "draw";
  };

  const getResultIcon = (result: string) => {
    switch (result) {
      case "win": return <Trophy className="h-4 w-4 text-green-500" />;
      case "loss": return <TrendingDown className="h-4 w-4 text-red-500" />;
      case "draw": return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case "win": return "bg-green-500/20 text-green-500 border-green-500/30";
      case "loss": return "bg-red-500/20 text-red-500 border-red-500/30";
      case "draw": return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    }
  };

  const latestStats = statsEvolution[statsEvolution.length - 1];

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <History className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Team History</h2>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">Select a team</label>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Choose a team..." /></SelectTrigger>
            <SelectContent>{teams.map((team) => (<SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>))}</SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-muted-foreground animate-pulse">Loading...</p></div>
        ) : selectedTeamId && matches.length > 0 ? (
          <div className="space-y-6">
            {latestStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="text-center"><div className="flex items-center justify-center gap-2 mb-1"><Award className="h-4 w-4 text-primary" /><p className="text-2xl font-bold text-primary">{latestStats.points}</p></div><p className="text-xs text-muted-foreground">Points</p></div>
                <div className="text-center"><div className="flex items-center justify-center gap-2 mb-1"><Trophy className="h-4 w-4 text-green-500" /><p className="text-2xl font-bold">{latestStats.wins}</p></div><p className="text-xs text-muted-foreground">Wins</p></div>
                <div className="text-center"><div className="flex items-center justify-center gap-2 mb-1"><Minus className="h-4 w-4 text-yellow-500" /><p className="text-2xl font-bold">{latestStats.draws}</p></div><p className="text-xs text-muted-foreground">Draws</p></div>
                <div className="text-center"><div className="flex items-center justify-center gap-2 mb-1"><Target className="h-4 w-4 text-primary" /><p className="text-2xl font-bold">{latestStats.goals_for - latestStats.goals_against > 0 ? "+" : ""}{latestStats.goals_for - latestStats.goals_against}</p></div><p className="text-xs text-muted-foreground">Goal Diff.</p></div>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold mb-4">All Matches</h3>
              <div className="space-y-3">
                {matches.map((match, index) => {
                  const result = getMatchResult(match);
                  const isTeam1 = match.team1_id === selectedTeamId;
                  const teamScore = isTeam1 ? match.team1_score! : match.team2_score!;
                  const opponentScore = isTeam1 ? match.team2_score! : match.team1_score!;
                  const opponentName = isTeam1 ? match.team2.name : match.team1.name;

                  return (
                    <div key={match.id} className={`flex items-center gap-4 p-4 rounded-lg border ${getResultBadge(result)}`}>
                      <div className="flex-shrink-0">{getResultIcon(result)}</div>
                      <div className="flex-shrink-0 text-sm text-muted-foreground w-20"><p className="font-medium">Round {match.round_number}</p><p className="text-xs">{match.phase === "round_robin" ? "RR" : match.phase === "swiss" ? "Swiss" : "Elim"}</p></div>
                      <div className="flex-1"><p className="font-medium">vs {opponentName}</p></div>
                      <div className="flex-shrink-0"><p className={`text-xl font-bold ${result === "win" ? "text-green-500" : result === "loss" ? "text-red-500" : "text-yellow-500"}`}>{teamScore} - {opponentScore}</p></div>
                      <div className="flex-shrink-0 w-16 text-center"><p className="text-sm font-medium">{result === "win" ? "+3" : result === "draw" ? "+1" : "0"} pts</p></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : selectedTeamId && matches.length === 0 ? (
          <div className="text-center py-12"><History className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" /><p className="text-muted-foreground">No matches played yet</p></div>
        ) : (
          <div className="text-center py-12"><p className="text-muted-foreground">Select a team to view its history</p></div>
        )}
      </Card>
    </div>
  );
};
