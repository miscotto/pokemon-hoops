"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

type Tab = "live" | "upcoming" | "completed";

interface Game {
  id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  status: string;
  scheduledAt: Date | string;
  gameType: string;
  round: number | null;
}

interface Team {
  userId: string;
  teamName: string;
}

interface Props {
  seasonId: string;
  teams: Team[];
  defaultTab: Tab;
  initialGames: Game[];
}

const TAB_LABEL: Record<Tab, string> = {
  live: "🔴 Live",
  upcoming: "Upcoming",
  completed: "Completed",
};

export default function ScheduleView({ seasonId, teams, defaultTab, initialGames }: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [userId, setUserId] = useState<string>("");
  const [games, setGames] = useState<Game[]>(initialGames);
  const [offset, setOffset] = useState(initialGames.length);
  const [hasMore, setHasMore] = useState(initialGames.length === 50);
  const [loading, setLoading] = useState(false);

  const fetchGames = useCallback(
    async (nextTab: Tab, nextUserId: string, nextOffset: number, append: boolean) => {
      setLoading(true);
      const params = new URLSearchParams({ status: nextTab, limit: "50", offset: String(nextOffset) });
      if (nextUserId) params.set("userId", nextUserId);
      const res = await fetch(`/api/seasons/${seasonId}/games?${params}`);
      if (!res.ok) { setLoading(false); return; }
      const data: Game[] = await res.json();
      setGames((prev) => (append ? [...prev, ...data] : data));
      setOffset(nextOffset + data.length);
      setHasMore(data.length === 50);
      setLoading(false);
    },
    [seasonId]
  );

  // Re-fetch when tab or team filter changes (skip on first render — initialGames already set)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setOffset(0);
    fetchGames(tab, userId, 0, false);
  }, [tab, userId, fetchGames]);

  // Auto-refresh live tab every 30 seconds (only when not paginated past first page)
  useEffect(() => {
    if (tab !== "live") return;
    const id = setInterval(() => {
      setOffset((currentOffset) => {
        if (currentOffset <= 50) fetchGames("live", userId, 0, false);
        return currentOffset;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [tab, userId, fetchGames]);

  function statusPill(game: Game) {
    if (game.status === "in_progress") {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
          LIVE
        </span>
      );
    }
    if (game.status === "completed") {
      return <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">FINAL</span>;
    }
    return <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">UPCOMING</span>;
  }

  function gameTypeLabel(game: Game) {
    if (game.gameType === "playoff") {
      const label = game.round === 1 ? "QF" : game.round === 2 ? "SF" : "Finals";
      return <span className="text-xs text-purple-600 font-medium">{label}</span>;
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border rounded-lg p-1 bg-gray-50">
          {(["live", "upcoming", "completed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="text-sm border rounded px-3 py-1.5 bg-white"
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t.userId} value={t.userId}>{t.teamName}</option>
          ))}
        </select>
      </div>

      <div className="border rounded-lg overflow-hidden divide-y">
        {games.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No {tab} games{userId ? " for this team" : ""}.
          </div>
        )}
        {games.map((game) => (
          <Link
            key={game.id}
            href={`/seasons/${seasonId}/games/${game.id}`}
            className="flex items-center px-4 py-3 hover:bg-gray-50 gap-4"
          >
            <div className="w-32 shrink-0 text-xs text-gray-400">
              {new Date(game.scheduledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {" "}
              {new Date(game.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{game.team1Name}</span>
              <span className="text-gray-400 mx-2">vs</span>
              <span className="font-medium text-sm">{game.team2Name}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {gameTypeLabel(game)}
              {game.status === "completed" && (
                <span className="font-mono text-sm tabular-nums">
                  {game.team1Score}–{game.team2Score}
                </span>
              )}
              {statusPill(game)}
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => fetchGames(tab, userId, offset, true)}
          disabled={loading}
          className="w-full py-2 text-sm text-blue-600 border rounded-lg hover:bg-blue-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
