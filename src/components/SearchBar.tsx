import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Search, Trophy, User, Calendar, Target, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Tournament = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  current_phase: string;
  is_closed: boolean;
};

type PlayerResult = {
  name: string;
  tournaments_count: number;
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
        .select("id, name, start_date, end_date, current_phase, is_closed")
        .ilike("name", `%${searchQuery}%`)
        .limit(5);

      if (tournamentsError) throw tournamentsError;

      // Search players by name (players are now independent of teams/tournaments)
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id, name")
        .ilike("name", `%${searchQuery}%`)
        .limit(5);

      if (playersError) throw playersError;

      // Get player stats and group by name
      const playersMap = new Map<string, PlayerResult>();
      
      for (const player of playersData || []) {
        const { data: stats } = await supabase
          .from("player_stats")
          .select("goals, assists, fouls, match_id")
          .eq("player_id", player.id);

        const uniqueMatches = new Set(stats?.map(s => s.match_id).filter(Boolean));
        const totalGoals = stats?.reduce((sum, s) => sum + (s.goals || 0), 0) || 0;
        const totalAssists = stats?.reduce((sum, s) => sum + (s.assists || 0), 0) || 0;
        const totalFouls = stats?.reduce((sum, s) => sum + (s.fouls || 0), 0) || 0;

        if (playersMap.has(player.name)) {
          const existing = playersMap.get(player.name)!;
          playersMap.set(player.name, {
            name: player.name,
            tournaments_count: existing.tournaments_count + 1,
            total_goals: existing.total_goals + totalGoals,
            total_assists: existing.total_assists + totalAssists,
            total_fouls: existing.total_fouls + totalFouls,
            matches_played: existing.matches_played + uniqueMatches.size,
          });
        } else {
          playersMap.set(player.name, {
            name: player.name,
            tournaments_count: 1,
            total_goals: totalGoals,
            total_assists: totalAssists,
            total_fouls: totalFouls,
            matches_played: uniqueMatches.size,
          });
        }
      }

      setTournaments(tournamentsData || []);
      setPlayers(Array.from(playersMap.values()));
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tournament.name}</span>
                            {tournament.is_closed && (
                              <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                                <Lock className="h-3 w-3" />
                                Clôturé
                              </Badge>
                            )}
                          </div>
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
                        key={player.name}
                        to={`/player/${encodeURIComponent(player.name)}`}
                        onClick={() => setShowResults(false)}
                      >
                        <Card className="p-3 hover:bg-primary/10 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{player.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {player.tournaments_count} tournoi{player.tournaments_count > 1 ? "s" : ""}
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