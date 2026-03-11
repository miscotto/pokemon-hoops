"use client";

import { useState } from "react";
import { Pokemon } from "../types";
import Image from "next/image";
import { toBballAverages, getPlaystyle, computeSalary } from "../utils/bballStats";
import { SUPPORT_ABILITIES } from "../utils/supportAbilities";
import { PokeButton, TypeBadge } from "./ui";

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
      className="relative font-pixel text-[5px] leading-loose px-1.5 py-0.5 border cursor-help"
      style={{
        backgroundColor: "var(--color-surface-alt)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
      }}
      title={desc}
      onClick={(e) => { e.stopPropagation(); setShowTip((v) => !v); }}
      onMouseLeave={() => setShowTip(false)}
    >
      ✨ {ability}
      {showTip && desc && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 p-2 text-[6px] font-pixel leading-loose text-center pointer-events-none border-2"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-shadow)",
            color: "var(--color-text)",
            boxShadow: "3px 3px 0 var(--color-shadow)",
          }}
        >
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

  const borderStyle = isDragOver
    ? { borderColor: "var(--color-accent)", backgroundColor: "var(--color-surface-alt)" }
    : pokemon
      ? { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }
      : { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-alt)" };

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className="relative flex flex-col items-center border-3 border-dashed p-2 transition-all"
      style={borderStyle}
    >
      {/* Position label */}
      <span
        className="font-pixel text-[7px] uppercase tracking-widest mb-1"
        style={{ color: isReserve ? "var(--color-accent)" : "var(--color-primary)" }}
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
              style={{ imageRendering: "pixelated" }}
              unoptimized
            />
          </div>
          <p className="font-pixel text-[7px] capitalize mt-0.5 truncate w-full text-center"
            style={{ color: "var(--color-text)" }}>
            {pokemon.name}
          </p>
          {(() => {
            const avg = toBballAverages(pokemon);
            const playstyle = getPlaystyle(avg, pokemon);
            const salary = computeSalary(avg, pokemon);
            return (
              <>
                <span
                  className="font-pixel text-[6px] px-1.5 py-0.5 border mt-1"
                  style={{
                    backgroundColor: salary >= 35 ? "var(--color-accent)" : "var(--color-surface-alt)",
                    borderColor: "var(--color-shadow)",
                    color: salary >= 35 ? "var(--color-shadow)" : "var(--color-text-muted)",
                  }}
                >
                  ${salary}M
                </span>

                <button
                  onClick={(e) => { e.stopPropagation(); setShowStats(!showStats); }}
                  className="mt-1.5 font-pixel text-[6px] cursor-pointer"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {showStats ? "▲ HIDE" : "▼ STATS"}
                </button>

                {showStats && (
                  <div className="w-full pt-2 flex flex-col gap-1 items-center">
                    <span className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>
                      {playstyle}
                    </span>
                    {pokemon.ability && <AbilityBadge ability={pokemon.ability} />}
                    <div className="flex gap-1 mt-1 flex-wrap justify-center">
                      {pokemon.types.map((type) => (
                        <TypeBadge key={type} type={type} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-center w-full">
                      {[
                        { label: "PPG", val: avg.ppg, color: "#f08030" },
                        { label: "RPG", val: avg.rpg, color: "#6890f0" },
                        { label: "APG", val: avg.apg, color: "#78c850" },
                        { label: "SPG", val: avg.spg, color: "#f8d030" },
                        { label: "BPG", val: avg.bpg, color: "#cc0000" },
                        { label: "MPG", val: avg.mpg, color: "#a040a0" },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="flex flex-col items-center">
                          <span className="font-pixel text-[8px] font-bold" style={{ color }}>{val}</span>
                          <span className="font-pixel text-[5px]" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                        </div>
                      ))}
                    </div>
                    {/* PER bar */}
                    <div className="flex items-center gap-1 mt-1.5 w-full font-pixel text-[5px]">
                      <span style={{ color: "var(--color-text-muted)" }}>PER</span>
                      <div className="flex-1 h-1.5 border" style={{ borderColor: "var(--color-shadow)", backgroundColor: "var(--color-surface-alt)" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${(avg.per / 35) * 100}%`,
                            backgroundColor: avg.per >= 25 ? "var(--color-accent)" : avg.per >= 18 ? "#78c850" : "var(--color-text-muted)",
                          }}
                        />
                      </div>
                      <span style={{ color: avg.per >= 25 ? "var(--color-accent)" : "var(--color-text-muted)" }}>
                        {avg.per}
                      </span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <PokeButton
            variant="danger"
            size="sm"
            className="mt-2"
            onClick={onRemove}
          >
            REMOVE
          </PokeButton>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-14 w-14 gap-1">
          <span className="font-pixel text-[18px]" style={{ color: "var(--color-border)" }}>+</span>
          <p className="font-pixel text-[5px] text-center" style={{ color: "var(--color-text-muted)" }}>
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
