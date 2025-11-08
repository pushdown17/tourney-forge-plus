import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface StandingsTableProps {
  tournamentId: string;
}

export const StandingsTable = ({ tournamentId }: StandingsTableProps) => {
  const [standings, setStandings] = useState<any[]>([]);

  useEffect(() => {
    fetchStandings();
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

    setStandings(data || []);
  };

  return (
    <Card className="glass-card p-6">
      <h2 className="text-2xl font-bold mb-4">Classement général</h2>
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
            <TableRow key={stat.id}>
              <TableCell className="font-medium">{index + 1}</TableCell>
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
          ))}
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
