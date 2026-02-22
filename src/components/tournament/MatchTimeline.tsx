import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Target, Handshake, AlertTriangle, Clock, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MatchEvent {
  id: string;
  event_type: string;
  match_time: string;
  player_name: string;
  team_id: string;
  score_at_event: string | null;
  delta: number;
  created_at: string;
}

interface MatchTimelineProps {
  matchId: string;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
}

const eventConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  goal: { icon: <Target className="h-4 w-4" />, label: "But", color: "text-primary" },
  assist: { icon: <Handshake className="h-4 w-4" />, label: "Passe", color: "text-blue-500" },
  foul: { icon: <AlertTriangle className="h-4 w-4" />, label: "Faute", color: "text-orange-500" },
  penalty_30s: { icon: <Clock className="h-4 w-4" />, label: "Pénalité 30s", color: "text-yellow-600" },
  penalty_1m: { icon: <Clock className="h-4 w-4" />, label: "Pénalité 1min", color: "text-orange-600" },
  penalty_2m: { icon: <Clock className="h-4 w-4" />, label: "Pénalité 2min", color: "text-red-600" },
};

export const MatchTimeline = ({ matchId, team1Id, team2Id, team1Name, team2Name }: MatchTimelineProps) => {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`match-events-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${matchId}`
        },
        () => fetchEvents()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  const fetchEvents = async () => {
    const { data, error } = await (supabase as any)
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setEvents(data as MatchEvent[]);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  // Filter out cancelled events (delta -1 that match a +1)
  const visibleEvents = events.filter(e => e.delta > 0);

  if (visibleEvents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4 italic">
        Aucun événement enregistré pour ce match.
      </p>
    );
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

      <div className="space-y-3">
        {visibleEvents.map((event) => {
          const config = eventConfig[event.event_type] || eventConfig.foul;
          const isTeam1 = event.team_id === team1Id;

          return (
            <div key={event.id} className="relative flex items-start gap-3">
              {/* Dot on the line */}
              <div className={cn(
                "absolute -left-6 top-1 w-[22px] h-[22px] rounded-full border-2 bg-background flex items-center justify-center",
                config.color,
                "border-current"
              )}>
                <div className="scale-75">{config.icon}</div>
              </div>

              {/* Event content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                    {event.match_time}
                  </span>
                  <span className={cn("text-sm font-medium", config.color)}>
                    {config.label}
                  </span>
                  <span className="text-sm">
                    {event.player_name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {isTeam1 ? team1Name : team2Name}
                  </span>
                  {event.score_at_event && event.event_type === 'goal' && (
                    <span className="text-xs font-mono font-semibold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                      {event.score_at_event}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
