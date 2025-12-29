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
  const [numberOfFields, setNumberOfFields] = useState("1");
  const [teamsForElimination, setTeamsForElimination] = useState("16");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in to create a tournament");
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
        toast.error("You must be logged in");
        navigate("/auth");
        return;
      }

      // Determine initial phase and elimination type
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
          initial_phase: currentPhase,
          elimination_type: eliminationType,
          teams_for_elimination: eliminationType ? parseInt(teamsForElimination) : null,
          number_of_fields: parseInt(numberOfFields),
          created_by: session.user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Tournament created successfully!");
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
            Create Tournament
          </h1>
          <p className="text-muted-foreground text-center mb-12">
            Configure your tournament with the format of your choice
          </p>

          <Card className="glass-card p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Tournament Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Summer Championship 2024"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  className="bg-secondary/50"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
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
                  <Label htmlFor="endDate">End Date</Label>
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
                <Label htmlFor="format">Final Phase Format</Label>
                <Select value={format} onValueChange={(val: any) => setFormat(val)}>
                  <SelectTrigger id="format" className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round-robin">Round Robin Only</SelectItem>
                    <SelectItem value="round-robin-single">Round Robin + Single Elimination</SelectItem>
                    <SelectItem value="round-robin-double">Round Robin + Double Elimination</SelectItem>
                    <SelectItem value="swiss">Swiss Round Only</SelectItem>
                    <SelectItem value="swiss-single">Swiss Round + Single Elimination</SelectItem>
                    <SelectItem value="swiss-double">Swiss Round + Double Elimination</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="numberOfFields">Number of Fields</Label>
                <Select value={numberOfFields} onValueChange={setNumberOfFields}>
                  <SelectTrigger id="numberOfFields" className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 field</SelectItem>
                    <SelectItem value="2">2 fields</SelectItem>
                    <SelectItem value="3">3 fields</SelectItem>
                    <SelectItem value="4">4 fields</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {format !== "round-robin" && format !== "swiss" && (
                <div className="space-y-2">
                  <Label htmlFor="teamsForElimination">Number of Teams Qualifying for Finals</Label>
                  <Select value={teamsForElimination} onValueChange={setTeamsForElimination}>
                    <SelectTrigger id="teamsForElimination" className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 teams</SelectItem>
                      <SelectItem value="8">8 teams</SelectItem>
                      <SelectItem value="16">16 teams</SelectItem>
                      <SelectItem value="32">32 teams</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create Tournament"}
              </Button>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default CreateTournament;
