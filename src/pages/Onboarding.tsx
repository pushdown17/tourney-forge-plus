import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, UserPlus, SkipForward, User, Link } from "lucide-react";

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"choice" | "search" | "create">("choice");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("players")
      .select("id, name")
      .ilike("name", `%${query.trim()}%`)
      .limit(20);

    const seen = new Set<string>();
    const unique = (data || []).filter((p) => {
      const lower = p.name.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
    setResults(unique);
    setSearching(false);
  };

  const linkPlayer = async (playerId: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if player is already linked to another account
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("linked_player_id", playerId)
        .maybeSingle();

      if (existingProfile) {
        toast.error("This player is already linked to another account");
        setSaving(false);
        return;
      }

      // Upsert profile with linked player
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        const { error } = await supabase
          .from("profiles")
          .update({ linked_player_id: playerId })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profiles")
          .insert({ user_id: user.id, linked_player_id: playerId });
        if (error) throw error;
      }

      toast.success("Player profile linked!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const createAndLinkPlayer = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if player with same name exists
      const { data: existing } = await supabase
        .from("players")
        .select("id, name")
        .ilike("name", newName.trim())
        .maybeSingle();

      if (existing) {
        toast.error(`A player named "${existing.name}" already exists. Try linking to the existing profile instead.`);
        setSaving(false);
        return;
      }

      // Create player
      const { data: newPlayer, error: playerError } = await supabase
        .from("players")
        .insert({ name: newName.trim() })
        .select("id")
        .single();

      if (playerError) throw playerError;

      // Link to profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        const { error } = await supabase
          .from("profiles")
          .update({ linked_player_id: newPlayer.id })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profiles")
          .insert({ user_id: user.id, linked_player_id: newPlayer.id });
        if (error) throw error;
      }

      toast.success("Player profile created and linked!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      <main className="container mx-auto px-4 pt-32 pb-16">
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold glow-text-primary">Welcome!</h1>
            <p className="text-muted-foreground">
              Link your account to a player profile to track your stats across tournaments.
            </p>
          </div>

          {step === "choice" && (
            <Card className="glass-card p-6 space-y-4">
              <Button
                className="w-full h-14 text-base"
                onClick={() => setStep("search")}
              >
                <Search className="h-5 w-5 mr-3" />
                Find my existing player profile
              </Button>
              <Button
                variant="outline"
                className="w-full h-14 text-base"
                onClick={() => setStep("create")}
              >
                <UserPlus className="h-5 w-5 mr-3" />
                Create a new player profile
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => navigate("/")}
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Skip for now
              </Button>
            </Card>
          )}

          {step === "search" && (
            <Card className="glass-card p-6 space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by player name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={searching} size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1">
                {results.length === 0 && !searching && query.length >= 2 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No players found. Try a different name or create a new profile.
                  </p>
                )}
                {results.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => linkPlayer(player.id)}
                    disabled={saving}
                    className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-primary/10 transition-colors text-left"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium flex-1">{player.name}</span>
                    <Link className="h-4 w-4 text-primary" />
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={() => { setStep("choice"); setResults([]); setQuery(""); }}>
                  Back
                </Button>
                <Button variant="outline" className="ml-auto" onClick={() => { setStep("create"); setNewName(query); }}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create new instead
                </Button>
              </div>
            </Card>
          )}

          {step === "create" && (
            <Card className="glass-card p-6 space-y-4">
              <div>
                <Label htmlFor="newPlayerName">Player name</Label>
                <Input
                  id="newPlayerName"
                  placeholder="First Last"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button
                onClick={createAndLinkPlayer}
                disabled={saving || !newName.trim()}
                className="w-full"
              >
                {saving ? "Creating..." : "Create & Link Profile"}
              </Button>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={() => setStep("choice")}>
                  Back
                </Button>
              </div>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground">
            You can always do this later from your account settings.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
