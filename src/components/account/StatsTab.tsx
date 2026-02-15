import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Trophy, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type TournamentStats = {
  id: string;
  name: string;
  teamName: string;
  goals: number;
  assists: number;
  fouls: number;
  matches: number;
};

export function StatsTab({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [linkedPlayerId, setLinkedPlayerId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<TournamentStats[]>([]);
  const [totals, setTotals] = useState({ goals: 0, assists: 0, fouls: 0, matches: 0 });

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const fetchStats = async () => {
    setLoading(true);

    // Get profile to find linked player
    const { data: profile } = await supabase
      .from("profiles")
      .select("linked_player_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.linked_player_id) {
      setLinkedPlayerId(null);
      setLoading(false);
      return;
    }

    setLinkedPlayerId(profile.linked_player_id);
    const playerId = profile.linked_player_id;

    // Get all tournament participations
    const { data: participations } = await supabase
      .from("tournament_team_players")
      .select(`
        tournament_team_id,
        tournament_teams!inner (
          tournament_id,
          tournaments!inner (id, name),
          teams!inner (name)
        )
      `)
      .eq("player_id", playerId);

    if (!participations || participations.length === 0) {
      setLoading(false);
      return;
    }

    const tournamentsData: TournamentStats[] = [];

    for (const participation of participations as any[]) {
      const tournamentId = participation.tournament_teams.tournament_id;

      const { data: stats } = await supabase
        .from("player_stats")
        .select("goals, assists, fouls, match_id")
        .eq("player_id", playerId)
        .eq("tournament_id", tournamentId);

      const uniqueMatches = new Set(stats?.map((s) => s.match_id).filter(Boolean));
      const goals = stats?.reduce((sum, s) => sum + (s.goals || 0), 0) || 0;
      const assists = stats?.reduce((sum, s) => sum + (s.assists || 0), 0) || 0;
      const fouls = stats?.reduce((sum, s) => sum + (s.fouls || 0), 0) || 0;

      tournamentsData.push({
        id: participation.tournament_teams.tournaments.id,
        name: participation.tournament_teams.tournaments.name,
        teamName: participation.tournament_teams.teams.name,
        goals,
        assists,
        fouls,
        matches: uniqueMatches.size,
      });
    }

    setTournaments(tournamentsData);
    setTotals({
      goals: tournamentsData.reduce((s, t) => s + t.goals, 0),
      assists: tournamentsData.reduce((s, t) => s + t.assists, 0),
      fouls: tournamentsData.reduce((s, t) => s + t.fouls, 0),
      matches: tournamentsData.reduce((s, t) => s + t.matches, 0),
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!linkedPlayerId) {
    return (
      <Card className="p-8 glass-card text-center">
        <p className="text-muted-foreground">
          Link your account to a player in the <strong>Profile</strong> tab to see your stats.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 glass-card">
          <div className="flex items-center gap-3">
            <Target className="h-7 w-7 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Goals</p>
              <p className="text-2xl font-bold">{totals.goals}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass-card">
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Assists</p>
              <p className="text-2xl font-bold">{totals.assists}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass-card">
          <div className="flex items-center gap-3">
            <Trophy className="h-7 w-7 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Matches</p>
              <p className="text-2xl font-bold">{totals.matches}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass-card">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-destructive/20 flex items-center justify-center">
              <span className="text-destructive font-bold text-sm">F</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fouls</p>
              <p className="text-2xl font-bold">{totals.fouls}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tournament history */}
      <h2 className="text-xl font-bold">Tournament History</h2>
      {tournaments.length === 0 ? (
        <Card className="p-6 glass-card text-center">
          <p className="text-muted-foreground">No participation found.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <Link key={t.id} to={`/tournament/${t.id}?tab=standings`}>
              <Card className="p-4 glass-card hover:bg-primary/10 transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <p className="text-sm text-muted-foreground">Team: {t.teamName}</p>
                  </div>
                  <Badge variant="outline">
                    {t.matches} match{t.matches > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="outline" className="gap-1">
                    <Target className="h-3 w-3" /> {t.goals} goal{t.goals > 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" /> {t.assists} assist{t.assists > 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <span className="text-destructive">F</span> {t.fouls} foul{t.fouls > 1 ? "s" : ""}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
