"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Pokemon, RosterSlot as RosterSlotType } from "../types";
import PokemonCard from "./PokemonCard";
import RosterSlotComponent from "./RosterSlot";
import {
  toBballAverages,
  computeSalary,
  SALARY_CAP,
  getPlaystyle,
} from "../utils/bballStats";
import { PokeButton, PokeInput } from "./ui";
const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

const POSITIONS: { position: string; label: string }[] = [
  { position: "PG", label: "Point Guard" },
  { position: "SG", label: "Shooting Guard" },
  { position: "SF", label: "Small Forward" },
  { position: "PF", label: "Power Forward" },
  { position: "C", label: "Center" },
];

const RESERVE = { position: "6th", label: "6th Man (Reserve)" };

const TOTAL_POKEMON = 1025;

interface RosterBuilderProps {
  rosterId: string;
  rosterName: string;
  rosterCity?: string;
  onBack: () => void;
}

export default function RosterBuilder({
  rosterId,
  rosterName,
  rosterCity = "",
  onBack,
}: RosterBuilderProps) {
  const [allPokemon, setAllPokemon] = useState<Pokemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [roleFilters, setRoleFilters] = useState<Set<string>>(new Set());
  const [salaryMax, setSalaryMax] = useState<number>(44);
  const [showAlliesOnly, setShowAlliesOnly] = useState(false);
  const [hideRivals, setHideRivals] = useState(false);
  const [sortBy, setSortBy] = useState<"id" | "name" | "stats">("id");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [roster, setRoster] = useState<RosterSlotType[]>([
    ...POSITIONS.map((p) => ({ ...p, pokemon: null })),
    { ...RESERVE, pokemon: null },
  ]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle"
  );
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);
  const [lockedPokemonIds, setLockedPokemonIds] = useState<Set<number>>(new Set());

  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch Pokemon locked in active seasons league-wide (fire-and-forget)
  useEffect(() => {
    fetch("/api/seasons/locked-pokemon")
      .then((res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data?: { lockedPokemonIds: number[] }) => {
        if (data?.lockedPokemonIds) {
          setLockedPokemonIds(new Set(data.lockedPokemonIds));
        }
      })
      .catch(() => {});
  }, []);

  // Load existing roster data from DB
  useEffect(() => {
    async function loadRoster() {
      try {
        const res = await fetch(`/api/rosters/${rosterId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.pokemon && data.pokemon.length > 0) {
            const slots: RosterSlotType[] = [
              ...POSITIONS.map((p) => ({ ...p, pokemon: null })),
              { ...RESERVE, pokemon: null },
            ];

            for (const p of data.pokemon) {
              const slotIndex = p.slot_position;
              if (slotIndex >= 0 && slotIndex < slots.length) {
                slots[slotIndex].pokemon = {
                  id: p.pokemon_id,
                  name: p.pokemon_name,
                  sprite: p.pokemon_sprite,
                  types:
                    typeof p.pokemon_types === "string"
                      ? JSON.parse(p.pokemon_types)
                      : p.pokemon_types,
                  stats:
                    typeof p.pokemon_stats === "string"
                      ? JSON.parse(p.pokemon_stats)
                      : p.pokemon_stats,
                  height: p.pokemon_height,
                  weight: p.pokemon_weight,
                  tag: p.pokemon_tag,
                };
              }
            }
            setRoster(slots);
          }
        }
      } catch (err) {
        console.error("Failed to load roster:", err);
      } finally {
        setLoadingRoster(false);
      }
    }
    loadRoster();
  }, [rosterId]);

  // Save roster to DB
  const saveRoster = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const pokemon = roster
        .flatMap((s, i) => (s.pokemon ? [{ slotIndex: i, s }] : []))
        .map(({ slotIndex, s }) => ({
          slot_position: slotIndex,
          slot_label: s.label,
          pokemon_id: s.pokemon!.id,
          pokemon_name: s.pokemon!.name,
          pokemon_sprite: s.pokemon!.sprite,
          pokemon_types: s.pokemon!.types,
          pokemon_stats: s.pokemon!.stats,
          pokemon_height: s.pokemon!.height,
          pokemon_weight: s.pokemon!.weight,
          pokemon_tag: s.pokemon!.tag || null,
        }));

      const res = await fetch(`/api/rosters/${rosterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pokemon }),
      });

      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [roster, rosterId]);

  // Sidebar resize
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.max(
          200,
          Math.min(500, startWidth + ev.clientX - startX)
        );
        setSidebarWidth(newWidth);
      };
      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth]
  );

  // Load all pokemon from augmented JSON
  useEffect(() => {
    async function loadAllPokemon() {
      setLoading(true);
      try {
        const res = await fetch("/pokemon-bball-stats-augmented.json");
        const data = await res.json();
        const pokemon: Pokemon[] = data.map((d: Record<string, unknown>) => ({
          id: d.id as number,
          name: d.name as string,
          sprite: d.sprite as string,
          types: d.types as string[],
          stats: (d.baseStats || d.stats) as Pokemon["stats"],
          height: d.height as number,
          weight: d.weight as number,
          tag: d.tag as "ball handler" | "support" | undefined,
          ability: d.ability as string | undefined,
          rivals: d.rivals as string[] | undefined,
          allies: d.allies as string[] | undefined,
          physicalProfile: d.physicalProfile as Pokemon["physicalProfile"],
          bball: d.bball as Pokemon["bball"],
          playstyle: d.playstyle as string[] | undefined,
          salary: d.salary as number | undefined,
        }));
        setAllPokemon(pokemon.filter((p: Pokemon) => p.tag !== "support"));
        setLoadedCount(pokemon.length);
      } catch (err) {
        console.error("Failed to load pokemon data:", err);
      }
      setLoading(false);
    }

    loadAllPokemon();
  }, []);

  // Reconcile roster Pokemon with fresh data
  useEffect(() => {
    if (allPokemon.length === 0) return;
    const lookup = new Map(allPokemon.map((p) => [p.id, p]));
    setRoster((prev) =>
      prev.map((slot) => {
        if (!slot.pokemon) return slot;
        const fresh = lookup.get(slot.pokemon.id);
        if (fresh && fresh.tag !== slot.pokemon.tag) {
          return { ...slot, pokemon: { ...slot.pokemon, tag: fresh.tag } };
        }
        return slot;
      })
    );
  }, [allPokemon]);

  // Compute available roles from loaded pokemon
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    allPokemon.forEach((p) => {
      const avg = toBballAverages(p);
      getPlaystyle(avg, p).forEach((ps) => roles.add(ps));
    });
    return Array.from(roles).sort();
  }, [allPokemon]);

  // Toggle helpers for multi-select filters
  const toggleFilter = useCallback(
    (current: Set<string>, setter: (s: Set<string>) => void, value: string) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      setter(next);
    },
    []
  );

  const clearAllFilters = useCallback(() => {
    setTypeFilters(new Set());
    setRoleFilters(new Set());
    setSalaryMax(44);
    setShowAlliesOnly(false);
    setHideRivals(false);
  }, []);

  const activeFilterCount =
    typeFilters.size +
    roleFilters.size +
    (salaryMax < 44 ? 1 : 0) +
    (showAlliesOnly ? 1 : 0) +
    (hideRivals ? 1 : 0);

  const selectedIds = useMemo(
    () => new Set(roster.filter((s) => s.pokemon).map((s) => s.pokemon!.id)),
    [roster]
  );

  const rosterPokemonNames = useMemo(
    () => new Set(roster.filter((s) => s.pokemon).map((s) => s.pokemon!.name)),
    [roster]
  );

  const teamSalary = useMemo(() => {
    return roster.reduce((total, slot) => {
      if (!slot.pokemon) return total;
      const avg = toBballAverages(slot.pokemon);
      return total + computeSalary(avg, slot.pokemon);
    }, 0);
  }, [roster]);

  const handleDrop = useCallback(
    (slotIndex: number, e: React.DragEvent) => {
      e.preventDefault();
      setDragOverSlot(null);
      try {
        const data = e.dataTransfer.getData("application/pokemon");
        if (!data) return;
        const pokemon: Pokemon = JSON.parse(data);

        if (selectedIds.has(pokemon.id)) {
          setRoster((prev) =>
            prev.map((s, i) => {
              if (s.pokemon?.id === pokemon.id) return { ...s, pokemon: null };
              if (i === slotIndex) return { ...s, pokemon };
              return s;
            })
          );
          return;
        }

        const avg = toBballAverages(pokemon);
        const pokemonSalary = computeSalary(avg, pokemon);
        if (teamSalary + pokemonSalary > SALARY_CAP) return;

        setRoster((prev) =>
          prev.map((s, i) => (i === slotIndex ? { ...s, pokemon } : s))
        );
      } catch {}
    },
    [selectedIds, teamSalary]
  );

  const remainingCap = Math.round((SALARY_CAP - teamSalary) * 10) / 10;
  const isOverCap = teamSalary > SALARY_CAP;
  const capPercent = Math.min((teamSalary / SALARY_CAP) * 100, 100);

  const filteredPokemon = useMemo(() => {
    let list = allPokemon;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.includes(q) || String(p.id).includes(q));
    }

    if (typeFilters.size > 0) {
      list = list.filter((p) => p.types.some((t) => typeFilters.has(t)));
    }

    if (roleFilters.size > 0) {
      list = list.filter((p) => {
        const avg = toBballAverages(p);
        return getPlaystyle(avg, p).some((ps) => roleFilters.has(ps));
      });
    }

    if (salaryMax < 44) {
      list = list.filter((p) => {
        const avg = toBballAverages(p);
        return computeSalary(avg, p) <= salaryMax;
      });
    }

    if (showAlliesOnly && rosterPokemonNames.size > 0) {
      list = list.filter((p) =>
        p.allies?.some((a) => rosterPokemonNames.has(a))
      );
    }

    if (hideRivals && rosterPokemonNames.size > 0) {
      list = list.filter(
        (p) => !p.rivals?.some((r) => rosterPokemonNames.has(r))
      );
    }

    if (sortBy === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "stats") {
      list = [...list].sort((a, b) => {
        const totalA = Object.values(a.stats).reduce((s, v) => s + v, 0);
        const totalB = Object.values(b.stats).reduce((s, v) => s + v, 0);
        return totalB - totalA;
      });
    } else {
      list = [...list].sort((a, b) => a.id - b.id);
    }

    return list;
  }, [allPokemon, search, typeFilters, roleFilters, salaryMax, showAlliesOnly, hideRivals, rosterPokemonNames, sortBy]);

  const handleSelect = useCallback(
    (pokemon: Pokemon) => {
      if (selectedIds.has(pokemon.id)) {
        setRoster((prev) =>
          prev.map((s) =>
            s.pokemon?.id === pokemon.id ? { ...s, pokemon: null } : s
          )
        );
        return;
      }

      const avg = toBballAverages(pokemon);
      const pokemonSalary = computeSalary(avg, pokemon);
      if (teamSalary + pokemonSalary > SALARY_CAP) return;

      if (activeSlot !== null) {
        setRoster((prev) =>
          prev.map((s, i) => (i === activeSlot ? { ...s, pokemon } : s))
        );
        setActiveSlot((prev) => {
          const next = roster.findIndex(
            (s, i) => i !== prev && s.pokemon === null
          );
          return next >= 0 ? next : null;
        });
        return;
      }

      const emptyIndex = roster.findIndex((s) => s.pokemon === null);
      if (emptyIndex >= 0) {
        setRoster((prev) =>
          prev.map((s, i) => (i === emptyIndex ? { ...s, pokemon } : s))
        );
      }
    },
    [selectedIds, activeSlot, roster, teamSalary]
  );

  const handleRemove = useCallback((index: number) => {
    setRoster((prev) =>
      prev.map((s, i) => (i === index ? { ...s, pokemon: null } : s))
    );
  }, []);

  const handleClearAll = useCallback(() => {
    setRoster((prev) => prev.map((s) => ({ ...s, pokemon: null })));
    setActiveSlot(null);
  }, []);

  const filledCount = roster.filter((s) => s.pokemon).length;
  const isComplete = filledCount === 6;

  if (loadingRoster) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div className="text-center">
          <div
            className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin"
            style={{
              borderColor: "var(--color-primary)",
              borderTopColor: "transparent",
            }}
          />
          <p
            className="font-pixel text-[8px] mt-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            LOADING ROSTER...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-sm px-3 sm:px-4 py-2 sm:py-3"
        style={{
          backgroundColor: "var(--color-surface)",
          borderBottom: "3px solid var(--color-border)",
        }}
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <PokeButton variant="ghost" size="sm" onClick={onBack}>
              ◀ BACK
            </PokeButton>
            <div className="text-2xl sm:text-3xl shrink-0">🏀</div>
            <div className="min-w-0">
              {rosterCity && (
                <p
                  className="font-pixel text-[6px] truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {rosterCity.toUpperCase()}
                </p>
              )}
              <h1
                className="text-base sm:text-xl font-pixel tracking-tight truncate"
                style={{ color: "var(--color-text)" }}
              >
                {rosterName}
              </h1>
              <p
                className="font-pixel text-[7px] -mt-0.5 hidden sm:block"
                style={{ color: "var(--color-text-muted)" }}
              >
                DRAFT YOUR STARTING 5 + RESERVE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div
              className="font-pixel text-[8px] hidden xs:block"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span
                style={{
                  color: isComplete
                    ? "var(--color-success, #4ade80)"
                    : "var(--color-primary)",
                }}
              >
                {filledCount}
              </span>
              /6
            </div>

            {/* Save button */}
            <PokeButton
              variant="primary"
              size="sm"
              onClick={saveRoster}
              disabled={saving}
            >
              {saving
                ? "SAVING..."
                : saveStatus === "saved"
                ? "✓ SAVED"
                : saveStatus === "error"
                ? "ERROR"
                : "SAVE ROSTER"}
            </PokeButton>

            {filledCount > 0 && (
              <button
                onClick={handleClearAll}
                className="font-pixel text-[7px] cursor-pointer hidden sm:block"
                style={{ color: "var(--color-danger, #f87171)" }}
              >
                CLEAR ALL
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Roster Toggle Button */}
      <button
        onClick={() => setMobileRosterOpen(!mobileRosterOpen)}
        className="md:hidden fixed bottom-4 right-4 z-50 font-pixel w-14 h-14 flex items-center justify-center cursor-pointer active:scale-95 transition-transform border-2"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "var(--color-bg)",
          borderColor: "var(--color-shadow)",
        }}
      >
        <div className="text-center leading-none">
          <span className="text-lg">🏀</span>
          <span className="block font-pixel text-[7px] -mt-0.5">
            {filledCount}/6
          </span>
        </div>
      </button>

      {/* Mobile Roster Bottom Sheet */}
      {mobileRosterOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          onClick={() => setMobileRosterOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto p-4"
            style={{
              backgroundColor: "var(--color-surface)",
              borderTop: "3px solid var(--color-border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                className="font-pixel text-[8px] uppercase"
                style={{ color: "var(--color-text-muted)" }}
              >
                YOUR ROSTER
              </h2>
              <div className="flex items-center gap-2">
                {filledCount > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="font-pixel text-[7px] border px-2 py-1 cursor-pointer"
                    style={{
                      color: "var(--color-danger)",
                      borderColor: "var(--color-danger)",
                    }}
                  >
                    CLEAR
                  </button>
                )}
                <button
                  onClick={() => setMobileRosterOpen(false)}
                  className="p-1 cursor-pointer"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Mobile Salary Cap */}
            <div
              className="mb-3 p-3 border-2"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-alt)",
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="font-pixel text-[6px] uppercase"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  SALARY CAP
                </span>
                <span
                  className="font-pixel text-[6px]"
                  style={{
                    color: isOverCap
                      ? "var(--color-danger)"
                      : "var(--color-text)",
                  }}
                >
                  ${Math.round(teamSalary * 10) / 10}M / ${SALARY_CAP}M
                </span>
              </div>
              <div
                className="h-2 border-2"
                style={{
                  borderColor: "var(--color-shadow)",
                  backgroundColor: "var(--color-surface-alt)",
                }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${capPercent}%`,
                    backgroundColor: isOverCap
                      ? "var(--color-danger)"
                      : "var(--color-primary)",
                  }}
                />
              </div>
            </div>

            {/* Mobile Roster Slots - horizontal scroll */}
            <div className="grid grid-cols-3 gap-2">
              {roster.slice(0, 5).map((slot, i) => (
                <div
                  key={slot.position}
                  onClick={() => {
                    setActiveSlot(activeSlot === i ? null : i);
                    setMobileRosterOpen(false);
                  }}
                  className={`cursor-pointer rounded-xl transition-all ${
                    activeSlot === i
                      ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900"
                      : ""
                  }`}
                >
                  <RosterSlotComponent
                    position={slot.position}
                    label={slot.label}
                    pokemon={slot.pokemon}
                    onRemove={() => handleRemove(i)}
                    isDragOver={false}
                  />
                </div>
              ))}
              <div
                onClick={() => {
                  setActiveSlot(activeSlot === 5 ? null : 5);
                  setMobileRosterOpen(false);
                }}
                className={`cursor-pointer rounded-xl transition-all ${
                  activeSlot === 5
                    ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900"
                    : ""
                }`}
              >
                <RosterSlotComponent
                  position={roster[5].position}
                  label={roster[5].label}
                  pokemon={roster[5].pokemon}
                  onRemove={() => handleRemove(5)}
                  isReserve
                  isDragOver={false}
                />
              </div>
            </div>

            {isComplete && (
              <div
                className="mt-4 p-3 border-2 text-center"
                style={{
                  borderColor: "var(--color-primary)",
                  backgroundColor: "var(--color-surface-alt)",
                }}
              >
                <p
                  className="font-pixel text-[8px]"
                  style={{ color: "var(--color-primary)" }}
                >
                  ROSTER COMPLETE!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`flex flex-1 max-w-[1600px] mx-auto w-full ${
          isResizing ? "select-none" : ""
        }`}
      >
        {/* Roster Panel - Desktop only */}
        <aside
          style={{
            width: sidebarWidth,
            backgroundColor: "var(--color-surface)",
            borderRight: "3px solid var(--color-border)",
          }}
          className="shrink-0 p-3 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto hidden md:block"
        >
          <h2
            className="font-pixel text-[8px] uppercase mb-3"
            style={{ color: "var(--color-text-muted)" }}
          >
            YOUR ROSTER
          </h2>

          {/* Salary Cap Tracker */}
          <div
            className="mb-4 p-3 border-t-2"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex justify-between mb-1">
              <span
                className="font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                SALARY CAP
              </span>
              <span
                className="font-pixel text-[6px]"
                style={{
                  color: isOverCap
                    ? "var(--color-danger)"
                    : "var(--color-text)",
                }}
              >
                ${Math.round(teamSalary * 10) / 10}M / ${SALARY_CAP}M
              </span>
            </div>
            <div
              className="h-2 border-2"
              style={{
                borderColor: "var(--color-shadow)",
                backgroundColor: "var(--color-surface-alt)",
              }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${capPercent}%`,
                  backgroundColor: isOverCap
                    ? "var(--color-danger)"
                    : "var(--color-primary)",
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span
                className="font-pixel text-[6px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {filledCount}/6 SLOTS
              </span>
              <span
                className="font-pixel text-[6px]"
                style={{
                  color: isOverCap
                    ? "var(--color-danger)"
                    : "var(--color-text-muted)",
                }}
              >
                {isOverCap ? "OVER CAP!" : `$${remainingCap}M LEFT`}
              </span>
            </div>
          </div>

          {/* Starters */}
          <div className="space-y-2 mb-3">
            <p
              className="font-pixel text-[6px] uppercase"
              style={{ color: "var(--color-primary)" }}
            >
              Starting Five
            </p>
            {roster.slice(0, 5).map((slot, i) => (
              <div
                key={slot.position}
                onClick={() => setActiveSlot(activeSlot === i ? null : i)}
                className={`cursor-pointer rounded-xl transition-all ${
                  activeSlot === i
                    ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900"
                    : ""
                }`}
              >
                <RosterSlotComponent
                  position={slot.position}
                  label={slot.label}
                  pokemon={slot.pokemon}
                  onRemove={() => handleRemove(i)}
                  isDragOver={dragOverSlot === i}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverSlot(i);
                  }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={(e) => handleDrop(i, e)}
                />
              </div>
            ))}
          </div>

          {/* Reserve */}
          <div className="space-y-2">
            <p
              className="font-pixel text-[6px] uppercase"
              style={{ color: "var(--color-text-muted)" }}
            >
              Reserve
            </p>
            <div
              onClick={() => setActiveSlot(activeSlot === 5 ? null : 5)}
              className={`cursor-pointer rounded-xl transition-all ${
                activeSlot === 5
                  ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900"
                  : ""
              }`}
            >
              <RosterSlotComponent
                position={roster[5].position}
                label={roster[5].label}
                pokemon={roster[5].pokemon}
                onRemove={() => handleRemove(5)}
                isReserve
                isDragOver={dragOverSlot === 5}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverSlot(5);
                }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(e) => handleDrop(5, e)}
              />
            </div>
          </div>

          {isComplete && (
            <div
              className="mt-6 p-4 border-2 text-center"
              style={{
                borderColor: "var(--color-primary)",
                backgroundColor: "var(--color-surface-alt)",
              }}
            >
              <p
                className="font-pixel text-[8px]"
                style={{ color: "var(--color-primary)" }}
              >
                ROSTER COMPLETE!
              </p>
              <p
                className="font-pixel text-[6px] mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                DON&apos;T FORGET TO SAVE
              </p>
            </div>
          )}
        </aside>

        {/* Resize Handle - Desktop only */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize transition-colors sticky top-[57px] h-[calc(100vh-57px)] z-10 hidden md:block"
          style={{ backgroundColor: "var(--color-border)" }}
        />

        {/* Pokemon Grid */}
        <main className="flex-1 p-2 sm:p-4">
          {/* Filters */}
          <div
            className="z-40 backdrop-blur-sm -mx-2 sm:-mx-4 px-2 sm:px-4 pb-2 sm:pb-3 pt-1 mb-3 sm:mb-4"
            style={{
              backgroundColor: "var(--color-surface)",
              borderBottom: "2px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <PokeInput
                  label="SEARCH"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="BULBASAUR..."
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "id" | "name" | "stats")
                }
                className="font-pixel text-[7px] border-2 px-2 sm:px-3 py-2 focus:outline-none cursor-pointer shrink-0"
                style={{
                  backgroundColor: "var(--color-surface-alt)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <option value="id">#</option>
                <option value="name">A-Z</option>
                <option value="stats">Stats</option>
              </select>
            </div>

            {/* Filter toggle button */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="font-pixel text-[7px] px-3 py-1 border-2 transition-all cursor-pointer flex items-center gap-1.5"
                style={{
                  backgroundColor:
                    filtersExpanded || activeFilterCount > 0
                      ? "var(--color-primary)"
                      : "var(--color-surface-alt)",
                  color:
                    filtersExpanded || activeFilterCount > 0
                      ? "var(--color-bg)"
                      : "var(--color-text-muted)",
                  borderColor: "var(--color-border)",
                }}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${
                    filtersExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span
                    className="font-pixel text-[7px] w-4 h-4 flex items-center justify-center border"
                    style={{
                      backgroundColor: "var(--color-shadow)",
                      color: "var(--color-bg)",
                      borderColor: "var(--color-shadow)",
                    }}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="font-pixel text-[7px] cursor-pointer"
                  style={{ color: "var(--color-danger)" }}
                >
                  CLEAR ALL
                </button>
              )}

              {/* Active filter pills (summary when collapsed) */}
              {!filtersExpanded && activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-1 overflow-hidden max-h-6">
                  {Array.from(typeFilters).map((t) => (
                    <span
                      key={`t-${t}`}
                      className={`text-[9px] px-1.5 py-0.5 rounded-full type-${t} capitalize`}
                    >
                      {t}
                    </span>
                  ))}
                  {Array.from(roleFilters).map((r) => (
                    <span
                      key={`r-${r}`}
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300"
                    >
                      {r}
                    </span>
                  ))}
                  {showAlliesOnly && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-pixel" style={{ backgroundColor: "#16a34a", color: "#dcfce7" }}>
                      ♥ ALLIES
                    </span>
                  )}
                  {hideRivals && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-pixel" style={{ backgroundColor: "#dc2626", color: "#fee2e2" }}>
                      ⚔ NO RIVALS
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Expanded filter panels */}
            {filtersExpanded && (
              <div className="mt-2 space-y-2 pb-1 ">
                {/* Type filter */}
                <div>
                  <p
                    className="font-pixel text-[6px] uppercase mb-1"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    TYPE
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {POKEMON_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          toggleFilter(typeFilters, setTypeFilters, type)
                        }
                        className={[
                          `type-${type} font-pixel text-[5px] px-1.5 py-0.5 uppercase cursor-pointer whitespace-nowrap`,
                          typeFilters.has(type)
                            ? "border-2 border-[var(--color-shadow)] shadow-poke-sm"
                            : "border border-[var(--color-shadow)] opacity-60",
                        ].join(" ")}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Role filter */}
                <div>
                  <p
                    className="font-pixel text-[6px] uppercase mb-1"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    ROLE / PLAYSTYLE
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {availableRoles.map((role) => (
                      <button
                        key={role}
                        onClick={() =>
                          toggleFilter(roleFilters, setRoleFilters, role)
                        }
                        className="font-pixel text-[5px] px-1.5 py-0.5 uppercase cursor-pointer whitespace-nowrap border-2 transition-all"
                        style={{
                          backgroundColor: roleFilters.has(role)
                            ? "var(--color-primary)"
                            : "var(--color-surface-alt)",
                          color: roleFilters.has(role)
                            ? "var(--color-bg)"
                            : "var(--color-text-muted)",
                          borderColor: "var(--color-border)",
                        }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Salary filter */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p
                      className="font-pixel text-[6px] uppercase"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      MAX SALARY
                    </p>
                    <span
                      className="font-pixel text-[6px]"
                      style={{
                        color:
                          salaryMax < 44
                            ? "var(--color-primary)"
                            : "var(--color-text-muted)",
                      }}
                    >
                      {salaryMax < 44 ? `≤ $${salaryMax}M` : "ANY"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={44}
                    step={1}
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(Number(e.target.value))}
                    className="w-full cursor-pointer"
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  <div className="flex justify-between mt-0.5">
                    <span
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      $1M
                    </span>
                    <span
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      $44M
                    </span>
                  </div>
                </div>

                {/* Ally / Rival filters */}
                {rosterPokemonNames.size > 0 && (
                  <div>
                    <p
                      className="font-pixel text-[6px] uppercase mb-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      TEAM CHEMISTRY
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setShowAlliesOnly((v) => !v)}
                        className="font-pixel text-[5px] px-2 py-0.5 uppercase cursor-pointer whitespace-nowrap border-2 transition-all"
                        style={{
                          backgroundColor: showAlliesOnly ? "#16a34a" : "var(--color-surface-alt)",
                          color: showAlliesOnly ? "#dcfce7" : "var(--color-text-muted)",
                          borderColor: showAlliesOnly ? "#14532d" : "var(--color-border)",
                        }}
                      >
                        ♥ ALLIES ONLY
                      </button>
                      <button
                        onClick={() => setHideRivals((v) => !v)}
                        className="font-pixel text-[5px] px-2 py-0.5 uppercase cursor-pointer whitespace-nowrap border-2 transition-all"
                        style={{
                          backgroundColor: hideRivals ? "#dc2626" : "var(--color-surface-alt)",
                          color: hideRivals ? "#fee2e2" : "var(--color-text-muted)",
                          borderColor: hideRivals ? "#7f1d1d" : "var(--color-border)",
                        }}
                      >
                        ⚔ HIDE RIVALS
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Loading Bar */}
          {loading && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  LOADING POKEMON...
                </span>
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {loadedCount} / {TOTAL_POKEMON}
                </span>
              </div>
              <div
                className="h-2 border-2"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-surface-alt)",
                }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${(loadedCount / TOTAL_POKEMON) * 100}%`,
                    backgroundColor: "var(--color-primary)",
                  }}
                />
              </div>
            </div>
          )}

          {activeSlot !== null && (
            <div
              className="mb-3 p-2 border-2 text-center"
              style={{
                borderColor: "var(--color-primary)",
                backgroundColor: "var(--color-surface-alt)",
              }}
            >
              <p
                className="font-pixel text-[6px]"
                style={{ color: "var(--color-primary)" }}
              >
                SELECTING FOR:{" "}
                <span>
                  {roster[activeSlot].position} — {roster[activeSlot].label}
                </span>
              </p>
            </div>
          )}

          <div
            ref={gridRef}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3 pb-20 md:pb-4"
          >
            {filteredPokemon.map((pokemon) => (
              <PokemonCard
                key={pokemon.id}
                pokemon={pokemon}
                onSelect={handleSelect}
                isSelected={selectedIds.has(pokemon.id)}
                disabled={
                  filledCount >= 6 ||
                  (!selectedIds.has(pokemon.id) &&
                    teamSalary +
                      computeSalary(toBballAverages(pokemon), pokemon) >
                      SALARY_CAP)
                }
                allyBonus={
                  rosterPokemonNames.size > 0 &&
                  !!pokemon.allies?.some((a) => rosterPokemonNames.has(a))
                }
                rivalDebuff={
                  rosterPokemonNames.size > 0 &&
                  !!pokemon.rivals?.some((r) => rosterPokemonNames.has(r))
                }
                isLockedInSeason={lockedPokemonIds.has(pokemon.id)}
              />
            ))}
          </div>

          {filteredPokemon.length === 0 && !loading && (
            <div className="text-center py-20">
              <p
                className="font-pixel text-[10px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                NO POKEMON FOUND
              </p>
              <p
                className="font-pixel text-[7px] mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                TRY A DIFFERENT SEARCH OR FILTER
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
