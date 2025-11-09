import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, Trophy, User, Calendar, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Tournament = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  current_phase: string;
};

type PlayerResult = {
  id: string;
  name: string;
  team_id: string;
  team_name: string;
  tournament_id: string;
  tournament_name: string;
  total_goals: number;
  total_assists: number;
  total_fouls: number;
  matches_played: number;
};

export const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchData();
    } else {
      setTournaments([]);
      setPlayers([]);
      setShowResults(false);
    }
  }, [searchQuery]);

  const searchData = async () => {
    setIsSearching(true);
    try {
      // Search tournaments
      const { data: tournamentsData, error: tournamentsError } = await supabase
        .from("tournaments")
        .select("id, name, start_date, end_date, current_phase")
        .ilike("name", `%${searchQuery}%`)
        .limit(5);

      if (tournamentsError) throw tournamentsError;

      // Search players with their stats
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select(`
          id,
          name,
          team_id,
          teams!inner(name, tournament_id, tournaments!inner(name))
        `)
        .ilike("name", `%${searchQuery}%`)
        .limit(5);

      if (playersError) throw playersError;

      // Get player stats
      const playersWithStats = await Promise.all(
        (playersData || []).map(async (player: any) => {
          const { data: stats } = await supabase
            .from("player_stats")
            .select("goals, assists, fouls, match_id")
            .eq("player_id", player.id);

          const uniqueMatches = new Set(stats?.map(s => s.match_id).filter(Boolean));
          const totalGoals = stats?.reduce((sum, s) => sum + (s.goals || 0), 0) || 0;
          const totalAssists = stats?.reduce((sum, s) => sum + (s.assists || 0), 0) || 0;
          const totalFouls = stats?.reduce((sum, s) => sum + (s.fouls || 0), 0) || 0;

          return {
            id: player.id,
            name: player.name,
            team_id: player.team_id,
            team_name: player.teams.name,
            tournament_id: player.teams.tournament_id,
            tournament_name: player.teams.tournaments.name,
            total_goals: totalGoals,
            total_assists: totalAssists,
            total_fouls: totalFouls,
            matches_played: uniqueMatches.size,
          };
        })
      );

      setTournaments(tournamentsData || []);
      setPlayers(playersWithStats);
      setShowResults(true);
    } catch (error) {
      console.error("Error searching:", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Rechercher un tournoi ou un joueur..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
          className="pl-10 h-12 text-lg glass-card"
        />
      </div>

      {showResults && (searchQuery.length >= 2) && (
        <Card className="absolute z-50 w-full mt-2 glass-card border-primary/20 max-h-[500px] overflow-y-auto">
          {isSearching ? (
            <div className="p-6 text-center text-muted-foreground">
              Recherche en cours...
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Tournaments Results */}
              {tournaments.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Tournois</h3>
                  </div>
                  <div className="space-y-2">
                    {tournaments.map((tournament) => (
                      <Link
                        key={tournament.id}
                        to={`/tournament/${tournament.id}`}
                        onClick={() => setShowResults(false)}
                      >
                        <Card className="p-3 hover:bg-primary/10 transition-colors cursor-pointer">
                          <div className="font-medium">{tournament.name}</div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {new Date(tournament.start_date).toLocaleDateString("fr-FR")} -{" "}
                              {new Date(tournament.end_date).toLocaleDateString("fr-FR")}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Players Results */}
              {players.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Joueurs</h3>
                  </div>
                  <div className="space-y-2">
                    {players.map((player) => (
                      <Link
                        key={player.id}
                        to={`/tournament/${player.tournament_id}?tab=standings`}
                        onClick={() => setShowResults(false)}
                      >
                        <Card className="p-3 hover:bg-primary/10 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{player.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {player.team_name} • {player.tournament_name}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Target className="h-3 w-3" />
                                {player.total_goals}
                              </Badge>
                              <Badge variant="outline">
                                {player.total_assists} A
                              </Badge>
                            </div>
                          </div>
                          {player.matches_played > 0 && (
                            <div className="text-xs text-muted-foreground mt-2">
                              {player.matches_played} match{player.matches_played > 1 ? "s" : ""} joué{player.matches_played > 1 ? "s" : ""}
                            </div>
                          )}
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {tournaments.length === 0 && players.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  Aucun résultat trouvé pour "{searchQuery}"
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowResults(false)}
              >
                Fermer
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};