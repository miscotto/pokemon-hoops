"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GameEvent, PlayerGameStats, Side } from "../utils/tournamentEngine";

// ─── Types (API response shapes) ────────────────────────────────────────────

interface TeamSummary {
  id: string;
  name: string;
  coast: string;
  seed: number;
  isPlayer: boolean;
}

interface MatchupSummary {
  id: string;
  round: number;
  conference: string;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  status: "upcoming" | "in_progress" | "completed";
  homeScore: number;
  awayScore: number;
  winner: Side | null;
  mvp: { name: string; sprite: string; points: number } | null;
}

interface BracketState {
  status: "active" | "completed";
  startedAt: string;
  matchups: MatchupSummary[];
  userTeamName: string | null;
}

interface LobbyState {
  status: "waiting";
  teamCount: number;
  maxTeams: number;
  teams: { teamName: string; joinedAt: string }[];
}

interface TeamFull {
  id: string;
  name: string;
  coast: string;
  seed: number;
  isPlayer: boolean;
  roster: {
    name: string;
    sprite: string;
    bball: {
      ppg: number;
      rpg: number;
      apg: number;
      spg: number;
      bpg: number;
      mpg: number;
      per: number;
    };
  }[];
}

interface GameState {
  status: "upcoming" | "in_progress" | "completed";
  homeTeam: TeamFull;
  awayTeam: TeamFull;
  events: GameEvent[];
  currentHomeScore: number;
  currentAwayScore: number;
  playerStats?: PlayerGameStats[];
  winner?: Side;
  mvp?: { name: string; sprite: string; points: number; team: Side } | null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface LiveTournamentProps {
  tournamentId: string;
  initialStatus: "waiting" | "active";
  onBack: () => void;
}

// ─── Lobby View ──────────────────────────────────────────────────────────────

function LobbyView({ lobby }: { lobby: LobbyState }) {
  const progress = (lobby.teamCount / lobby.maxTeams) * 100;

  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
        <div className="text-5xl mb-4">🏟️</div>
        <h2 className="text-2xl font-black text-white mb-2">
          Live Tournament Lobby
        </h2>
        <p className="text-slate-400 mb-6">Waiting for players to join...</p>

        {/* Progress ring */}
        <div className="relative w-32 h-32 mx-auto mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="#334155"
              strokeWidth="8"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="8"
              strokeDasharray={`${progress * 3.52} ${352 - progress * 3.52}`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-black text-white">
              {lobby.teamCount}
              <span className="text-lg text-slate-400">/{lobby.maxTeams}</span>
            </span>
          </div>
        </div>

        {/* Team list */}
        <div className="space-y-2 text-left">
          {lobby.teams.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-slate-700/50 rounded-lg px-4 py-2.5"
            >
              <span className="text-amber-400 font-bold text-sm">{i + 1}</span>
              <span className="text-white text-sm font-medium">
                {t.teamName}
              </span>
              <span className="text-slate-500 text-xs ml-auto">Joined</span>
            </div>
          ))}
          {Array.from({ length: lobby.maxTeams - lobby.teamCount }).map(
            (_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-4 py-2.5 border border-dashed border-slate-600"
              >
                <span className="text-slate-600 font-bold text-sm">
                  {lobby.teamCount + i + 1}
                </span>
                <span className="text-slate-600 text-sm italic">
                  Waiting...
                </span>
              </div>
            ),
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-amber-400 text-sm">
          <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          Searching for opponents...
        </div>
      </div>
    </div>
  );
}

// ─── Live Bracket View ───────────────────────────────────────────────────────

function LiveMatchupCard({
  matchup,
  userTeamName,
  onWatch,
}: {
  matchup: MatchupSummary;
  userTeamName: string | null;
  onWatch: (id: string) => void;
}) {
  const isLive = matchup.status === "in_progress";
  const isDone = matchup.status === "completed";
  const isUpcoming = matchup.status === "upcoming";

  return (
    <div
      className={`rounded-lg border-2 overflow-hidden transition-all ${
        isDone
          ? "border-green-500/50 bg-slate-800"
          : isLive
            ? "border-amber-400/70 bg-slate-800 shadow-lg shadow-amber-400/10"
            : "border-slate-700 bg-slate-800/60"
      }`}
    >
      {/* Status bar */}
      <div
        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
          isDone
            ? "bg-green-900/40 text-green-400"
            : isLive
              ? "bg-amber-900/40 text-amber-400"
              : "bg-slate-700/40 text-slate-500"
        }`}
      >
        {isLive && (
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
        {isDone ? "Final" : isLive ? "Live" : "Upcoming"}
      </div>

      {/* Teams */}
      <div className="divide-y divide-slate-700/50">
        <LiveTeamRow
          name={matchup.homeTeam.name}
          seed={matchup.homeTeam.seed}
          score={matchup.homeScore}
          isWinner={isDone && matchup.winner === "home"}
          isUser={matchup.homeTeam.name === userTeamName}
          showScore={!isUpcoming}
        />
        <LiveTeamRow
          name={matchup.awayTeam.name}
          seed={matchup.awayTeam.seed}
          score={matchup.awayScore}
          isWinner={isDone && matchup.winner === "away"}
          isUser={matchup.awayTeam.name === userTeamName}
          showScore={!isUpcoming}
        />
      </div>

      {/* Watch button for live/completed games */}
      {(isLive || isDone) && (
        <button
          onClick={() => onWatch(matchup.id)}
          className={`w-full py-1.5 text-xs font-bold transition-colors ${
            isLive
              ? "bg-amber-500 hover:bg-amber-400 text-slate-900"
              : "bg-slate-700 hover:bg-slate-600 text-slate-300"
          }`}
        >
          {isLive ? "WATCH LIVE" : "VIEW RECAP"}
        </button>
      )}

      {/* MVP for completed */}
      {isDone && matchup.mvp && (
        <div className="px-3 py-1.5 bg-slate-900/50 text-[10px] text-slate-400 flex items-center gap-1.5">
          MVP:{" "}
          <span className="text-amber-400 font-semibold">
            {matchup.mvp.name}
          </span>
          ({matchup.mvp.points} pts)
        </div>
      )}
    </div>
  );
}

function LiveTeamRow({
  name,
  seed,
  score,
  isWinner,
  isUser,
  showScore,
}: {
  name: string;
  seed: number;
  score: number;
  isWinner: boolean;
  isUser: boolean;
  showScore: boolean;
}) {
  return (
    <div
      className={`px-3 py-2 flex items-center gap-2 ${isWinner ? "bg-green-900/20" : ""}`}
    >
      <span className="w-4 text-[10px] text-slate-500 font-mono">{seed}</span>
      <span
        className={`text-sm flex-1 truncate ${isWinner ? "font-bold text-green-400" : "text-slate-200"}`}
      >
        {name}
      </span>
      {isUser && (
        <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">
          YOU
        </span>
      )}
      {showScore && (
        <span
          className={`text-sm font-bold tabular-nums ${isWinner ? "text-green-400" : "text-slate-400"}`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function LiveBracketView({
  bracket,
  onWatch,
}: {
  bracket: BracketState;
  onWatch: (matchupId: string) => void;
}) {
  const m = bracket.matchups;
  const isComplete = bracket.status === "completed";
  const finalsMatchup = m.find((g) => g.id === "finals");
  const champion =
    isComplete && finalsMatchup?.winner
      ? finalsMatchup.winner === "home"
        ? finalsMatchup.homeTeam
        : finalsMatchup.awayTeam
      : null;

  return (
    <div className="w-full">
      {champion && (
        <div className="mb-8 text-center">
          <div className="inline-block bg-gradient-to-r from-amber-500/20 via-amber-400/20 to-amber-500/20 border border-amber-400/40 rounded-2xl px-8 py-5">
            <div className="text-4xl mb-2">🏆</div>
            <div className="text-2xl font-black text-amber-400">
              {champion.name}
            </div>
            <div className="text-sm text-slate-400 mt-1">
              Tournament Champion
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-6 max-w-5xl mx-auto">
        {/* Round 1 */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider text-center">
            West First Round
          </h3>
          {m
            .filter((g) => g.round === 1 && g.conference === "west")
            .map((g) => (
              <LiveMatchupCard
                key={g.id}
                matchup={g}
                userTeamName={bracket.userTeamName}
                onWatch={onWatch}
              />
            ))}
          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider text-center pt-3">
            East First Round
          </h3>
          {m
            .filter((g) => g.round === 1 && g.conference === "east")
            .map((g) => (
              <LiveMatchupCard
                key={g.id}
                matchup={g}
                userTeamName={bracket.userTeamName}
                onWatch={onWatch}
              />
            ))}
        </div>

        {/* Round 2 */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider text-center">
            West Final
          </h3>
          {m
            .filter((g) => g.round === 2 && g.conference === "west")
            .map((g) => (
              <LiveMatchupCard
                key={g.id}
                matchup={g}
                userTeamName={bracket.userTeamName}
                onWatch={onWatch}
              />
            ))}
          <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider text-center pt-3">
            Championship
          </h3>
          {m
            .filter((g) => g.round === 3)
            .map((g) => (
              <LiveMatchupCard
                key={g.id}
                matchup={g}
                userTeamName={bracket.userTeamName}
                onWatch={onWatch}
              />
            ))}
          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider text-center pt-3">
            East Final
          </h3>
          {m
            .filter((g) => g.round === 2 && g.conference === "east")
            .map((g) => (
              <LiveMatchupCard
                key={g.id}
                matchup={g}
                userTeamName={bracket.userTeamName}
                onWatch={onWatch}
              />
            ))}
        </div>

        {/* Spacer column for symmetry */}
        <div />
      </div>
    </div>
  );
}

// ─── Live Game View ──────────────────────────────────────────────────────────

function LiveGameScoreboard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  quarter,
  clock,
  status,
}: {
  homeTeam: TeamFull;
  awayTeam: TeamFull;
  homeScore: number;
  awayScore: number;
  quarter: number;
  clock: string;
  status: string;
}) {
  return (
    <div className="bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex -space-x-2">
            {homeTeam.roster?.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-900"
              />
            ))}
          </div>
          <div>
            <div className="text-white font-bold">{homeTeam.name}</div>
            <div className="text-slate-500 text-xs">
              {homeTeam.coast?.toUpperCase()} CONF
            </div>
          </div>
        </div>

        <div className="text-center px-6">
          <div className="flex items-center gap-3">
            <span
              className={`text-4xl font-black tabular-nums ${homeScore > awayScore ? "text-white" : "text-slate-500"}`}
            >
              {homeScore}
            </span>
            <span className="text-slate-600 text-xl">-</span>
            <span
              className={`text-4xl font-black tabular-nums ${awayScore > homeScore ? "text-white" : "text-slate-500"}`}
            >
              {awayScore}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-2">
            {status === "in_progress" && (
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            )}
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                status === "completed"
                  ? "bg-slate-700 text-slate-300"
                  : status === "in_progress"
                    ? "bg-red-600 text-white"
                    : "bg-slate-700 text-slate-400"
              }`}
            >
              {status === "completed"
                ? "FINAL"
                : status === "upcoming"
                  ? "UPCOMING"
                  : `Q${quarter}`}
            </span>
            {status === "in_progress" && (
              <span className="text-slate-400 text-sm font-mono">{clock}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="text-right">
            <div className="text-white font-bold">{awayTeam.name}</div>
            <div className="text-slate-500 text-xs">
              {awayTeam.coast?.toUpperCase()} CONF
            </div>
          </div>
          <div className="flex -space-x-2">
            {awayTeam.roster?.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-900"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveEventFeed({ events }: { events: GameEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (containerRef.current && events.length > prevCountRef.current) {
      containerRef.current.scrollTop = 0;
    }
    prevCountRef.current = events.length;
  }, [events.length]);

  const reversed = [...events].reverse();

  const getIcon = (type: string) => {
    const map: Record<string, string> = {
      score_2pt: "🏀",
      score_3pt: "🎯",
      dunk: "💥",
      layup: "🏀",
      block: "🖐️",
      steal: "🤏",
      rebound: "📦",
      assist: "🎁",
      foul: "⚠️",
      foul_out: "⚠️",
      injury: "🏥",
      hot_hand: "🔥",
      cold_streak: "🥶",
      clutch: "⭐",
      type_advantage: "⚡",
      ability_trigger: "✨",
      momentum: "📈",
      rivalry_clash: "😤",
      ally_boost: "🤝",
      fatigue: "😮‍💨",
      halftime: "⏸️",
      game_start: "🏁",
      game_end: "🏆",
      quarter_start: "📣",
      quarter_end: "📣",
    };
    return map[type] || "•";
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-700">
        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
          Play-by-Play
          {events.length > 0 && (
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
              {events.length} plays
            </span>
          )}
        </h3>
      </div>
      <div ref={containerRef} className="h-96 overflow-y-auto">
        {reversed.map((event, idx) => {
          const isNew = idx === 0;
          const isScoring = [
            "score_2pt",
            "score_3pt",
            "dunk",
            "layup",
            "clutch",
          ].includes(event.type);
          return (
            <div
              key={events.length - 1 - idx}
              className={`px-4 py-2.5 border-b border-slate-700/30 flex gap-3 transition-colors ${
                isNew ? "bg-amber-900/20" : ""
              } ${isScoring ? (event.team === "home" ? "border-l-2 border-l-blue-500" : "border-l-2 border-l-red-500") : ""}`}
            >
              <div className="shrink-0 text-center w-10">
                <div className="text-[9px] text-slate-500 font-mono">
                  Q{event.quarter}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {event.clock}
                </div>
              </div>
              <div className="text-base shrink-0">{getIcon(event.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {event.pokemonSprite && (
                    <img src={event.pokemonSprite} alt="" className="w-4 h-4" />
                  )}
                  <span
                    className={`text-xs font-bold ${event.team === "home" ? "text-blue-400" : "text-red-400"}`}
                  >
                    {event.pokemonName}
                  </span>
                  {event.pointsScored && (
                    <span className="text-[10px] font-bold text-green-400 bg-green-900/40 px-1 rounded">
                      +{event.pointsScored}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-300">
                  {event.description}
                </div>
              </div>
              <div className="shrink-0 text-xs font-bold text-slate-400 tabular-nums">
                {event.homeScore}-{event.awayScore}
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-center text-slate-500 py-12">
            <div className="text-2xl mb-2">⏳</div>
            Game hasn&apos;t started yet...
          </div>
        )}
      </div>
    </div>
  );
}

function LiveBoxScore({
  events,
  homeTeam,
  awayTeam,
}: {
  events: GameEvent[];
  homeTeam: TeamFull;
  awayTeam: TeamFull;
}) {
  const [tab, setTab] = useState<"home" | "away">("home");

  // Accumulate stats from events
  const statsMap = new Map<string, PlayerGameStats>();
  const team = tab === "home" ? homeTeam : awayTeam;
  for (const p of team.roster || []) {
    statsMap.set(p.name, {
      name: p.name,
      sprite: p.sprite,
      team: tab,
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      fouls: 0,
      injured: false,
    });
  }
  for (const e of events) {
    if (e.team !== tab) continue;
    const s = statsMap.get(e.pokemonName);
    if (!s) continue;
    if (e.pointsScored) s.points += e.pointsScored;
    if (e.statType === "rebound") s.rebounds++;
    if (e.statType === "assist") s.assists++;
    if (e.statType === "steal") s.steals++;
    if (e.statType === "block") s.blocks++;
    if (e.statType === "foul") s.fouls++;
    if (e.type === "injury" || e.type === "foul_out") s.injured = true;
  }

  const players = Array.from(statsMap.values()).sort(
    (a, b) => b.points - a.points,
  );

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setTab("home")}
          className={`flex-1 py-2.5 text-xs font-bold ${tab === "home" ? "text-blue-400 bg-blue-900/20 border-b-2 border-blue-400" : "text-slate-500"}`}
        >
          {homeTeam.name}
        </button>
        <button
          onClick={() => setTab("away")}
          className={`flex-1 py-2.5 text-xs font-bold ${tab === "away" ? "text-red-400 bg-red-900/20 border-b-2 border-red-400" : "text-slate-500"}`}
        >
          {awayTeam.name}
        </button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 uppercase text-[10px]">
            <th className="text-left px-3 py-2">Player</th>
            <th className="text-center px-1.5 py-2">PTS</th>
            <th className="text-center px-1.5 py-2">REB</th>
            <th className="text-center px-1.5 py-2">AST</th>
            <th className="text-center px-1.5 py-2">STL</th>
            <th className="text-center px-1.5 py-2">BLK</th>
            <th className="text-center px-1.5 py-2">PF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {players.map((p) => (
            <tr key={p.name} className={p.injured ? "opacity-40" : ""}>
              <td className="px-3 py-2 flex items-center gap-1.5">
                <img src={p.sprite} alt="" className="w-5 h-5" />
                <span className="text-slate-200 truncate max-w-[80px]">
                  {p.name}
                </span>
                {p.injured && (
                  <span className="text-[8px] bg-red-900/50 text-red-400 px-1 rounded">
                    OUT
                  </span>
                )}
              </td>
              <td className="text-center px-1.5 py-2 font-bold text-white">
                {p.points}
              </td>
              <td className="text-center px-1.5 py-2 text-slate-400">
                {p.rebounds}
              </td>
              <td className="text-center px-1.5 py-2 text-slate-400">
                {p.assists}
              </td>
              <td className="text-center px-1.5 py-2 text-slate-400">
                {p.steals}
              </td>
              <td className="text-center px-1.5 py-2 text-slate-400">
                {p.blocks}
              </td>
              <td className="text-center px-1.5 py-2 text-slate-400">
                {p.fouls}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveGameView({
  tournamentId,
  matchupId,
  onBack,
}: {
  tournamentId: string;
  matchupId: string;
  onBack: () => void;
}) {
  const [game, setGame] = useState<GameState | null>(null);

  // Poll for game events every 2 seconds
  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(
          `/api/live-tournaments/${tournamentId}/game/${matchupId}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (active) setGame(data);
      } catch {
        // Network error, retry next tick
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tournamentId, matchupId]);

  if (!game) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400" />
      </div>
    );
  }

  const lastEvent = game.events[game.events.length - 1];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <button
        onClick={onBack}
        className="text-slate-400 hover:text-slate-200 text-sm font-medium flex items-center gap-1"
      >
        <span>←</span> Back to Bracket
      </button>

      <LiveGameScoreboard
        homeTeam={game.homeTeam}
        awayTeam={game.awayTeam}
        homeScore={game.currentHomeScore}
        awayScore={game.currentAwayScore}
        quarter={lastEvent?.quarter || 1}
        clock={lastEvent?.clock || "12:00"}
        status={game.status}
      />

      {/* Game over banner */}
      {game.status === "completed" && game.mvp && (
        <div className="bg-gradient-to-r from-amber-900/30 to-amber-800/30 border border-amber-500/30 rounded-xl p-4 text-center">
          <div className="text-lg font-black text-white mb-1">
            {game.winner === "home" ? game.homeTeam.name : game.awayTeam.name}{" "}
            Wins!
          </div>
          <div className="text-sm text-slate-300">
            MVP:{" "}
            <span className="text-amber-400 font-bold">{game.mvp.name}</span> (
            {game.mvp.points} pts)
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <LiveEventFeed events={game.events} />
        </div>
        <div className="lg:col-span-2">
          <LiveBoxScore
            events={game.events}
            homeTeam={game.homeTeam}
            awayTeam={game.awayTeam}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LiveTournament({
  tournamentId,
  initialStatus,
  onBack,
}: LiveTournamentProps) {
  const [status, setStatus] = useState<"waiting" | "active" | "completed">(
    initialStatus,
  );
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [bracket, setBracket] = useState<BracketState | null>(null);
  const [watchingMatchup, setWatchingMatchup] = useState<string | null>(null);

  // Poll for state updates
  useEffect(() => {
    if (watchingMatchup) return; // Game view handles its own polling

    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/live-tournaments/${tournamentId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        if (data.status === "waiting") {
          setStatus("waiting");
          setLobby(data);
        } else {
          setStatus(data.status);
          setBracket(data);
        }
      } catch {
        // Retry next tick
      }
    }

    poll();
    const interval = setInterval(poll, status === "waiting" ? 3000 : 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tournamentId, status, watchingMatchup]);

  // Watching a live game
  if (watchingMatchup) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 pt-6">
        <LiveGameView
          tournamentId={tournamentId}
          matchupId={watchingMatchup}
          onBack={() => setWatchingMatchup(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-6xl mx-auto pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="text-slate-400 hover:text-slate-200 font-medium text-sm flex items-center gap-1"
          >
            <span>←</span> Dashboard
          </button>
          <div className="text-center">
            <h1 className="text-xl font-black">
              Live Tournament
              {status === "active" && (
                <span className="ml-2 inline-flex items-center gap-1 text-sm text-red-400">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              )}
            </h1>
          </div>
          <div className="w-24" />
        </div>

        {/* Content */}
        {status === "waiting" && lobby && <LobbyView lobby={lobby} />}
        {(status === "active" || status === "completed") && bracket && (
          <LiveBracketView bracket={bracket} onWatch={setWatchingMatchup} />
        )}

        {/* Loading */}
        {!lobby && status === "waiting" && (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400 mx-auto" />
          </div>
        )}
      </div>
    </div>
  );
}
