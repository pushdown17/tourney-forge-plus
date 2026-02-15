import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PlayerEntry {
  name: string;
  nickname?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface PlayerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const PlayerAutocomplete = ({
  value,
  onChange,
  placeholder = "Player name",
  disabled = false,
}: PlayerAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<PlayerEntry[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllPlayerData();
  }, []);

  useEffect(() => {
    if (value.trim().length >= 2) {
      const q = value.toLowerCase();
      const filtered = allPlayers.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.nickname?.toLowerCase().includes(q) ||
          p.firstName?.toLowerCase().includes(q) ||
          p.lastName?.toLowerCase().includes(q)
      );
      // Deduplicate by name
      const seen = new Set<string>();
      const unique = filtered.filter((p) => {
        const lower = p.name.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
      setSuggestions(unique);
      setShowSuggestions(unique.length > 0);
      setSelectedIndex(-1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [value, allPlayers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAllPlayerData = async () => {
    // Fetch all players
    const { data: players, error } = await supabase
      .from("players")
      .select("id, name");

    if (error || !players) return;

    // Fetch profiles with linked players
    const { data: profiles } = await supabase
      .from("profiles")
      .select("linked_player_id, nickname, first_name, last_name")
      .not("linked_player_id", "is", null);

    const profileMap = new Map<string, { nickname: string | null; first_name: string | null; last_name: string | null }>();
    for (const p of profiles || []) {
      if (p.linked_player_id) {
        profileMap.set(p.linked_player_id, {
          nickname: p.nickname,
          first_name: p.first_name,
          last_name: p.last_name,
        });
      }
    }

    const entries: PlayerEntry[] = players.map((player) => {
      const profile = profileMap.get(player.id);
      return {
        name: player.name,
        nickname: profile?.nickname || null,
        firstName: profile?.first_name || null,
        lastName: profile?.last_name || null,
      };
    });

    setAllPlayers(entries);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          onChange(suggestions[selectedIndex].name);
          setShowSuggestions(false);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  const handleSuggestionClick = (entry: PlayerEntry) => {
    onChange(entry.name);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const getSubtext = (entry: PlayerEntry): string | null => {
    const parts: string[] = [];
    if (entry.nickname) parts.push(entry.nickname);
    if (entry.firstName || entry.lastName) {
      parts.push([entry.firstName, entry.lastName].filter(Boolean).join(" "));
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((entry, index) => {
            const subtext = getSubtext(entry);
            return (
              <div
                key={entry.name}
                onClick={() => handleSuggestionClick(entry)}
                className={cn(
                  "px-3 py-2 cursor-pointer text-sm transition-colors",
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
              >
                <div>{entry.name}</div>
                {subtext && (
                  <div className="text-xs text-muted-foreground">{subtext}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
