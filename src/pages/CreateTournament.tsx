import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const CreateTournament = () => {
  const navigate = useNavigate();
  const [tournamentName, setTournamentName] = useState("");
  const [format, setFormat] = useState<"round-robin" | "swiss" | "round-robin-single" | "round-robin-double" | "swiss-single" | "swiss-double" | "broquil">("round-robin");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [numberOfFields, setNumberOfFields] = useState("1");
  const [teamsForElimination, setTeamsForElimination] = useState("16");
  const [divideIntoGroups, setDivideIntoGroups] = useState(false);
  const [numberOfGroups, setNumberOfGroups] = useState("2");
  const [loading, setLoading] = useState(false);

  // When Broquil is selected, force groups on with 2 groups
  useEffect(() => {
    if (format === "broquil") {
      setDivideIntoGroups(true);
      setNumberOfGroups("2");
    }
  }, [format]);

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

  const hasEliminationPhase = format === "round-robin-single" || format === "round-robin-double" || format === "swiss-single" || format === "swiss-double" || format === "broquil";

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
      let currentPhase: "round_robin" | "swiss" = "round_robin";
      if (format === "swiss" || format === "swiss-single" || format === "swiss-double") {
        currentPhase = "swiss";
      }

      let eliminationType: "single" | "double" | null = null;
      if (format === "round-robin-single" || format === "swiss-single" || format === "broquil") {
        eliminationType = "single";
      } else if (format === "round-robin-double" || format === "swiss-double") {
        eliminationType = "double";
      }

      const { data, error } = await supabase
        .from("tournaments")
        .insert({
          name: tournamentName,
          start_date: startDate,
          end_date: endDate,
          current_phase: currentPhase,
          initial_phase: currentPhase,
          elimination_type: eliminationType,
          teams_for_elimination: hasEliminationPhase ? parseInt(teamsForElimination) : null,
          number_of_fields: parseInt(numberOfFields),
          number_of_groups: divideIntoGroups ? parseInt(numberOfGroups) : 1,
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
                <Label htmlFor="format">Format</Label>
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
                    <SelectItem value="broquil">Broquil</SelectItem>
                  </SelectContent>
                </Select>
                {format === "broquil" && (
                  <p className="text-xs text-muted-foreground">
                    Round Robin with teams split into 2 groups (A & B) followed by a Single Elimination phase.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="numberOfFields">Number of Courts</Label>
                <Select value={numberOfFields} onValueChange={setNumberOfFields}>
                  <SelectTrigger id="numberOfFields" className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 court</SelectItem>
                    <SelectItem value="2">2 courts</SelectItem>
                    <SelectItem value="3">3 courts</SelectItem>
                    <SelectItem value="4">4 courts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="divideGroups">Divide teams into groups?</Label>
                  <Switch
                    id="divideGroups"
                    checked={divideIntoGroups}
                    onCheckedChange={setDivideIntoGroups}
                    disabled={format === "broquil"}
                  />
                </div>

                {divideIntoGroups && (
                  <div className="space-y-2">
                    <Label htmlFor="numberOfGroups">Number of groups</Label>
                    <Input
                      id="numberOfGroups"
                      type="number"
                      min="2"
                      max="8"
                      value={numberOfGroups}
                      onChange={(e) => setNumberOfGroups(e.target.value)}
                      className="bg-secondary/50"
                      disabled={format === "broquil"}
                    />
                  </div>
                )}
              </div>

              {hasEliminationPhase && (
                <div className="space-y-2">
                  <Label htmlFor="teamsForElimination">Number of Teams Qualifying for Finals</Label>
                  <Input
                    id="teamsForElimination"
                    type="number"
                    min="2"
                    max="64"
                    placeholder="e.g., 8, 12, 16..."
                    value={teamsForElimination}
                    onChange={(e) => setTeamsForElimination(e.target.value)}
                    className="bg-secondary/50"
                  />
                  {(() => {
                    const n = parseInt(teamsForElimination) || 0;
                    const isDoubleElim = format === "round-robin-double" || format === "swiss-double";
                    const isPow2 = n > 0 && Number.isInteger(Math.log2(n));
                    const isOdd = n > 0 && !isPow2 && n % 2 !== 0;
                    if (isDoubleElim && isOdd) {
                      return (
                        <p className="text-xs text-destructive font-medium">
                          ⚠️ Double elimination requires an even number. Try {n - 1} or {n + 1}.
                        </p>
                      );
                    }
                    if (isDoubleElim && !isPow2 && n > 0) {
                      const nextP2 = Math.pow(2, Math.ceil(Math.log2(n)));
                      const byes = nextP2 - n;
                      return (
                        <p className="text-xs text-muted-foreground">
                          {byes} BYE{byes > 1 ? 's' : ''} — top {byes} seed{byes > 1 ? 's' : ''} advance directly to Round 2.
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-muted-foreground">
                        {isDoubleElim ? "Even numbers recommended. " : ""}Choose any number (2-64). Non-power-of-2 numbers will have byes.
                      </p>
                    );
                  })()}
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
