import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, ExternalLink, Monitor, Loader2, XCircle, Tv2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface RefereeStation {
  id: string;
  station_number: number;
  station_name: string;
  current_match_id: string | null;
  is_active: boolean;
  current_match?: {
    id: string;
    team1: { name: string };
    team2: { name: string };
  } | null;
}

interface RefereeStationsManagerProps {
  tournamentId: string;
  isCreator: boolean;
}

export const RefereeStationsManager = ({ tournamentId, isCreator }: RefereeStationsManagerProps) => {
  const [stations, setStations] = useState<RefereeStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newStationName, setNewStationName] = useState("Terrain");

  const fetchStations = async () => {
    const { data, error } = await supabase
      .from("referee_stations")
      .select(`
        *,
        current_match:matches!referee_stations_current_match_id_fkey(
          id,
          team1:teams!matches_team1_id_fkey(name),
          team2:teams!matches_team2_id_fkey(name)
        )
      `)
      .eq("tournament_id", tournamentId)
      .order("station_number");

    if (error) {
      console.error("Error fetching stations:", error);
      return;
    }

    setStations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchStations();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`stations-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referee_stations',
          filter: `tournament_id=eq.${tournamentId}`
        },
        () => {
          fetchStations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const createStation = async () => {
    setCreating(true);
    
    const nextNumber = stations.length > 0 
      ? Math.max(...stations.map(s => s.station_number)) + 1 
      : 1;

    const { error } = await supabase
      .from("referee_stations")
      .insert({
        tournament_id: tournamentId,
        station_number: nextNumber,
        station_name: newStationName || "Terrain"
      });

    if (error) {
      console.error("Error creating station:", error);
      toast.error("Error creating station");
    } else {
      toast.success(`${newStationName} ${nextNumber} created`);
      setDialogOpen(false);
      setNewStationName("Terrain");
    }
    
    setCreating(false);
  };

  const deleteStation = async (stationId: string) => {
    const { error } = await supabase
      .from("referee_stations")
      .delete()
      .eq("id", stationId);

    if (error) {
      toast.error("Error deleting station");
    } else {
      toast.success("Station deleted");
      fetchStations();
    }
  };

  const clearStationMatch = async (stationId: string) => {
    const { error } = await supabase
      .from("referee_stations")
      .update({
        current_match_id: null,
        timer_started_at: null,
        timer_paused_at: null,
        timer_elapsed_when_paused: 0,
      })
      .eq("id", stationId);

    if (error) {
      toast.error("Erreur lors du retrait du match");
    } else {
      toast.success("Match retiré de la station");
      fetchStations();
    }
  };

  const copyStationLink = (stationId: string) => {
    const url = `${window.location.origin}/referee-station/${stationId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  };

  const openStation = (stationId: string) => {
    const url = `${window.location.origin}/referee-station/${stationId}`;
    window.open(url, '_blank');
  };

  const copyOverlayLink = (stationId: string) => {
    const url = `${window.location.origin}/overlay/${stationId}`;
    navigator.clipboard.writeText(url);
    toast.success("Overlay URL copied! Paste it in OBS as a Browser Source.");
  };

  const openOverlay = (stationId: string) => {
    const url = `${window.location.origin}/overlay/${stationId}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Referee Stations
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage referee devices for each court
          </p>
        </div>
        
        {isCreator && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Station
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Referee Station</DialogTitle>
                <DialogDescription>
                  Create a new referee station for a court.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="station-name">Station Name</Label>
                <Input
                  id="station-name"
                  placeholder="e.g., Terrain, Court, Pitch"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createStation} disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {stations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No referee stations yet</p>
          {isCreator && <p className="text-sm">Create stations for each court</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {stations.map((station) => (
            <div
              key={station.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="font-bold text-primary">{station.station_number}</span>
                </div>
                <div>
                  <p className="font-medium">{station.station_name}</p>
                  {station.current_match ? (
                    <Badge variant="default" className="text-xs">
                      {station.current_match.team1.name} vs {station.current_match.team2.name}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Available</Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {isCreator && station.current_match_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => clearStationMatch(station.id)}
                    className="text-destructive hover:text-destructive"
                    title="Retirer le match"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyStationLink(station.id)}
                  title="Copy referee link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openStation(station.id)}
                  title="Open referee station"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openOverlay(station.id)}
                  title="Open streaming overlay"
                  className="text-primary hover:text-primary"
                >
                  <Tv2 className="h-4 w-4" />
                </Button>
                {isCreator && !station.current_match_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteStation(station.id)}
                    className="text-destructive hover:text-destructive"
                    title="Delete station"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Streaming Overlay info section */}
      {stations.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <Tv2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm flex-1 min-w-0">
              <p className="font-medium text-foreground">Streaming Overlay (OBS)</p>
              <p className="text-muted-foreground mt-0.5 mb-3">
                In OBS, add a <span className="font-mono text-xs bg-muted px-1 rounded">Browser Source</span> and paste the overlay URL below.
                Set background to transparent (check "Custom CSS" → <span className="font-mono text-xs bg-muted px-1 rounded">background-color: rgba(0,0,0,0);</span>).
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs bg-muted px-2 py-1.5 rounded border font-mono text-muted-foreground">
                  {`${window.location.origin}/overlay/live-match`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/overlay/live-match`);
                    toast.success("URL de l'overlay copiée !");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copier l'URL
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
