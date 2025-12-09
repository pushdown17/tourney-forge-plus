import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Medal, Users, Target, Calendar, Lock } from "lucide-react";

interface ClosedTournamentSummaryProps {
  tournament: any;
}

interface TeamStanding {
  team_id: string;
  team_name: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
}

interface Match {
  id: string;
  round_number: number;
  phase: string;
  team1_name: string;
  team2_name: string;
  team1_score: number | null;
  team2_score: number | null;
  is_third_place_match: boolean;
}

interface PlayerStat {
  player_name: string;
  team_name: string;
  goals: number;
  assists: number;
  fouls: number;
}

export const ClosedTournamentSummary = ({ tournament }: ClosedTournamentSummaryProps) => {
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [champion, setChampion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, [tournament.id]);

  const fetchAllData = async () => {
    try {
      // Fetch standings
      const { data: standingsData } = await supabase
        .from("team_stats")
        .select(`*, team:team_id(name)`)
        .eq("tournament_id", tournament.id);

      const sortedStandings = (standingsData || [])
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const diffA = a.goals_for - a.goals_against;
          const diffB = b.goals_for - b.goals_against;
          if (diffB !== diffA) return diffB - diffA;
          return b.goals_for - a.goals_for;
        })
        .map((s) => ({
          team_id: s.team_id,
          team_name: s.team?.name || "Équipe inconnue",
          points: s.points,
          wins: s.wins,
          draws: s.draws,
          losses: s.losses,
          goals_for: s.goals_for,
          goals_against: s.goals_against,
        }));

      setStandings(sortedStandings);

      // Fetch matches with team names
      const { data: matchesData } = await supabase
        .from("matches")
        .select(`
          id, round_number, phase, team1_score, team2_score, is_third_place_match,
          team1:team1_id(name),
          team2:team2_id(name)
        `)
        .eq("tournament_id", tournament.id)
        .order("phase")
        .order("round_number")
        .order("created_at");

      const formattedMatches = (matchesData || []).map((m: any) => ({
        id: m.id,
        round_number: m.round_number,
        phase: m.phase,
        team1_name: m.team1?.name || "TBD",
        team2_name: m.team2?.name || "TBD",
        team1_score: m.team1_score,
        team2_score: m.team2_score,
        is_third_place_match: m.is_third_place_match,
      }));

      setMatches(formattedMatches);

      // Find champion from final match
      const finalMatch = formattedMatches.find(
        (m) => 
          (m.phase === "single_elimination" || m.phase === "double_elimination") && 
          !m.is_third_place_match &&
          m.team1_score !== null && 
          m.team2_score !== null
      );

      if (finalMatch) {
        // Get the last elimination match (final)
        const eliminationMatches = formattedMatches.filter(
          (m) => (m.phase === "single_elimination" || m.phase === "double_elimination") && !m.is_third_place_match
        );
        const final = eliminationMatches[eliminationMatches.length - 1];
        if (final && final.team1_score !== null && final.team2_score !== null) {
          setChampion(final.team1_score > final.team2_score ? final.team1_name : final.team2_name);
        }
      }

      // Fetch player stats
      const { data: statsData } = await supabase
        .from("player_stats")
        .select(`
          goals, assists, fouls,
          player:player_id(name),
          tournament_team_player:tournament_team_player_id(
            tournament_team:tournament_team_id(
              team:team_id(name)
            )
          )
        `)
        .eq("tournament_id", tournament.id);

      // Aggregate player stats
      const playerStatsMap = new Map<string, PlayerStat>();
      (statsData || []).forEach((stat: any) => {
        const playerName = stat.player?.name || "Joueur inconnu";
        const teamName = stat.tournament_team_player?.tournament_team?.team?.name || "";
        const key = `${playerName}-${teamName}`;
        
        if (playerStatsMap.has(key)) {
          const existing = playerStatsMap.get(key)!;
          existing.goals += stat.goals || 0;
          existing.assists += stat.assists || 0;
          existing.fouls += stat.fouls || 0;
        } else {
          playerStatsMap.set(key, {
            player_name: playerName,
            team_name: teamName,
            goals: stat.goals || 0,
            assists: stat.assists || 0,
            fouls: stat.fouls || 0,
          });
        }
      });

      setPlayerStats(Array.from(playerStatsMap.values()));
    } catch (error) {
      console.error("Error fetching tournament data:", error);
    } finally {
      setLoading(false);
    }
  };

  const topScorers = [...playerStats].sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssisters = [...playerStats].sort((a, b) => b.assists - a.assists).slice(0, 5);

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case "round_robin": return "Round Robin";
      case "swiss": return "Swiss";
      case "single_elimination":
      case "double_elimination": return "Élimination";
      default: return phase;
    }
  };

  const getRoundLabel = (match: Match) => {
    if (match.is_third_place_match) return "3ème place";
    if (match.phase === "single_elimination" || match.phase === "double_elimination") {
      const eliminationMatches = matches.filter(
        (m) => (m.phase === "single_elimination" || m.phase === "double_elimination") && !m.is_third_place_match
      );
      const maxRound = Math.max(...eliminationMatches.map((m) => m.round_number));
      if (match.round_number === maxRound) return "Finale";
      if (match.round_number === maxRound - 1) return "Demi-finale";
      if (match.round_number === maxRound - 2) return "Quart de finale";
      return `Tour ${match.round_number}`;
    }
    return `Round ${match.round_number}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <p className="text-lg text-muted-foreground animate-pulse">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <Card className="glass-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold glow-text-primary">{tournament.name}</h1>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Clôturé
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {new Date(tournament.start_date).toLocaleDateString("fr-FR")} - {new Date(tournament.end_date).toLocaleDateString("fr-FR")}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Champion & Podium */}
      {champion && (
        <Card className="glass-card p-6 text-center bg-gradient-to-b from-primary/10 to-transparent">
          <Trophy className="h-16 w-16 mx-auto text-yellow-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Champion</h2>
          <p className="text-4xl font-bold glow-text-primary">{champion}</p>
          
          {standings.length >= 3 && (
            <div className="flex justify-center gap-8 mt-8">
              <div className="text-center">
                <Medal className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-muted-foreground">2ème</p>
                <p className="font-semibold">{standings[1]?.team_name}</p>
              </div>
              <div className="text-center">
                <Medal className="h-8 w-8 mx-auto text-amber-700 mb-2" />
                <p className="text-sm text-muted-foreground">3ème</p>
                <p className="font-semibold">{standings[2]?.team_name}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Standings */}
      <Card className="glass-card p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Classement final
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead className="text-center">J</TableHead>
              <TableHead className="text-center">V</TableHead>
              <TableHead className="text-center">N</TableHead>
              <TableHead className="text-center">D</TableHead>
              <TableHead className="text-center">BP</TableHead>
              <TableHead className="text-center">BC</TableHead>
              <TableHead className="text-center">Diff</TableHead>
              <TableHead className="text-center font-bold">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((stat, index) => (
              <TableRow key={stat.team_id}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell className="font-bold">{stat.team_name}</TableCell>
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
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Player Stats */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Scorers */}
        <Card className="glass-card p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Meilleurs buteurs
          </h3>
          <div className="space-y-3">
            {topScorers.map((player, index) => (
              <div key={`${player.player_name}-${player.team_name}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{player.player_name}</p>
                    <p className="text-xs text-muted-foreground">{player.team_name}</p>
                  </div>
                </div>
                <Badge variant="default">{player.goals} buts</Badge>
              </div>
            ))}
            {topScorers.length === 0 && (
              <p className="text-muted-foreground text-center py-4">Aucune donnée</p>
            )}
          </div>
        </Card>

        {/* Top Assisters */}
        <Card className="glass-card p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Meilleurs passeurs
          </h3>
          <div className="space-y-3">
            {topAssisters.map((player, index) => (
              <div key={`${player.player_name}-${player.team_name}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{player.player_name}</p>
                    <p className="text-xs text-muted-foreground">{player.team_name}</p>
                  </div>
                </div>
                <Badge variant="secondary">{player.assists} passes</Badge>
              </div>
            ))}
            {topAssisters.length === 0 && (
              <p className="text-muted-foreground text-center py-4">Aucune donnée</p>
            )}
          </div>
        </Card>
      </div>

      {/* All Matches */}
      <Card className="glass-card p-6">
        <h2 className="text-2xl font-bold mb-4">Tous les matchs</h2>
        <div className="space-y-6">
          {Object.entries(
            matches.reduce((acc, match) => {
              const phase = getPhaseLabel(match.phase);
              if (!acc[phase]) acc[phase] = [];
              acc[phase].push(match);
              return acc;
            }, {} as Record<string, Match[]>)
          ).map(([phase, phaseMatches]) => {
            // Group matches by round within each phase
            const matchesByRound = phaseMatches.reduce((acc, match) => {
              const round = match.round_number;
              if (!acc[round]) acc[round] = [];
              acc[round].push(match);
              return acc;
            }, {} as Record<number, Match[]>);

            return (
              <div key={phase}>
                <h3 className="text-lg font-semibold mb-3 text-primary">{phase}</h3>
                <div className="space-y-4">
                  {Object.entries(matchesByRound).map(([roundNum, roundMatches], roundIndex) => {
                    // Alternate colors: even rounds get lighter bg, odd rounds get darker
                    const isEvenRound = roundIndex % 2 === 0;
                    const bgClass = isEvenRound 
                      ? "bg-primary/10 border-l-4 border-l-primary/40" 
                      : "bg-muted/40 border-l-4 border-l-muted-foreground/30";
                    
                    return (
                      <div key={roundNum} className={`rounded-lg p-3 ${bgClass}`}>
                        <div className="text-sm font-semibold mb-2 text-muted-foreground">
                          {getRoundLabel(roundMatches[0])}
                        </div>
                        <div className="grid gap-2">
                          {roundMatches.map((match) => (
                            <div
                              key={match.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-background/80"
                            >
                              <div className="flex items-center gap-4 flex-1 justify-center">
                                <span className={`font-medium text-right flex-1 ${match.team1_score !== null && match.team2_score !== null && match.team1_score > match.team2_score ? "text-primary font-bold" : ""}`}>
                                  {match.team1_name}
                                </span>
                                <span className="font-bold bg-muted px-3 py-1 rounded">
                                  {match.team1_score ?? "-"} - {match.team2_score ?? "-"}
                                </span>
                                <span className={`font-medium text-left flex-1 ${match.team1_score !== null && match.team2_score !== null && match.team2_score > match.team1_score ? "text-primary font-bold" : ""}`}>
                                  {match.team2_name}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
