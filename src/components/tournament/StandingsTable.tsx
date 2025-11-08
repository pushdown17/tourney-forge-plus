import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StandingsTableProps {
  tournamentId: string;
}

export const StandingsTable = ({ tournamentId }: StandingsTableProps) => {
  const [standings, setStandings] = useState<any[]>([]);
  const previousPositions = useRef<Map<string, number>>(new Map());
  const [positionChanges, setPositionChanges] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchStandings();

    // Subscribe to real-time updates on matches table
    const matchesChannel = supabase
      .channel('matches-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`
        },
        () => {
          console.log('Match updated, refreshing standings...');
          fetchStandings();
        }
      )
      .subscribe();

    // Subscribe to real-time updates on team_stats table
    const statsChannel = supabase
      .channel('stats-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_stats',
          filter: `tournament_id=eq.${tournamentId}`
        },
        () => {
          console.log('Stats updated, refreshing standings...');
          fetchStandings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(statsChannel);
    };
  }, [tournamentId]);

  const fetchStandings = async () => {
    const { data, error } = await supabase
      .from("team_stats")
      .select(`
        *,
        team:team_id(name)
      `)
      .eq("tournament_id", tournamentId)
      .order("points", { ascending: false })
      .order("goals_for", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement du classement");
      return;
    }

    const newStandings = data || [];
    
    // Calculate position changes
    const changes = new Map<string, number>();
    newStandings.forEach((stat, newIndex) => {
      const oldPosition = previousPositions.current.get(stat.team_id);
      if (oldPosition !== undefined) {
        const change = oldPosition - newIndex;
        if (change !== 0) {
          changes.set(stat.team_id, change);
        }
      }
    });

    // Update previous positions
    newStandings.forEach((stat, index) => {
      previousPositions.current.set(stat.team_id, index);
    });

    setPositionChanges(changes);
    setStandings(newStandings);

    // Clear position change indicators after 3 seconds
    if (changes.size > 0) {
      setTimeout(() => {
        setPositionChanges(new Map());
      }, 3000);
    }
  };

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Classement général</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>Mise à jour en temps réel</span>
        </div>
      </div>
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
          {standings.map((stat, index) => {
            const change = positionChanges.get(stat.team_id);
            const hasChange = change !== undefined;
            
            return (
              <TableRow 
                key={stat.id}
                className={`transition-all duration-500 ${
                  hasChange ? 'animate-fade-in bg-primary/5' : ''
                }`}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{index + 1}</span>
                    {hasChange && change > 0 && (
                      <TrendingUp className="h-4 w-4 text-green-500 animate-in slide-in-from-bottom-2" />
                    )}
                    {hasChange && change < 0 && (
                      <TrendingDown className="h-4 w-4 text-red-500 animate-in slide-in-from-top-2" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-bold">{stat.team?.name}</TableCell>
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
            );
          })}
        </TableBody>
      </Table>
      {standings.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          Aucune statistique disponible pour le moment
        </p>
      )}
    </Card>
  );
};
