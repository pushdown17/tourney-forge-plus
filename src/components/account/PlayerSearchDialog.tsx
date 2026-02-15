import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User } from "lucide-react";

type Player = { id: string; name: string };

export function PlayerSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (playerId: string, playerName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);

    const { data } = await supabase
      .from("players")
      .select("id, name")
      .ilike("name", `%${query.trim()}%`)
      .limit(20);

    // Deduplicate by name (keep first occurrence)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rechercher un joueur</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Nom du joueur..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searching} size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1">
          {results.length === 0 && !searching && query.length >= 2 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun joueur trouvé
            </p>
          )}
          {results.map((player) => (
            <button
              key={player.id}
              onClick={() => onSelect(player.id, player.name)}
              className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-primary/10 transition-colors text-left"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{player.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
