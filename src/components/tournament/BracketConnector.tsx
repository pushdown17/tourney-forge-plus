import { cn } from "@/lib/utils";

interface BracketConnectorProps {
  matchIndex: number;
  totalMatchesInRound: number;
  matchHeight: number;
  verticalGap: number;
  isLastRound: boolean;
}

export const BracketConnector = ({
  matchIndex,
  totalMatchesInRound,
  matchHeight,
  verticalGap,
  isLastRound,
}: BracketConnectorProps) => {
  if (isLastRound) return null;
  if (matchIndex % 2 !== 0) return null;
  if (matchIndex + 1 >= totalMatchesInRound) return null;

  // Calculate vertical positions
  const totalHeight = matchHeight + verticalGap;
  const y1 = matchHeight / 2;
  const y2 = totalHeight + matchHeight / 2;
  const yMid = (y1 + y2) / 2;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: "100%",
        top: matchIndex * totalHeight,
        width: "32px",
        height: totalHeight + matchHeight,
        overflow: "visible",
      }}
    >
      {/* Horizontal line from match 1 */}
      <line
        x1="0"
        y1={y1}
        x2="16"
        y2={y1}
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        className="opacity-40"
      />
      {/* Horizontal line from match 2 */}
      <line
        x1="0"
        y1={y2}
        x2="16"
        y2={y2}
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        className="opacity-40"
      />
      {/* Vertical connector */}
      <line
        x1="16"
        y1={y1}
        x2="16"
        y2={y2}
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        className="opacity-40"
      />
      {/* Horizontal line to next round */}
      <line
        x1="16"
        y1={yMid}
        x2="32"
        y2={yMid}
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        className="opacity-40"
      />
    </svg>
  );
};
