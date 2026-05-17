export const CARD_DEFINITIONS = {
  move_1: { label: "Move 1", action: "move", distance: 1 },
  move_2: { label: "Move 2", action: "move", distance: 2 },
  move_3: { label: "Move 3", action: "move", distance: 3 },
  backup: { label: "Back Up", action: "move", distance: -1 },
  rotate_right: { label: "Rotate Right", action: "rotate", turn: 1 },
  rotate_left: { label: "Rotate Left", action: "rotate", turn: -1 },
  u_turn: { label: "U-Turn", action: "rotate", turn: 2 }
};

export function createProgramDeck() {
  return [
    ...cardsFor("u_turn", range(1, 6)),
    ...cardsFor("rotate_left", oddRange(7, 42)),
    ...cardsFor("rotate_right", evenRange(7, 42)),
    ...cardsFor("backup", range(43, 48)),
    ...cardsFor("move_1", range(49, 66)),
    ...cardsFor("move_2", range(67, 78)),
    ...cardsFor("move_3", range(79, 84))
  ].sort((a, b) => a.priorityRank - b.priorityRank);
}

export function hydrateCard(cardId) {
  const card = createProgramDeck().find((item) => item.id === cardId);
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card;
}

function cardsFor(type, ranks) {
  return ranks.map((priorityRank) => ({
    id: `${type}_${priorityRank * 10}`,
    type,
    priorityRank,
    priority: priorityRank * 10,
    ...CARD_DEFINITIONS[type]
  }));
}

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function oddRange(from, to) {
  return range(from, to).filter((value) => value % 2 === 1);
}

function evenRange(from, to) {
  return range(from, to).filter((value) => value % 2 === 0);
}
