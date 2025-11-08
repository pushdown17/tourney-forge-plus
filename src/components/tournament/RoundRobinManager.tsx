import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RoundRobinManagerProps {
  tournamentId: string;
}

export const RoundRobinManager = ({ tournamentId }: RoundRobinManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMatches();
  }, [tournamentId, currentRound]);

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:team1_id(id, name),
        team2:team2_id(id, name)
      `)
      .eq("tournament_id", tournamentId)
      .eq("phase", "round_robin")
      .eq("round_number", currentRound)
      .order("created_at");

    if (error) {
      toast.error("Erreur lors du chargement des matchs");
      return;
    }

    setMatches(data || []);
  };

  const generateNextRound = async () => {
    setLoading(true);
    try {
      // Fetch all teams
      const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("id")
        .eq("tournament_id", tournamentId);

      if (teamsError) throw teamsError;

      if (!teams || teams.length < 2) {
        toast.error("Il faut au moins 2 équipes pour créer des matchs");
        return;
      }

      // Determine which round to generate
      const roundToGenerate = matches.length === 0 ? currentRound : currentRound + 1;

      // Fetch all previous matches to avoid duplicates
      const { data: previousMatches, error: prevMatchesError } = await supabase
        .from("matches")
        .select("team1_id, team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "round_robin");

      if (prevMatchesError) throw prevMatchesError;

      // Create a set of already played matchups
      const playedMatchups = new Set(
        (previousMatches || []).map(m => 
          [m.team1_id, m.team2_id].sort().join("-")
        )
      );

      // Fetch team stats for Swiss pairing
      const { data: stats, error: statsError } = await supabase
        .from("team_stats")
        .select("team_id, points, wins, losses, draws, goals_for, goals_against")
        .eq("tournament_id", tournamentId)
        .order("points", { ascending: false })
        .order("goals_for", { ascending: false });

      if (statsError) throw statsError;

      // Create a map of team stats
      const statsMap = new Map(
        (stats || []).map(s => [s.team_id, s])
      );

      // Sort teams by their stats (Swiss system)
      const sortedTeams = teams.sort((a, b) => {
        const statsA = statsMap.get(a.id) || { points: 0, goals_for: 0 };
        const statsB = statsMap.get(b.id) || { points: 0, goals_for: 0 };
        
        if (statsA.points !== statsB.points) {
          return statsB.points - statsA.points;
        }
        return statsB.goals_for - statsA.goals_for;
      });

      // Swiss pairing algorithm
      const newMatches = [];
      const paired = new Set();

      for (let i = 0; i < sortedTeams.length; i++) {
        if (paired.has(sortedTeams[i].id)) continue;

        const team1 = sortedTeams[i];
        let team2 = null;

        // Try to find the best opponent (closest in ranking that hasn't played against)
        for (let j = i + 1; j < sortedTeams.length; j++) {
          if (paired.has(sortedTeams[j].id)) continue;

          const matchupKey = [team1.id, sortedTeams[j].id].sort().join("-");
          
          if (!playedMatchups.has(matchupKey)) {
            team2 = sortedTeams[j];
            break;
          }
        }

        // If no suitable opponent found, pair with the closest available team
        if (!team2) {
          for (let j = i + 1; j < sortedTeams.length; j++) {
            if (!paired.has(sortedTeams[j].id)) {
              team2 = sortedTeams[j];
              break;
            }
          }
        }

        if (team2) {
          paired.add(team1.id);
          paired.add(team2.id);

          newMatches.push({
            tournament_id: tournamentId,
            phase: "round_robin",
            round_number: roundToGenerate,
            team1_id: team1.id,
            team2_id: team2.id,
          });
        }
      }

      if (newMatches.length === 0) {
        toast.error("Impossible de générer de nouveaux matchs. Toutes les équipes se sont déjà affrontées.");
        return;
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(newMatches);

      if (insertError) throw insertError;

      toast.success(`Round ${roundToGenerate} généré avec ${newMatches.length} match${newMatches.length > 1 ? 's' : ''} !`);
      if (roundToGenerate > currentRound) {
        setCurrentRound(roundToGenerate);
      } else {
        fetchMatches();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateScore = async (matchId: string, team1Score: number, team2Score: number) => {
    try {
      const match = matches.find(m => m.id === matchId);
      const winnerId = team1Score > team2Score ? match.team1_id : 
                      team2Score > team1Score ? match.team2_id : null;

      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: team1Score,
          team2_score: team2Score,
          winner_id: winnerId,
        })
        .eq("id", matchId);

      if (error) throw error;

      toast.success("Score enregistré !");
      fetchMatches();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Round {currentRound}</h2>
          <Button onClick={generateNextRound} disabled={loading}>
            {matches.length === 0 ? `Générer le Round ${currentRound}` : `Générer le Round ${currentRound + 1}`}
          </Button>
        </div>

        <div className="space-y-4">
          {matches.filter(m => m.team1_score === null || m.team2_score === null).map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onScoreUpdate={updateScore}
            />
          ))}
          {matches.filter(m => m.team1_score === null || m.team2_score === null).length === 0 && matches.length > 0 && (
            <p className="text-muted-foreground text-center py-8">
              Tous les matchs de ce round sont terminés !
            </p>
          )}
          {matches.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              Aucun match pour ce round. Cliquez sur "Générer" pour créer les matchs.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

interface MatchCardProps {
  match: any;
  onScoreUpdate: (matchId: string, team1Score: number, team2Score: number) => void;
}

const MatchCard = ({ match, onScoreUpdate }: MatchCardProps) => {
  const [team1Score, setTeam1Score] = useState(match.team1_score ?? 0);
  const [team2Score, setTeam2Score] = useState(match.team2_score ?? 0);

  return (
    <div className="flex items-center gap-4 p-4 bg-secondary/20 rounded-lg">
      <div className="flex-1 flex items-center justify-between">
        <span className="font-medium">{match.team1?.name || "Équipe 1"}</span>
        <Input
          type="number"
          min="0"
          value={team1Score}
          onChange={(e) => setTeam1Score(parseInt(e.target.value) || 0)}
          className="w-20 text-center"
        />
      </div>
      <span className="text-muted-foreground">vs</span>
      <div className="flex-1 flex items-center justify-between">
        <Input
          type="number"
          min="0"
          value={team2Score}
          onChange={(e) => setTeam2Score(parseInt(e.target.value) || 0)}
          className="w-20 text-center"
        />
        <span className="font-medium">{match.team2?.name || "Équipe 2"}</span>
      </div>
      <Button
        onClick={() => onScoreUpdate(match.id, team1Score, team2Score)}
      >
        Valider
      </Button>
    </div>
  );
};
