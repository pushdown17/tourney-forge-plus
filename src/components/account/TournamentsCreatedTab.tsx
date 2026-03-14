import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Calendar, Users, Lock } from "lucide-react";

type TournamentItem = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  current_phase: string;
  is_closed: boolean;
  teamCount: number;
};

export function TournamentsCreatedTab({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);

  useEffect(() => {
    fetchTournaments();
  }, [userId]);

  const fetchTournaments = async () => {
    setLoading(true);

    const { data } = await supabase
      .from("tournaments")
      .select("id, name, start_date, end_date, current_phase, is_closed")
      .eq("created_by", userId)
      .order("start_date", { ascending: false });

    if (!data || data.length === 0) {
      setLoading(false);
      return;
    }

    // Fetch team counts for each tournament
    const withCounts = await Promise.all(
      data.map(async (t) => {
        const { count } = await supabase
          .from("tournament_teams")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", t.id);
        return { ...t, teamCount: count ?? 0 };
      })
    );

    setTournaments(withCounts);
    setLoading(false);
  };

  const phaseLabel: Record<string, string> = {
    round_robin: "Round Robin",
    swiss: "Swiss",
    elimination: "Elimination",
    single_elimination: "Single Elim.",
    double_elimination: "Double Elim.",
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <Card className="p-8 glass-card text-center">
        <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">You haven't created any tournament yet.</p>
        <Link to="/create-tournament" className="text-primary text-sm underline mt-2 inline-block">
          Create your first tournament
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tournaments.map((t) => (
        <Link key={t.id} to={`/tournament/${t.id}`}>
          <Card className="p-4 glass-card hover:bg-primary/10 transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold truncate">{t.name}</h3>
                  {t.is_closed && (
                    <Badge variant="secondary" className="gap-1 shrink-0">
                      <Lock className="h-3 w-3" />
                      Closed
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(t.start_date).toLocaleDateString()}
                    {" – "}
                    {new Date(t.end_date).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {t.teamCount} team{t.teamCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0">
                {phaseLabel[t.current_phase] ?? t.current_phase}
              </Badge>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
