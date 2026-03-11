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
  onBack: () => void;
}

export default function RosterBuilder({
  rosterId,
  rosterName,
  onBack,
}: RosterBuilderProps) {
  const [allPokemon, setAllPokemon] = useState<Pokemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [roleFilters, setRoleFilters] = useState<Set<string>>(new Set());
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
    "idle",
  );
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);

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
              const slotIndex = slots.findIndex(
                (s) => s.position === p.slot_position,
              );
              if (slotIndex >= 0) {
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
        .filter((s) => s.pokemon)
        .map((s) => ({
          slot_position: s.position,
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
          Math.min(500, startWidth + ev.clientX - startX),
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
    [sidebarWidth],
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
          playstyle: d.playstyle as string | undefined,
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
      }),
    );
  }, [allPokemon]);

  // Compute available roles from loaded pokemon
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    allPokemon.forEach((p) => {
      const avg = toBballAverages(p);
      roles.add(getPlaystyle(avg, p));
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
    [],
  );

  const clearAllFilters = useCallback(() => {
    setTypeFilters(new Set());
    setRoleFilters(new Set());
  }, []);

  const activeFilterCount = typeFilters.size + roleFilters.size;

  const selectedIds = useMemo(
    () => new Set(roster.filter((s) => s.pokemon).map((s) => s.pokemon!.id)),
    [roster],
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
            }),
          );
          return;
        }

        const avg = toBballAverages(pokemon);
        const pokemonSalary = computeSalary(avg, pokemon);
        if (teamSalary + pokemonSalary > SALARY_CAP) return;

        setRoster((prev) =>
          prev.map((s, i) => (i === slotIndex ? { ...s, pokemon } : s)),
        );
      } catch {}
    },
    [selectedIds, teamSalary],
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
        return roleFilters.has(getPlaystyle(avg, p));
      });
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
  }, [allPokemon, search, typeFilters, roleFilters, sortBy]);

  const handleSelect = useCallback(
    (pokemon: Pokemon) => {
      if (selectedIds.has(pokemon.id)) {
        setRoster((prev) =>
          prev.map((s) =>
            s.pokemon?.id === pokemon.id ? { ...s, pokemon: null } : s,
          ),
        );
        return;
      }

      const avg = toBballAverages(pokemon);
      const pokemonSalary = computeSalary(avg, pokemon);
      if (teamSalary + pokemonSalary > SALARY_CAP) return;

      if (activeSlot !== null) {
        setRoster((prev) =>
          prev.map((s, i) => (i === activeSlot ? { ...s, pokemon } : s)),
        );
        setActiveSlot((prev) => {
          const next = roster.findIndex(
            (s, i) => i !== prev && s.pokemon === null,
          );
          return next >= 0 ? next : null;
        });
        return;
      }

      const emptyIndex = roster.findIndex((s) => s.pokemon === null);
      if (emptyIndex >= 0) {
        setRoster((prev) =>
          prev.map((s, i) => (i === emptyIndex ? { ...s, pokemon } : s)),
        );
      }
    },
    [selectedIds, activeSlot, roster, teamSalary],
  );

  const handleRemove = useCallback((index: number) => {
    setRoster((prev) =>
      prev.map((s, i) => (i === index ? { ...s, pokemon: null } : s)),
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm mt-3">Loading roster...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 px-3 sm:px-4 py-2 sm:py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onBack}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Back to dashboard"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="text-2xl sm:text-3xl shrink-0">🏀</div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black tracking-tight truncate">
                {rosterName}
              </h1>
              <p className="text-[11px] text-slate-400 -mt-0.5 hidden sm:block">
                Draft your starting 5 + reserve
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div className="text-xs sm:text-sm text-slate-400 hidden xs:block">
              <span
                className={`font-bold ${isComplete ? "text-green-400" : "text-amber-400"}`}
              >
                {filledCount}
              </span>
              /6
            </div>

            {/* Save button */}
            <button
              onClick={saveRoster}
              disabled={saving}
              className={`text-xs font-bold px-3 sm:px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                saveStatus === "saved"
                  ? "bg-green-400/20 text-green-400 border border-green-400/30"
                  : saveStatus === "error"
                    ? "bg-red-400/20 text-red-400 border border-red-400/30"
                    : "bg-amber-400 text-slate-900 hover:bg-amber-300"
              }`}
            >
              {saving
                ? "..."
                : saveStatus === "saved"
                  ? "✓"
                  : saveStatus === "error"
                    ? "!"
                    : "Save"}
            </button>

            {filledCount > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 px-2 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer hidden sm:block"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Roster Toggle Button */}
      <button
        onClick={() => setMobileRosterOpen(!mobileRosterOpen)}
        className="md:hidden fixed bottom-4 right-4 z-50 bg-amber-400 text-slate-900 font-bold rounded-full w-14 h-14 flex items-center justify-center shadow-lg shadow-amber-400/30 cursor-pointer active:scale-95 transition-transform"
      >
        <div className="text-center leading-none">
          <span className="text-lg">🏀</span>
          <span className="block text-[9px] font-bold -mt-0.5">
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
            className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700/50 rounded-t-2xl max-h-[75vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
                Your Roster
              </h2>
              <div className="flex items-center gap-2">
                {filledCount > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-1 rounded-lg cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setMobileRosterOpen(false)}
                  className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
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
            <div className="mb-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Salary Cap
                </span>
                <span
                  className={`text-xs font-bold ${isOverCap ? "text-red-400" : remainingCap < 15 ? "text-amber-400" : "text-emerald-400"}`}
                >
                  ${Math.round(teamSalary * 10) / 10}M / ${SALARY_CAP}M
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isOverCap ? "bg-red-500" : capPercent > 80 ? "bg-amber-400" : "bg-emerald-400"}`}
                  style={{ width: `${capPercent}%` }}
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
                  className={`cursor-pointer rounded-xl transition-all ${activeSlot === i ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900" : ""}`}
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
                className={`cursor-pointer rounded-xl transition-all ${activeSlot === 5 ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900" : ""}`}
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
              <div className="mt-4 p-3 rounded-xl bg-linear-to-r from-amber-400/20 to-orange-400/20 border border-amber-400/30 text-center">
                <p className="text-amber-400 font-bold text-sm">
                  🏆 Roster Complete!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`flex flex-1 max-w-[1600px] mx-auto w-full ${isResizing ? "select-none" : ""}`}
      >
        {/* Roster Panel - Desktop only */}
        <aside
          style={{ width: sidebarWidth }}
          className="shrink-0 border-r border-slate-700/50 bg-slate-900/50 p-3 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto hidden md:block"
        >
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-3">
            Your Roster
          </h2>

          {/* Salary Cap Tracker */}
          <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Salary Cap
              </span>
              <span
                className={`text-xs font-bold ${isOverCap ? "text-red-400" : remainingCap < 15 ? "text-amber-400" : "text-emerald-400"}`}
              >
                ${Math.round(teamSalary * 10) / 10}M / ${SALARY_CAP}M
              </span>
            </div>
            <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverCap
                    ? "bg-red-500"
                    : capPercent > 80
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                }`}
                style={{ width: `${capPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-slate-500">
                {filledCount}/6 slots filled
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  isOverCap
                    ? "text-red-400"
                    : remainingCap < 15
                      ? "text-amber-400"
                      : "text-slate-400"
                }`}
              >
                {isOverCap ? "Over cap!" : `$${remainingCap}M remaining`}
              </span>
            </div>
          </div>

          {/* Starters */}
          <div className="space-y-2 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/70">
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
            <div className="mt-6 p-4 rounded-xl bg-linear-to-r from-amber-400/20 to-orange-400/20 border border-amber-400/30 text-center">
              <p className="text-amber-400 font-bold text-sm">
                🏆 Roster Complete!
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Don&apos;t forget to save your roster
              </p>
            </div>
          )}
        </aside>

        {/* Resize Handle - Desktop only */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-amber-400/40 active:bg-amber-400/60 transition-colors sticky top-[57px] h-[calc(100vh-57px)] z-10 hidden md:block"
        />

        {/* Pokemon Grid */}
        <main className="flex-1 p-2 sm:p-4">
          {/* Filters */}
          <div className="sticky top-[49px] sm:top-[57px] z-40 bg-slate-900/95 backdrop-blur-sm -mx-2 sm:-mx-4 px-2 sm:px-4 pb-2 sm:pb-3 pt-1 border-b border-slate-700/30 mb-3 sm:mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 placeholder-slate-500"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "id" | "name" | "stats")
                }
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 sm:px-3 py-2 text-sm focus:outline-none focus:border-amber-400/50 cursor-pointer shrink-0"
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
                className={`text-[11px] px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  filtersExpanded || activeFilterCount > 0
                    ? "bg-amber-400/20 text-amber-400 border border-amber-400/40"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"
                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
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
                  <span className="bg-amber-400 text-slate-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
                >
                  Clear all
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
                </div>
              )}
            </div>

            {/* Expanded filter panels */}
            {filtersExpanded && (
              <div className="mt-2 space-y-2 pb-1">
                {/* Type filter */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Type
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {POKEMON_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() =>
                          toggleFilter(typeFilters, setTypeFilters, type)
                        }
                        className={`text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full font-semibold capitalize transition-all cursor-pointer whitespace-nowrap
                          ${
                            typeFilters.has(type)
                              ? `type-${type} ring-2 ring-white/30`
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                          }
                        `}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Role filter */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Role / Playstyle
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {availableRoles.map((role) => (
                      <button
                        key={role}
                        onClick={() =>
                          toggleFilter(roleFilters, setRoleFilters, role)
                        }
                        className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer whitespace-nowrap
                          ${
                            roleFilters.has(role)
                              ? "bg-cyan-400/30 text-cyan-300 ring-2 ring-cyan-400/40"
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                          }
                        `}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Loading Bar */}
          {loading && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Loading Pokémon...</span>
                <span>
                  {loadedCount} / {TOTAL_POKEMON}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${(loadedCount / TOTAL_POKEMON) * 100}%` }}
                />
              </div>
            </div>
          )}

          {activeSlot !== null && (
            <div className="mb-3 p-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-center">
              <p className="text-xs text-amber-400">
                Selecting for:{" "}
                <span className="font-bold">
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
              />
            ))}
          </div>

          {filteredPokemon.length === 0 && !loading && (
            <div className="text-center py-20 text-slate-500">
              <p className="text-lg">No Pokémon found</p>
              <p className="text-sm mt-1">Try a different search or filter</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
