import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Swords, Crown, Check, X } from "lucide-react";

interface UltimateRoundManagerProps {
  tournamentId: string;
  phase: "round_robin" | "swiss";
  isClosed?: boolean;
  isCreator?: boolean;
  currentPhase?: string;
}

export const UltimateRoundManager = ({
  tournamentId,
  phase,
  isClosed = false,
  isCreator = false,
  currentPhase,
}: UltimateRoundManagerProps) => {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editScore1, setEditScore1] = useState(0);
  const [editScore2, setEditScore2] = useState(0);

  useEffect(() => {
    fetchMatches();
  }, [tournamentId]);

  useEffect(() => {
    const channel = supabase
      .channel(`ultimate-round-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => fetchMatches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from("matches")
      .select(
        `*, team1:team1_id(id, name), team2:team2_id(id, name)`
      )
      .eq("tournament_id", tournamentId)
      .eq("phase", phase)
      .eq("round_number", 99)
      .order("field_number", { ascending: false });

    if (error) {
      toast.error("Error loading Ultimate Round matches");
      return;
    }
    setMatches(data || []);
  };

  const generateUltimateRound = async () => {
    setLoading(true);
    try {
      // Check if ultimate round matches already exist
      const { data: existing } = await supabase
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("round_number", 99)
        .limit(1);

      if (existing && existing.length > 0) {
        toast.error("Ultimate Round matches already exist");
        setLoading(false);
        return;
      }

      // Get team groups
      const { data: tournamentTeams } = await supabase
        .from("tournament_teams")
        .select("team_id, group_name")
        .eq("tournament_id", tournamentId);

      if (!tournamentTeams) throw new Error("No teams found");

      const morningTeamIds = tournamentTeams
        .filter((t) => t.group_name === "Morning")
        .map((t) => t.team_id);
      const afternoonTeamIds = tournamentTeams
        .filter((t) => t.group_name === "Afternoon")
        .map((t) => t.team_id);

      // Get standings to rank teams within each group
      const { data: stats } = await supabase
        .from("team_stats")
        .select("team_id, points, goals_for, goals_against")
        .eq("tournament_id", tournamentId);

      const statsMap = new Map(
        (stats || []).map((s) => [s.team_id, s])
      );

      const sortByRank = (teamIds: string[]) =>
        [...teamIds].sort((a, b) => {
          const sa = statsMap.get(a) || { points: 0, goals_for: 0, goals_against: 0 };
          const sb = statsMap.get(b) || { points: 0, goals_for: 0, goals_against: 0 };
          if (sb.points !== sa.points) return sb.points - sa.points;
          const diffA = sa.goals_for - sa.goals_against;
          const diffB = sb.goals_for - sb.goals_against;
          if (diffB !== diffA) return diffB - diffA;
          return sb.goals_for - sa.goals_for;
        });

      const rankedMorning = sortByRank(morningTeamIds);
      const rankedAfternoon = sortByRank(afternoonTeamIds);

      const pairCount = Math.min(rankedMorning.length, rankedAfternoon.length);
      if (pairCount === 0) {
        toast.error("Not enough teams in both groups");
        setLoading(false);
        return;
      }

      const newMatches = [];
      for (let i = 0; i < pairCount; i++) {
        newMatches.push({
          tournament_id: tournamentId,
          phase: phase as "round_robin" | "swiss",
          round_number: 99,
          team1_id: rankedMorning[i],
          team2_id: rankedAfternoon[i],
          field_number: i + 1, // pair rank: 1 = 1st vs 1st
        });
      }

      const { error: insertError } = await supabase
        .from("matches")
        .insert(newMatches);

      if (insertError) throw insertError;

      toast.success(
        `${pairCount} Ultimate Round match${pairCount > 1 ? "es" : ""} generated!`
      );
      fetchMatches();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateScore = async (
    matchId: string,
    team1Score: number,
    team2Score: number
  ) => {
    try {
      const { matchScoreSchema } = await import("@/lib/validations");
      const validation = matchScoreSchema.safeParse({
        team1_score: team1Score,
        team2_score: team2Score,
      });

      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      const match = matches.find((m) => m.id === matchId);
      const winnerId =
        validation.data.team1_score > validation.data.team2_score
          ? match.team1_id
          : validation.data.team2_score > validation.data.team1_score
          ? match.team2_id
          : null;

      const { error } = await supabase
        .from("matches")
        .update({
          team1_score: validation.data.team1_score,
          team2_score: validation.data.team2_score,
          winner_id: winnerId,
        })
        .eq("id", matchId);

      if (error) throw error;

      toast.success("Score saved!");
      setEditingMatchId(null);
      fetchMatches();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const completedCount = matches.filter(
    (m) => m.team1_score !== null && m.team2_score !== null
  ).length;

  const getPairLabel = (fieldNumber: number, totalPairs: number) => {
    const rank = fieldNumber;
    if (rank === 1) return "🏆 1st vs 1st";
    if (rank === 2) return "🥈 2nd vs 2nd";
    if (rank === 3) return "🥉 3rd vs 3rd";
    return `${rank}th vs ${rank}th`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Swords className="h-5 w-5 text-primary" />
            Ultimate Round — Crossover Matches
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Teams ranked by group face off: 1st Morning vs 1st Afternoon, etc.
          </p>
        </div>
        {isCreator && matches.length === 0 && (
          <Button
            onClick={generateUltimateRound}
            disabled={loading || isClosed || (currentPhase && currentPhase !== phase)}
          >
            Generate Ultimate Round
          </Button>
        )}
      </div>

      {matches.length > 0 && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4" />
          <span>
            Progress: {completedCount} / {matches.length} matches completed
          </span>
          {completedCount === matches.length && matches.length > 0 && (
            <Badge variant="default" className="ml-auto">All done ✓</Badge>
          )}
        </div>
      )}

      {/* Matches displayed in reverse order: lowest rank first, 1st vs 1st last */}
      <div className="space-y-3">
        {matches.map((match) => {
          const isEditing = editingMatchId === match.id;
          const isCompleted =
            match.team1_score !== null && match.team2_score !== null;
          const pairLabel = getPairLabel(
            match.field_number,
            matches.length
          );

          return (
            <Card
              key={match.id}
              className={`p-4 transition-all ${
                isCompleted
                  ? "bg-muted/30 border-muted"
                  : "bg-card border-primary/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <Badge
                  variant={match.field_number === 1 ? "default" : "secondary"}
                  className="text-xs"
                >
                  {pairLabel}
                </Badge>
                {isCompleted && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Final
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-right">
                  <span
                    className={`font-bold ${
                      isCompleted && match.winner_id === match.team1_id
                        ? "text-primary"
                        : ""
                    }`}
                  >
                    {match.team1?.name || "TBD"}
                  </span>
                  {isCompleted && match.winner_id === match.team1_id && (
                    <Crown className="inline h-4 w-4 ml-1 text-primary" />
                  )}
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={editScore1}
                      onChange={(e) => setEditScore1(parseInt(e.target.value) || 0)}
                      className="w-16 text-center"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="number"
                      min="0"
                      value={editScore2}
                      onChange={(e) => setEditScore2(parseInt(e.target.value) || 0)}
                      className="w-16 text-center"
                    />
                    <Button size="icon" variant="ghost" onClick={() => updateScore(match.id, editScore1, editScore2)}>
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingMatchId(null)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                      isCompleted ? "bg-muted" : "bg-muted/50"
                    }`}
                  >
                    {isCompleted ? (
                      <>
                        <span className="text-xl font-bold tabular-nums">
                          {match.team1_score}
                        </span>
                        <span className="text-muted-foreground">-</span>
                        <span className="text-xl font-bold tabular-nums">
                          {match.team2_score}
                        </span>
                      </>
                    ) : isCreator && !isClosed ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditScore1(0); setEditScore2(0); setEditingMatchId(match.id); }}
                      >
                        Enter Score
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        vs
                      </span>
                    )}
                  </div>
                )}

                <div className="flex-1 text-left">
                  {isCompleted && match.winner_id === match.team2_id && (
                    <Crown className="inline h-4 w-4 mr-1 text-primary" />
                  )}
                  <span
                    className={`font-bold ${
                      isCompleted && match.winner_id === match.team2_id
                        ? "text-primary"
                        : ""
                    }`}
                  >
                    {match.team2?.name || "TBD"}
                  </span>
                </div>
              </div>

              {isCompleted && isCreator && !isClosed && !isEditing && (
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setEditScore1(match.team1_score || 0); setEditScore2(match.team2_score || 0); setEditingMatchId(match.id); }}
                  >
                    Edit Score
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {matches.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No Ultimate Round matches yet. Generate them once all group matches are completed.
        </p>
      )}
    </div>
  );
};
