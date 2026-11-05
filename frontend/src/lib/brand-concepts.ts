export const logoConcepts = [
  {
    id: "connected-nodes",
    number: "01",
    name: "Connected nodes",
    tagline: "Three points. One direct route.",
    description: "Two routes meet at one green settlement node. A compact symbol for the buyer, the merchant wallet, and the chain, drawn from your brand guide.",
    strength: "The strongest connection to your brand story.",
    recommended: true,
    icon: '<rect x="8" y="8" width="48" height="48" rx="12.5" fill="none" stroke="CURRENT" stroke-width="3.6"/><path d="M21 22v7c0 7 11 6 11 15M43 22v7c0 7-11 6-11 15" fill="none" stroke="CURRENT" stroke-width="3.6" stroke-linecap="round"/><circle cx="21" cy="21" r="4.1" fill="CURRENT"/><circle cx="43" cy="21" r="4.1" fill="CURRENT"/><circle cx="32" cy="44" r="5.5" fill="#12e08a"/>',
  },
  {
    id: "worldz-w",
    number: "02",
    name: "The Worldz W",
    tagline: "A confident mark for a moving business.",
    description: "A custom W built from two joining strokes. The final green segment represents the payment arriving at its destination. Strong as an app icon or a favicon.",
    strength: "The most recognizable standalone symbol.",
    recommended: false,
    icon: '<path d="M7 15h10l7 27 8-20h7l8 20 7-27h10L52 52H42L35.5 35 29 52H19Z" transform="translate(-3 0)" fill="CURRENT"/><path d="M51 15h10L49 52H39l4-10Z" fill="#12e08a"/>',
  },
  {
    id: "quiet-wordmark",
    number: "03",
    name: "The quiet wordmark",
    tagline: "Less symbol. More name.",
    description: "A tightly set wordmark with a single green full stop: payment complete. The compact w-dot signature carries the identity into favicons and small spaces.",
    strength: "The simplest and most restrained direction.",
    recommended: false,
    icon: '<path d="m10 22 8 25 12-19 12 19 8-25" fill="none" stroke="CURRENT" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="54" cy="48" r="4.5" fill="#12e08a"/>',
  },
] as const;

export type LogoConceptId = (typeof logoConcepts)[number]["id"];
