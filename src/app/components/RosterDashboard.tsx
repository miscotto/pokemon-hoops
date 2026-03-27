"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { signOut } from "@/lib/auth-client";
import { PokeButton, PokeCard, PokeInput, ThemeToggle } from "./ui";

interface RosterSummary {
  id: string;
  name: string;
  city: string;
  is_tournament_roster: boolean;
  pokemon_count: number;
  created_at: string;
  updated_at: string;
}

interface RosterDashboardProps {
  userName: string;
  onEditRoster: (rosterId: string) => void;
  onJoinLiveTournament: (tournamentId?: string) => void;
}

export default function RosterDashboard({
  userName,
  onEditRoster,
  onJoinLiveTournament,
}: RosterDashboardProps) {
  const [rosters, setRosters] = useState<RosterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRosterName, setNewRosterName] = useState("");
  const [newRosterCity, setNewRosterCity] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState("");

  const [showCreateTournamentForm, setShowCreateTournamentForm] =
    useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTournamentMaxTeams, setNewTournamentMaxTeams] = useState(8);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [tournamentCreateError, setTournamentCreateError] = useState("");

  // Season join state
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [openSeasons, setOpenSeasons] = useState<
    { id: string; name: string; teamCount: number; maxTeams: number }[]
  >([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [joiningSeasonId, setJoiningSeasonId] = useState<string | null>(null);
  const [seasonJoinMsg, setSeasonJoinMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchRosters = useCallback(async () => {
    try {
      const res = await fetch("/api/rosters");
      if (res.ok) {
        const data = await res.json();
        setRosters(data);
      }
    } catch {
      console.error("Failed to fetch rosters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRosters();
  }, [fetchRosters]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRosterName.trim() || !newRosterCity.trim()) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRosterName.trim(),
          city: newRosterCity.trim(),
        }),
      });

      if (res.ok) {
        const roster = await res.json();
        setNewRosterName("");
        setNewRosterCity("");
        setShowCreateForm(false);
        onEditRoster(roster.id);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create roster");
      }
    } catch {
      setError("Failed to create roster");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete roster "${name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/rosters/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRosters((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      console.error("Failed to delete roster");
    }
  };

  const handleSetTournament = async (id: string) => {
    try {
      const res = await fetch(`/api/rosters/${id}/tournament`, {
        method: "POST",
      });
      if (res.ok) {
        setRosters((prev) =>
          prev.map((r) => ({
            ...r,
            is_tournament_roster: r.id === id,
          }))
        );
      } else {
        const data = await res.json();
        alert(data.error || "Failed to set tournament roster");
      }
    } catch {
      console.error("Failed to set tournament roster");
    }
  };

  const handleUnsetTournament = async (id: string) => {
    try {
      const res = await fetch(`/api/rosters/${id}/tournament`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRosters((prev) =>
          prev.map((r) => ({
            ...r,
            is_tournament_roster: r.id === id ? false : r.is_tournament_roster,
          }))
        );
      }
    } catch {
      console.error("Failed to unset tournament roster");
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTournamentName.trim()) return;
    setCreatingTournament(true);
    setTournamentCreateError("");

    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTournamentName.trim(),
          maxTeams: newTournamentMaxTeams,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowCreateTournamentForm(false);
        setNewTournamentName("");
        setNewTournamentMaxTeams(8);
        onJoinLiveTournament(data.id);
      } else {
        const data = await res.json();
        setTournamentCreateError(data.error || "Failed to create tournament");
      }
    } catch {
      setTournamentCreateError("Failed to create tournament");
    } finally {
      setCreatingTournament(false);
    }
  };

  const handleOpenSeasonPicker = async () => {
    setShowSeasonPicker(true);
    setSeasonJoinMsg(null);
    setLoadingSeasons(true);
    const res = await fetch("/api/seasons");
    if (res.ok) {
      const data = await res.json();
      setOpenSeasons(
        (Array.isArray(data) ? data : []).filter(
          (s: { status: string }) => s.status === "registration"
        )
      );
    }
    setLoadingSeasons(false);
  };

  const handleJoinSeason = async (seasonId: string) => {
    setJoiningSeasonId(seasonId);
    setSeasonJoinMsg(null);
    const res = await fetch(`/api/seasons/${seasonId}/join`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      setSeasonJoinMsg({ type: "ok", text: "Joined! Good luck this season." });
      setShowSeasonPicker(false);
    } else {
      setSeasonJoinMsg({ type: "err", text: data.error || "Failed to join" });
    }
    setJoiningSeasonId(null);
  };

  const tournamentRoster = rosters.find((r) => r.is_tournament_roster);

  return (
    <>
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Tournament Roster Banner */}
        {tournamentRoster && (
          <PokeCard variant="highlighted" className="mb-6 sm:mb-8 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span
                  className="font-pixel text-[6px] px-2 py-1 self-start border border-[var(--color-shadow)]"
                  style={{
                    backgroundColor: "var(--color-danger)",
                    color: "#fff",
                  }}
                >
                  ★ TOURNAMENT ROSTER
                </span>
                {tournamentRoster.city && (
                  <span
                    className="font-pixel text-[6px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {tournamentRoster.city.toUpperCase()}
                  </span>
                )}
                <span
                  className="font-pixel text-[9px]"
                  style={{ color: "var(--color-text)" }}
                >
                  {tournamentRoster.name.toUpperCase()}
                </span>
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {tournamentRoster.pokemon_count}/6 POKEMON
                </span>
              </div>
              <div className="flex gap-2 flex-wrap shrink-0">
                <PokeButton
                  variant="danger"
                  size="sm"
                  onClick={() => onJoinLiveTournament()}
                >
                  ⚡ JOIN LIVE
                </PokeButton>
                <PokeButton
                  variant="primary"
                  size="sm"
                  onClick={handleOpenSeasonPicker}
                >
                  🏆 JOIN SEASON
                </PokeButton>
                <PokeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditRoster(tournamentRoster.id)}
                >
                  VIEW
                </PokeButton>
                <PokeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnsetTournament(tournamentRoster.id)}
                >
                  UNSET
                </PokeButton>
              </div>
            </div>

            {/* Season join feedback */}
            {seasonJoinMsg && (
              <p
                className="font-pixel text-[6px] mt-3"
                style={{
                  color:
                    seasonJoinMsg.type === "ok"
                      ? "var(--color-primary)"
                      : "var(--color-danger)",
                }}
              >
                {seasonJoinMsg.type === "ok" ? "✓ " : "✕ "}
                {seasonJoinMsg.text}
              </p>
            )}

            {/* Season picker */}
            {showSeasonPicker && (
              <div
                className="mt-4 border-t pt-4"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="font-pixel text-[6px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    SELECT OPEN SEASON
                  </span>
                  <PokeButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSeasonPicker(false)}
                  >
                    ✕
                  </PokeButton>
                </div>
                {loadingSeasons ? (
                  <div className="flex items-center gap-2 py-2">
                    <div
                      className="inline-block w-4 h-4 border-2 border-t-transparent animate-spin"
                      style={{
                        borderColor: "var(--color-primary)",
                        borderTopColor: "transparent",
                      }}
                    />
                    <span
                      className="font-pixel text-[6px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      LOADING...
                    </span>
                  </div>
                ) : openSeasons.length === 0 ? (
                  <p
                    className="font-pixel text-[6px]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    NO OPEN SEASONS RIGHT NOW.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {openSeasons.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 border"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: "var(--color-surface-alt)",
                        }}
                      >
                        <div>
                          <p
                            className="font-pixel text-[7px]"
                            style={{ color: "var(--color-text)" }}
                          >
                            {s.name.toUpperCase()}
                          </p>
                          <p
                            className="font-pixel text-[5px] mt-0.5"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {s.teamCount}/{s.maxTeams} TEAMS
                          </p>
                        </div>
                        <PokeButton
                          variant="primary"
                          size="sm"
                          disabled={joiningSeasonId === s.id}
                          onClick={() => handleJoinSeason(s.id)}
                        >
                          {joiningSeasonId === s.id ? "..." : "JOIN"}
                        </PokeButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </PokeCard>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2
              className="font-pixel text-[9px]"
              style={{ color: "var(--color-text)" }}
            >
              YOUR ROSTERS
            </h2>
            <p
              className="font-pixel text-[6px] mt-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              {rosters.length} ROSTER{rosters.length !== 1 ? "S" : ""}
            </p>
          </div>
          <PokeButton
            variant="primary"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            + NEW ROSTER
          </PokeButton>
        </div>

        {/* Create Roster Form */}
        {showCreateForm && (
          <div
            className="mb-6 p-4 border-3 border-[var(--color-border)]"
            style={{
              backgroundColor: "var(--color-surface)",
              boxShadow: "4px 4px 0 var(--color-shadow)",
            }}
          >
            <form onSubmit={handleCreate} className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <PokeInput
                  type="text"
                  value={newRosterCity}
                  onChange={(e) => setNewRosterCity(e.target.value)}
                  placeholder="City (e.g. New York)"
                  autoFocus
                />
                <PokeInput
                  type="text"
                  value={newRosterName}
                  onChange={(e) => setNewRosterName(e.target.value)}
                  placeholder="Team name (e.g. Dragons)"
                />
              </div>
              <div className="flex gap-2">
                <PokeButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={
                    creating || !newRosterName.trim() || !newRosterCity.trim()
                  }
                >
                  {creating ? "CREATING..." : "CREATE"}
                </PokeButton>
                <PokeButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRosterName("");
                    setNewRosterCity("");
                    setError("");
                  }}
                >
                  CANCEL
                </PokeButton>
              </div>
            </form>
            {error && (
              <p
                className="font-pixel text-[6px] mt-2"
                style={{ color: "var(--color-danger)" }}
              >
                {error}
              </p>
            )}
          </div>
        )}

        {/* Roster Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div
              className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin"
              style={{
                borderColor: "var(--color-primary)",
                borderTopColor: "transparent",
              }}
            />
            <p
              className="font-pixel text-[7px] mt-3"
              style={{ color: "var(--color-text-muted)" }}
            >
              LOADING...
            </p>
          </div>
        ) : rosters.length === 0 ? (
          <div
            className="text-center py-20 border-3 border-dashed"
            style={{ borderColor: "var(--color-border)" }}
          >
            <p
              className="font-pixel text-[9px] mb-2"
              style={{ color: "var(--color-text)" }}
            >
              NO ROSTERS YET
            </p>
            <p
              className="font-pixel text-[6px] mb-6"
              style={{ color: "var(--color-text-muted)" }}
            >
              CREATE YOUR FIRST ROSTER
            </p>
            <PokeButton
              variant="primary"
              size="md"
              onClick={() => setShowCreateForm(true)}
            >
              + CREATE ROSTER
            </PokeButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {rosters.map((roster) => (
              <PokeCard
                key={roster.id}
                variant={
                  roster.is_tournament_roster ? "highlighted" : "default"
                }
                className="relative p-4 flex flex-col gap-2"
              >
                {roster.is_tournament_roster && (
                  <span
                    className="absolute -top-2 -right-2 font-pixel text-[5px] px-2 py-1 border border-[var(--color-shadow)]"
                    style={{
                      backgroundColor: "var(--color-accent)",
                      color: "var(--color-shadow)",
                    }}
                  >
                    ★ TOURNAMENT
                  </span>
                )}
                {roster.city && (
                  <p
                    className="font-pixel text-[5px] mb-0.5 truncate"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {roster.city.toUpperCase()}
                  </p>
                )}
                <h3
                  className="font-pixel text-[8px] truncate pr-4"
                  style={{ color: "var(--color-text)" }}
                >
                  {roster.name.toUpperCase()}
                </h3>
                <div
                  className="flex items-center gap-2 font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <span
                    style={{
                      color:
                        roster.pokemon_count === 6
                          ? "var(--color-primary)"
                          : "var(--color-accent)",
                    }}
                  >
                    {roster.pokemon_count}
                  </span>
                  /6 &nbsp;•&nbsp;{" "}
                  {new Date(roster.updated_at).toLocaleDateString()}
                </div>
                {/* Progress bar */}
                <div
                  className="h-1.5 border border-[var(--color-shadow)]"
                  style={{ backgroundColor: "var(--color-surface-alt)" }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(roster.pokemon_count / 6) * 100}%`,
                      backgroundColor:
                        roster.pokemon_count === 6
                          ? "var(--color-primary)"
                          : "var(--color-accent)",
                    }}
                  />
                </div>
                {/* Actions */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <PokeButton
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => onEditRoster(roster.id)}
                  >
                    {roster.pokemon_count < 6 ? "EDIT" : "VIEW"}
                  </PokeButton>
                  {roster.pokemon_count === 6 &&
                    !roster.is_tournament_roster && (
                      <PokeButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetTournament(roster.id)}
                        title="Use in tournament"
                      >
                        ★
                      </PokeButton>
                    )}
                  <PokeButton
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(roster.id, roster.name)}
                    title="Delete roster"
                  >
                    ✕
                  </PokeButton>
                </div>
              </PokeCard>
            ))}
          </div>
        )}
      </div>

      {/* Create Tournament Section */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2
              className="font-pixel text-[9px]"
              style={{ color: "var(--color-text)" }}
            >
              TOURNAMENTS
            </h2>
          </div>
          {!showCreateTournamentForm && (
            <PokeButton
              variant="primary"
              size="sm"
              onClick={() => {
                setShowCreateTournamentForm(true);
                setTournamentCreateError("");
              }}
            >
              + NEW TOURNAMENT
            </PokeButton>
          )}
        </div>

        {showCreateTournamentForm && (
          <div
            className="mb-6 p-4 border-3 border-[var(--color-border)]"
            style={{
              backgroundColor: "var(--color-surface)",
              boxShadow: "4px 4px 0 var(--color-shadow)",
            }}
          >
            <form
              onSubmit={handleCreateTournament}
              className="flex flex-col gap-2"
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <PokeInput
                  type="text"
                  value={newTournamentName}
                  onChange={(e) => setNewTournamentName(e.target.value)}
                  placeholder="Tournament name"
                  autoFocus
                />
                <select
                  value={newTournamentMaxTeams}
                  onChange={(e) =>
                    setNewTournamentMaxTeams(Number(e.target.value))
                  }
                  className="font-pixel text-[7px] px-2 py-1 border-2 border-[var(--color-border)]"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                  }}
                >
                  {[2, 4, 8, 16, 32].map((n) => (
                    <option key={n} value={n}>
                      {n} TEAMS
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <PokeButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={creatingTournament || !newTournamentName.trim()}
                >
                  {creatingTournament ? "CREATING..." : "CREATE"}
                </PokeButton>
                <PokeButton
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setShowCreateTournamentForm(false);
                    setNewTournamentName("");
                    setNewTournamentMaxTeams(8);
                    setTournamentCreateError("");
                  }}
                >
                  CANCEL
                </PokeButton>
              </div>
            </form>
            {tournamentCreateError && (
              <p
                className="font-pixel text-[6px] mt-2"
                style={{ color: "var(--color-danger)" }}
              >
                {tournamentCreateError}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
