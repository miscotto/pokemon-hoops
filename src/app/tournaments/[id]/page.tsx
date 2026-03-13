"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { PokeButton, PokeCard, PokeDialog, TypewriterText, ThemeToggle } from "@/app/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchupState {
  gameId: string;
  round: number;
  matchupIndex: number;
  team1UserId: string;
  team1Name: string;
  team2UserId: string;
  team2Name: string;
  status: string;
  team1Score: number | null;
  team2Score: number | null;
  winnerId: string | null;
  playedAt: string | null;
}

interface TournamentState {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  totalRounds?: number;
  teamCount?: number;
  teams?: { teamName: string; userId: string; joinedAt: string }[];
  matchups?: MatchupState[];
  userTeamName?: string | null;
  startedAt?: string | null;
}

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
  statType?: string;
  displayAtMs: number;
}

interface ViewingGame {
  gameId: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  winnerId: string | null;
  events: GameEvent[];
  tournamentId: string;
  startedAt: string;
  round: number;
}

// ─── Event Feed ───────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  score_2pt: "🏀", score_3pt: "🎯", dunk: "💥", layup: "🏀",
  block: "🖐️", steal: "🤏", rebound: "📦", assist: "🎁",
  foul: "⚠️", foul_out: "⚠️", injury: "🏥", hot_hand: "🔥",
  cold_streak: "🥶", clutch: "⭐", type_advantage: "⚡",
  ability_trigger: "✨", momentum: "📈", rivalry_clash: "😤",
  ally_boost: "🤝", fatigue: "😮‍💨", halftime: "⏸️",
  game_start: "🏁", game_end: "🏆", quarter_start: "📣", quarter_end: "📣",
};

const SCORING_TYPES = new Set(["score_2pt", "score_3pt", "dunk", "layup", "clutch"]);

function EventFeed({ events }: { events: GameEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    if (containerRef.current && events.length !== prevCount.current) {
      containerRef.current.scrollTop = 0;
    }
    prevCount.current = events.length;
  }, [events.length]);

  const reversed = [...events].reverse();
  const latestDesc = reversed[0]?.description ?? "";

  return (
    <PokeDialog label="PLAY-BY-PLAY" className="overflow-hidden">
      {events.length > 0 && (
        <span
          className="font-pixel text-[5px] px-1.5 py-0.5"
          style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
        >
          {events.length} PLAYS
        </span>
      )}
      <div ref={containerRef} className="h-96 overflow-y-auto mt-3">
        {reversed.map((event, idx) => {
          const isNew = idx === 0;
          const isScoring = SCORING_TYPES.has(event.type);
          return (
            <div
              key={events.length - 1 - idx}
              className="px-2 py-2.5 flex gap-3 transition-colors"
              style={{
                borderBottom: "1px solid var(--color-border)",
                borderLeft: isScoring
                  ? `2px solid ${event.team === "home" ? "var(--color-primary)" : "var(--color-danger)"}`
                  : undefined,
                opacity: isNew ? 1 : 0.5,
              }}
            >
              <div className="shrink-0 text-center w-10">
                <div className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>Q{event.quarter}</div>
                <div className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>{event.clock}</div>
              </div>
              <div className="text-base shrink-0">{EVENT_ICONS[event.type] ?? "•"}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {event.pokemonSprite && <img src={event.pokemonSprite} alt="" className="w-4 h-4" />}
                  <span
                    className="font-pixel text-[5px]"
                    style={{ color: event.team === "home" ? "var(--color-primary)" : "var(--color-danger)" }}
                  >
                    {event.pokemonName}
                  </span>
                  {event.pointsScored && (
                    <span
                      className="font-pixel text-[5px] px-1"
                      style={{ color: "var(--color-primary)", border: "1px solid var(--color-primary)" }}
                    >
                      +{event.pointsScored}
                    </span>
                  )}
                </div>
                <div className="font-pixel text-[5px] leading-loose" style={{ color: "var(--color-text)" }}>
                  {isNew ? (
                    <TypewriterText key={events.length} text={latestDesc} speed={30} />
                  ) : (
                    event.description
                  )}
                </div>
              </div>
              <div className="shrink-0 font-pixel text-[5px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                {event.homeScore}-{event.awayScore}
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-center py-12 font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
            <div className="text-2xl mb-2">⏳</div>
            NO EVENTS YET
          </div>
        )}
      </div>
    </PokeDialog>
  );
}

// ─── Box Score ────────────────────────────────────────────────────────────────

interface PlayerStat {
  name: string;
  sprite?: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fouls: number;
  injured: boolean;
}

const STRUCTURAL_TYPES = new Set([
  "game_start", "game_end", "quarter_start", "quarter_end", "halftime",
]);

function computeBoxScore(events: GameEvent[], side: "home" | "away"): PlayerStat[] {
  const map = new Map<string, PlayerStat>();
  for (const e of events) {
    if (STRUCTURAL_TYPES.has(e.type)) continue;
    if (e.team !== side) continue;
    if (!map.has(e.pokemonName)) {
      map.set(e.pokemonName, {
        name: e.pokemonName,
        sprite: e.pokemonSprite,
        points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fouls: 0, injured: false,
      });
    }
    const s = map.get(e.pokemonName)!;
    if (e.pointsScored) s.points += e.pointsScored;
    if (e.statType === "rebound") s.rebounds++;
    if (e.statType === "assist") s.assists++;
    if (e.statType === "steal") s.steals++;
    if (e.statType === "block") s.blocks++;
    if (e.statType === "foul") s.fouls++;
    if (e.type === "injury" || e.type === "foul_out") s.injured = true;
    if (e.pokemonSprite && !s.sprite) s.sprite = e.pokemonSprite;
  }
  return Array.from(map.values()).sort((a, b) => b.points - a.points);
}

function BoxScore({ events, team1Name, team2Name }: { events: GameEvent[]; team1Name: string; team2Name: string }) {
  const [tab, setTab] = useState<"home" | "away">("home");
  const players = computeBoxScore(events, tab);

  return (
    <PokeCard variant="default" className="overflow-hidden">
      <div className="flex" style={{ borderBottom: "1px solid var(--color-border)" }}>
        {(["home", "away"] as const).map((side) => (
          <button
            key={side}
            onClick={() => setTab(side)}
            className="flex-1 py-2.5 font-pixel text-[6px]"
            style={{
              color: tab === side ? "var(--color-primary)" : "var(--color-text-muted)",
              backgroundColor: tab === side ? "rgba(0,0,0,0.08)" : "transparent",
              borderBottom: tab === side ? "2px solid var(--color-primary)" : "none",
            }}
          >
            {side === "home" ? team1Name : team2Name}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: "var(--color-surface)" }}>
              {["PLAYER", "PTS", "REB", "AST", "STL", "BLK", "PF"].map((h) => (
                <th
                  key={h}
                  className={`py-2 font-pixel text-[5px] ${h === "PLAYER" ? "text-left px-3" : "text-center px-1.5"}`}
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.name} className={p.injured ? "opacity-40" : ""} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="px-3 py-2 flex items-center gap-1.5">
                  {p.sprite && <img src={p.sprite} alt="" className="w-5 h-5" />}
                  <span className="font-pixel text-[6px] truncate max-w-20" style={{ color: "var(--color-text)" }}>{p.name}</span>
                  {p.injured && (
                    <span className="font-pixel text-[5px] px-1" style={{ backgroundColor: "rgba(239,68,68,0.2)", color: "var(--color-danger)", border: "1px solid var(--color-danger)" }}>OUT</span>
                  )}
                </td>
                {[p.points, p.rebounds, p.assists, p.steals, p.blocks, p.fouls].map((v, i) => (
                  <td key={i} className="text-center px-1.5 py-2 font-pixel text-[6px]" style={{ color: i === 0 ? "var(--color-primary)" : "var(--color-text)" }}>{v}</td>
                ))}
              </tr>
            ))}
            {players.length === 0 && (
              <tr><td colSpan={7} className="text-center py-4 font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>NO DATA</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </PokeCard>
  );
}

// ─── Game Detail View ─────────────────────────────────────────────────────────

const ROUND_DURATION_MS = 300_000;
const ROUND_BUFFER_MS = 15_000;

function GameDetailView({ game, onBack }: { game: ViewingGame; onBack: () => void }) {
  const [allEvents, setAllEvents] = useState<GameEvent[]>(game.events);
  const [now, setNow] = useState(Date.now());

  const gameVirtualStartMs =
    new Date(game.startedAt).getTime() +
    (game.round - 1) * (ROUND_DURATION_MS + ROUND_BUFFER_MS);

  const elapsed = now - gameVirtualStartMs;
  const isDone = elapsed >= ROUND_DURATION_MS;
  const visibleEvents = allEvents.filter((e) => e.displayAtMs <= elapsed);
  const currentEvent = visibleEvents[visibleEvents.length - 1];
  const liveScore = currentEvent
    ? { home: currentEvent.homeScore, away: currentEvent.awayScore }
    : { home: 0, away: 0 };

  useEffect(() => {
    if (isDone) return;
    const interval = setInterval(async () => {
      setNow(Date.now());
      try {
        const res = await fetch(
          `/api/live-tournaments/${game.tournamentId}/games/${game.gameId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events) && data.events.length > allEvents.length) {
            setAllEvents(data.events as GameEvent[]);
          }
        }
      } catch {
        // silent — clock still ticks
      }
    }, 750);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, game.tournamentId, game.gameId]);

  const team1Wins = game.team1Score > game.team2Score;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <PokeButton variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-1">
          ← BACK TO BRACKET
        </PokeButton>
        {!isDone && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="font-pixel text-[5px]" style={{ color: "var(--color-danger)" }}>
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      <PokeCard variant="highlighted" className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex-1">
            <div className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{game.team1Name}</div>
          </div>
          <div className="text-center px-8">
            <div className="flex items-center gap-4">
              <span
                className="font-pixel text-[24px] tabular-nums"
                style={{ color: liveScore.home >= liveScore.away ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {liveScore.home}
              </span>
              <span className="font-pixel text-[16px]" style={{ color: "var(--color-border)" }}>-</span>
              <span
                className="font-pixel text-[24px] tabular-nums"
                style={{ color: liveScore.away > liveScore.home ? "var(--color-primary)" : "var(--color-text-muted)" }}
              >
                {liveScore.away}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {!isDone && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
              <span
                className="font-pixel text-[6px] px-2 py-0.5"
                style={{ backgroundColor: isDone ? "var(--color-danger)" : "var(--color-primary)", color: "#fff" }}
              >
                {isDone ? "FINAL" : currentEvent ? `Q${currentEvent.quarter} ${currentEvent.clock}` : "LIVE"}
              </span>
            </div>
          </div>
          <div className="flex-1 text-right">
            <div className="font-pixel text-[8px]" style={{ color: "var(--color-text)" }}>{game.team2Name}</div>
          </div>
        </div>
        {isDone && (
          <div
            className="px-6 py-2 text-center font-pixel text-[6px]"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-primary)" }}
          >
            {team1Wins ? game.team1Name : game.team2Name} WINS!
          </div>
        )}
      </PokeCard>

      {/* Event Feed + Box Score */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <EventFeed events={visibleEvents} />
        </div>
        <div className="lg:col-span-2">
          <BoxScore events={visibleEvents} team1Name={game.team1Name} team2Name={game.team2Name} />
        </div>
      </div>
    </div>
  );
}

// ─── Bracket Matchup Card ─────────────────────────────────────────────────────

function MatchupCard({
  matchup,
  userTeamName,
  onView,
}: {
  matchup: MatchupState;
  userTeamName: string | null;
  onView: (gameId: string) => void;
}) {
  const isDone = matchup.status === "completed";
  const isLive = matchup.status === "in_progress";
  const isPending = matchup.status === "pending";

  const team1Wins = isDone && matchup.winnerId === matchup.team1UserId;
  const team2Wins = isDone && matchup.winnerId === matchup.team2UserId;

  return (
    <PokeCard variant={isLive ? "highlighted" : "default"} className="overflow-hidden">
      {/* Status bar */}
      <div
        className="px-3 py-1 font-pixel text-[6px] uppercase tracking-wider flex items-center gap-1.5"
        style={{
          backgroundColor: isDone ? "rgba(0,0,0,0.1)" : isLive ? "rgba(0,0,0,0.15)" : "transparent",
          color: isDone || isLive ? "var(--color-primary)" : "var(--color-text-muted)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {isLive && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
        {isDone ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
      </div>

      {/* Teams */}
      <div>
        {[
          { name: matchup.team1Name, score: matchup.team1Score, wins: team1Wins, isUser: matchup.team1Name === userTeamName },
          { name: matchup.team2Name, score: matchup.team2Score, wins: team2Wins, isUser: matchup.team2Name === userTeamName },
        ].map((team, i) => (
          <div key={i}>
            {i === 1 && <div style={{ borderTop: "1px solid var(--color-border)", opacity: 0.4 }} />}
            <div
              className="px-3 py-2 flex items-center gap-2"
              style={{ backgroundColor: team.wins ? "rgba(0,0,0,0.06)" : "transparent" }}
            >
              <span
                className="font-pixel text-[6px] flex-1 truncate"
                style={{ color: team.wins ? "var(--color-primary)" : "var(--color-text)" }}
              >
                {team.name.toUpperCase()}
                {team.wins ? " 🏆" : ""}
              </span>
              {team.isUser && (
                <span
                  className="font-pixel text-[5px] px-1.5 py-0.5 shrink-0"
                  style={{ backgroundColor: "var(--color-primary)", color: "var(--color-primary-text)" }}
                >
                  YOU
                </span>
              )}
              {isDone && (
                <span
                  className="font-pixel text-[8px] tabular-nums"
                  style={{ color: team.wins ? "var(--color-primary)" : "var(--color-text-muted)" }}
                >
                  {team.score}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {isDone && (
        <div className="p-2" style={{ borderTop: "1px solid var(--color-border)" }}>
          <PokeButton variant="ghost" size="sm" className="w-full" onClick={() => onView(matchup.gameId)}>
            VIEW RECAP
          </PokeButton>
        </div>
      )}
      {isPending && (
        <div className="px-3 py-2 font-pixel text-[5px] text-center" style={{ color: "var(--color-text-muted)", borderTop: "1px solid var(--color-border)" }}>
          SIMULATING...
        </div>
      )}
    </PokeCard>
  );
}

// ─── Conference Bracket View ──────────────────────────────────────────────────

function getConferenceLabel(round: number, matchupIndex: number, totalRounds: number): string {
  if (round === totalRounds) return "CHAMPIONSHIP";
  if (totalRounds >= 3 && round === totalRounds - 1) {
    return matchupIndex === 0 ? "WEST FINAL" : "EAST FINAL";
  }
  if (round === 1) {
    return matchupIndex < 2 ? "WEST" : "EAST";
  }
  return `ROUND ${round}`;
}

function BracketView({
  tournament,
  onView,
}: {
  tournament: TournamentState;
  onView: (gameId: string) => void;
}) {
  const matchups = tournament.matchups ?? [];
  const totalRounds = tournament.totalRounds ?? 1;

  // Group by round
  const rounds: Record<number, MatchupState[]> = {};
  for (const m of matchups) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  // For 8-team tournaments (3 rounds), show a 3-column conference layout
  const showConferenceLayout = totalRounds >= 3 && (rounds[1]?.length ?? 0) >= 4;

  if (showConferenceLayout) {
    const round1 = (rounds[1] ?? []).sort((a, b) => a.matchupIndex - b.matchupIndex);
    const round2 = (rounds[2] ?? []).sort((a, b) => a.matchupIndex - b.matchupIndex);
    const finalRound = rounds[totalRounds] ?? [];

    const westR1 = round1.filter((m) => m.matchupIndex < 2);
    const eastR1 = round1.filter((m) => m.matchupIndex >= 2);
    const westFinal = round2.filter((m) => m.matchupIndex === 0);
    const eastFinal = round2.filter((m) => m.matchupIndex === 1);

    const commonProps = { userTeamName: tournament.userTeamName ?? null, onView };

    return (
      <div className="w-full">
        {tournament.status === "completed" && (() => {
          const champion = finalRound[0];
          const champName = champion?.winnerId === champion?.team1UserId ? champion?.team1Name : champion?.team2Name;
          return champName ? (
            <div className="mb-8 text-center">
              <PokeCard variant="highlighted" className="inline-block px-8 py-5">
                <div className="text-4xl mb-2">🏆</div>
                <div className="font-pixel text-[10px]" style={{ color: "var(--color-primary)" }}>{champName}</div>
                <div className="font-pixel text-[6px] mt-1" style={{ color: "var(--color-text-muted)" }}>TOURNAMENT CHAMPION</div>
              </PokeCard>
            </div>
          ) : null;
        })()}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* West */}
          <div className="space-y-4">
            <h3 className="font-pixel text-[7px] uppercase tracking-wider text-center" style={{ color: "var(--color-primary)" }}>
              WEST CONFERENCE
            </h3>
            {westR1.map((m) => (
              <MatchupCard key={m.gameId} matchup={m} {...commonProps} />
            ))}
            {westFinal.length > 0 && (
              <>
                <h3 className="font-pixel text-[6px] uppercase tracking-wider text-center pt-2" style={{ color: "var(--color-text-muted)" }}>
                  WEST FINAL
                </h3>
                {westFinal.map((m) => (
                  <MatchupCard key={m.gameId} matchup={m} {...commonProps} />
                ))}
              </>
            )}
          </div>

          {/* Championship */}
          <div className="space-y-4 flex flex-col justify-center">
            <h3 className="font-pixel text-[7px] uppercase tracking-wider text-center" style={{ color: "var(--color-text-muted)" }}>
              CHAMPIONSHIP
            </h3>
            {finalRound.map((m) => (
              <MatchupCard key={m.gameId} matchup={m} {...commonProps} />
            ))}
          </div>

          {/* East */}
          <div className="space-y-4">
            <h3 className="font-pixel text-[7px] uppercase tracking-wider text-center" style={{ color: "var(--color-danger)" }}>
              EAST CONFERENCE
            </h3>
            {eastR1.map((m) => (
              <MatchupCard key={m.gameId} matchup={m} {...commonProps} />
            ))}
            {eastFinal.length > 0 && (
              <>
                <h3 className="font-pixel text-[6px] uppercase tracking-wider text-center pt-2" style={{ color: "var(--color-text-muted)" }}>
                  EAST FINAL
                </h3>
                {eastFinal.map((m) => (
                  <MatchupCard key={m.gameId} matchup={m} {...commonProps} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback: simple round-by-round layout
  return (
    <div className="space-y-8">
      {Object.entries(rounds)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([round, ms]) => (
          <div key={round}>
            <h2 className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-text-muted)" }}>
              ROUND {round}{Number(round) === totalRounds ? " — FINAL" : ""}
            </h2>
            <div className="space-y-3">
              {ms.map((m) => (
                <MatchupCard
                  key={m.gameId}
                  matchup={m}
                  userTeamName={tournament.userTeamName ?? null}
                  onView={onView}
                />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [tournament, setTournament] = useState<TournamentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewingGame, setViewingGame] = useState<ViewingGame | null>(null);
  const [leaving, setLeaving] = useState(false);

  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-tournaments/${id}`);
      if (!res.ok) { setError("Tournament not found"); return; }
      const data = await res.json();
      setTournament(data);
    } catch {
      setError("Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchTournament(); }, [fetchTournament]);

  useEffect(() => {
    if ((tournament?.status !== "active" && tournament?.status !== "waiting") || viewingGame) return;
    const pollInterval = tournament?.status === "waiting" ? 3000 : 5000;
    const interval = setInterval(fetchTournament, pollInterval);
    return () => clearInterval(interval);
  }, [tournament?.status, viewingGame, fetchTournament]);

  const handleViewGameData = async (matchup: MatchupState, tournamentId: string, startedAtOverride?: string) => {
    try {
      const res = await fetch(`/api/live-tournaments/${tournamentId}/games/${matchup.gameId}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      const startedAt = startedAtOverride ?? tournament?.startedAt;
      if (!startedAt) { setError("Tournament not yet started"); return; }
      setViewingGame({
        gameId: matchup.gameId,
        team1Name: matchup.team1Name,
        team2Name: matchup.team2Name,
        team1Score: data.team1Score ?? matchup.team1Score ?? 0,
        team2Score: data.team2Score ?? matchup.team2Score ?? 0,
        winnerId: data.winnerId ?? matchup.winnerId,
        events: (data.events as GameEvent[]) ?? [],
        tournamentId,
        startedAt,
        round: matchup.round,
      });
    } catch {
      setError("Failed to load game");
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const res = await fetch(`/api/live-tournaments/${id}/leave`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to leave"); return; }
      await fetchTournament();
    } catch {
      setError("Failed to leave tournament");
    } finally {
      setLeaving(false);
    }
  };

  const handleJoin = async () => {
    try {
      const res = await fetch("/api/live-tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      // Fetch updated tournament state
      const tRes = await fetch(`/api/live-tournaments/${id}`);
      if (!tRes.ok) { await fetchTournament(); return; }
      const tData = await tRes.json();
      setTournament(tData);
      setLoading(false);

      // If tournament just started, auto-open the user's first game
      if (data.status === "active") {
        const firstGame = (tData.matchups as MatchupState[] | undefined)?.find(
          (m) => m.status === "completed"
        );
        if (firstGame) {
          await handleViewGameData(firstGame, id, tData.startedAt ?? undefined);
        }
      }
    } catch {
      setError("Failed to join tournament");
    }
  };

  const handleViewGame = async (gameId: string) => {
    const matchup = tournament?.matchups?.find((m) => m.gameId === gameId);
    if (!matchup) return;
    await handleViewGameData(matchup, id);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--color-bg)" }}>
        <div className="text-center">
          <p className="font-pixel text-[8px] mb-4" style={{ color: "var(--color-danger)" }}>{error || "TOURNAMENT NOT FOUND"}</p>
          <Link href="/tournaments" className="font-pixel text-[6px] underline" style={{ color: "var(--color-primary)" }}>← ALL TOURNAMENTS</Link>
        </div>
      </div>
    );
  }

  const isParticipant = tournament.userTeamName != null;
  const canJoin = tournament.status === "waiting" && session?.user && !isParticipant;

  // Game detail view (full-page)
  if (viewingGame) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
        <header className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3" style={{ backgroundColor: "var(--color-primary)" }}>
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="font-pixel text-[9px]" style={{ color: "var(--color-primary-text)" }}>
              {tournament.name.toUpperCase()}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <GameDetailView game={viewingGame} onBack={() => setViewingGame(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <header className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3" style={{ backgroundColor: "var(--color-primary)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/tournaments" className="font-pixel text-[7px]" style={{ color: "var(--color-primary-text)", opacity: 0.8 }}>
              ← TOURNAMENTS
            </Link>
            <span className="font-pixel text-[9px]" style={{ color: "var(--color-primary-text)" }}>
              {tournament.name.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isParticipant && (
              <span className="font-pixel text-[5px] px-2 py-1" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-shadow)" }}>
                ★ {tournament.userTeamName}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {error && <p className="font-pixel text-[6px] mb-4" style={{ color: "var(--color-danger)" }}>{error}</p>}

        {/* WAITING LOBBY */}
        {tournament.status === "waiting" && (
          <div className="max-w-lg mx-auto">
            <div className="font-pixel text-[8px] mb-2" style={{ color: "var(--color-primary)" }}>⏳ WAITING FOR PLAYERS</div>
            <p className="font-pixel text-[6px] mb-4" style={{ color: "var(--color-text-muted)" }}>
              {tournament.teamCount}/{tournament.maxTeams} TEAMS JOINED
            </p>
            <div className="mb-6 h-2 border-2 border-[var(--color-shadow)]" style={{ backgroundColor: "var(--color-surface-alt)" }}>
              <div className="h-full" style={{ width: `${((tournament.teamCount ?? 0) / tournament.maxTeams) * 100}%`, backgroundColor: "var(--color-primary)" }} />
            </div>
            {canJoin && (
              <PokeButton variant="primary" size="md" onClick={handleJoin} className="mb-6">⚡ JOIN TOURNAMENT</PokeButton>
            )}
            {!session?.user && (
              <p className="font-pixel text-[6px] mb-6" style={{ color: "var(--color-text-muted)" }}>
                <Link href="/dashboard" className="underline" style={{ color: "var(--color-primary)" }}>SIGN IN</Link>{" "}TO JOIN
              </p>
            )}
            {isParticipant && tournament.status === "waiting" && (
              <PokeButton
                variant="danger"
                size="sm"
                onClick={handleLeave}
                disabled={leaving}
                className="mb-4"
              >
                {leaving ? "LEAVING..." : "LEAVE TOURNAMENT"}
              </PokeButton>
            )}
            <div className="space-y-2">
              {tournament.teams?.map((t, i) => (
                <div key={i} className="border-2 border-[var(--color-border)] p-3" style={{ backgroundColor: "var(--color-surface)" }}>
                  <span className="font-pixel text-[7px]" style={{ color: "var(--color-text)" }}>{t.teamName.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVE / COMPLETED BRACKET */}
        {(tournament.status === "active" || tournament.status === "completed") && (
          <BracketView
            tournament={tournament}
            onView={handleViewGame}
          />
        )}
      </div>
    </div>
  );
}
