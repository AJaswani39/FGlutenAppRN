import { Restaurant } from '../types/restaurant';

export type CuisineRiskTone = 'warning' | 'info';

export interface CuisineRiskHint {
  id: string;
  label: string;
  risk: string;
  saferAsk: string;
  tone: CuisineRiskTone;
}

interface CuisineRiskRule {
  id: string;
  patterns: RegExp[];
  hints: CuisineRiskHint[];
}

const DEFAULT_HINTS: CuisineRiskHint[] = [
  {
    id: 'shared-fryer',
    label: 'Shared fryer',
    risk: 'Fried items can pick up gluten from breaded foods in the same oil.',
    saferAsk: 'Ask whether fries, chips, and fried proteins use a dedicated fryer.',
    tone: 'warning',
  },
  {
    id: 'hidden-sauces',
    label: 'Hidden gluten',
    risk: 'Sauces, marinades, dressings, and seasoning blends may include wheat, malt, or soy sauce.',
    saferAsk: 'Ask staff to verify ingredients before ordering.',
    tone: 'info',
  },
];

const CUISINE_RULES: CuisineRiskRule[] = [
  {
    id: 'italian',
    patterns: [/italian|pasta|pizza|trattoria|ristorante|spaghetti|lasagna|gnocchi/i],
    hints: [
      {
        id: 'italian-flour-stations',
        label: 'Flour-heavy prep',
        risk: 'Pizza and pasta stations often have airborne flour, shared cutters, and shared prep surfaces.',
        saferAsk: 'Ask for separate pans, cutters, gloves, and prep space.',
        tone: 'warning',
      },
      {
        id: 'italian-pasta-water',
        label: 'Pasta water',
        risk: 'Gluten-free pasta is not celiac-safe if boiled in shared pasta water.',
        saferAsk: 'Ask whether GF pasta is cooked in fresh water with a separate strainer.',
        tone: 'warning',
      },
    ],
  },
  {
    id: 'asian',
    patterns: [/sushi|ramen|thai|chinese|japanese|korean|pho|teriyaki|soy sauce|tempura|udon|dumpling/i],
    hints: [
      {
        id: 'asian-soy-sauce',
        label: 'Soy sauce',
        risk: 'Regular soy sauce, teriyaki, eel sauce, and many marinades commonly contain wheat.',
        saferAsk: 'Ask for gluten-free tamari or sauce-free preparation.',
        tone: 'warning',
      },
      {
        id: 'asian-tempura-noodles',
        label: 'Batter and noodles',
        risk: 'Tempura, crispy toppings, ramen, udon, and dumplings are common gluten sources.',
        saferAsk: 'Ask for plain rice-based options and confirm no shared fryer.',
        tone: 'info',
      },
    ],
  },
  {
    id: 'mexican',
    patterns: [/mexican|taco|burrito|tortilla|quesadilla|enchilada|taqueria|fajita/i],
    hints: [
      {
        id: 'mexican-flour-tortillas',
        label: 'Tortilla contact',
        risk: 'Corn tortillas can be contaminated by flour tortillas on shared warmers or grills.',
        saferAsk: 'Ask for 100% corn tortillas warmed separately.',
        tone: 'warning',
      },
      {
        id: 'mexican-fryer',
        label: 'Chips and shells',
        risk: 'Chips, tostadas, and taco shells may share oil with flour or breaded items.',
        saferAsk: 'Ask whether the fryer is dedicated before eating chips.',
        tone: 'info',
      },
    ],
  },
  {
    id: 'burger',
    patterns: [/burger|sandwich|deli|sub|bun|fries|fried chicken|wrap/i],
    hints: [
      {
        id: 'burger-buns-toasters',
        label: 'Buns and toasters',
        risk: 'GF buns can become unsafe if toasted on shared equipment or handled near regular buns.',
        saferAsk: 'Ask for a sealed GF bun or lettuce wrap with clean gloves.',
        tone: 'warning',
      },
      {
        id: 'burger-fryers',
        label: 'Fries',
        risk: 'Fries are only as safe as the fryer oil they use.',
        saferAsk: 'Ask if breaded chicken, onion rings, or nuggets ever use the same fryer.',
        tone: 'warning',
      },
    ],
  },
  {
    id: 'indian',
    patterns: [/indian|curry|tandoori|naan|roti|samosa|pakora|biryani|masala/i],
    hints: [
      {
        id: 'indian-breads',
        label: 'Naan and roti',
        risk: 'Naan, roti, samosas, and some fried appetizers contain wheat.',
        saferAsk: 'Ask for rice-based dishes and confirm separate utensils from breads.',
        tone: 'info',
      },
      {
        id: 'indian-thickeners',
        label: 'Thickeners',
        risk: 'Some sauces may use flour-based thickeners or spice blends with hidden gluten.',
        saferAsk: 'Ask whether the curry or sauce is thickened with wheat flour.',
        tone: 'warning',
      },
    ],
  },
];

export function getCuisineRiskHints(restaurant: Restaurant): CuisineRiskHint[] {
  const text = `${restaurant.name}\n${restaurant.rawMenuText ?? ''}\n${restaurant.gfMenu.join('\n')}`;
  const hints: CuisineRiskHint[] = [];

  for (const rule of CUISINE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      hints.push(...rule.hints);
    }
  }

  const hasFryerHint = hints.some((h) => h.id.includes('fryer'));
  
  if (!hasFryerHint) {
    hints.unshift(DEFAULT_HINTS.find((h) => h.id === 'shared-fryer')!);
  }
  hints.unshift(DEFAULT_HINTS.find((h) => h.id === 'hidden-sauces')!);

  return dedupeHints(hints).slice(0, 6);
}

function dedupeHints(hints: CuisineRiskHint[]): CuisineRiskHint[] {
  const seen = new Set<string>();
  const deduped: CuisineRiskHint[] = [];

  for (const hint of hints) {
    if (seen.has(hint.id)) continue;
    seen.add(hint.id);
    deduped.push(hint);
  }

  return deduped;
}
