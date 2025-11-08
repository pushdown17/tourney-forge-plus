import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface TeamsManagerProps {
  tournamentId: string;
}

export const TeamsManager = ({ tournamentId }: TeamsManagerProps) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, [tournamentId]);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des équipes");
      return;
    }

    setTeams(data || []);
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("teams")
        .insert({
          name: teamName,
          tournament_id: tournamentId,
        });

      if (error) throw error;

      toast.success("Équipe ajoutée !");
      setTeamName("");
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      const { error } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId);

      if (error) throw error;

      toast.success("Équipe supprimée");
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card p-6">
        <h2 className="text-2xl font-bold mb-4">Ajouter une équipe</h2>
        <form onSubmit={handleAddTeam} className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="teamName" className="sr-only">Nom de l'équipe</Label>
            <Input
              id="teamName"
              placeholder="Nom de l'équipe"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter
          </Button>
        </form>
      </Card>

      <Card className="glass-card p-6">
        <h2 className="text-2xl font-bold mb-4">Équipes inscrites ({teams.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between p-4 bg-secondary/20 rounded-lg"
            >
              <span className="font-medium">{team.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteTeam(team.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        {teams.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Aucune équipe inscrite pour le moment
          </p>
        )}
      </Card>
    </div>
  );
};
