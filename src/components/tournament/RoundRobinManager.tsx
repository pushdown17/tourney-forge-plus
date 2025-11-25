import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScoreInput } from "@/components/ui/score-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Users, Target, Trophy, AlertTriangle, Clock } from "lucide-react";
import { GoalScorerDialog } from "./GoalScorerDialog";
import { QuickStatDialog } from "./QuickStatDialog";

interface RoundRobinManagerProps {
  tournamentId: string;
  isClosed?: boolean;
  currentPhase?: string;
}

export const RoundRobinManager = ({ tournamentId, isClosed = false, currentPhase }: RoundRobinManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

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
      // Validate input
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({
        team1_score: team1Score,
        team2_score: team2Score,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const match = matches.find(m => m.id === matchId);
      const winnerId = validation.data.team1_score > validation.data.team2_score ? match.team1_id : 
                      validation.data.team2_score > validation.data.team1_score ? match.team2_id : null;

      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: validation.data.team1_score,
          team2_score: validation.data.team2_score,
          winner_id: winnerId,
        })
        .eq("id", matchId);

      if (error) throw error;

      toast.success("Score enregistré !");
      setEditingMatchId(null);
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
          <Button 
            onClick={generateNextRound} 
            disabled={loading || isClosed || (currentPhase && currentPhase !== "round_robin")}
          >
            {matches.length === 0 ? `Générer le Round ${currentRound}` : `Générer le Round ${currentRound + 1}`}
          </Button>
        </div>

        {currentPhase && currentPhase !== "round_robin" && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-foreground">
              Le tournoi est en phase {currentPhase === "elimination" ? "éliminatoire" : currentPhase}. Vous ne pouvez plus générer de nouveaux rounds Round Robin.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {matches.filter(m => m.team1_score === null || m.team2_score === null).map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              tournamentId={tournamentId}
              onScoreUpdate={updateScore}
              editingMatchId={editingMatchId}
              setEditingMatchId={setEditingMatchId}
              isClosed={isClosed}
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
  tournamentId: string;
  onScoreUpdate: (matchId: string, team1Score: number, team2Score: number) => void;
  editingMatchId: string | null;
  setEditingMatchId: (id: string | null) => void;
  isClosed?: boolean;
}

const MatchCard = ({ match, tournamentId, onScoreUpdate, editingMatchId, setEditingMatchId, isClosed = false }: MatchCardProps) => {
  const [team1Score, setTeam1Score] = useState(match.team1_score ?? 0);
  const [team2Score, setTeam2Score] = useState(match.team2_score ?? 0);
  const [isOpen, setIsOpen] = useState(false);
  const [team1Players, setTeam1Players] = useState<any[]>([]);
  const [team2Players, setTeam2Players] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, any>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [goalScorerDialogOpen, setGoalScorerDialogOpen] = useState(false);
  const [scoringTeam, setScoringTeam] = useState<{ id: string; name: string } | null>(null);
  const [quickStatDialogOpen, setQuickStatDialogOpen] = useState(false);
  const [quickStatType, setQuickStatType] = useState<"assists" | "fouls" | "penalty_30s" | "penalty_1m" | "penalty_2m">("assists");
  const [quickStatTeam, setQuickStatTeam] = useState<{ id: string; name: string } | null>(null);
  
  const isLocked = editingMatchId !== null && editingMatchId !== match.id;
  const isEditing = editingMatchId === match.id;

  useEffect(() => {
    if (isOpen) {
      fetchPlayers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (team1Players.length > 0 || team2Players.length > 0) {
      fetchPlayerStats();
    }
  }, [team1Players, team2Players, goalScorerDialogOpen]);

  const fetchPlayers = async () => {
    const { data: players1, error: error1 } = await supabase
      .from("players")
      .select("*")
      .eq("team_id", match.team1_id)
      .order("name");

    const { data: players2, error: error2 } = await supabase
      .from("players")
      .select("*")
      .eq("team_id", match.team2_id)
      .order("name");

    if (!error1) setTeam1Players(players1 || []);
    if (!error2) setTeam2Players(players2 || []);
  };

  const fetchPlayerStats = async () => {
    const allPlayerIds = [...team1Players, ...team2Players].map(p => p.id);
    
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("match_id", match.id)
      .in("player_id", allPlayerIds);

    if (!error && data) {
      const statsMap = data.reduce((acc, stat) => {
        acc[stat.player_id] = stat;
        return acc;
      }, {} as Record<string, any>);
      setPlayerStats(statsMap);
    }
  };

  const updatePlayerStat = async (playerId: string, field: string, value: number) => {
    const existingStat = playerStats[playerId];

    if (existingStat) {
      const { error } = await supabase
        .from("player_stats")
        .update({ [field]: value })
        .eq("id", existingStat.id);

      if (!error) {
        setPlayerStats(prev => ({
          ...prev,
          [playerId]: { ...prev[playerId], [field]: value }
        }));
      }
    } else {
      const { data, error } = await supabase
        .from("player_stats")
        .insert({
          player_id: playerId,
          tournament_id: tournamentId,
          match_id: match.id,
          [field]: value,
        })
        .select()
        .single();

      if (!error && data) {
        setPlayerStats(prev => ({
          ...prev,
          [playerId]: data
        }));
      }
    }

    // Si c'est un but, mettre à jour le score du match
    if (field === "goals") {
      await updateMatchScoresFromPlayerStats();
    }
  };

  const updateMatchScoresFromPlayerStats = async () => {
    // Récupérer tous les stats des joueurs pour ce match
    const { data: allStats, error } = await supabase
      .from("player_stats")
      .select("player_id, goals")
      .eq("match_id", match.id);

    if (error || !allStats) return;

    // Calculer les scores pour chaque équipe
    const team1PlayerIds = team1Players.map(p => p.id);
    const team2PlayerIds = team2Players.map(p => p.id);

    const team1Goals = allStats
      .filter(stat => team1PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    const team2Goals = allStats
      .filter(stat => team2PlayerIds.includes(stat.player_id))
      .reduce((sum, stat) => sum + (stat.goals || 0), 0);

    // Mettre à jour les scores locaux UNIQUEMENT (pas la DB)
    setTeam1Score(team1Goals);
    setTeam2Score(team2Goals);
  };

  const handleValidateScore = () => {
    setShowConfirmDialog(true);
  };

  const confirmValidateScore = () => {
    onScoreUpdate(match.id, team1Score, team2Score);
    setShowConfirmDialog(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <div className={`flex flex-col gap-2 p-4 bg-secondary/20 rounded-lg ${isLocked ? 'opacity-50' : ''}`}>
        {isLocked && (
          <div className="text-xs text-muted-foreground mb-2">
            🔒 Veuillez valider le match en cours avant de modifier celui-ci
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="flex-1 flex items-center justify-between">
            <span className="font-medium">{match.team1?.name || "Équipe 1"}</span>
            <ScoreInput
              value={team1Score}
              onChange={(value) => {
                setTeam1Score(value);
                if (!isEditing) setEditingMatchId(match.id);
              }}
              onIncrement={() => {
                setScoringTeam({ id: match.team1_id, name: match.team1?.name || "Équipe 1" });
                setGoalScorerDialogOpen(true);
              }}
              disabled={isLocked || isClosed}
            />
          </div>
          <span className="text-muted-foreground">vs</span>
          <div className="flex-1 flex items-center justify-between">
            <ScoreInput
              value={team2Score}
              onChange={(value) => {
                setTeam2Score(value);
                if (!isEditing) setEditingMatchId(match.id);
              }}
              onIncrement={() => {
                setScoringTeam({ id: match.team2_id, name: match.team2?.name || "Équipe 2" });
                setGoalScorerDialogOpen(true);
              }}
              disabled={isLocked || isClosed}
            />
            <span className="font-medium">{match.team2?.name || "Équipe 2"}</span>
          </div>
        </div>

        {/* Onglets stats rapides */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuickStatType("assists");
              setQuickStatTeam(null);
              setQuickStatDialogOpen(true);
            }}
            disabled={isLocked || isClosed}
            className="text-xs"
          >
            Passes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuickStatType("fouls");
              setQuickStatTeam(null);
              setQuickStatDialogOpen(true);
            }}
            disabled={isLocked || isClosed}
            className="text-xs"
          >
            Fautes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuickStatType("penalty_30s");
              setQuickStatTeam(null);
              setQuickStatDialogOpen(true);
            }}
            disabled={isLocked || isClosed}
            className="text-xs"
          >
            30 sec
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuickStatType("penalty_1m");
              setQuickStatTeam(null);
              setQuickStatDialogOpen(true);
            }}
            disabled={isLocked || isClosed}
            className="text-xs"
          >
            1 min
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuickStatType("penalty_2m");
              setQuickStatTeam(null);
              setQuickStatDialogOpen(true);
            }}
            disabled={isLocked || isClosed}
            className="text-xs"
          >
            2 min
          </Button>
        </div>

        <div className="flex gap-2 justify-end">
          {isEditing && (
            <Button
              onClick={() => {
                setTeam1Score(match.team1_score ?? 0);
                setTeam2Score(match.team2_score ?? 0);
                setEditingMatchId(null);
              }}
              size="sm"
              variant="outline"
            >
              Annuler
            </Button>
          )}
          <Button
            onClick={handleValidateScore}
            disabled={isLocked || isClosed}
          >
            Valider
          </Button>
        </div>
      </div>

      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-center gap-2"
          disabled={isLocked || isClosed}
        >
          <Users className="h-4 w-4" />
          Statistiques des joueurs
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Card className="p-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Team 1 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match.team1?.name}
              </h4>
              <div className="space-y-2">
                {team1Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                    onEditStart={() => !isEditing && setEditingMatchId(match.id)}
                    onEditEnd={() => setEditingMatchId(null)}
                  />
                ))}
                {team1Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun joueur</p>
                )}
              </div>
            </div>

            {/* Team 2 Players */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {match.team2?.name}
              </h4>
              <div className="space-y-2">
                {team2Players.map((player) => (
                  <PlayerStatsInput
                    key={player.id}
                    player={player}
                    stats={playerStats[player.id] || {}}
                    onUpdate={(field, value) => updatePlayerStat(player.id, field, value)}
                    onEditStart={() => !isEditing && setEditingMatchId(match.id)}
                    onEditEnd={() => setEditingMatchId(null)}
                  />
                ))}
                {team2Players.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun joueur</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </CollapsibleContent>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le score final</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez-vous le score final de ce match ?<br />
              <strong>{match.team1?.name}</strong> : {team1Score} - {team2Score} : <strong>{match.team2?.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmValidateScore}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {scoringTeam && (
        <GoalScorerDialog
          open={goalScorerDialogOpen}
          onOpenChange={(open) => {
            setGoalScorerDialogOpen(open);
            if (!open) {
              // Recharger les stats quand le dialog se ferme
              fetchPlayerStats();
            }
          }}
          teamId={scoringTeam.id}
          teamName={scoringTeam.name}
          matchId={match.id}
          tournamentId={tournamentId}
          onGoalRecorded={() => {
            // Recharger immédiatement après l'enregistrement
            fetchPlayerStats();
          }}
        />
      )}

      {quickStatDialogOpen && (
        <QuickStatDialog
          open={quickStatDialogOpen}
          onOpenChange={(open) => {
            setQuickStatDialogOpen(open);
            if (!open) {
              fetchPlayerStats();
            }
          }}
          team1={{ id: match.team1_id, name: match.team1?.name || "Équipe 1" }}
          team2={{ id: match.team2_id, name: match.team2?.name || "Équipe 2" }}
          matchId={match.id}
          tournamentId={tournamentId}
          statType={quickStatType}
          statLabel={
            quickStatType === "assists" ? "Passe décisive" :
            quickStatType === "fouls" ? "Faute" :
            quickStatType === "penalty_30s" ? "Pénalité 30 sec" :
            quickStatType === "penalty_1m" ? "Pénalité 1 min" :
            "Pénalité 2 min"
          }
          onStatRecorded={() => {
            fetchPlayerStats();
          }}
        />
      )}
    </Collapsible>
  );
};

interface PlayerStatsInputProps {
  player: any;
  stats: any;
  onUpdate: (field: string, value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}

const PlayerStatsInput = ({ player, stats, onUpdate, onEditStart, onEditEnd }: PlayerStatsInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      onEditStart();
    } else {
      onEditEnd();
    }
  };
  
  const incrementStat = (field: string, current: number) => {
    onUpdate(field, current + 1);
  };

  const decrementStat = (field: string, current: number) => {
    if (current > 0) {
      onUpdate(field, current - 1);
    }
  };

  const totalStats = (stats.goals || 0) + (stats.assists || 0);
  const hasFouls = (stats.fouls || 0) > 0;
  const hasPenalties = (stats.penalty_30s || 0) > 0 || (stats.penalty_1m || 0) > 0 || (stats.penalty_2m || 0) > 0;
  const hasAnyStats = totalStats > 0 || hasFouls || hasPenalties;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <div className="p-2 bg-background/50 rounded-lg hover:bg-background/70 cursor-pointer transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{player.name}</span>
            <div className="flex items-center gap-2">
              {hasAnyStats && (
                <span className="text-xs text-muted-foreground">
                  {stats.goals || 0}B {stats.assists || 0}P
                  {hasFouls && <span className="ml-1">{stats.fouls}F</span>}
                  {hasPenalties && <span className="ml-1 text-destructive">⚠</span>}
                </span>
              )}
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="p-3 bg-background/30 rounded-lg mt-1 space-y-2">
        {/* Buts */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Buts</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("goals", stats.goals || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.goals || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("goals", stats.goals || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Passes */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Passes</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("assists", stats.assists || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.assists || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("assists", stats.assists || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* Fautes */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">Fautes</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("fouls", stats.fouls || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.fouls || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("fouls", stats.fouls || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 30 secondes */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">30sec</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_30s", stats.penalty_30s || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_30s || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_30s", stats.penalty_30s || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 1 minute */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">1min</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_1m", stats.penalty_1m || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_1m || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_1m", stats.penalty_1m || 0)}
            >
              +
            </Button>
          </div>
        </div>

        {/* 2 minutes */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium min-w-[50px]">2min</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => decrementStat("penalty_2m", stats.penalty_2m || 0)}
            >
              -
            </Button>
            <div className="h-8 w-12 flex items-center justify-center bg-primary/10 rounded font-bold text-sm">
              {stats.penalty_2m || 0}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() => incrementStat("penalty_2m", stats.penalty_2m || 0)}
            >
              +
            </Button>
          </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
