import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, TrendingUp } from "lucide-react";

interface SwissManagerProps {
  tournamentId: string;
}

export const SwissManager = ({ tournamentId }: SwissManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [maxRound, setMaxRound] = useState(1);

  useEffect(() => {
    fetchMatches();
    fetchMaxRound();
  }, [tournamentId, currentRound]);

  const fetchMaxRound = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select("round_number")
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .order("round_number", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      setMaxRound(data[0].round_number);
    }
  };

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:team1_id(id, name),
        team2:team2_id(id, name)
      `)
      .eq("tournament_id", tournamentId)
      .eq("phase", "swiss")
      .eq("round_number", currentRound)
      .order("created_at");

    if (error) {
      toast.error("Erreur lors du chargement des matchs");
      return;
    }

    setMatches(data || []);
  };

  const generateSwissRound = async () => {
    setLoading(true);
    try {
      // Fetch all teams
      const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("tournament_id", tournamentId);

      if (teamsError) throw teamsError;

      if (!teams || teams.length < 2) {
        toast.error("Il faut au moins 2 équipes pour créer des matchs");
        return;
      }

      // Determine which round to generate
      const roundToGenerate = matches.length === 0 ? currentRound : currentRound + 1;

      // Fetch all previous matches to avoid rematches when possible
      const { data: previousMatches, error: prevMatchesError } = await supabase
        .from("matches")
        .select("team1_id, team2_id")
        .eq("tournament_id", tournamentId)
        .eq("phase", "swiss");

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
        const statsA = statsMap.get(a.id) || { points: 0, goals_for: 0, goals_against: 0 };
        const statsB = statsMap.get(b.id) || { points: 0, goals_for: 0, goals_against: 0 };
        
        // Primary: Sort by points
        if (statsA.points !== statsB.points) {
          return statsB.points - statsA.points;
        }
        // Secondary: Sort by goal difference
        const diffA = statsA.goals_for - statsA.goals_against;
        const diffB = statsB.goals_for - statsB.goals_against;
        if (diffA !== diffB) {
          return diffB - diffA;
        }
        // Tertiary: Sort by goals scored
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

        // If no suitable opponent found (all have played), pair with the closest available team
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
            phase: "swiss",
            round_number: roundToGenerate,
            team1_id: team1.id,
            team2_id: team2.id,
          });
        }
      }

      if (newMatches.length === 0) {
        toast.error("Impossible de générer de nouveaux matchs.");
        return;
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(newMatches);

      if (insertError) throw insertError;

      toast.success(`Round ${roundToGenerate} généré avec ${newMatches.length} match${newMatches.length > 1 ? 's' : ''} !`);
      if (roundToGenerate > currentRound) {
        setCurrentRound(roundToGenerate);
        setMaxRound(roundToGenerate);
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

  const canGenerateNextRound = () => {
    // Check if all matches in current round are completed
    const allMatchesCompleted = matches.every(m => 
      m.team1_score !== null && m.team2_score !== null
    );
    return matches.length > 0 && allMatchesCompleted;
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Round Swiss {currentRound}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Les équipes sont appariées selon leur classement actuel
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentRound > 1 && (
              <Button 
                variant="outline" 
                onClick={() => setCurrentRound(currentRound - 1)}
                disabled={currentRound === 1}
              >
                Round précédent
              </Button>
            )}
            {currentRound < maxRound && (
              <Button 
                variant="outline"
                onClick={() => setCurrentRound(currentRound + 1)}
              >
                Round suivant
              </Button>
            )}
            <Button 
              onClick={generateSwissRound} 
              disabled={loading || (matches.length > 0 && !canGenerateNextRound())}
              className="gap-2"
            >
              <TrendingUp className="h-4 w-4" />
              {matches.length === 0 ? `Générer Round ${currentRound}` : `Générer Round ${currentRound + 1}`}
            </Button>
          </div>
        </div>

        {matches.length > 0 && !canGenerateNextRound() && (
          <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm">
            <p className="text-foreground">
              Complétez tous les matchs de ce round pour générer le suivant.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {matches.filter(m => m.team1_score === null || m.team2_score === null).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Matchs en cours</h3>
              {matches.filter(m => m.team1_score === null || m.team2_score === null).map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onScoreUpdate={updateScore}
                />
              ))}
            </div>
          )}
          
          {matches.filter(m => m.team1_score !== null && m.team2_score !== null).length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-muted-foreground">Matchs terminés</h3>
              <div className="space-y-2 opacity-60">
                {matches.filter(m => m.team1_score !== null && m.team2_score !== null).map((match) => (
                  <CompletedMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          )}
          
          {matches.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              Aucun match pour ce round. Cliquez sur "Générer" pour créer les matchs selon le système Swiss.
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
    <div className="flex items-center gap-4 p-4 bg-secondary/20 rounded-lg border border-border/50 hover:border-primary/50 transition-colors">
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className="font-medium flex-1">{match.team1?.name || "Équipe 1"}</span>
        <Input
          type="number"
          min="0"
          value={team1Score}
          onChange={(e) => setTeam1Score(parseInt(e.target.value) || 0)}
          className="w-20 text-center"
        />
      </div>
      <span className="text-muted-foreground font-bold">vs</span>
      <div className="flex-1 flex items-center justify-between gap-3">
        <Input
          type="number"
          min="0"
          value={team2Score}
          onChange={(e) => setTeam2Score(parseInt(e.target.value) || 0)}
          className="w-20 text-center"
        />
        <span className="font-medium flex-1 text-right">{match.team2?.name || "Équipe 2"}</span>
      </div>
      <Button
        onClick={() => onScoreUpdate(match.id, team1Score, team2Score)}
        size="sm"
      >
        Valider
      </Button>
    </div>
  );
};

const CompletedMatchCard = ({ match }: { match: any }) => {
  const isTeam1Winner = match.team1_score > match.team2_score;
  const isTeam2Winner = match.team2_score > match.team1_score;
  
  return (
    <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className={`font-medium ${isTeam1Winner ? 'text-primary' : ''}`}>
          {match.team1?.name || "Équipe 1"}
        </span>
        <span className={`text-lg font-bold ${isTeam1Winner ? 'text-primary' : ''}`}>
          {match.team1_score}
        </span>
      </div>
      <span className="text-muted-foreground">-</span>
      <div className="flex-1 flex items-center justify-between gap-3">
        <span className={`text-lg font-bold ${isTeam2Winner ? 'text-primary' : ''}`}>
          {match.team2_score}
        </span>
        <span className={`font-medium text-right ${isTeam2Winner ? 'text-primary' : ''}`}>
          {match.team2?.name || "Équipe 2"}
        </span>
      </div>
    </div>
  );
};
