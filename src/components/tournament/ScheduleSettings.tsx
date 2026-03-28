import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, CalendarClock } from "lucide-react";

interface ScheduleSettingsProps {
  tournamentId: string;
  isCreator: boolean;
  onSettingsChange?: (settings: ScheduleSettingsData) => void;
}

export interface ScheduleSettingsData {
  schedule_start_time: string;
  match_duration_minutes: number;
  break_duration_minutes: number;
}

export const ScheduleSettings = ({ tournamentId, isCreator, onSettingsChange }: ScheduleSettingsProps) => {
  const [startTime, setStartTime] = useState("09:00");
  const [matchDuration, setMatchDuration] = useState(18);
  const [breakDuration, setBreakDuration] = useState(7);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("tournaments")
        .select("schedule_start_time, match_duration_minutes, break_duration_minutes")
        .eq("id", tournamentId)
        .single();
      if (data) {
        setStartTime((data as any).schedule_start_time || "09:00");
        setMatchDuration((data as any).match_duration_minutes ?? 18);
        setBreakDuration((data as any).break_duration_minutes ?? 7);
        setLoaded(true);
        onSettingsChange?.({
          schedule_start_time: (data as any).schedule_start_time || "09:00",
          match_duration_minutes: (data as any).match_duration_minutes ?? 18,
          break_duration_minutes: (data as any).break_duration_minutes ?? 7,
        });
      }
    };
    fetch();
  }, [tournamentId]);

  const save = useCallback(async (field: string, value: string | number) => {
    const { error } = await supabase
      .from("tournaments")
      .update({ [field]: value } as any)
      .eq("id", tournamentId);
    if (error) {
      toast.error("Failed to save setting");
    } else {
      const newSettings: ScheduleSettingsData = {
        schedule_start_time: field === "schedule_start_time" ? (value as string) : startTime,
        match_duration_minutes: field === "match_duration_minutes" ? (value as number) : matchDuration,
        break_duration_minutes: field === "break_duration_minutes" ? (value as number) : breakDuration,
      };
      onSettingsChange?.(newSettings);
    }
  }, [tournamentId, startTime, matchDuration, breakDuration, onSettingsChange]);

  if (!loaded) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-sm">Schedule Settings</h4>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="start-time" className="text-xs text-muted-foreground">Start Time</Label>
          <Input
            id="start-time"
            type="time"
            value={startTime}
            disabled={!isCreator}
            className="h-8 text-sm"
            onChange={(e) => {
              setStartTime(e.target.value);
              save("schedule_start_time", e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="match-dur" className="text-xs text-muted-foreground">Match (min)</Label>
          <Input
            id="match-dur"
            type="number"
            min={1}
            max={120}
            value={matchDuration}
            disabled={!isCreator}
            className="h-8 text-sm"
            onChange={(e) => {
              const v = parseInt(e.target.value) || 1;
              setMatchDuration(v);
              save("match_duration_minutes", v);
            }}
          />
        </div>
        <div>
          <Label htmlFor="break-dur" className="text-xs text-muted-foreground">Break (min)</Label>
          <Input
            id="break-dur"
            type="number"
            min={0}
            max={60}
            value={breakDuration}
            disabled={!isCreator}
            className="h-8 text-sm"
            onChange={(e) => {
              const v = parseInt(e.target.value) || 0;
              setBreakDuration(v);
              save("break_duration_minutes", v);
            }}
          />
        </div>
      </div>
    </Card>
  );
};

/**
 * Calculate the scheduled time for a match based on its sort_order position.
 * Returns a string like "09:00" or "10:25".
 */
export const calculateMatchTime = (
  sortIndex: number,
  settings: ScheduleSettingsData,
  numberOfFields: number = 1
): string => {
  const [hours, minutes] = settings.schedule_start_time.split(":").map(Number);
  const slotDuration = settings.match_duration_minutes + settings.break_duration_minutes;
  // With N fields, N matches can run in parallel per slot
  const slotIndex = Math.floor(sortIndex / Math.max(1, numberOfFields));
  const totalMinutes = hours * 60 + minutes + slotIndex * slotDuration;
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
