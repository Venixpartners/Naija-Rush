import type { LeaderboardRow } from "@/lib/services/leaderboards";

export function LeaderboardList({ rows, emptyText = "No scores yet today. Be the first on the board." }: { rows: LeaderboardRow[]; emptyText?: string }) {
  if (rows.length === 0) return <div className="board empty">{emptyText}</div>;
  return (
    <ol className="board">
      {rows.map((r) => (
        <li key={`${r.rank}-${r.name}`} className={r.isYou ? "you" : undefined}>
          <span className="rank">{r.rank}</span>
          <span className="name">
            {r.name}
            {r.isYou ? " (you)" : ""}
          </span>
          <span className="pts">{r.score.toLocaleString("en-NG")}</span>
        </li>
      ))}
    </ol>
  );
}
