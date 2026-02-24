import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, GripVertical, Trash2, Sun, CloudSun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

interface Team {
  id: string;
  tournament_team_id: string;
  name: string;
  group_name: string | null;
}

interface GroupedTeamsManagerProps {
  teams: Team[];
  isCreator: boolean;
  isClosed: boolean;
  onDeleteTeam: (tournamentTeamId: string) => void;
  onTeamsUpdated: () => void;
}

const GROUP_MORNING = "Morning";
const GROUP_AFTERNOON = "Afternoon";
const GROUP_UNASSIGNED = "unassigned";

function DraggableTeamCard({
  team,
  isCreator,
  isClosed,
  onDelete,
}: {
  team: Team;
  isCreator: boolean;
  isClosed: boolean;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: team.tournament_team_id, disabled: !isCreator || isClosed });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' as const : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg min-h-[48px] border border-border/30 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center gap-2">
        {isCreator && !isClosed && (
          <GripVertical
            className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
            {...attributes}
            {...listeners}
          />
        )}
        <span className="font-medium text-sm">{team.name}</span>
      </div>
      {isCreator && !isClosed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(team.tournament_team_id)}
          className="h-8 w-8 p-0 shrink-0"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

function DroppableColumn({
  id,
  title,
  icon,
  teams,
  maxTeams,
  isCreator,
  isClosed,
  onDelete,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  teams: Team[];
  maxTeams: number | null;
  isCreator: boolean;
  isClosed: boolean;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 rounded-xl border-2 transition-colors p-4 ${
        isOver
          ? "border-primary/60 bg-primary/5"
          : teams.length === 0
          ? "border-dashed border-muted-foreground/30 bg-muted/10"
          : "border-border/40 bg-card/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-semibold text-base">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted/50">
          {teams.length}{maxTeams !== null ? `/${maxTeams}` : ""}
        </span>
      </div>

      <div className="space-y-2 min-h-[60px]">
        {teams.length === 0 && (
          <div className="flex items-center justify-center h-[60px] text-muted-foreground/50 text-sm">
            Drag teams here
          </div>
        )}
        {teams.map((team) => (
          <DraggableTeamCard
            key={team.tournament_team_id}
            team={team}
            isCreator={isCreator}
            isClosed={isClosed}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export const GroupedTeamsManager = ({
  teams,
  isCreator,
  isClosed,
  onDeleteTeam,
  onTeamsUpdated,
}: GroupedTeamsManagerProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const morningTeams = useMemo(
    () => teams.filter((t) => t.group_name === GROUP_MORNING).sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );
  const afternoonTeams = useMemo(
    () => teams.filter((t) => t.group_name === GROUP_AFTERNOON).sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );
  const unassignedTeams = useMemo(
    () => teams.filter((t) => !t.group_name || (t.group_name !== GROUP_MORNING && t.group_name !== GROUP_AFTERNOON)).sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );

  const totalTeams = teams.length;
  const halfTeams = Math.ceil(totalTeams / 2);

  const activeTeam = activeId
    ? teams.find((t) => t.tournament_team_id === activeId)
    : null;

  const findContainer = (id: string): string | null => {
    if ([GROUP_MORNING, GROUP_AFTERNOON, GROUP_UNASSIGNED].includes(id)) return id;
    if (morningTeams.some((t) => t.tournament_team_id === id)) return GROUP_MORNING;
    if (afternoonTeams.some((t) => t.tournament_team_id === id)) return GROUP_AFTERNOON;
    if (unassignedTeams.some((t) => t.tournament_team_id === id)) return GROUP_UNASSIGNED;
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!overContainer || activeContainer === overContainer) return;

    const newGroupName = overContainer === GROUP_UNASSIGNED ? null : overContainer;

    try {
      const { error } = await supabase
        .from("tournament_teams")
        .update({ group_name: newGroupName })
        .eq("id", active.id as string);

      if (error) throw error;
      onTeamsUpdated();
    } catch (err: any) {
      toast.error("Error moving team: " + err.message);
    }
  };

  return (
    <Card className="glass-card p-4 md:p-6">
      <h2 className="text-xl md:text-2xl font-bold mb-4">
        Team Groups ({teams.length})
      </h2>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <DroppableColumn
            id={GROUP_MORNING}
            title="Morning Group"
            icon={<Sun className="h-5 w-5 text-amber-400" />}
            teams={morningTeams}
            maxTeams={halfTeams}
            isCreator={isCreator}
            isClosed={isClosed}
            onDelete={onDeleteTeam}
          />
          <DroppableColumn
            id={GROUP_AFTERNOON}
            title="Afternoon Group"
            icon={<CloudSun className="h-5 w-5 text-orange-400" />}
            teams={afternoonTeams}
            maxTeams={halfTeams}
            isCreator={isCreator}
            isClosed={isClosed}
            onDelete={onDeleteTeam}
          />
        </div>

        {(unassignedTeams.length > 0 || isCreator) && (
          <DroppableColumn
            id={GROUP_UNASSIGNED}
            title="Unassigned Teams"
            icon={<Users className="h-5 w-5 text-muted-foreground" />}
            teams={unassignedTeams}
            maxTeams={null}
            isCreator={isCreator}
            isClosed={isClosed}
            onDelete={onDeleteTeam}
          />
        )}

        <DragOverlay dropAnimation={null}>
          {activeTeam && (
            <div className="flex items-center gap-2 p-3 bg-primary/20 border border-primary/50 rounded-lg shadow-lg backdrop-blur-sm">
              <GripVertical className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">{activeTeam.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </Card>
  );
};
