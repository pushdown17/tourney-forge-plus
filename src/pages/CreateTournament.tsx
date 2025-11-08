import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const CreateTournament = () => {
  const navigate = useNavigate();
  const [tournamentName, setTournamentName] = useState("");
  const [format, setFormat] = useState<"round-robin" | "swiss" | "round-robin-single" | "round-robin-double" | "swiss-single" | "swiss-double">("round-robin");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [teamsForElimination, setTeamsForElimination] = useState("16");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Vous devez être connecté pour créer un tournoi");
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Vous devez être connecté");
        navigate("/auth");
        return;
      }

      // Déterminer la phase initiale et le type d'élimination
      const currentPhase = format === "round-robin" || format === "round-robin-single" || format === "round-robin-double" 
        ? "round_robin" 
        : "swiss";
      
      const eliminationType = format === "round-robin" || format === "swiss"
        ? null
        : format.includes("single")
        ? "single"
        : "double";

      const { data, error } = await supabase
        .from("tournaments")
        .insert({
          name: tournamentName,
          start_date: startDate,
          end_date: endDate,
          current_phase: currentPhase,
          elimination_type: eliminationType,
          teams_for_elimination: eliminationType ? parseInt(teamsForElimination) : null,
          created_by: session.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Tournoi créé avec succès !");
      navigate(`/tournament/${data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-center glow-text-primary">
            Créer un tournoi
          </h1>
          <p className="text-muted-foreground text-center mb-12">
            Configurez votre tournoi avec le format de votre choix
          </p>

          <Card className="glass-card p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nom du tournoi</Label>
                <Input
                  id="name"
                  placeholder="ex: Championnat d'été 2024"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  className="bg-secondary/50"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Date de début</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-secondary/50"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">Date de fin</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-secondary/50"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="format">Format de la phase finale</Label>
                <Select value={format} onValueChange={(val: any) => setFormat(val)}>
                  <SelectTrigger id="format" className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round-robin">Round Robin uniquement</SelectItem>
                    <SelectItem value="round-robin-single">Round Robin + Simple Élimination</SelectItem>
                    <SelectItem value="round-robin-double">Round Robin + Double Élimination</SelectItem>
                    <SelectItem value="swiss">Swiss Round uniquement</SelectItem>
                    <SelectItem value="swiss-single">Swiss Round + Simple Élimination</SelectItem>
                    <SelectItem value="swiss-double">Swiss Round + Double Élimination</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {format !== "round-robin" && format !== "swiss" && (
                <div className="space-y-2">
                  <Label htmlFor="teamsForElimination">Nombre d'équipes qualifiées pour la phase finale</Label>
                  <Select value={teamsForElimination} onValueChange={setTeamsForElimination}>
                    <SelectTrigger id="teamsForElimination" className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 équipes</SelectItem>
                      <SelectItem value="8">8 équipes</SelectItem>
                      <SelectItem value="16">16 équipes</SelectItem>
                      <SelectItem value="32">32 équipes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                {loading ? "Création..." : "Créer le tournoi"}
              </Button>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default CreateTournament;
