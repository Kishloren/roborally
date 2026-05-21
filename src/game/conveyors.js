export const CONVEYOR_TURNS = [
  { label: "VEN", from: "east", to: "north", turn: "right", spriteRotation: 0, spriteFlipX: false },
  { label: "VNW", from: "north", to: "west", turn: "right", spriteRotation: 270, spriteFlipX: false },
  { label: "VWS", from: "west", to: "south", turn: "right", spriteRotation: 180, spriteFlipX: false },
  { label: "VSE", from: "south", to: "east", turn: "right", spriteRotation: 90, spriteFlipX: false },
  { label: "VES", from: "east", to: "south", turn: "left", spriteRotation: 180, spriteFlipX: true },
  { label: "VSW", from: "south", to: "west", turn: "left", spriteRotation: 270, spriteFlipX: true },
  { label: "VWN", from: "west", to: "north", turn: "left", spriteRotation: 0, spriteFlipX: true },
  { label: "VNE", from: "north", to: "east", turn: "left", spriteRotation: 90, spriteFlipX: true }
];

export function conveyorTurnEntry(conveyor) {
  return CONVEYOR_TURNS.find((entry) => entry.from === (conveyor.from || "east") && entry.turn === (conveyor.turn || "right")) || null;
}
