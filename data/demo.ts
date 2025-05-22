import { PCTemplate } from "../types/character";

export const thalbern: PCTemplate = {
  id: "thalbern-demo-1",
  type: "pc",
  name: "Thalbern",
  image: "/images/characters/demo-ranger.png",
  archetype: "Ranger",
  race: "Human",
  gender: "Male",
  appearance: "Lean, weathered, with sharp green eyes and long, tangled brown hair. Wears a cloak of forest hues and carries a longbow.",
  personality: "Solitary, cautious, loyal to those who earn his trust, and deeply connected to nature.",
  background: "Orphaned by border raiders, raised by elves in the Valkarr woods. Lives on the edge of Kordavos, guiding travelers and hunting for survival.",
  motivation: "To protect the Valkarr woods and its people from outside threats, and to find a place where he truly belongs.",
  behavior: "Prefers silence and observation, avoids city politics, acts decisively when the wilds are threatened.",
  health: 92,
  equipment: [
    { name: "Longbow", description: "A finely crafted elven bow, silent and deadly." },
    { name: "Short Sword", description: "A practical blade for close encounters." },
    { name: "Cloak of the Wilds", description: "Blends the wearer into the forest." }
  ],
  skills: ["Stealth", "Tracking", "Archery", "Survival", "Nature Lore"],
  attributes: {
    strength: 13,
    dexterity: 17,
    constitution: 13,
    intelligence: 11,
    wisdom: 13,
    charisma: 10
  }
}; 