import { Target, Users, AlertTriangle, Clock } from "lucide-react";

interface PlayerStat {
  id?: string;
  goals?: number;
  assists?: number;
  fouls?: number;
  penalty_30s?: number;
  penalty_1m?: number;
  penalty_2m?: number;
}

interface Player {
  id: string;
  name: string;
}

interface MatchStatsRecapProps {
  team1Name: string;
  team2Name: string;
  team1Players: Player[];
  team2Players: Player[];
  playerStats: Record<string, PlayerStat>;
}

export const MatchStatsRecap = ({
  team1Name,
  team2Name,
  team1Players,
  team2Players,
  playerStats,
}: MatchStatsRecapProps) => {
  const getTeamStats = (players: Player[]) => {
    const stats = {
      scorers: [] as { name: string; goals: number }[],
      assisters: [] as { name: string; assists: number }[],
      fouls: [] as { name: string; fouls: number }[],
      penalties: [] as { name: string; total: number }[],
    };

    players.forEach((player) => {
      const stat = playerStats[player.id];
      if (stat) {
        if (stat.goals && stat.goals > 0) {
          stats.scorers.push({ name: player.name, goals: stat.goals });
        }
        if (stat.assists && stat.assists > 0) {
          stats.assisters.push({ name: player.name, assists: stat.assists });
        }
        if (stat.fouls && stat.fouls > 0) {
          stats.fouls.push({ name: player.name, fouls: stat.fouls });
        }
        const totalPenalties = (stat.penalty_30s || 0) + (stat.penalty_1m || 0) + (stat.penalty_2m || 0);
        if (totalPenalties > 0) {
          stats.penalties.push({ name: player.name, total: totalPenalties });
        }
      }
    });

    return stats;
  };

  const team1Stats = getTeamStats(team1Players);
  const team2Stats = getTeamStats(team2Players);

  const hasAnyStats = (stats: ReturnType<typeof getTeamStats>) =>
    stats.scorers.length > 0 || stats.assisters.length > 0 || stats.fouls.length > 0 || stats.penalties.length > 0;

  const TeamStatsSection = ({ teamName, stats }: { teamName: string; stats: ReturnType<typeof getTeamStats> }) => (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm border-b pb-1">{teamName}</h4>
      {stats.scorers.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <Target className="h-4 w-4 text-green-500 mt-0.5" />
          <div>
            <span className="font-medium">Buts: </span>
            {stats.scorers.map((s, i) => (
              <span key={s.name}>
                {s.name} ({s.goals}){i < stats.scorers.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {stats.assisters.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <Users className="h-4 w-4 text-blue-500 mt-0.5" />
          <div>
            <span className="font-medium">Passes D: </span>
            {stats.assisters.map((s, i) => (
              <span key={s.name}>
                {s.name} ({s.assists}){i < stats.assisters.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {stats.fouls.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
          <div>
            <span className="font-medium">Fautes: </span>
            {stats.fouls.map((s, i) => (
              <span key={s.name}>
                {s.name} ({s.fouls}){i < stats.fouls.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {stats.penalties.length > 0 && (
        <div className="flex items-start gap-2 text-sm">
          <Clock className="h-4 w-4 text-red-500 mt-0.5" />
          <div>
            <span className="font-medium">Pénalités: </span>
            {stats.penalties.map((s, i) => (
              <span key={s.name}>
                {s.name} ({s.total}){i < stats.penalties.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {!hasAnyStats(stats) && (
        <p className="text-sm text-muted-foreground italic">Aucune stat enregistrée</p>
      )}
    </div>
  );

  return (
    <div className="mt-4 space-y-4 max-h-60 overflow-y-auto">
      <h3 className="font-semibold text-sm text-muted-foreground">Récapitulatif des faits de jeu</h3>
      <div className="grid grid-cols-2 gap-4">
        <TeamStatsSection teamName={team1Name} stats={team1Stats} />
        <TeamStatsSection teamName={team2Name} stats={team2Stats} />
      </div>
    </div>
  );
};
