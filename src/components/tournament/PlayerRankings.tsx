import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Target, HandHelping, AlertTriangle, Clock } from "lucide-react";

interface PlayerRankingsProps {
  tournamentId: string;
}

interface PlayerRanking {
  player_id: string;
  player_name: string;
  team_name: string;
  goals: number;
  assists: number;
  fouls: number;
  penalty_minutes: number;
  matches_played: number;
}

export const PlayerRankings = ({ tournamentId }: PlayerRankingsProps) => {
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRankings();
  }, [tournamentId]);

  const fetchRankings = async () => {
    try {
      // Fetch all player stats for this tournament with player and team info
      const { data: statsData, error: statsError } = await supabase
        .from("player_stats")
        .select(`
          goals,
          assists,
          fouls,
          penalty_30s,
          penalty_1m,
          penalty_2m,
          tournament_team_player_id
        `)
        .eq("tournament_id", tournamentId);

      if (statsError) throw statsError;

      // Fetch tournament team players with player and team info
      const { data: ttpData, error: ttpError } = await supabase
        .from("tournament_team_players")
        .select(`
          id,
          player_id,
          tournament_team_id
        `);

      if (ttpError) throw ttpError;

      // Fetch players
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id, name");

      if (playersError) throw playersError;

      // Fetch tournament teams with team info
      const { data: ttData, error: ttError } = await supabase
        .from("tournament_teams")
        .select("id, team_id")
        .eq("tournament_id", tournamentId);

      if (ttError) throw ttError;

      // Fetch teams
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id, name");

      if (teamsError) throw teamsError;

      // Create lookup maps
      const playersMap = new Map(playersData?.map(p => [p.id, p.name]) || []);
      const teamsMap = new Map(teamsData?.map(t => [t.id, t.name]) || []);
      const ttMap = new Map(ttData?.map(tt => [tt.id, tt.team_id]) || []);
      const ttpMap = new Map(ttpData?.map(ttp => [ttp.id, { player_id: ttp.player_id, tournament_team_id: ttp.tournament_team_id }]) || []);

      // Aggregate stats by player
      const playerStatsMap = new Map<string, PlayerRanking>();

      statsData?.forEach(stat => {
        const ttpInfo = ttpMap.get(stat.tournament_team_player_id || "");
        if (!ttpInfo) return;

        const playerId = ttpInfo.player_id;
        const teamId = ttMap.get(ttpInfo.tournament_team_id);
        const playerName = playersMap.get(playerId) || "Unknown";
        const teamName = teamsMap.get(teamId || "") || "Unknown";

        const penaltyMinutes = (stat.penalty_30s * 0.5) + stat.penalty_1m + (stat.penalty_2m * 2);

        if (playerStatsMap.has(playerId)) {
          const existing = playerStatsMap.get(playerId)!;
          existing.goals += stat.goals;
          existing.assists += stat.assists;
          existing.fouls += stat.fouls;
          existing.penalty_minutes += penaltyMinutes;
          existing.matches_played += 1;
        } else {
          playerStatsMap.set(playerId, {
            player_id: playerId,
            player_name: playerName,
            team_name: teamName,
            goals: stat.goals,
            assists: stat.assists,
            fouls: stat.fouls,
            penalty_minutes: penaltyMinutes,
            matches_played: 1,
          });
        }
      });

      setRankings(Array.from(playerStatsMap.values()));
    } catch (error) {
      console.error("Error fetching rankings:", error);
    } finally {
      setLoading(false);
    }
  };

  const sortedByGoals = [...rankings].sort((a, b) => b.goals - a.goals).filter(r => r.goals > 0);
  const sortedByAssists = [...rankings].sort((a, b) => b.assists - a.assists).filter(r => r.assists > 0);
  const sortedByFouls = [...rankings].sort((a, b) => b.fouls - a.fouls).filter(r => r.fouls > 0);
  const sortedByPenalties = [...rankings].sort((a, b) => b.penalty_minutes - a.penalty_minutes).filter(r => r.penalty_minutes > 0);

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground animate-pulse">Loading statistics...</p>
        </CardContent>
      </Card>
    );
  }

  const RankingTable = ({ data, statKey, statLabel, icon: Icon }: { 
    data: PlayerRanking[]; 
    statKey: keyof PlayerRanking; 
    statLabel: string;
    icon: React.ElementType;
  }) => (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {statLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">{statLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 10).map((player, index) => (
                <TableRow key={player.player_id}>
                  <TableCell className="font-medium">
                    {index === 0 && "🥇"}
                    {index === 1 && "🥈"}
                    {index === 2 && "🥉"}
                    {index > 2 && index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{player.player_name}</TableCell>
                  <TableCell className="text-muted-foreground">{player.team_name}</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {statKey === "penalty_minutes" 
                      ? `${player[statKey]}min` 
                      : player[statKey]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="goals" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-4 bg-muted/30">
            <TabsTrigger value="goals" className="whitespace-nowrap px-3 py-2 text-sm gap-2">
              <Target className="h-4 w-4" />
              Scorers
            </TabsTrigger>
            <TabsTrigger value="assists" className="whitespace-nowrap px-3 py-2 text-sm gap-2">
              <HandHelping className="h-4 w-4" />
              Assisters
            </TabsTrigger>
            <TabsTrigger value="fouls" className="whitespace-nowrap px-3 py-2 text-sm gap-2">
              <AlertTriangle className="h-4 w-4" />
              Fouls
            </TabsTrigger>
            <TabsTrigger value="penalties" className="whitespace-nowrap px-3 py-2 text-sm gap-2">
              <Clock className="h-4 w-4" />
              Penalties
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="goals">
          <RankingTable data={sortedByGoals} statKey="goals" statLabel="Goals" icon={Target} />
        </TabsContent>

        <TabsContent value="assists">
          <RankingTable data={sortedByAssists} statKey="assists" statLabel="Assists" icon={HandHelping} />
        </TabsContent>

        <TabsContent value="fouls">
          <RankingTable data={sortedByFouls} statKey="fouls" statLabel="Fouls" icon={AlertTriangle} />
        </TabsContent>

        <TabsContent value="penalties">
          <RankingTable data={sortedByPenalties} statKey="penalty_minutes" statLabel="Penalties" icon={Clock} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
