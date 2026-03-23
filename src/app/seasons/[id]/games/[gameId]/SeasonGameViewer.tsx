"use client";

import { useEffect, useState, useRef } from "react";

interface GameEvent {
  type: string;
  description: string;
  homeScore: number;
  awayScore: number;
  quarter: number;
  clock: string;
  team: "home" | "away";
  pokemonName: string;
  pokemonSprite?: string;
  pointsScored?: number;
  sequence?: number;
}

const EVENT_ICONS: Record<string, string> = {
  score_2pt: "🏀", score_3pt: "🎯", dunk: "💥", layup: "🏀",
  block: "🖐️", steal: "🤏", rebound: "📦", assist: "🎁",
  foul: "⚠️", foul_out: "⚠️", injury: "🏥", hot_hand: "🔥",
  cold_streak: "🥶", clutch: "⭐", type_advantage: "⚡",
  ability_trigger: "✨", momentum: "📈", rivalry_clash: "😤",
  ally_boost: "🤝", fatigue: "😮‍💨", halftime: "⏸️",
  game_start: "🏁", game_end: "🏆", quarter_start: "📣", quarter_end: "📣",
};

interface Props {
  gameId: string;
  team1Name: string;
  team2Name: string;
  initialStatus: string;
  initialTeam1Score: number;
  initialTeam2Score: number;
  streamUrl: string;
}

export default function SeasonGameViewer({
  team1Name,
  team2Name,
  initialStatus,
  initialTeam1Score,
  initialTeam2Score,
  streamUrl,
}: Props) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [liveScore, setLiveScore] = useState({ home: initialTeam1Score, away: initialTeam2Score });
  const [isDone, setIsDone] = useState(initialStatus === "completed");
  const [currentClock, setCurrentClock] = useState({ quarter: 1, clock: "12:00" });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDone) return;

    const es = new EventSource(streamUrl);

    es.addEventListener("game_state", (e) => {
      const d = JSON.parse(e.data);
      setLiveScore({ home: d.team1Score ?? 0, away: d.team2Score ?? 0 });
      if (d.status === "completed") setIsDone(true);
    });

    es.addEventListener("game_event", (e) => {
      const ev = JSON.parse(e.data) as GameEvent;
      setEvents((prev) => {
        if (prev.some((p) => p.sequence === ev.sequence)) return prev;
        return [...prev, ev];
      });
      setLiveScore({ home: ev.homeScore, away: ev.awayScore });
      setCurrentClock({ quarter: ev.quarter, clock: ev.clock });
    });

    es.addEventListener("game_end", (e) => {
      const d = JSON.parse(e.data);
      if (d.team1Score != null) setLiveScore({ home: d.team1Score, away: d.team2Score });
      setIsDone(true);
      es.close();
    });

    es.onerror = () => es.close();

    return () => es.close();
  }, [streamUrl, isDone]);

  // Scroll event feed to top on new events
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [events.length]);

  const reversedEvents = [...events].reverse();
  const team1Wins = liveScore.home > liveScore.away;

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="font-semibold text-lg">{team1Name}</div>
          </div>
          <div className="text-center px-8">
            <div className="flex items-center gap-4">
              <span className={`text-4xl font-bold tabular-nums ${liveScore.home >= liveScore.away ? "text-blue-600" : "text-gray-400"}`}>
                {liveScore.home}
              </span>
              <span className="text-2xl text-gray-300">-</span>
              <span className={`text-4xl font-bold tabular-nums ${liveScore.away > liveScore.home ? "text-blue-600" : "text-gray-400"}`}>
                {liveScore.away}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              {!isDone && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
              <span className={`text-xs px-2 py-0.5 rounded text-white ${isDone ? "bg-gray-600" : "bg-blue-600"}`}>
                {isDone ? "FINAL" : `Q${currentClock.quarter} ${currentClock.clock}`}
              </span>
            </div>
          </div>
          <div className="flex-1 text-right">
            <div className="font-semibold text-lg">{team2Name}</div>
          </div>
        </div>
        {isDone && (
          <div className="mt-3 text-center text-sm text-blue-700 font-medium">
            {team1Wins ? team1Name : team2Name} wins!
          </div>
        )}
      </div>

      {/* Event feed */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 flex justify-between">
          <span>PLAY-BY-PLAY</span>
          <span>{events.length} plays</span>
        </div>
        <div ref={containerRef} className="h-96 overflow-y-auto">
          {reversedEvents.map((event, idx) => (
            <div
              key={event.sequence ?? idx}
              className="px-4 py-3 flex gap-3 border-b last:border-0"
              style={{ opacity: idx === 0 ? 1 : 0.55 }}
            >
              <div className="shrink-0 text-center w-10">
                <div className="text-xs text-gray-400">Q{event.quarter}</div>
                <div className="text-xs text-gray-400">{event.clock}</div>
              </div>
              <div className="text-lg shrink-0">{EVENT_ICONS[event.type] ?? "•"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {event.pokemonSprite && <img src={event.pokemonSprite} alt="" className="w-4 h-4" />}
                  <span className={`text-xs font-medium ${event.team === "home" ? "text-blue-600" : "text-red-600"}`}>
                    {event.pokemonName}
                  </span>
                  {event.pointsScored && (
                    <span className="text-xs text-blue-600 border border-blue-600 px-1 rounded">
                      +{event.pointsScored}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-700 leading-snug">{event.description}</div>
              </div>
              <div className="shrink-0 text-xs text-gray-400 tabular-nums">
                {event.homeScore}-{event.awayScore}
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-3xl mb-2">⏳</div>
              <div className="text-sm">Waiting for game to start…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
