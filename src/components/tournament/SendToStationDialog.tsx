import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Monitor, Loader2, Check, Timer } from "lucide-react";

interface RefereeStation {
  id: string;
  station_number: number;
  station_name: string;
  current_match_id: string | null;
}

interface SendToStationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  matchId: string;
  matchLabel: string;
}

export const SendToStationDialog = ({
  open,
  onOpenChange,
  tournamentId,
  matchId,
  matchLabel
}: SendToStationDialogProps) => {
  const [stations, setStations] = useState<RefereeStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [timerMinutes, setTimerMinutes] = useState<string>("10");
  const [timerEnabled, setTimerEnabled] = useState(true);

  const fetchStations = async () => {
    const { data, error } = await supabase
      .from("referee_stations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("is_active", true)
      .order("station_number");

    if (error) {
      console.error("Error fetching stations:", error);
      return;
    }

    setStations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      fetchStations();
    }
  }, [open, tournamentId]);

  const sendToStation = async (stationId: string) => {
    setSending(stationId);

    const timerDuration = timerEnabled && timerMinutes 
      ? parseInt(timerMinutes) * 60 
      : null;

    const { error } = await supabase
      .from("referee_stations")
      .update({ 
        current_match_id: matchId,
        timer_duration_seconds: timerDuration,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0
      } as any)
      .eq("id", stationId);

    if (error) {
      console.error("Error sending to station:", error);
      toast.error("Error sending match to station");
    } else {
      const station = stations.find(s => s.id === stationId);
      toast.success(`Match sent to ${station?.station_name} ${station?.station_number}`);
      onOpenChange(false);
    }

    setSending(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Send to Referee Station
          </DialogTitle>
          <DialogDescription>
            Send <strong>{matchLabel}</strong> to a referee device.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Timer configuration */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3 mb-3">
              <Timer className="h-5 w-5 text-primary" />
              <span className="font-medium">Chrono du match</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={timerEnabled}
                  onChange={(e) => setTimerEnabled(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Activer le chrono</span>
              </label>
              {timerEnabled && (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(e.target.value)}
                    className="w-20 h-8"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : stations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No referee stations available</p>
              <p className="text-sm">Create stations in the Teams tab first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stations.map((station) => {
                const isOccupied = station.current_match_id !== null;
                const isCurrentMatch = station.current_match_id === matchId;
                
                return (
                  <button
                    key={station.id}
                    onClick={() => !isOccupied && sendToStation(station.id)}
                    disabled={isOccupied || sending !== null}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      isCurrentMatch
                        ? 'bg-primary/10 border-primary'
                        : isOccupied
                        ? 'bg-muted opacity-50 cursor-not-allowed'
                        : 'hover:bg-muted cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary">{station.station_number}</span>
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{station.station_name} {station.station_number}</p>
                        {isCurrentMatch ? (
                          <Badge variant="default" className="text-xs">This match</Badge>
                        ) : isOccupied ? (
                          <Badge variant="secondary" className="text-xs">Busy</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Available</Badge>
                        )}
                      </div>
                    </div>
                    
                    {sending === station.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : isCurrentMatch ? (
                      <Check className="h-5 w-5 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
