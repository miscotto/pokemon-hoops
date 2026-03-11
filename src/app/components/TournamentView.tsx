"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TournamentTeam,
  TournamentPokemon,
  TournamentBracketData,
  BracketMatchup,
  LiveGameResult,
  GameEvent,
  PlayerGameStats,
  Side,
  simulateMatchup,
  generateTournamentBracket,
  advanceBracket,
  isMatchupPlayable,
  isTournamentComplete,
  toTournamentPokemon,
} from "../utils/tournamentEngine";

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAYBACK_INTERVAL_MS = 2000; // 2 seconds between events = ~5 min total

// ─── Pokemon Pool Hook ───────────────────────────────────────────────────────

function usePokemonPool() {
  const [pool, setPool] = useState<TournamentPokemon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/pokemon-bball-stats-augmented.json")
      .then((r) => r.json())
      .then((data) => setPool(data.map(toTournamentPokemon)))
      .catch((err) => console.error("Failed to load pool:", err))
      .finally(() => setLoading(false));
  }, []);

  return { pool, loading };
}

// ─── Bracket View ────────────────────────────────────────────────────────────

function MatchupCard({
  matchup,
  onWatch,
  roundLabel,
}: {
  matchup: BracketMatchup;
  onWatch: (m: BracketMatchup) => void;
  roundLabel: string;
}) {
  const playable = isMatchupPlayable(matchup);
  const done = matchup.result !== null;
  const pending = !matchup.homeTeam || !matchup.awayTeam;

  return (
    <div
      className={`rounded-lg border-2 overflow-hidden transition-all ${
        done
          ? "border-green-400 bg-white"
          : playable
            ? "border-yellow-400 bg-white shadow-lg shadow-yellow-100"
            : "border-gray-200 bg-gray-50"
      }`}
    >
      {/* Round label */}
      <div
        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 ${
          done
            ? "bg-green-50 text-green-700"
            : playable
              ? "bg-yellow-50 text-yellow-700"
              : "bg-gray-100 text-gray-500"
        }`}
      >
        {roundLabel}
      </div>

      {/* Teams */}
      <div className="divide-y divide-gray-100">
        <TeamRow
          team={matchup.homeTeam}
          score={matchup.result?.finalHomeScore}
          isWinner={done && matchup.result!.winner === "home"}
          seed={matchup.homeTeam?.seed}
        />
        <TeamRow
          team={matchup.awayTeam}
          score={matchup.result?.finalAwayScore}
          isWinner={done && matchup.result!.winner === "away"}
          seed={matchup.awayTeam?.seed}
        />
      </div>

      {/* Action */}
      {playable && (
        <button
          onClick={() => onWatch(matchup)}
          className="w-full py-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-sm font-bold hover:from-yellow-500 hover:to-orange-500 transition-all"
        >
          WATCH GAME
        </button>
      )}
      {done && matchup.result?.mvp && (
        <div className="px-3 py-1.5 bg-gray-50 text-xs text-gray-600 flex items-center gap-1.5">
          <span>MVP:</span>
          {matchup.result.mvp.sprite && (
            <img src={matchup.result.mvp.sprite} alt="" className="w-4 h-4" />
          )}
          <span className="font-semibold">{matchup.result.mvp.name}</span>
          <span>({matchup.result.mvp.points} pts)</span>
        </div>
      )}
      {pending && (
        <div className="px-3 py-2 text-xs text-gray-400 text-center italic">
          Waiting for previous round...
        </div>
      )}
    </div>
  );
}

function TeamRow({
  team,
  score,
  isWinner,
  seed,
}: {
  team: TournamentTeam | null;
  score?: number;
  isWinner?: boolean;
  seed?: number;
}) {
  if (!team) {
    return (
      <div className="px-3 py-2.5 flex items-center text-gray-300 text-sm">
        <span className="w-5 text-xs text-gray-300">-</span>
        <span className="italic">TBD</span>
      </div>
    );
  }

  return (
    <div
      className={`px-3 py-2.5 flex items-center gap-2 ${isWinner ? "bg-green-50" : ""}`}
    >
      <span className="w-5 text-xs text-gray-400 font-mono">{seed}</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {team.roster[0]?.sprite && (
          <img
            src={team.roster[0].sprite}
            alt=""
            className="w-5 h-5 flex-shrink-0"
          />
        )}
        <span
          className={`text-sm truncate ${isWinner ? "font-bold text-green-800" : "text-gray-800"}`}
        >
          {team.name}
        </span>
        {team.isPlayer && (
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
            YOU
          </span>
        )}
      </div>
      {score !== undefined && (
        <span
          className={`text-sm font-bold tabular-nums ${isWinner ? "text-green-700" : "text-gray-500"}`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function BracketView({
  bracket,
  onWatch,
}: {
  bracket: TournamentBracketData;
  onWatch: (m: BracketMatchup) => void;
}) {
  const m = bracket.matchups;
  const complete = isTournamentComplete(m);
  const champion = m.find((g) => g.id === "finals")?.winner;

  return (
    <div className="w-full">
      {/* Champion banner */}
      {complete && champion && (
        <div className="mb-8 text-center">
          <div className="inline-block bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400 rounded-2xl px-8 py-5 shadow-xl">
            <div className="text-4xl mb-2">🏆</div>
            <div className="text-2xl font-black text-yellow-900">
              {champion.name}
            </div>
            <div className="text-sm text-yellow-800 mt-1">
              Tournament Champion
            </div>
            {champion.isPlayer && (
              <div className="mt-2 text-lg font-bold text-yellow-900">
                Congratulations!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bracket grid */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-x-4 gap-y-6 items-center max-w-5xl mx-auto">
        {/* Column 1: Round 1 */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider text-center mb-2">
            West First Round
          </h3>
          <MatchupCard
            matchup={m[0]}
            onWatch={onWatch}
            roundLabel={`(${m[0].homeTeam?.seed}) vs (${m[0].awayTeam?.seed})`}
          />
          <MatchupCard
            matchup={m[1]}
            onWatch={onWatch}
            roundLabel={`(${m[1].homeTeam?.seed}) vs (${m[1].awayTeam?.seed})`}
          />
          <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider text-center mb-2 pt-4">
            East First Round
          </h3>
          <MatchupCard
            matchup={m[2]}
            onWatch={onWatch}
            roundLabel={`(${m[2].homeTeam?.seed}) vs (${m[2].awayTeam?.seed})`}
          />
          <MatchupCard
            matchup={m[3]}
            onWatch={onWatch}
            roundLabel={`(${m[3].homeTeam?.seed}) vs (${m[3].awayTeam?.seed})`}
          />
        </div>

        {/* Connector */}
        <div className="flex flex-col items-center justify-center gap-32 text-gray-300">
          <svg width="24" height="60" className="text-gray-300">
            <line
              x1="0"
              y1="15"
              x2="24"
              y2="30"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="0"
              y1="45"
              x2="24"
              y2="30"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <svg width="24" height="60" className="text-gray-300">
            <line
              x1="0"
              y1="15"
              x2="24"
              y2="30"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="0"
              y1="45"
              x2="24"
              y2="30"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Column 3: Round 2 (Conference Finals) + Finals */}
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider text-center mb-2">
              West Final
            </h3>
            <MatchupCard
              matchup={m[4]}
              onWatch={onWatch}
              roundLabel="Conference Final"
            />
          </div>
          <div className="py-2">
            <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wider text-center mb-2">
              Championship
            </h3>
            <MatchupCard matchup={m[6]} onWatch={onWatch} roundLabel="Finals" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider text-center mb-2">
              East Final
            </h3>
            <MatchupCard
              matchup={m[5]}
              onWatch={onWatch}
              roundLabel="Conference Final"
            />
          </div>
        </div>

        {/* Connector */}
        <div className="flex flex-col items-center justify-center text-gray-300">
          <svg width="24" height="120">
            <line
              x1="0"
              y1="20"
              x2="24"
              y2="60"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="0"
              y1="100"
              x2="24"
              y2="60"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Column 5: empty placeholder for alignment */}
        <div />
      </div>
    </div>
  );
}

// ─── Live Game View ──────────────────────────────────────────────────────────

function LiveScoreboard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  quarter,
  clock,
  isGameOver,
}: {
  homeTeam: TournamentTeam;
  awayTeam: TournamentTeam;
  homeScore: number;
  awayScore: number;
  quarter: number;
  clock: string;
  isGameOver: boolean;
}) {
  return (
    <div className="bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5">
        {/* Home team */}
        <div className="flex items-center gap-4 flex-1">
          <div className="flex -space-x-2">
            {homeTeam.roster.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-900"
              />
            ))}
          </div>
          <div>
            <div className="text-white font-bold text-lg">{homeTeam.name}</div>
            <div className="text-gray-400 text-xs">
              {homeTeam.coast.toUpperCase()} CONF
              {homeTeam.isPlayer && (
                <span className="ml-2 text-blue-400">(YOU)</span>
              )}
            </div>
          </div>
        </div>

        {/* Score + Clock */}
        <div className="text-center px-8">
          <div className="flex items-center gap-4">
            <span
              className={`text-5xl font-black tabular-nums ${homeScore > awayScore ? "text-white" : "text-gray-500"}`}
            >
              {homeScore}
            </span>
            <span className="text-gray-600 text-2xl font-light">-</span>
            <span
              className={`text-5xl font-black tabular-nums ${awayScore > homeScore ? "text-white" : "text-gray-500"}`}
            >
              {awayScore}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                isGameOver ? "bg-red-600 text-white" : "bg-green-600 text-white"
              }`}
            >
              {isGameOver ? "FINAL" : `Q${quarter}`}
            </span>
            {!isGameOver && (
              <span className="text-gray-400 text-sm font-mono">{clock}</span>
            )}
          </div>
        </div>

        {/* Away team */}
        <div className="flex items-center gap-4 flex-1 justify-end">
          <div className="text-right">
            <div className="text-white font-bold text-lg">{awayTeam.name}</div>
            <div className="text-gray-400 text-xs">
              {awayTeam.coast.toUpperCase()} CONF
              {awayTeam.isPlayer && (
                <span className="ml-2 text-blue-400">(YOU)</span>
              )}
            </div>
          </div>
          <div className="flex -space-x-2">
            {awayTeam.roster.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-900"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Quarter scores */}
      <div className="bg-gray-800 px-6 py-2 flex justify-center gap-6 text-xs text-gray-400">
        {[1, 2, 3, 4].map((q) => (
          <span
            key={q}
            className={
              quarter === q && !isGameOver ? "text-green-400 font-bold" : ""
            }
          >
            Q{q}
          </span>
        ))}
      </div>
    </div>
  );
}

function BoxScore({
  playerStats,
  homeTeam,
  awayTeam,
}: {
  playerStats: PlayerGameStats[];
  homeTeam: TournamentTeam;
  awayTeam: TournamentTeam;
}) {
  const [tab, setTab] = useState<Side>("home");
  const players = playerStats.filter((p) => p.team === tab);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab("home")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            tab === "home"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          {homeTeam.name}
        </button>
        <button
          onClick={() => setTab("away")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
            tab === "away"
              ? "text-red-600 border-b-2 border-red-600 bg-red-50"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          {awayTeam.name}
        </button>
      </div>

      {/* Stats table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-center px-2 py-2">PTS</th>
              <th className="text-center px-2 py-2">REB</th>
              <th className="text-center px-2 py-2">AST</th>
              <th className="text-center px-2 py-2">STL</th>
              <th className="text-center px-2 py-2">BLK</th>
              <th className="text-center px-2 py-2">PF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {players
              .sort((a, b) => b.points - a.points)
              .map((p) => (
                <tr key={p.name} className={p.injured ? "opacity-50" : ""}>
                  <td className="px-3 py-2 flex items-center gap-2">
                    <img src={p.sprite} alt="" className="w-6 h-6" />
                    <span className="font-medium text-gray-800 truncate max-w-[100px]">
                      {p.name}
                    </span>
                    {p.injured && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">
                        OUT
                      </span>
                    )}
                  </td>
                  <td className="text-center px-2 py-2 font-bold text-gray-900">
                    {p.points}
                  </td>
                  <td className="text-center px-2 py-2 text-gray-700">
                    {p.rebounds}
                  </td>
                  <td className="text-center px-2 py-2 text-gray-700">
                    {p.assists}
                  </td>
                  <td className="text-center px-2 py-2 text-gray-700">
                    {p.steals}
                  </td>
                  <td className="text-center px-2 py-2 text-gray-700">
                    {p.blocks}
                  </td>
                  <td className="text-center px-2 py-2 text-gray-700">
                    {p.fouls}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventFeed({
  events,
  currentIndex,
}: {
  events: GameEvent[];
  currentIndex: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [currentIndex]);

  const visible = events.slice(0, currentIndex + 1).reverse(); // Newest first

  const getEventIcon = (type: GameEvent["type"]) => {
    switch (type) {
      case "score_2pt":
      case "layup":
        return "🏀";
      case "score_3pt":
        return "🎯";
      case "dunk":
        return "💥";
      case "block":
        return "🖐️";
      case "steal":
        return "🤏";
      case "rebound":
        return "📦";
      case "assist":
        return "🎁";
      case "foul":
      case "foul_out":
        return "⚠️";
      case "injury":
        return "🏥";
      case "hot_hand":
        return "🔥";
      case "cold_streak":
        return "🥶";
      case "clutch":
        return "⭐";
      case "type_advantage":
        return "⚡";
      case "ability_trigger":
        return "✨";
      case "rivalry_clash":
        return "😤";
      case "ally_boost":
        return "🤝";
      case "momentum":
        return "📈";
      case "fatigue":
        return "😮‍💨";
      case "halftime":
        return "⏸️";
      case "game_start":
        return "🏁";
      case "game_end":
        return "🏆";
      case "quarter_start":
      case "quarter_end":
        return "📣";
      default:
        return "•";
    }
  };

  const isScoring = (type: GameEvent["type"]) =>
    ["score_2pt", "score_3pt", "dunk", "layup", "clutch"].includes(type);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-bold text-gray-800 text-sm">Play-by-Play</h3>
      </div>
      <div ref={containerRef} className="h-[420px] overflow-y-auto">
        {visible.map((event, idx) => {
          const isNew = idx === 0;
          const scoring = isScoring(event.type);
          return (
            <div
              key={currentIndex - idx}
              className={`px-4 py-3 border-b border-gray-50 flex gap-3 transition-all duration-300 ${
                isNew ? "bg-yellow-50" : ""
              } ${scoring ? "bg-gradient-to-r from-transparent " + (event.team === "home" ? "to-blue-50" : "to-red-50") : ""}`}
            >
              {/* Time */}
              <div className="flex-shrink-0 text-center w-12">
                <div className="text-[10px] text-gray-400 font-mono">
                  Q{event.quarter}
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {event.clock}
                </div>
              </div>

              {/* Icon */}
              <div className="text-lg flex-shrink-0">
                {getEventIcon(event.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {event.pokemonSprite && (
                    <img src={event.pokemonSprite} alt="" className="w-5 h-5" />
                  )}
                  <span
                    className={`text-xs font-bold ${event.team === "home" ? "text-blue-600" : "text-red-600"}`}
                  >
                    {event.pokemonName}
                  </span>
                  {event.pointsScored && (
                    <span className="text-xs font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                      +{event.pointsScored}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-700">{event.description}</div>
              </div>

              {/* Score */}
              <div className="flex-shrink-0 text-right">
                <div className="text-xs font-bold text-gray-800">
                  {event.homeScore}-{event.awayScore}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            Waiting for tip-off...
          </div>
        )}
      </div>
    </div>
  );
}

function GameResultOverlay({
  result,
  onBackToBracket,
}: {
  result: LiveGameResult;
  onBackToBracket: () => void;
}) {
  const winnerTeam =
    result.winner === "home" ? result.homeTeam : result.awayTeam;
  const winScore =
    result.winner === "home" ? result.finalHomeScore : result.finalAwayScore;
  const loseScore =
    result.winner === "home" ? result.finalAwayScore : result.finalHomeScore;

  return (
    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-xl shadow-2xl p-8 text-center text-white">
      <div className="text-5xl mb-4">🏆</div>
      <h2 className="text-3xl font-black mb-2">{winnerTeam.name} Wins!</h2>
      <div className="text-5xl font-black mb-4">
        {winScore} <span className="text-gray-500">-</span> {loseScore}
      </div>
      <div className="bg-gray-700 rounded-lg p-4 inline-block mb-6">
        <div className="text-sm text-gray-400 mb-1">Game MVP</div>
        <div className="flex items-center gap-3">
          {result.mvp.sprite && (
            <img src={result.mvp.sprite} alt="" className="w-10 h-10" />
          )}
          <div className="text-left">
            <div className="font-bold">{result.mvp.name}</div>
            <div className="text-sm text-yellow-400">
              {result.mvp.points} points
            </div>
          </div>
        </div>
      </div>
      <div>
        <button
          onClick={onBackToBracket}
          className="bg-white text-gray-900 font-bold py-3 px-8 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Back to Bracket
        </button>
      </div>
    </div>
  );
}

function LiveGameView({
  matchup,
  onFinish,
  onBack,
}: {
  matchup: BracketMatchup;
  onFinish: (result: LiveGameResult) => void;
  onBack: () => void;
}) {
  const [result, setResult] = useState<LiveGameResult | null>(null);
  const [eventIndex, setEventIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [liveStats, setLiveStats] = useState<PlayerGameStats[]>([]);

  // Simulate game on mount
  useEffect(() => {
    if (!matchup.homeTeam || !matchup.awayTeam) return;
    const r = simulateMatchup(matchup.homeTeam, matchup.awayTeam);
    setResult(r);
    setIsPlaying(true);
    // Initialize empty stats for live tracking
    setLiveStats(
      r.playerStats.map((p) => ({
        ...p,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        fouls: 0,
        injured: false,
      })),
    );
  }, [matchup]);

  // When game ends, notify parent (deferred to avoid setState-during-render)
  useEffect(() => {
    if (gameOver && result) {
      onFinish(result);
    }
  }, [gameOver, result, onFinish]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying || !result) return;

    const interval = setInterval(() => {
      setEventIndex((prev) => {
        const next = prev + 1;
        if (next >= result.events.length) {
          setIsPlaying(false);
          setGameOver(true);
          setLiveStats(result.playerStats);
          return prev;
        }

        // Update live stats based on event
        const event = result.events[next];
        setLiveStats((currentStats) => {
          const updated = currentStats.map((s) => ({ ...s }));
          const side = event.team;
          const player = updated.find(
            (s) => s.name === event.pokemonName && s.team === side,
          );
          if (player) {
            if (event.pointsScored) player.points += event.pointsScored;
            if (event.statType === "rebound") player.rebounds++;
            if (event.statType === "assist") player.assists++;
            if (event.statType === "steal") player.steals++;
            if (event.statType === "block") player.blocks++;
            if (event.statType === "foul") player.fouls++;
            if (event.type === "injury" || event.type === "foul_out")
              player.injured = true;
          }
          return updated;
        });

        return next;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isPlaying, result]);

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const currentEvent = result.events[eventIndex];
  const progress = (eventIndex / (result.events.length - 1)) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700 text-sm font-medium flex items-center gap-1"
        >
          <span>←</span> Back to Bracket
        </button>
        <div className="flex items-center gap-3">
          {!gameOver && (
            <>
              {isPlaying ? (
                <button
                  onClick={() => setIsPlaying(false)}
                  className="px-4 py-1.5 bg-yellow-500 text-white text-sm font-bold rounded-lg hover:bg-yellow-600"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={() => setIsPlaying(true)}
                  className="px-4 py-1.5 bg-green-500 text-white text-sm font-bold rounded-lg hover:bg-green-600"
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => {
                  setEventIndex(result.events.length - 1);
                  setIsPlaying(false);
                  setGameOver(true);
                  setLiveStats(result.playerStats);
                }}
                className="px-4 py-1.5 bg-gray-500 text-white text-sm font-bold rounded-lg hover:bg-gray-600"
              >
                Skip to End
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <LiveScoreboard
        homeTeam={result.homeTeam}
        awayTeam={result.awayTeam}
        homeScore={currentEvent?.homeScore || 0}
        awayScore={currentEvent?.awayScore || 0}
        quarter={currentEvent?.quarter || 1}
        clock={currentEvent?.clock || "12:00"}
        isGameOver={gameOver}
      />

      {/* Progress bar */}
      <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Game over overlay */}
      {gameOver && (
        <GameResultOverlay result={result} onBackToBracket={onBack} />
      )}

      {/* Box Score + Event Feed side by side */}
      {!gameOver && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <EventFeed events={result.events} currentIndex={eventIndex} />
          </div>
          <div className="lg:col-span-2">
            <BoxScore
              playerStats={liveStats}
              homeTeam={result.homeTeam}
              awayTeam={result.awayTeam}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Tournament View ────────────────────────────────────────────────────

interface TournamentViewProps {
  onBack: () => void;
  playerTeam: TournamentTeam;
}

export default function TournamentView({
  onBack,
  playerTeam,
}: TournamentViewProps) {
  const { pool, loading } = usePokemonPool();
  const [bracket, setBracket] = useState<TournamentBracketData | null>(null);
  const [watchingMatchup, setWatchingMatchup] = useState<BracketMatchup | null>(
    null,
  );

  // Generate bracket once pool loads
  useEffect(() => {
    if (!loading && pool.length > 0 && !bracket) {
      const b = generateTournamentBracket(playerTeam, pool);
      setBracket(b);
    }
  }, [loading, pool, playerTeam, bracket]);

  const handleWatch = useCallback((matchup: BracketMatchup) => {
    setWatchingMatchup(matchup);
  }, []);

  const handleGameFinish = useCallback(
    (result: LiveGameResult) => {
      setBracket((prev) => {
        if (!prev) return prev;
        const updated = prev.matchups.map((m) => {
          if (m.id === watchingMatchup?.id) {
            const winnerTeam =
              result.winner === "home" ? m.homeTeam! : m.awayTeam!;
            return { ...m, result, winner: winnerTeam };
          }
          return m;
        });
        return { ...prev, matchups: advanceBracket(updated) };
      });
    },
    [watchingMatchup],
  );

  const handleBackToBracket = useCallback(() => {
    setWatchingMatchup(null);
  }, []);

  if (loading || !bracket) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <div className="text-xl font-bold text-gray-800">
            Generating Tournament Bracket...
          </div>
          <div className="text-gray-500 mt-2">
            Assembling 8 teams from 1,025 Pokemon...
          </div>
        </div>
      </div>
    );
  }

  // Watching a game
  if (watchingMatchup) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 pt-6">
        <LiveGameView
          matchup={watchingMatchup}
          onFinish={handleGameFinish}
          onBack={handleBackToBracket}
        />
      </div>
    );
  }

  // Bracket view
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 font-medium text-sm flex items-center gap-1"
          >
            <span>←</span> Dashboard
          </button>
          <h1 className="text-2xl font-black text-gray-800 text-center">
            West Coast vs East Coast Championship
          </h1>
          <div className="w-24" />
        </div>

        {/* Bracket */}
        <BracketView bracket={bracket} onWatch={handleWatch} />
      </div>
    </div>
  );
}
