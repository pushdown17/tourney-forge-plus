import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Target, Handshake, AlertTriangle, Clock } from "lucide-react";
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

const eventIcons: Record<string, React.ReactNode> = {
  goal: <Target className="h-3.5 w-3.5 text-primary" />,
  goals: <Target className="h-3.5 w-3.5 text-primary" />,
  assist: <Handshake className="h-3.5 w-3.5 text-blue-500" />,
  assists: <Handshake className="h-3.5 w-3.5 text-blue-500" />,
  foul: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />,
  fouls: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />,
  penalty_30s: <Clock className="h-3.5 w-3.5 text-yellow-600" />,
  penalty_1m: <Clock className="h-3.5 w-3.5 text-orange-600" />,
  penalty_2m: <Clock className="h-3.5 w-3.5 text-red-600" />,
};

const eventLabels: Record<string, string> = {
  penalty_30s: "30s",
  penalty_1m: "1min",
  penalty_2m: "2min",
};

export const MatchTimeline = ({ matchId, team1Id, team2Id, team1Name, team2Name }: MatchTimelineProps) => {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
    const channel = supabase
      .channel(`match-events-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, () => fetchEvents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  const fetchEvents = async () => {
    const { data, error } = await (supabase as any)
      .from("match_events")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });
    if (!error && data) setEvents(data as MatchEvent[]);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const visibleEvents = events.filter(e => e.delta > 0);

  // Group events by type category for rendering sections
  const goalTypes = ["goal", "goals"];
  const foulTypes = ["foul", "fouls", "penalty_30s", "penalty_1m", "penalty_2m"];
  const assistTypes = ["assist", "assists"];

  const goalEvents = visibleEvents.filter(e => goalTypes.includes(e.event_type));
  const foulEvents = visibleEvents.filter(e => foulTypes.includes(e.event_type));
  const assistEvents = visibleEvents.filter(e => assistTypes.includes(e.event_type));

  const sections = [
    { events: goalEvents, label: "Buts" },
    { events: assistEvents, label: "Passes" },
    { events: foulEvents, label: "Fautes & Pénalités" },
  ].filter(s => s.events.length > 0);

  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4 italic">
        Aucun événement enregistré pour ce match.
      </p>
    );
  }

  const renderEventText = (event: MatchEvent) => {
    const icon = eventIcons[event.event_type] || eventIcons.foul;
    const suffix = eventLabels[event.event_type] ? ` (${eventLabels[event.event_type]})` : "";
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        {event.player_name} {event.match_time} {icon}{suffix}
      </span>
    );
  };

  const renderEventTextRight = (event: MatchEvent) => {
    const icon = eventIcons[event.event_type] || eventIcons.foul;
    const suffix = eventLabels[event.event_type] ? ` (${eventLabels[event.event_type]})` : "";
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        {icon} {event.match_time} {event.player_name}{suffix}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const team1Events = section.events.filter(e => e.team_id === team1Id);
        const team2Events = section.events.filter(e => e.team_id === team2Id);
        const maxRows = Math.max(team1Events.length, team2Events.length);

        return (
          <div key={section.label} className="bg-muted/30 rounded-lg px-3 py-2">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2">
              {Array.from({ length: maxRows }).map((_, i) => (
                <div key={i} className="contents">
                  {/* Team 1 - right aligned */}
                  <div className="flex justify-end py-0.5">
                    {team1Events[i] ? renderEventText(team1Events[i]) : null}
                  </div>
                  {/* Separator */}
                  <div className="w-px bg-border" />
                  {/* Team 2 - left aligned */}
                  <div className="flex justify-start py-0.5">
                    {team2Events[i] ? renderEventTextRight(team2Events[i]) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
