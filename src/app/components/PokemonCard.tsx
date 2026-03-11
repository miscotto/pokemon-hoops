"use client";

import { Pokemon } from "../types";
import Image from "next/image";
import { useState } from "react";
import {
  toBballAverages,
  getPlaystyle,
  computeSalary,
} from "../utils/bballStats";

// Import abilities data
const abilitiesData = require("../../../public/abilities.json");

interface PokemonCardProps {
  pokemon: Pokemon;
  onSelect: (pokemon: Pokemon) => void;
  isSelected: boolean;
  disabled: boolean;
}

function AbilityBadge({ ability }: { ability: string }) {
  const [showTip, setShowTip] = useState(false);
  const abilityInfo = abilitiesData[ability];
  const desc = abilityInfo
    ? abilityInfo["effect desc"]
    : "Standard Pokemon ability";

  return (
    <span
      className="relative mt-0.5 capitalize text-[9px] font-semibold text-purple-300 bg-purple-400/15 px-2 py-0.5 rounded-full cursor-help"
      title={desc}
      onClick={(e) => {
        e.stopPropagation();
        setShowTip((v) => !v);
      }}
      onMouseLeave={() => setShowTip(false)}
    >
      ✨ {ability}
      {showTip && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-purple-400/30 text-[10px] text-slate-200 font-normal tracking-normal text-center shadow-lg shadow-black/40 pointer-events-none">
          {desc}
        </span>
      )}
    </span>
  );
}

export default function PokemonCard({
  pokemon,
  onSelect,
  isSelected,
  disabled,
}: PokemonCardProps) {
  const avg = toBballAverages(pokemon);
  const playstyle = getPlaystyle(avg, pokemon);
  const salary = computeSalary(avg, pokemon);

  return (
    <button
      onClick={() => onSelect(pokemon)}
      draggable={!disabled || isSelected}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/pokemon", JSON.stringify(pokemon));
        e.dataTransfer.effectAllowed = "move";
      }}
      disabled={disabled && !isSelected}
      className={`relative flex flex-col items-center rounded-xl border-2 p-2 sm:p-3 transition-all duration-200 cursor-pointer
        ${
          isSelected
            ? "border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/20 scale-105"
            : disabled
              ? "border-slate-700 bg-slate-800/50 opacity-40 cursor-not-allowed"
              : "border-slate-700 bg-slate-800/80 hover:border-slate-500 hover:bg-slate-700/80 hover:scale-102"
        }
      `}
    >
      {isSelected && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center">
          <svg
            className="w-4 h-4 text-slate-900"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      )}

      <div className="relative w-16 h-16 sm:w-20 sm:h-20">
        <Image
          src={pokemon.sprite}
          alt={pokemon.name}
          fill
          sizes="(max-width: 640px) 64px, 80px"
          className="object-contain pixelated"
          unoptimized
        />
      </div>

      <p className="text-xs text-slate-400 font-mono">
        #{String(pokemon.id).padStart(3, "0")}
      </p>
      <p className="text-sm font-bold capitalize mt-0.5 truncate w-full text-center">
        {pokemon.name}
      </p>

      <div className="flex gap-1 mt-1.5">
        {pokemon.types.map((type) => (
          <span
            key={type}
            className={`type-${type} text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize`}
          >
            {type}
          </span>
        ))}
      </div>

      <div className="flex gap-2 mt-1.5 text-[10px]">
        <span className="text-orange-400 font-bold">
          {avg.ppg}
          <span className="text-slate-500 font-normal"> pts</span>
        </span>
        <span className="text-blue-400 font-bold">
          {avg.rpg}
          <span className="text-slate-500 font-normal"> reb</span>
        </span>
        <span className="text-green-400 font-bold">
          {avg.apg}
          <span className="text-slate-500 font-normal"> ast</span>
        </span>
      </div>
      <p className="text-[9px] text-slate-500 mt-0.5">{playstyle}</p>
      {pokemon.ability && <AbilityBadge ability={pokemon.ability} />}
      <span
        className={`mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          salary >= 35
            ? "bg-amber-400/20 text-amber-300"
            : salary >= 20
              ? "bg-emerald-400/20 text-emerald-300"
              : "bg-slate-700/60 text-slate-400"
        }`}
      >
        ${salary}M
      </span>
    </button>
  );
}
