"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { PokeButton, PokeCard } from "./ui";

interface TournamentPreview {
  id: string;
  name: string;
  status: string;
  max_teams: number;
  team_count: number;
  created_at: string;
  started_at: string | null;
}

interface SeasonPreview {
  id: string;
  name: string;
  status: string;
  maxTeams: number;
  teamCount: number;
  regularSeasonStart: string;
  regularSeasonEnd: string;
  playoffStart: string;
  playoffEnd: string;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [tournaments, setTournaments] = useState<TournamentPreview[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [seasons, setSeasons] = useState<SeasonPreview[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);

  useEffect(() => {
    fetch("/api/tournaments")
      .then((r) => r.json())
      .then((data) => {
        setTournaments(Array.isArray(data) ? data : []);
      })
      .catch(() => setTournaments([]))
      .finally(() => setLoadingTournaments(false));

    fetch("/api/seasons")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setSeasons(Array.isArray(data) ? data : []))
      .catch(() => setSeasons([]))
      .finally(() => setLoadingSeasons(false));
  }, []);

  const statusColor = (status: string) => {
    if (status === "active") return "var(--color-primary)";
    if (status === "completed") return "var(--color-text-muted)";
    return "var(--color-accent)";
  };

  const statusLabel = (status: string) => {
    if (status === "active") return "⚡ LIVE";
    if (status === "completed") return "✓ ENDED";
    return "◉ OPEN";
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Nav */}
      <nav
        className="sticky top-0 z-50 border-b-3 border-(--color-shadow) px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span
            className="font-pixel text-[10px] sm:text-[12px]"
            style={{ color: "var(--color-primary-text)" }}
          >
            ⚡ POKEMON HOOPS
          </span>
          <div className="flex gap-2 items-center">
            <Link
              href="/tournaments"
              className="font-pixel text-[7px] hidden sm:block"
              style={{ color: "var(--color-primary-text)", opacity: 0.85 }}
            >
              TOURNAMENTS
            </Link>
            <Link
              href="/seasons"
              className="font-pixel text-[7px] hidden sm:block"
              style={{ color: "var(--color-primary-text)", opacity: 0.85 }}
            >
              SEASONS
            </Link>
            {session?.user ? (
              <>
                <Link
                  href="/profile"
                  className="font-pixel text-[7px] hidden sm:block"
                  style={{ color: "var(--color-primary-text)", opacity: 0.85 }}
                >
                  MY PROFILE
                </Link>
                <Link href="/dashboard">
                  <PokeButton variant="primary" size="sm">
                    DASHBOARD
                  </PokeButton>
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard">
                  <PokeButton variant="ghost" size="sm">
                    SIGN IN
                  </PokeButton>
                </Link>
                <Link href="/dashboard">
                  <PokeButton variant="primary" size="sm">
                    SIGN UP
                  </PokeButton>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Banner */}
      <section
        className="py-16 sm:py-24 px-4 text-center border-b-3 border-(--color-shadow)"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-3xl mx-auto">
          {/* Pixel art pokeball decoration */}
          <div className="flex justify-center mb-6 gap-4">
            {["🏀", "⚡", "🎮"].map((icon, i) => (
              <span
                key={i}
                className="text-3xl sm:text-4xl"
                style={{ filter: "drop-shadow(2px 2px 0 var(--color-shadow))" }}
              >
                {icon}
              </span>
            ))}
          </div>

          <h1
            className="font-pixel text-[14px] sm:text-[20px] leading-relaxed mb-4"
            style={{ color: "var(--color-primary-text)" }}
          >
            POKEMON HOOPS
          </h1>
          <p
            className="font-pixel text-[7px] sm:text-[9px] leading-loose mb-2"
            style={{ color: "var(--color-primary-text)", opacity: 0.85 }}
          >
            BUILD YOUR ULTIMATE POKEMON BASKETBALL SQUAD
          </p>
          <p
            className="font-pixel text-[6px] sm:text-[7px] leading-loose mb-10"
            style={{ color: "var(--color-primary-text)", opacity: 0.7 }}
          >
            DRAFT, STRATEGIZE & COMPETE IN LIVE TOURNAMENTS
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard">
              <PokeButton variant="accent" size="lg">
                {session?.user ? "▶ GO TO DASHBOARD" : "▶ START PLAYING FREE"}
              </PokeButton>
            </Link>
            {!session?.user && (
              <Link href="/dashboard">
                <PokeButton variant="ghost" size="lg">
                  SIGN IN
                </PokeButton>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        className="py-12 px-4 border-b-3 border-[var(--color-border)]"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="font-pixel text-[9px] text-center mb-8"
            style={{ color: "var(--color-text)" }}
          >
            HOW IT WORKS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: "🏀",
                title: "BUILD YOUR ROSTER",
                desc: "Draft 6 Pokemon as your team. Each stat maps to real basketball skills.",
              },
              {
                icon: "⚡",
                title: "LIVE TOURNAMENTS",
                desc: "Compete against real players in bracket tournaments with live play-by-play.",
              },
              {
                icon: "🏆",
                title: "CLIMB THE RANKS",
                desc: "Refine your strategy, dominate brackets, become the Pokemon Hoops champion.",
              },
            ].map(({ icon, title, desc }) => (
              <PokeCard
                key={title}
                variant="default"
                className="p-5 text-center"
              >
                <div className="text-3xl mb-3">{icon}</div>
                <h3
                  className="font-pixel text-[7px] mb-3"
                  style={{ color: "var(--color-text)" }}
                >
                  {title}
                </h3>
                <p
                  className="font-pixel text-[6px] leading-loose"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {desc}
                </p>
              </PokeCard>
            ))}
          </div>
        </div>
      </section>

      {/* Live Tournaments Preview */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2
              className="font-pixel text-[9px]"
              style={{ color: "var(--color-text)" }}
            >
              ACTIVE TOURNAMENTS
            </h2>
            <Link href="/dashboard">
              <PokeButton variant="ghost" size="sm">
                JOIN ONE →
              </PokeButton>
            </Link>
          </div>

          {loadingTournaments ? (
            <div className="text-center py-12">
              <div
                className="inline-block w-6 h-6 border-2 border-t-transparent animate-spin"
                style={{
                  borderColor: "var(--color-primary)",
                  borderTopColor: "transparent",
                }}
              />
            </div>
          ) : tournaments.filter((t) => t.status === "in_progress").length ===
            0 ? (
            <PokeCard variant="default" className="p-8 text-center">
              <p
                className="font-pixel text-[7px] mb-2"
                style={{ color: "var(--color-text)" }}
              >
                NO ACTIVE TOURNAMENTS YET
              </p>
              <p
                className="font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                BE THE FIRST TO JOIN!
              </p>
            </PokeCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tournaments
                .filter((t) => t.status === "in_progress")
                .slice(0, 6)
                .map((t) => (
                  <PokeCard
                    key={t.id}
                    variant={t.status === "active" ? "highlighted" : "default"}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span
                        className="font-pixel text-[5px] px-2 py-1 border border-(--color-shadow)"
                        style={{
                          backgroundColor: statusColor(t.status),
                          color:
                            t.status === "waiting"
                              ? "var(--color-shadow)"
                              : "#fff",
                        }}
                      >
                        {statusLabel(t.status)}
                      </span>
                      <span
                        className="font-pixel text-[5px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {t.max_teams} TEAMS
                      </span>
                    </div>
                    <h3
                      className="font-pixel text-[7px] mb-2 truncate"
                      style={{ color: "var(--color-text)" }}
                    >
                      {t.name.toUpperCase()}
                    </h3>
                    <div
                      className="h-1.5 border border-(--color-shadow) mb-2"
                      style={{ backgroundColor: "var(--color-surface-alt)" }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.min(
                            ((t.status === "completed"
                              ? t.max_teams
                              : t.team_count) /
                              t.max_teams) *
                              100,
                            100
                          )}%`,
                          backgroundColor: statusColor(t.status),
                        }}
                      />
                    </div>
                    <p
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {t.status === "completed" ? t.max_teams : t.team_count}/
                      {t.max_teams} TEAMS JOINED
                    </p>
                  </PokeCard>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* Closed Tournaments Preview */}
      <section className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2
              className="font-pixel text-[9px]"
              style={{ color: "var(--color-text)" }}
            >
              PAST TOURNAMENTS
            </h2>
          </div>

          {loadingTournaments ? (
            <div className="text-center py-12">
              <div
                className="inline-block w-6 h-6 border-2 border-t-transparent animate-spin"
                style={{
                  borderColor: "var(--color-primary)",
                  borderTopColor: "transparent",
                }}
              />
            </div>
          ) : tournaments.filter((t) => t.status === "completed").length ===
            0 ? (
            <></>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tournaments
                .filter((t) => t.status === "completed")
                .slice(0, 6)
                .map((t) => (
                  <PokeCard
                    key={t.id}
                    variant={t.status === "active" ? "highlighted" : "default"}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span
                        className="font-pixel text-[5px] px-2 py-1 border border-(--color-shadow)"
                        style={{
                          backgroundColor: statusColor(t.status),
                          color:
                            t.status === "waiting"
                              ? "var(--color-shadow)"
                              : "#fff",
                        }}
                      >
                        {statusLabel(t.status)}
                      </span>
                      <span
                        className="font-pixel text-[5px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {t.max_teams} TEAMS
                      </span>
                    </div>
                    <h3
                      className="font-pixel text-[7px] mb-2 truncate"
                      style={{ color: "var(--color-text)" }}
                    >
                      {t.name.toUpperCase()}
                    </h3>
                    <div
                      className="h-1.5 border border-(--color-shadow) mb-2"
                      style={{ backgroundColor: "var(--color-surface-alt)" }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.min(
                            ((t.status === "completed"
                              ? t.max_teams
                              : t.team_count) /
                              t.max_teams) *
                              100,
                            100
                          )}%`,
                          backgroundColor: statusColor(t.status),
                        }}
                      />
                    </div>
                    <p
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {t.status === "completed" ? t.max_teams : t.team_count}/
                      {t.max_teams} TEAMS JOINED
                    </p>
                  </PokeCard>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* Seasons Preview */}
      <section
        className="py-12 px-4 border-t-3 border-(--color-border)"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-pixel text-[9px]" style={{ color: "var(--color-text)" }}>
              SEASONS
            </h2>
            <Link href="/seasons">
              <PokeButton variant="ghost" size="sm">
                VIEW ALL →
              </PokeButton>
            </Link>
          </div>

          {loadingSeasons ? (
            <div className="text-center py-8">
              <div
                className="inline-block w-6 h-6 border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
              />
            </div>
          ) : seasons.length === 0 ? (
            <PokeCard variant="default" className="p-8 text-center">
              <p className="font-pixel text-[7px] mb-2" style={{ color: "var(--color-text)" }}>
                NO SEASONS YET
              </p>
              <p className="font-pixel text-[6px]" style={{ color: "var(--color-text-muted)" }}>
                CHECK BACK SOON!
              </p>
            </PokeCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {seasons.slice(0, 6).map((s) => {
                const seasonStatusColor = (st: string) => {
                  if (st === "active") return "var(--color-primary)";
                  if (st === "playoffs") return "var(--color-accent)";
                  if (st === "completed") return "var(--color-text-muted)";
                  return "var(--color-accent)";
                };
                const seasonStatusLabel = (st: string) => {
                  if (st === "active") return "⚡ REGULAR SEASON";
                  if (st === "playoffs") return "🏆 PLAYOFFS";
                  if (st === "completed") return "✓ COMPLETED";
                  return "◉ REGISTRATION";
                };
                const fillPct = Math.min((s.teamCount / s.maxTeams) * 100, 100);
                return (
                  <Link key={s.id} href={`/seasons/${s.id}`}>
                    <PokeCard
                      variant={s.status === "active" || s.status === "playoffs" ? "highlighted" : "default"}
                      className="p-4 cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span
                          className="font-pixel text-[5px] px-2 py-1 border border-(--color-shadow)"
                          style={{
                            backgroundColor: seasonStatusColor(s.status),
                            color: s.status === "registration" ? "var(--color-shadow)" : "#fff",
                          }}
                        >
                          {seasonStatusLabel(s.status)}
                        </span>
                        <span className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>
                          {s.maxTeams} TEAMS
                        </span>
                      </div>
                      <h3 className="font-pixel text-[7px] mb-2 truncate" style={{ color: "var(--color-text)" }}>
                        {s.name.toUpperCase()}
                      </h3>
                      <div
                        className="h-1.5 border border-(--color-shadow) mb-2"
                        style={{ backgroundColor: "var(--color-surface-alt)" }}
                      >
                        <div
                          className="h-full"
                          style={{ width: `${fillPct}%`, backgroundColor: seasonStatusColor(s.status) }}
                        />
                      </div>
                      <p className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>
                        {s.teamCount}/{s.maxTeams} TEAMS ·{" "}
                        {new Date(s.regularSeasonStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" – "}
                        {new Date(s.regularSeasonEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </PokeCard>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      {!session?.user && (
        <section
          className="py-14 px-4 text-center border-t-3 border-(--color-shadow)"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <div className="max-w-2xl mx-auto">
            <h2
              className="font-pixel text-[11px] sm:text-[14px] mb-4 leading-loose"
              style={{ color: "var(--color-primary-text)" }}
            >
              READY TO COMPETE?
            </h2>
            <p
              className="font-pixel text-[6px] mb-8 leading-loose"
              style={{ color: "var(--color-primary-text)", opacity: 0.8 }}
            >
              FREE TO PLAY. 1,025 POKEMON TO DRAFT. INFINITE STRATEGIES.
            </p>
            <Link href="/dashboard">
              <PokeButton variant="accent" size="lg">
                ▶ CREATE FREE ACCOUNT
              </PokeButton>
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer
        className="py-4 px-4 text-center border-t-3 border-[var(--color-border)]"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <p
          className="font-pixel text-[5px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          © 2025 POKEMON HOOPS · NOT AFFILIATED WITH NINTENDO OR THE POKEMON
          COMPANY
        </p>
      </footer>
    </div>
  );
}
