"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { PokeButton, PokeCard, PokeInput } from "../components/ui";

interface Season {
  id: string;
  name: string;
  status: string;
  teamCount: number;
  maxTeams: number;
  regularSeasonStart: string;
  regularSeasonEnd: string;
  playoffStart: string;
  playoffEnd: string;
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  max_teams: number;
  team_count: number;
  created_at: string;
  started_at: string | null;
}

export default function AdminPage() {
  const { data: session, isPending } = useSession();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [maxTeams, setMaxTeams] = useState<number>(8);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Season state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonName, setSeasonName] = useState("");
  const [regularSeasonStart, setRegularSeasonStart] = useState("");
  const [regularSeasonEnd, setRegularSeasonEnd] = useState("");
  const [playoffStart, setPlayoffStart] = useState("");
  const [playoffEnd, setPlayoffEnd] = useState("");
  const [creatingSeason, setCreatingSeason] = useState(false);
  const [seasonError, setSeasonError] = useState("");
  const [seasonSuccess, setSeasonSuccess] = useState("");

  const fetchTournaments = useCallback(async () => {
    const res = await fetch("/api/admin/tournaments");
    if (res.status === 401) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const data = await res.json();
    setTournaments(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  const fetchSeasons = useCallback(async () => {
    const res = await fetch("/api/seasons");
    if (res.ok) {
      const data = await res.json();
      setSeasons(Array.isArray(data) ? data : []);
    }
  }, [setSeasons]);

  useEffect(() => {
    if (!isPending && session?.user) {
      fetchTournaments();
      fetchSeasons();
    } else if (!isPending && !session?.user) {
      setAuthorized(false);
      setLoading(false);
    }
  }, [isPending, session, fetchTournaments, fetchSeasons]);

  const handleCreateSeason = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreatingSeason(true);
    setSeasonError("");
    setSeasonSuccess("");
    const res = await fetch("/api/seasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: seasonName.trim(),
        regularSeasonStart: new Date(regularSeasonStart).toISOString(),
        regularSeasonEnd: new Date(regularSeasonEnd).toISOString(),
        playoffStart: new Date(playoffStart).toISOString(),
        playoffEnd: new Date(playoffEnd).toISOString(),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setSeasonSuccess(`Season created! ID: ${data.id}`);
      setSeasonName("");
      setRegularSeasonStart("");
      setRegularSeasonEnd("");
      setPlayoffStart("");
      setPlayoffEnd("");
      fetchSeasons();
    } else {
      setSeasonError(data.error || "Failed to create season");
    }
    setCreatingSeason(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    const res = await fetch(`/api/admin/tournaments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTournaments((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
    }
    setDeleting(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");

    const res = await fetch("/api/admin/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), maxTeams }),
    });

    const data = await res.json();
    if (res.ok) {
      setCreateSuccess(`Tournament "${data.name}" created!`);
      setName("");
      setMaxTeams(8);
      fetchTournaments();
    } else {
      setCreateError(data.error || "Failed to create tournament");
    }
    setCreating(false);
  };

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

  if (isPending || loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div
          className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin"
          style={{
            borderColor: "var(--color-primary)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div className="text-center">
          <p
            className="font-pixel text-[10px] mb-4"
            style={{ color: "var(--color-danger)" }}
          >
            ACCESS DENIED
          </p>
          <p
            className="font-pixel text-[6px] mb-6"
            style={{ color: "var(--color-text-muted)" }}
          >
            {!session?.user
              ? "YOU MUST BE SIGNED IN AS AN ADMIN."
              : "YOUR ACCOUNT DOES NOT HAVE ADMIN ACCESS."}
          </p>
          <Link href="/">
            <PokeButton variant="primary" size="md">
              ← HOME
            </PokeButton>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-4 py-3"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span
            className="font-pixel text-[10px]"
            style={{ color: "var(--color-primary-text)" }}
          >
            ⚙ ADMIN PANEL
          </span>
          <div className="flex gap-2 items-center">
            <span
              className="font-pixel text-[5px] hidden sm:block"
              style={{ color: "var(--color-primary-text)", opacity: 0.7 }}
            >
              {session?.user?.email}
            </span>
            <Link href="/dashboard">
              <PokeButton variant="ghost" size="sm">
                DASHBOARD
              </PokeButton>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Create Tournament */}
        <PokeCard variant="highlighted" className="p-6">
          <h2
            className="font-pixel text-[9px] mb-5"
            style={{ color: "var(--color-text)" }}
          >
            + CREATE TOURNAMENT
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                className="font-pixel text-[6px] block mb-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                TOURNAMENT NAME
              </label>
              <PokeInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring Championship 2025..."
                required
              />
            </div>

            <div>
              <label
                className="font-pixel text-[6px] block mb-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                MAX TEAMS (EVEN NUMBER)
              </label>
              <PokeInput
                type="number"
                value={maxTeams}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 2) setMaxTeams(v);
                }}
                min={2}
                step={2}
              />
              <p
                className="font-pixel text-[5px] mt-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                {maxTeams >= 2 && maxTeams % 2 === 0
                  ? `${maxTeams / 2} TEAMS PER CONFERENCE — ${
                      maxTeams - 1
                    } MATCHUPS TOTAL`
                  : "MUST BE AN EVEN NUMBER ≥ 2"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <PokeButton
                type="submit"
                variant="primary"
                size="md"
                disabled={creating || !name.trim()}
              >
                {creating ? "CREATING..." : "CREATE TOURNAMENT"}
              </PokeButton>
              {createError && (
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-danger)" }}
                >
                  {createError}
                </span>
              )}
              {createSuccess && (
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-primary)" }}
                >
                  ✓ {createSuccess}
                </span>
              )}
            </div>
          </form>
        </PokeCard>

        {/* Create Season */}
        <PokeCard variant="highlighted" className="p-6">
          <h2 className="font-pixel text-[9px] mb-5" style={{ color: "var(--color-text)" }}>
            + CREATE SEASON
          </h2>
          <form onSubmit={handleCreateSeason} className="space-y-4">
            <div>
              <label className="font-pixel text-[6px] block mb-1" style={{ color: "var(--color-text-muted)" }}>
                SEASON NAME
              </label>
              <PokeInput
                type="text"
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                placeholder="Season 1..."
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-pixel text-[6px] block mb-1" style={{ color: "var(--color-text-muted)" }}>
                  REGULAR SEASON START
                </label>
                <PokeInput
                  type="datetime-local"
                  value={regularSeasonStart}
                  onChange={(e) => setRegularSeasonStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="font-pixel text-[6px] block mb-1" style={{ color: "var(--color-text-muted)" }}>
                  REGULAR SEASON END
                </label>
                <PokeInput
                  type="datetime-local"
                  value={regularSeasonEnd}
                  onChange={(e) => setRegularSeasonEnd(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="font-pixel text-[6px] block mb-1" style={{ color: "var(--color-text-muted)" }}>
                  PLAYOFF START
                </label>
                <PokeInput
                  type="datetime-local"
                  value={playoffStart}
                  onChange={(e) => setPlayoffStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="font-pixel text-[6px] block mb-1" style={{ color: "var(--color-text-muted)" }}>
                  PLAYOFF END
                </label>
                <PokeInput
                  type="datetime-local"
                  value={playoffEnd}
                  onChange={(e) => setPlayoffEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PokeButton
                type="submit"
                variant="primary"
                size="md"
                disabled={creatingSeason || !seasonName.trim()}
              >
                {creatingSeason ? "CREATING..." : "CREATE SEASON"}
              </PokeButton>
              {seasonError && (
                <span className="font-pixel text-[6px]" style={{ color: "var(--color-danger)" }}>
                  {seasonError}
                </span>
              )}
              {seasonSuccess && (
                <span className="font-pixel text-[6px]" style={{ color: "var(--color-primary)" }}>
                  ✓ {seasonSuccess}
                </span>
              )}
            </div>
          </form>
        </PokeCard>

        {/* Seasons List */}
        <div>
          <h2 className="font-pixel text-[9px] mb-4" style={{ color: "var(--color-text)" }}>
            ALL SEASONS ({seasons.length})
          </h2>
          {seasons.length === 0 ? (
            <PokeCard variant="default" className="p-8 text-center">
              <p className="font-pixel text-[7px]" style={{ color: "var(--color-text-muted)" }}>
                NO SEASONS YET. CREATE ONE ABOVE.
              </p>
            </PokeCard>
          ) : (
            <div className="space-y-2">
              {seasons.map((s) => {
                const sColor = s.status === "active" ? "var(--color-primary)" : s.status === "playoffs" ? "var(--color-accent)" : s.status === "completed" ? "var(--color-text-muted)" : "var(--color-accent)";
                const sLabel = s.status === "active" ? "⚡ REGULAR SEASON" : s.status === "playoffs" ? "🏆 PLAYOFFS" : s.status === "completed" ? "✓ COMPLETED" : "◉ REGISTRATION";
                return (
                  <PokeCard key={s.id} variant="default" className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <span
                        className="font-pixel text-[5px] px-2 py-1 self-start border border-(--color-shadow) shrink-0"
                        style={{ backgroundColor: sColor, color: s.status === "registration" ? "var(--color-shadow)" : "#fff" }}
                      >
                        {sLabel}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-pixel text-[8px] truncate" style={{ color: "var(--color-text)" }}>
                          {s.name.toUpperCase()}
                        </h3>
                        <p className="font-pixel text-[5px] mt-1" style={{ color: "var(--color-text-muted)" }}>
                          {s.teamCount}/{s.maxTeams} TEAMS · REG: {new Date(s.regularSeasonStart).toLocaleDateString()} – {new Date(s.regularSeasonEnd).toLocaleDateString()}
                        </p>
                      </div>
                      <Link href={`/seasons/${s.id}`}>
                        <PokeButton variant="ghost" size="sm">VIEW →</PokeButton>
                      </Link>
                    </div>
                  </PokeCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Tournament List */}
        <div>
          <h2
            className="font-pixel text-[9px] mb-4"
            style={{ color: "var(--color-text)" }}
          >
            ALL TOURNAMENTS ({tournaments.length})
          </h2>

          {tournaments.length === 0 ? (
            <PokeCard variant="default" className="p-8 text-center">
              <p
                className="font-pixel text-[7px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                NO TOURNAMENTS YET. CREATE ONE ABOVE.
              </p>
            </PokeCard>
          ) : (
            <div className="space-y-2">
              {tournaments.map((t) => (
                <PokeCard key={t.id} variant="default" className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <span
                      className="font-pixel text-[5px] px-2 py-1 self-start border border-[var(--color-shadow)] shrink-0"
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

                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-pixel text-[8px] truncate"
                        style={{ color: "var(--color-text)" }}
                      >
                        {t.name.toUpperCase()}
                      </h3>
                      <p
                        className="font-pixel text-[5px] mt-1"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        ID: {t.id.slice(0, 8)}... · {t.team_count}/{t.max_teams}{" "}
                        TEAMS · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Delete control */}
                    <div className="shrink-0 flex gap-2 items-center">
                      {confirmDeleteId === t.id ? (
                        <>
                          <PokeButton
                            variant="danger"
                            size="sm"
                            disabled={deleting}
                            onClick={() => handleDelete(t.id)}
                          >
                            {deleting ? "..." : "CONFIRM?"}
                          </PokeButton>
                          <PokeButton
                            variant="ghost"
                            size="sm"
                            disabled={deleting}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            CANCEL
                          </PokeButton>
                        </>
                      ) : (
                        <PokeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(t.id)}
                        >
                          DELETE
                        </PokeButton>
                      )}
                    </div>

                    {/* Fill bar */}
                    <div className="w-full sm:w-24 shrink-0">
                      <div
                        className="h-2 border border-[var(--color-shadow)]"
                        style={{ backgroundColor: "var(--color-surface-alt)" }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(
                              (t.team_count / t.max_teams) * 100,
                              100
                            )}%`,
                            backgroundColor: statusColor(t.status),
                          }}
                        />
                      </div>
                      <p
                        className="font-pixel text-[4px] mt-0.5 text-right"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {Math.round((t.team_count / t.max_teams) * 100)}% FULL
                      </p>
                    </div>
                  </div>
                </PokeCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
