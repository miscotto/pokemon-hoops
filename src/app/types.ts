export interface PhysicalProfile {
  sizeAndReach: number;
  speedAndAgility: number;
  jumpingAbility: number;
  coordination: number;
  stamina: number;
  balance: number;
  strength: number;
}

export interface Pokemon {
  id: number;
  name: string;
  sprite: string;
  types: string[];
  stats: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    specialAttack: number;
    specialDefense: number;
  };
  height: number;
  weight: number;
  tag?: "ball handler" | "support";
  ability?: string;
  rivals?: string[];
  allies?: string[];
  physicalProfile?: PhysicalProfile;
  bball?: {
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    mpg: number;
    per: number;
  };
  playstyle?: string;
  salary?: number;
}

export interface RosterSlot {
  position: string;
  label: string;
  pokemon: Pokemon | null;
}
