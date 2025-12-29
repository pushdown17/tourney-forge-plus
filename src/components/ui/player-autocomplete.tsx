import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllPlayerNames();
  }, []);

  useEffect(() => {
    if (value.trim().length >= 2) {
      const filtered = allPlayers.filter((name) =>
        name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
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

  const fetchAllPlayerNames = async () => {
    const { data, error } = await supabase
      .from("players")
      .select("name");

    if (!error && data) {
      const uniqueNames = Array.from(new Set(data.map((p) => p.name))).sort();
      setAllPlayers(uniqueNames);
    }
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
          onChange(suggestions[selectedIndex]);
          setShowSuggestions(false);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
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
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                "px-3 py-2 cursor-pointer text-sm transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
