"use client";

import { Pokemon } from "../types";
import Image from "next/image";
import { useState } from "react";
import {
  toBballAverages,
  getPlaystyle,
  computeSalary,
} from "../utils/bballStats";
import { PokeButton, TypeBadge } from "./ui";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const abilitiesData: Record<string, { "effect trigger"?: string; "effect desc"?: string }> =
  require("../../../public/abilities.json");

interface PokemonCardProps {
  pokemon: Pokemon;
  onSelect: (pokemon: Pokemon) => void;
  isSelected: boolean;
  disabled: boolean;
}

function AbilityBadge({ ability }: { ability: string }) {
  const [showTip, setShowTip] = useState(false);
  const abilityInfo = abilitiesData[ability];
  const trigger = abilityInfo?.["effect trigger"] ?? "No in-game effect";
  const desc = abilityInfo?.["effect desc"] ?? "No in-game effect";

  return (
    <span
      className="relative font-pixel text-[5px] leading-loose px-1.5 py-0.5 border cursor-help"
      style={{
        backgroundColor: "var(--color-surface-alt)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
      }}
      onClick={(e) => {
        e.stopPropagation();
        setShowTip((v) => !v);
      }}
    >
      ✨ {ability}
      {showTip && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-[6px] font-pixel leading-loose text-center pointer-events-none border-2"
          style={{
            borderColor: "var(--color-shadow)",
            color: "var(--color-text)",
            boxShadow: "3px 3px 0 var(--color-shadow)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <span className="block font-bold">When:</span>{" "}
          {trigger}
          <span className="block font-bold mt-1">Effect:</span>{" "}
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
      className="relative flex flex-col items-center p-2 w-full text-left"
      style={{
        border: `3px solid ${
          isSelected ? "var(--color-accent)" : "var(--color-border)"
        }`,
        backgroundColor: isSelected
          ? "var(--color-surface-alt)"
          : "var(--color-surface)",
        boxShadow: isSelected
          ? "4px 4px 0 var(--color-accent)"
          : disabled
          ? "none"
          : "4px 4px 0 var(--color-shadow)",
        opacity: disabled && !isSelected ? 0.4 : 1,
        cursor: disabled && !isSelected ? "not-allowed" : "pointer",
      }}
    >
      {isSelected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center border-2 font-pixel text-[7px]"
          style={{
            backgroundColor: "var(--color-accent)",
            borderColor: "var(--color-shadow)",
            color: "var(--color-shadow)",
          }}
        >
          ✓
        </div>
      )}

      {/* Sprite */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
        <Image
          src={pokemon.sprite}
          alt={pokemon.name}
          fill
          sizes="(max-width: 640px) 64px, 80px"
          className="object-contain"
          unoptimized
        />
      </div>

      {/* Pokedex number */}
      <p
        className="font-pixel text-[6px] mt-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        #{String(pokemon.id).padStart(3, "0")}
      </p>

      {/* Name */}
      <p
        className="font-pixel text-[7px] mt-0.5 capitalize truncate w-full text-center"
        style={{ color: "var(--color-text)" }}
      >
        {pokemon.name}
      </p>

      {/* Types */}
      <div className="flex gap-1 mt-1.5 flex-wrap justify-center">
        {pokemon.types.map((type) => (
          <TypeBadge key={type} type={type} />
        ))}
      </div>

      {/* Stats */}
      <div className="flex gap-2 mt-1.5 font-pixel text-[6px]">
        <span style={{ color: "#f08030" }}>
          {avg.ppg}
          <span style={{ color: "var(--color-text-muted)" }}>pt</span>
        </span>
        <span style={{ color: "#6890f0" }}>
          {avg.rpg}
          <span style={{ color: "var(--color-text-muted)" }}>rb</span>
        </span>
        <span style={{ color: "#78c850" }}>
          {avg.apg}
          <span style={{ color: "var(--color-text-muted)" }}>as</span>
        </span>
      </div>

      {/* Playstyle */}
      <p
        className="font-pixel text-[5px] mt-0.5 text-center"
        style={{ color: "var(--color-text-muted)" }}
      >
        {playstyle}
      </p>

      {/* Ability */}
      {pokemon.ability && <AbilityBadge ability={pokemon.ability} />}

      {/* Salary */}
      <span
        className="mt-1 font-pixel text-[6px] px-1.5 py-0.5 border"
        style={{
          backgroundColor:
            salary >= 35 ? "var(--color-accent)" : "var(--color-surface-alt)",
          borderColor: "var(--color-shadow)",
          color:
            salary >= 35 ? "var(--color-shadow)" : "var(--color-text-muted)",
        }}
      >
        ${salary}M
      </span>

      {/* Draft button */}
      {!disabled && !isSelected && (
        <PokeButton variant="primary" size="sm" className="mt-2 w-full">
          + DRAFT
        </PokeButton>
      )}
    </button>
  );
}
