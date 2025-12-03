import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Trophy, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type PlayerData = {
  name: string;
  tournaments: {
    id: string;
    name: string;
    teamName: string;
    goals: number;
    assists: number;
    fouls: number;
    matches: number;
  }[];
  totalGoals: number;
  totalAssists: number;
  totalFouls: number;
  totalMatches: number;
};

export default function PlayerProfile() {
  const { name } = useParams<{ name: string }>();
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!name) return;

      setLoading(true);
      try {
        // Fetch all players with this name
        const { data: players, error: playersError } = await supabase
          .from("players")
          .select("id, name")
          .ilike("name", name);

        if (playersError) throw playersError;

        if (!players || players.length === 0) {
          setPlayerData(null);
          return;
        }

        // Fetch tournament participation for each player via tournament_team_players
        const tournamentsData: {
          id: string;
          name: string;
          teamName: string;
          goals: number;
          assists: number;
          fouls: number;
          matches: number;
        }[] = [];

        for (const player of players) {
          // Get all tournament participations for this player
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
            .eq("player_id", player.id);

          if (!participations) continue;

          for (const participation of participations as any[]) {
            const tournamentId = participation.tournament_teams.tournament_id;
            
            // Get stats for this player in this tournament
            const { data: stats } = await supabase
              .from("player_stats")
              .select("goals, assists, fouls, match_id")
              .eq("player_id", player.id)
              .eq("tournament_id", tournamentId);

            const uniqueMatches = new Set(stats?.map(s => s.match_id).filter(Boolean));
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
        }

        const totalGoals = tournamentsData.reduce((sum, t) => sum + t.goals, 0);
        const totalAssists = tournamentsData.reduce((sum, t) => sum + t.assists, 0);
        const totalFouls = tournamentsData.reduce((sum, t) => sum + t.fouls, 0);
        const totalMatches = tournamentsData.reduce((sum, t) => sum + t.matches, 0);

        setPlayerData({
          name: players[0].name,
          tournaments: tournamentsData,
          totalGoals,
          totalAssists,
          totalFouls,
          totalMatches,
        });
      } catch (error) {
        console.error("Error fetching player data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [name]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/80">
        <Navigation />
        <div className="container mx-auto px-4 py-8 mt-16">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!playerData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/80">
        <Navigation />
        <div className="container mx-auto px-4 py-8 mt-16">
          <h1 className="text-4xl font-bold mb-8">Joueur non trouvé</h1>
          <Link to="/" className="text-primary hover:underline">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80">
      <Navigation />
      <div className="container mx-auto px-4 py-8 mt-16">
        <h1 className="text-4xl font-bold mb-8">{playerData.name}</h1>

        {/* Stats globales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-6 glass-card">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Buts totaux</p>
                <p className="text-3xl font-bold">{playerData.totalGoals}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 glass-card">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Passes décisives</p>
                <p className="text-3xl font-bold">{playerData.totalAssists}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 glass-card">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Matchs joués</p>
                <p className="text-3xl font-bold">{playerData.totalMatches}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 glass-card">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center">
                <span className="text-destructive font-bold">F</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fautes totales</p>
                <p className="text-3xl font-bold">{playerData.totalFouls}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Historique par tournoi */}
        <h2 className="text-2xl font-bold mb-4">Historique des tournois</h2>
        <div className="space-y-4">
          {playerData.tournaments.map((tournament) => (
            <Link key={tournament.id} to={`/tournament/${tournament.id}?tab=standings`}>
              <Card className="p-6 glass-card hover:bg-primary/10 transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">{tournament.name}</h3>
                    <p className="text-sm text-muted-foreground">Équipe: {tournament.teamName}</p>
                  </div>
                  <Badge variant="outline">{tournament.matches} match{tournament.matches > 1 ? "s" : ""}</Badge>
                </div>
                
                <div className="flex gap-4">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {tournament.goals} but{tournament.goals > 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {tournament.assists} passe{tournament.assists > 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <span className="text-destructive">F</span>
                    {tournament.fouls} faute{tournament.fouls > 1 ? "s" : ""}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
