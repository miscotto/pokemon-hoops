"use client";

import { useState } from "react";
import { Pokemon } from "../types";
import Image from "next/image";
import {
  toBballAverages,
  getPlaystyle,
  computeSalary,
} from "../utils/bballStats";
import { SUPPORT_ABILITIES } from "../utils/supportAbilities";

interface RosterSlotProps {
  position: string;
  label: string;
  pokemon: Pokemon | null;
  onRemove: () => void;
  isReserve?: boolean;
  isDragOver?: boolean;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
}

function AbilityBadge({ ability }: { ability: string }) {
  const [showTip, setShowTip] = useState(false);
  const desc = SUPPORT_ABILITIES[ability]?.description;
  return (
    <span
      className="relative text-[9px] font-semibold text-purple-300 bg-purple-400/15 px-2 py-0.5 rounded-full cursor-help"
      title={desc}
      onClick={(e) => {
        e.stopPropagation();
        setShowTip((v) => !v);
      }}
      onMouseLeave={() => setShowTip(false)}
    >
      ✨ {ability}
      {showTip && desc && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-44 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-purple-400/30 text-[10px] text-slate-200 font-normal normal-case tracking-normal text-center shadow-lg shadow-black/40 pointer-events-none">
          {desc}
        </span>
      )}
    </span>
  );
}

export default function RosterSlot({
  position,
  label,
  pokemon,
  onRemove,
  isReserve = false,
  isDragOver = false,
  onDrop,
  onDragOver,
  onDragLeave,
}: RosterSlotProps) {
  const [showStats, setShowStats] = useState(false);
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`relative flex flex-col items-center rounded-xl border-2 border-dashed p-2 transition-all duration-300
        ${
          isDragOver
            ? "border-amber-400 bg-amber-400/20 scale-105"
            : pokemon
              ? isReserve
                ? "border-cyan-400 bg-cyan-400/10 shadow-lg shadow-cyan-400/10"
                : "border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10"
              : "border-slate-600 bg-slate-800/40"
        }
      `}
    >
      <span
        className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
          isReserve ? "text-cyan-400" : "text-amber-400"
        }`}
      >
        {position}
      </span>

      {pokemon ? (
        <>
          <div className="relative w-14 h-14">
            <Image
              src={pokemon.sprite}
              alt={pokemon.name}
              fill
              sizes="56px"
              className="object-contain"
              unoptimized
            />
          </div>
          <p className="text-xs font-bold capitalize mt-0.5 truncate w-full text-center">
            {pokemon.name}
          </p>
          {(() => {
            const avg = toBballAverages(pokemon);
            const playstyle = getPlaystyle(avg, pokemon);
            const salary = computeSalary(avg, pokemon);
            return (
              <>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      salary >= 35
                        ? "bg-amber-400/20 text-amber-300"
                        : salary >= 20
                          ? "bg-emerald-400/20 text-emerald-300"
                          : "bg-slate-700/60 text-slate-400"
                    }`}
                  >
                    ${salary}M
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStats(!showStats);
                  }}
                  className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${showStats ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  <span>{showStats ? "Hide" : "Show"} Stats</span>
                </button>
                {showStats && (
                  <div className="w-full animate-in fade-in slide-in-from-top-1 pt-2 duration-200">
                    <div className="flex flex-wrap items-center justify-center gap-1 mb-2">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isReserve
                            ? "bg-cyan-400/20 text-cyan-300"
                            : "bg-amber-400/20 text-amber-300"
                        }`}
                      >
                        {playstyle}
                      </span>
                      {pokemon.ability && (
                        <AbilityBadge ability={pokemon.ability} />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                      {pokemon.height >= 10
                        ? `${(pokemon.height / 10).toFixed(1)}m`
                        : `${pokemon.height * 10}cm`}
                      {" / "}
                      {(() => {
                        const totalInches = Math.round(pokemon.height * 3.937);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        return `${feet}'${inches}"`;
                      })()}
                    </p>
                    <div className="flex gap-1 mt-1 justify-center">
                      {pokemon.types.map((type) => (
                        <span
                          key={type}
                          className={`type-${type} text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize`}
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-[10px] w-full">
                      <div className="flex flex-col items-center">
                        <span className="text-orange-400 font-bold text-sm">
                          {avg.ppg}
                        </span>
                        <span className="text-slate-500">PPG</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-blue-400 font-bold text-sm">
                          {avg.rpg}
                        </span>
                        <span className="text-slate-500">RPG</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-green-400 font-bold text-sm">
                          {avg.apg}
                        </span>
                        <span className="text-slate-500">APG</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-yellow-400 font-bold text-sm">
                          {avg.spg}
                        </span>
                        <span className="text-slate-500">SPG</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-red-400 font-bold text-sm">
                          {avg.bpg}
                        </span>
                        <span className="text-slate-500">BPG</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-purple-400 font-bold text-sm">
                          {avg.mpg}
                        </span>
                        <span className="text-slate-500">MPG</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                      <span className="text-slate-500">PER</span>
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${avg.per >= 25 ? "bg-amber-400" : avg.per >= 18 ? "bg-green-400" : "bg-slate-400"}`}
                          style={{ width: `${(avg.per / 35) * 100}%` }}
                        />
                      </div>
                      <span
                        className={`font-bold ${avg.per >= 25 ? "text-amber-400" : avg.per >= 18 ? "text-green-400" : "text-slate-400"}`}
                      >
                        {avg.per}
                      </span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <button
            onClick={onRemove}
            className="mt-2 text-[10px] text-red-400 hover:text-red-300 font-semibold uppercase tracking-wide cursor-pointer transition-colors"
          >
            Remove
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-14 w-14">
          <svg
            className="w-7 h-7 text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <p className="text-[11px] text-slate-500 mt-1 text-center">{label}</p>
        </div>
      )}
    </div>
  );
}
