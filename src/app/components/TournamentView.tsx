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
import { PokeButton, PokeCard, PokeDialog, TypewriterText } from "./ui";

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
      className="overflow-hidden"
      style={{ border: "2px solid var(--color-border)" }}
    >
      {/* Round label */}
      <div
        className="font-pixel text-[6px] uppercase tracking-wider px-3 py-1"
        style={{
          backgroundColor: done
            ? "var(--color-primary)"
            : playable
              ? "var(--color-surface)"
              : "var(--color-surface)",
          color: done
            ? "var(--color-primary-text)"
            : playable
              ? "var(--color-primary)"
              : "var(--color-text-muted)",
        }}
      >
        {roundLabel}
      </div>

      {/* Teams */}
      <div style={{ borderTop: "1px solid var(--color-border)" }}>
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
        <PokeButton
          variant="primary"
          onClick={() => onWatch(matchup)}
          className="w-full py-2"
        >
          WATCH GAME
        </PokeButton>
      )}
      {done && matchup.result?.mvp && (
        <div
          className="px-3 py-1.5 flex items-center gap-1.5 font-pixel text-[6px]"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-muted)",
          }}
        >
          <span>MVP:</span>
          {matchup.result.mvp.sprite && (
            <img src={matchup.result.mvp.sprite} alt="" className="w-4 h-4" />
          )}
          <span style={{ color: "var(--color-text)" }}>
            {matchup.result.mvp.name}
          </span>
          <span>({matchup.result.mvp.points} pts)</span>
        </div>
      )}
      {pending && (
        <div
          className="px-3 py-2 font-pixel text-[6px] text-center"
          style={{ color: "var(--color-text-muted)" }}
        >
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
      <PokeCard
        variant="default"
        className="p-2 flex flex-col gap-1 opacity-50"
      >
        <span
          className="font-pixel text-[6px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          TBD
        </span>
      </PokeCard>
    );
  }

  return (
    <PokeCard
      variant={isWinner ? "highlighted" : "default"}
      className="p-2 flex flex-col gap-1"
      style={isWinner ? undefined : { opacity: score !== undefined && !isWinner ? 0.5 : 1 }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-pixel text-[6px] w-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          {seed}
        </span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {team.roster[0]?.sprite && (
            <img
              src={team.roster[0].sprite}
              alt=""
              className="w-5 h-5 shrink-0"
            />
          )}
          <span
            className="font-pixel text-[6px] truncate"
            style={{ color: "var(--color-text)" }}
          >
            {team.name}
          </span>
          {team.isPlayer && (
            <span
              className="font-pixel text-[6px] px-1.5 py-0.5 shrink-0"
              style={{
                backgroundColor: "var(--color-primary)",
                color: "var(--color-primary-text)",
              }}
            >
              YOU
            </span>
          )}
        </div>
        {score !== undefined && (
          <span
            className="font-pixel text-[8px] tabular-nums"
            style={{
              color: isWinner
                ? "var(--color-primary)"
                : "var(--color-text-muted)",
            }}
          >
            {score}
          </span>
        )}
      </div>
    </PokeCard>
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
          <PokeCard variant="highlighted" className="inline-block px-8 py-5">
            <div className="text-4xl mb-2">🏆</div>
            <div
              className="font-pixel text-[12px]"
              style={{ color: "var(--color-primary)" }}
            >
              {champion.name}
            </div>
            <div
              className="font-pixel text-[8px] mt-1"
              style={{ color: "var(--color-text)" }}
            >
              Tournament Champion
            </div>
            {champion.isPlayer && (
              <div
                className="mt-2 font-pixel text-[8px]"
                style={{ color: "var(--color-primary)" }}
              >
                Congratulations!
              </div>
            )}
          </PokeCard>
        </div>
      )}

      {/* Bracket grid */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-x-4 gap-y-6 items-center max-w-5xl mx-auto">
        {/* Column 1: Round 1 */}
        <div className="space-y-4">
          <h3
            className="font-pixel text-[8px] uppercase tracking-wider text-center mb-2"
            style={{ color: "var(--color-primary)" }}
          >
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
          <h3
            className="font-pixel text-[8px] uppercase tracking-wider text-center mb-2 pt-4"
            style={{ color: "var(--color-danger)" }}
          >
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
        <div
          className="flex flex-col items-center justify-center gap-32"
          style={{ color: "var(--color-border)" }}
        >
          <svg width="24" height="60">
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
          <svg width="24" height="60">
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
            <h3
              className="font-pixel text-[8px] uppercase tracking-wider text-center mb-2"
              style={{ color: "var(--color-primary)" }}
            >
              West Final
            </h3>
            <MatchupCard
              matchup={m[4]}
              onWatch={onWatch}
              roundLabel="Conference Final"
            />
          </div>
          <div className="py-2">
            <h3
              className="font-pixel text-[8px] uppercase tracking-wider text-center mb-2"
              style={{ color: "var(--color-text)" }}
            >
              Championship
            </h3>
            <MatchupCard matchup={m[6]} onWatch={onWatch} roundLabel="Finals" />
          </div>
          <div>
            <h3
              className="font-pixel text-[8px] uppercase tracking-wider text-center mb-2"
              style={{ color: "var(--color-danger)" }}
            >
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
        <div
          className="flex flex-col items-center justify-center"
          style={{ color: "var(--color-border)" }}
        >
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
    <PokeCard
      variant="highlighted"
      className="overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-5">
        {/* Home team */}
        <div className="flex items-center gap-4 flex-1">
          <div className="flex -space-x-2">
            {homeTeam.roster.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-8 h-8 rounded-full border-2"
                style={{ borderColor: "var(--color-border)" }}
              />
            ))}
          </div>
          <div>
            <div
              className="font-pixel text-[8px]"
              style={{ color: "var(--color-text)" }}
            >
              {homeTeam.name}
            </div>
            <div
              className="font-pixel text-[6px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              {homeTeam.coast.toUpperCase()} CONF
              {homeTeam.isPlayer && (
                <span
                  className="ml-2"
                  style={{ color: "var(--color-primary)" }}
                >
                  (YOU)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Score + Clock */}
        <div className="text-center px-8">
          <div className="flex items-center gap-4">
            <span
              className="font-pixel text-[24px] tabular-nums"
              style={{
                color:
                  homeScore > awayScore
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
              }}
            >
              {homeScore}
            </span>
            <span
              className="font-pixel text-[16px]"
              style={{ color: "var(--color-border)" }}
            >
              -
            </span>
            <span
              className="font-pixel text-[24px] tabular-nums"
              style={{
                color:
                  awayScore > homeScore
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
              }}
            >
              {awayScore}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className="font-pixel text-[6px] px-2 py-0.5"
              style={{
                backgroundColor: isGameOver
                  ? "var(--color-danger)"
                  : "var(--color-primary)",
                color: "var(--color-primary-text)",
              }}
            >
              {isGameOver ? "FINAL" : `Q${quarter}`}
            </span>
            {!isGameOver && (
              <span
                className="font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {clock}
              </span>
            )}
          </div>
        </div>

        {/* Away team */}
        <div className="flex items-center gap-4 flex-1 justify-end">
          <div className="text-right">
            <div
              className="font-pixel text-[8px]"
              style={{ color: "var(--color-text)" }}
            >
              {awayTeam.name}
            </div>
            <div
              className="font-pixel text-[6px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              {awayTeam.coast.toUpperCase()} CONF
              {awayTeam.isPlayer && (
                <span
                  className="ml-2"
                  style={{ color: "var(--color-primary)" }}
                >
                  (YOU)
                </span>
              )}
            </div>
          </div>
          <div className="flex -space-x-2">
            {awayTeam.roster.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-8 h-8 rounded-full border-2"
                style={{ borderColor: "var(--color-border)" }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Quarter scores */}
      <div
        className="px-6 py-2 flex justify-center gap-6 font-pixel text-[6px]"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
        }}
      >
        {[1, 2, 3, 4].map((q) => (
          <span
            key={q}
            style={
              quarter === q && !isGameOver
                ? { color: "var(--color-primary)" }
                : undefined
            }
          >
            Q{q}
          </span>
        ))}
      </div>
    </PokeCard>
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
    <PokeCard variant="default" className="overflow-hidden">
      {/* Tabs */}
      <div
        className="flex"
        style={{ borderBottom: "2px solid var(--color-border)" }}
      >
        <PokeButton
          variant={tab === "home" ? "primary" : "ghost"}
          onClick={() => setTab("home")}
          className="flex-1 py-2.5"
        >
          {homeTeam.name}
        </PokeButton>
        <PokeButton
          variant={tab === "away" ? "primary" : "ghost"}
          onClick={() => setTab("away")}
          className="flex-1 py-2.5"
        >
          {awayTeam.name}
        </PokeButton>
      </div>

      {/* Stats table */}
      <div className="overflow-x-auto">
        <table className="w-full font-pixel text-[6px]">
          <thead>
            <tr style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)" }}>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-center px-2 py-2">PTS</th>
              <th className="text-center px-2 py-2">REB</th>
              <th className="text-center px-2 py-2">AST</th>
              <th className="text-center px-2 py-2">STL</th>
              <th className="text-center px-2 py-2">BLK</th>
              <th className="text-center px-2 py-2">PF</th>
            </tr>
          </thead>
          <tbody style={{ borderTop: "1px solid var(--color-border)" }}>
            {players
              .sort((a, b) => b.points - a.points)
              .map((p) => (
                <tr
                  key={p.name}
                  className={p.injured ? "opacity-50" : ""}
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <td className="px-3 py-2 flex items-center gap-2">
                    <img src={p.sprite} alt="" className="w-6 h-6" />
                    <span
                      className="truncate max-w-25"
                      style={{ color: "var(--color-text)" }}
                    >
                      {p.name}
                    </span>
                    {p.injured && (
                      <span
                        className="px-1"
                        style={{
                          backgroundColor: "var(--color-danger)",
                          color: "#fff",
                        }}
                      >
                        OUT
                      </span>
                    )}
                  </td>
                  <td
                    className="text-center px-2 py-2"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {p.points}
                  </td>
                  <td
                    className="text-center px-2 py-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {p.rebounds}
                  </td>
                  <td
                    className="text-center px-2 py-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {p.assists}
                  </td>
                  <td
                    className="text-center px-2 py-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {p.steals}
                  </td>
                  <td
                    className="text-center px-2 py-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {p.blocks}
                  </td>
                  <td
                    className="text-center px-2 py-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {p.fouls}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </PokeCard>
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
    <PokeDialog label="PLAY-BY-PLAY" className="max-h-105 overflow-hidden">
      <div ref={containerRef} className="h-95 overflow-y-auto">
        {visible.map((event, idx) => {
          const isNew = idx === 0;
          const scoring = isScoring(event.type);
          return (
            <div
              key={currentIndex - idx}
              className="py-3 flex gap-3 transition-all duration-300"
              style={{
                borderBottom: "1px solid var(--color-border)",
                backgroundColor:
                  isNew
                    ? "var(--color-surface)"
                    : scoring
                      ? "var(--color-surface)"
                      : undefined,
                opacity: isNew ? 1 : 0.65,
              }}
            >
              {/* Time */}
              <div className="flex-shrink-0 text-center w-12">
                <div
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Q{event.quarter}
                </div>
                <div
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
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
                    className="font-pixel text-[6px]"
                    style={{
                      color:
                        event.team === "home"
                          ? "var(--color-primary)"
                          : "var(--color-danger)",
                    }}
                  >
                    {event.pokemonName}
                  </span>
                  {event.pointsScored && (
                    <span
                      className="font-pixel text-[6px] px-1.5 py-0.5"
                      style={{
                        backgroundColor: "var(--color-primary)",
                        color: "var(--color-primary-text)",
                      }}
                    >
                      +{event.pointsScored}
                    </span>
                  )}
                </div>
                <div
                  className="font-pixel text-[6px] leading-loose"
                  style={{ color: "var(--color-text)" }}
                >
                  {isNew ? (
                    <TypewriterText text={event.description} speed={35} />
                  ) : (
                    event.description
                  )}
                </div>
              </div>

              {/* Score */}
              <div className="flex-shrink-0 text-right">
                <div
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text)" }}
                >
                  {event.homeScore}-{event.awayScore}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div
            className="font-pixel text-[6px] text-center py-12"
            style={{ color: "var(--color-text-muted)" }}
          >
            Waiting for tip-off...
          </div>
        )}
      </div>
    </PokeDialog>
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
    <PokeCard
      variant="highlighted"
      className="p-8 text-center"
    >
      <div className="text-5xl mb-4">🏆</div>
      <h2
        className="font-pixel text-[12px] mb-2"
        style={{ color: "var(--color-primary)" }}
      >
        {winnerTeam.name} Wins!
      </h2>
      <div
        className="font-pixel text-[20px] mb-4"
        style={{ color: "var(--color-text)" }}
      >
        {winScore}{" "}
        <span style={{ color: "var(--color-text-muted)" }}>-</span> {loseScore}
      </div>
      <PokeCard variant="default" className="p-4 inline-block mb-6">
        <div
          className="font-pixel text-[6px] mb-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Game MVP
        </div>
        <div className="flex items-center gap-3">
          {result.mvp.sprite && (
            <img src={result.mvp.sprite} alt="" className="w-10 h-10" />
          )}
          <div className="text-left">
            <div
              className="font-pixel text-[8px]"
              style={{ color: "var(--color-text)" }}
            >
              {result.mvp.name}
            </div>
            <div
              className="font-pixel text-[7px]"
              style={{ color: "var(--color-primary)" }}
            >
              {result.mvp.points} points
            </div>
          </div>
        </div>
      </PokeCard>
      <div>
        <PokeButton variant="ghost" onClick={onBackToBracket}>
          Back to Bracket
        </PokeButton>
      </div>
    </PokeCard>
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: "var(--color-primary)" }} />
      </div>
    );
  }

  const currentEvent = result.events[eventIndex];
  const progress = (eventIndex / (result.events.length - 1)) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <PokeButton
          variant="ghost"
          onClick={onBack}
          className="flex items-center gap-1"
        >
          ← Back to Bracket
        </PokeButton>
        <div className="flex items-center gap-3">
          {!gameOver && (
            <>
              {isPlaying ? (
                <PokeButton
                  variant="primary"
                  onClick={() => setIsPlaying(false)}
                >
                  Pause
                </PokeButton>
              ) : (
                <PokeButton
                  variant="primary"
                  onClick={() => setIsPlaying(true)}
                >
                  Resume
                </PokeButton>
              )}
              <PokeButton
                variant="ghost"
                onClick={() => {
                  setEventIndex(result.events.length - 1);
                  setIsPlaying(false);
                  setGameOver(true);
                  setLiveStats(result.playerStats);
                }}
              >
                Skip to End
              </PokeButton>
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
      <div
        className="rounded-full h-1.5 overflow-hidden"
        style={{ backgroundColor: "var(--color-border)" }}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            backgroundColor: "var(--color-primary)",
          }}
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: "var(--color-primary)" }}
          />
          <div
            className="font-pixel text-[10px]"
            style={{ color: "var(--color-text)" }}
          >
            Generating Tournament Bracket...
          </div>
          <div
            className="font-pixel text-[8px] mt-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Assembling 8 teams from 1,025 Pokemon...
          </div>
        </div>
      </div>
    );
  }

  // Watching a game
  if (watchingMatchup) {
    return (
      <div
        className="min-h-screen p-4 pt-6"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
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
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="max-w-6xl mx-auto pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <PokeButton
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-1"
          >
            ← Dashboard
          </PokeButton>
          <h1
            className="font-pixel text-[12px] text-center"
            style={{ color: "var(--color-text)" }}
          >
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
