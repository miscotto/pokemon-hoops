"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GameEvent, PlayerGameStats, Side } from "../utils/tournamentEngine";
import { PokeButton, PokeCard, PokeDialog, TypewriterText } from "./ui";

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
      <PokeCard variant="default" className="p-8">
        <div className="text-5xl mb-4">🏟️</div>
        <h2
          className="font-pixel text-[10px] mb-2"
          style={{ color: "var(--color-text)" }}
        >
          LIVE TOURNAMENT LOBBY
        </h2>
        <p
          className="font-pixel text-[6px] mb-6"
          style={{ color: "var(--color-text-muted)" }}
        >
          WAITING FOR PLAYERS TO JOIN...
        </p>

        {/* Progress ring */}
        <div className="relative w-32 h-32 mx-auto mb-6">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="8"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="8"
              strokeDasharray={`${progress * 3.52} ${352 - progress * 3.52}`}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-pixel text-[14px]"
              style={{ color: "var(--color-text)" }}
            >
              {lobby.teamCount}
              <span
                className="font-pixel text-[8px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                /{lobby.maxTeams}
              </span>
            </span>
          </div>
        </div>

        {/* Team list */}
        <div className="space-y-2 text-left">
          {lobby.teams.map((t, i) => (
            <PokeCard
              key={i}
              variant="highlighted"
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                className="font-pixel text-[6px]"
                style={{ color: "var(--color-primary)" }}
              >
                {i + 1}
              </span>
              <span
                className="font-pixel text-[6px] flex-1 truncate"
                style={{ color: "var(--color-text)" }}
              >
                {t.teamName}
              </span>
              <span
                className="font-pixel text-[5px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                JOINED
              </span>
            </PokeCard>
          ))}
          {Array.from({ length: lobby.maxTeams - lobby.teamCount }).map(
            (_, i) => (
              <PokeCard
                key={`empty-${i}`}
                variant="default"
                className="flex items-center gap-3 px-4 py-2.5 border-dashed"
              >
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {lobby.teamCount + i + 1}
                </span>
                <span
                  className="font-pixel text-[6px] italic"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  WAITING...
                </span>
              </PokeCard>
            ),
          )}
        </div>

        <div
          className="mt-6 flex items-center justify-center gap-2 font-pixel text-[6px]"
          style={{ color: "var(--color-primary)" }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: "var(--color-primary)" }}
          />
          SEARCHING FOR OPPONENTS...
        </div>
      </PokeCard>
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
    <PokeCard
      variant={isLive ? "highlighted" : "default"}
      className="overflow-hidden transition-all"
    >
      {/* Status bar */}
      <div
        className="px-3 py-1 font-pixel text-[6px] uppercase tracking-wider flex items-center gap-1.5"
        style={{
          backgroundColor: isDone
            ? "rgba(var(--color-primary-rgb, 0,0,0), 0.15)"
            : isLive
              ? "rgba(var(--color-primary-rgb, 0,0,0), 0.25)"
              : "transparent",
          color: isDone
            ? "var(--color-primary)"
            : isLive
              ? "var(--color-primary)"
              : "var(--color-text-muted)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {isLive && (
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
        {isDone ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
      </div>

      {/* Teams */}
      <div style={{ borderTop: "none" }}>
        <LiveTeamRow
          name={matchup.homeTeam.name}
          seed={matchup.homeTeam.seed}
          score={matchup.homeScore}
          isWinner={isDone && matchup.winner === "home"}
          isUser={matchup.homeTeam.name === userTeamName}
          showScore={!isUpcoming}
        />
        <div style={{ borderTop: "1px solid var(--color-border)", opacity: 0.4 }} />
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
        <div className="p-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          <PokeButton
            variant={isLive ? "primary" : "ghost"}
            size="sm"
            className="w-full"
            onClick={() => onWatch(matchup.id)}
          >
            {isLive ? "WATCH LIVE" : "VIEW RECAP"}
          </PokeButton>
        </div>
      )}

      {/* MVP for completed */}
      {isDone && matchup.mvp && (
        <div
          className="px-3 py-1.5 font-pixel text-[5px] flex items-center gap-1.5"
          style={{
            backgroundColor: "rgba(0,0,0,0.15)",
            color: "var(--color-text-muted)",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          MVP:{" "}
          <span
            className="font-pixel text-[5px]"
            style={{ color: "var(--color-primary)" }}
          >
            {matchup.mvp.name}
          </span>
          ({matchup.mvp.points} PTS)
        </div>
      )}
    </PokeCard>
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
      className="px-3 py-2 flex items-center gap-2"
      style={{
        backgroundColor: isWinner ? "rgba(var(--color-primary-rgb, 0,0,0), 0.1)" : "transparent",
      }}
    >
      <span
        className="w-4 font-pixel text-[5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        {seed}
      </span>
      <span
        className="font-pixel text-[6px] flex-1 truncate"
        style={{
          color: isWinner ? "var(--color-primary)" : "var(--color-text)",
          fontWeight: isWinner ? "bold" : undefined,
        }}
      >
        {name}
      </span>
      {isUser && (
        <span
          className="font-pixel text-[5px] px-1.5 py-0.5"
          style={{
            backgroundColor: "rgba(var(--color-primary-rgb, 0,0,0), 0.2)",
            color: "var(--color-primary)",
            border: "1px solid var(--color-primary)",
          }}
        >
          YOU
        </span>
      )}
      {showScore && (
        <span
          className="font-pixel text-[6px] tabular-nums"
          style={{
            color: isWinner ? "var(--color-primary)" : "var(--color-text-muted)",
          }}
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
    <div className="w-full" style={{ backgroundColor: "var(--color-bg)" }}>
      {champion && (
        <div className="mb-8 text-center">
          <PokeCard variant="highlighted" className="inline-block px-8 py-5">
            <div className="text-4xl mb-2">🏆</div>
            <div
              className="font-pixel text-[10px]"
              style={{ color: "var(--color-primary)" }}
            >
              {champion.name}
            </div>
            <div
              className="font-pixel text-[6px] mt-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              TOURNAMENT CHAMPION
            </div>
          </PokeCard>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-6 max-w-5xl mx-auto">
        {/* Round 1 */}
        <div className="space-y-4">
          <h3
            className="font-pixel text-[6px] uppercase tracking-wider text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            WEST FIRST ROUND
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
          <h3
            className="font-pixel text-[6px] uppercase tracking-wider text-center pt-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            EAST FIRST ROUND
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
          <h3
            className="font-pixel text-[6px] uppercase tracking-wider text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            WEST FINAL
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
          <h3
            className="font-pixel text-[6px] uppercase tracking-wider text-center pt-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            CHAMPIONSHIP
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
          <h3
            className="font-pixel text-[6px] uppercase tracking-wider text-center pt-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            EAST FINAL
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
    <PokeCard
      variant="default"
      className="overflow-hidden"
    >
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex -space-x-2">
            {homeTeam.roster?.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-7 h-7 rounded-full border-2"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                }}
              />
            ))}
          </div>
          <div>
            <div
              className="font-pixel text-[7px]"
              style={{ color: "var(--color-text)" }}
            >
              {homeTeam.name}
            </div>
            <div
              className="font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              {homeTeam.coast?.toUpperCase()} CONF
            </div>
          </div>
        </div>

        <div className="text-center px-6">
          <div className="flex items-center gap-3">
            <span
              className="font-pixel text-[14px] tabular-nums"
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
              className="font-pixel text-[10px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              -
            </span>
            <span
              className="font-pixel text-[14px] tabular-nums"
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
          <div className="mt-1.5 flex items-center justify-center gap-2">
            {status === "in_progress" && (
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            )}
            <span
              className="font-pixel text-[5px] px-2 py-0.5"
              style={{
                backgroundColor:
                  status === "in_progress"
                    ? "var(--color-danger)"
                    : "var(--color-surface)",
                color:
                  status === "in_progress"
                    ? "#fff"
                    : "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
              }}
            >
              {status === "completed"
                ? "FINAL"
                : status === "upcoming"
                  ? "UPCOMING"
                  : `Q${quarter}`}
            </span>
            {status === "in_progress" && (
              <span
                className="font-pixel text-[5px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {clock}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="text-right">
            <div
              className="font-pixel text-[7px]"
              style={{ color: "var(--color-text)" }}
            >
              {awayTeam.name}
            </div>
            <div
              className="font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              {awayTeam.coast?.toUpperCase()} CONF
            </div>
          </div>
          <div className="flex -space-x-2">
            {awayTeam.roster?.slice(0, 3).map((p, i) => (
              <img
                key={i}
                src={p.sprite}
                alt=""
                className="w-7 h-7 rounded-full border-2"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderColor: "var(--color-border)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </PokeCard>
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
  const latestEvent = reversed[0]?.description ?? "";

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
    <PokeDialog label="LIVE FEED" className="overflow-hidden">
      {events.length > 0 && (
        <span
          className="font-pixel text-[5px] px-1.5 py-0.5"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          {events.length} PLAYS
        </span>
      )}
      <div ref={containerRef} className="h-96 overflow-y-auto mt-3">
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
              className="px-2 py-2.5 flex gap-3 transition-colors"
              style={{
                borderBottom: "1px solid var(--color-border)",
                borderLeft: isScoring
                  ? `2px solid ${event.team === "home" ? "var(--color-primary)" : "var(--color-danger)"}`
                  : undefined,
                opacity: isNew ? 1 : 0.45,
              }}
            >
              <div className="shrink-0 text-center w-10">
                <div
                  className="font-pixel text-[5px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Q{event.quarter}
                </div>
                <div
                  className="font-pixel text-[5px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
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
                    className="font-pixel text-[5px]"
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
                      className="font-pixel text-[5px] px-1"
                      style={{
                        color: "var(--color-primary)",
                        border: "1px solid var(--color-primary)",
                      }}
                    >
                      +{event.pointsScored}
                    </span>
                  )}
                </div>
                <div
                  className="font-pixel text-[5px] leading-loose"
                  style={{ color: "var(--color-text)" }}
                >
                  {isNew ? (
                    <TypewriterText
                      key={events.length}
                      text={latestEvent}
                      speed={30}
                    />
                  ) : (
                    event.description
                  )}
                </div>
              </div>
              <div
                className="shrink-0 font-pixel text-[5px] tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                {event.homeScore}-{event.awayScore}
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <div
            className="text-center py-12 font-pixel text-[6px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <div className="text-2xl mb-2">⏳</div>
            GAME HASN&apos;T STARTED YET...
          </div>
        )}
      </div>
    </PokeDialog>
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
    <PokeCard variant="default" className="overflow-hidden">
      <div
        className="flex"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => setTab("home")}
          className="flex-1 py-2.5 font-pixel text-[6px]"
          style={{
            color: tab === "home" ? "var(--color-primary)" : "var(--color-text-muted)",
            backgroundColor:
              tab === "home" ? "rgba(var(--color-primary-rgb, 0,0,0), 0.1)" : "transparent",
            borderBottom: tab === "home" ? "2px solid var(--color-primary)" : "none",
          }}
        >
          {homeTeam.name}
        </button>
        <button
          onClick={() => setTab("away")}
          className="flex-1 py-2.5 font-pixel text-[6px]"
          style={{
            color: tab === "away" ? "var(--color-danger)" : "var(--color-text-muted)",
            backgroundColor:
              tab === "away" ? "rgba(var(--color-danger-rgb, 0,0,0), 0.1)" : "transparent",
            borderBottom: tab === "away" ? "2px solid var(--color-danger)" : "none",
          }}
        >
          {awayTeam.name}
        </button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th
              className="text-left px-3 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              PLAYER
            </th>
            <th
              className="text-center px-1.5 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              PTS
            </th>
            <th
              className="text-center px-1.5 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              REB
            </th>
            <th
              className="text-center px-1.5 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              AST
            </th>
            <th
              className="text-center px-1.5 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              STL
            </th>
            <th
              className="text-center px-1.5 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              BLK
            </th>
            <th
              className="text-center px-1.5 py-2 font-pixel text-[5px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              PF
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr
              key={p.name}
              className={p.injured ? "opacity-40" : ""}
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <td className="px-3 py-2 flex items-center gap-1.5">
                <img src={p.sprite} alt="" className="w-5 h-5" />
                <span
                  className="font-pixel text-[6px] truncate max-w-20"
                  style={{ color: "var(--color-text)" }}
                >
                  {p.name}
                </span>
                {p.injured && (
                  <span
                    className="font-pixel text-[5px] px-1"
                    style={{
                      backgroundColor: "rgba(var(--color-danger-rgb, 0,0,0), 0.2)",
                      color: "var(--color-danger)",
                      border: "1px solid var(--color-danger)",
                    }}
                  >
                    OUT
                  </span>
                )}
              </td>
              <td
                className="text-center px-1.5 py-2 font-pixel text-[6px]"
                style={{ color: "var(--color-text)" }}
              >
                {p.points}
              </td>
              <td
                className="text-center px-1.5 py-2 font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {p.rebounds}
              </td>
              <td
                className="text-center px-1.5 py-2 font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {p.assists}
              </td>
              <td
                className="text-center px-1.5 py-2 font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {p.steals}
              </td>
              <td
                className="text-center px-1.5 py-2 font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {p.blocks}
              </td>
              <td
                className="text-center px-1.5 py-2 font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {p.fouls}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PokeCard>
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
        <div
          className="animate-spin rounded-full h-10 w-10 border-b-2"
          style={{ borderColor: "var(--color-primary)" }}
        />
      </div>
    );
  }

  const lastEvent = game.events[game.events.length - 1];

  return (
    <div
      className="max-w-6xl mx-auto space-y-4"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <PokeButton
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="flex items-center gap-1"
      >
        ← BACK TO BRACKET
      </PokeButton>

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
        <PokeCard variant="highlighted" className="p-4 text-center">
          <div
            className="font-pixel text-[8px] mb-1"
            style={{ color: "var(--color-text)" }}
          >
            {game.winner === "home" ? game.homeTeam.name : game.awayTeam.name}{" "}
            WINS!
          </div>
          <div
            className="font-pixel text-[6px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            MVP:{" "}
            <span
              className="font-pixel text-[6px]"
              style={{ color: "var(--color-primary)" }}
            >
              {game.mvp.name}
            </span>{" "}
            ({game.mvp.points} PTS)
          </div>
        </PokeCard>
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
      <div
        className="min-h-screen p-4 pt-6"
        style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <LiveGameView
          tournamentId={tournamentId}
          matchupId={watchingMatchup}
          onBack={() => setWatchingMatchup(null)}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <div className="max-w-6xl mx-auto pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <PokeButton
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-1"
          >
            ← DASHBOARD
          </PokeButton>
          <div className="text-center">
            <h1
              className="font-pixel text-[9px]"
              style={{ color: "var(--color-text)" }}
            >
              LIVE TOURNAMENT
              {status === "active" && (
                <span
                  className="ml-2 inline-flex items-center gap-1 font-pixel text-[7px]"
                  style={{ color: "var(--color-danger)" }}
                >
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
            <div
              className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto"
              style={{ borderColor: "var(--color-primary)" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
