import { Restaurant } from '../types/restaurant';
import { MenuSafetyLevel } from './menuSafety';

export interface DiningChecklistItem {
  id: string;
  question: string;
  note: string;
  priority: 'high' | 'medium';
}

interface CuisineRule {
  id: string;
  patterns: RegExp[];
  items: DiningChecklistItem[];
}

const BASE_ITEMS: DiningChecklistItem[] = [
  {
    id: 'dedicated-prep',
    question: 'Can this be prepared on a clean surface with fresh gloves and utensils?',
    note: 'Prep surfaces and shared tongs are common cross-contact points.',
    priority: 'high',
  },
  {
    id: 'dedicated-fryer',
    question: 'Is there a dedicated fryer for gluten-free items?',
    note: 'Fries, chips, and fried proteins are risky if the fryer is shared.',
    priority: 'high',
  },
  {
    id: 'sauces-marinades',
    question: 'Do any sauces, marinades, dressings, or spice blends contain wheat?',
    note: 'Soy sauce, malt vinegar, roux, and seasoning mixes can be hidden sources.',
    priority: 'medium',
  },
];

const STRICT_ITEM: DiningChecklistItem = {
  id: 'celiac-protocol',
  question: 'Do you have a celiac-safe protocol, not just gluten-free ingredients?',
  note: 'Strict mode should verify process, storage, prep, and staff handling.',
  priority: 'high',
};

const CUISINE_RULES: CuisineRule[] = [
  {
    id: 'italian',
    patterns: [/italian|pasta|pizza|trattoria|ristorante|spaghetti|lasagna/i],
    items: [
      {
        id: 'italian-pasta-water',
        question: 'Is gluten-free pasta boiled in fresh water with a separate strainer?',
        note: 'Shared pasta water can contaminate otherwise gluten-free pasta.',
        priority: 'high',
      },
      {
        id: 'italian-pizza-surface',
        question: 'Is gluten-free pizza made with separate pans, cutters, and prep space?',
        note: 'Flour-heavy pizza stations need extra care.',
        priority: 'high',
      },
    ],
  },
  {
    id: 'asian',
    patterns: [/sushi|ramen|thai|chinese|japanese|korean|pho|teriyaki|soy sauce|tempura|udon/i],
    items: [
      {
        id: 'asian-soy-sauce',
        question: 'Can the kitchen use gluten-free tamari instead of regular soy sauce?',
        note: 'Soy sauce, teriyaki, eel sauce, and marinades often contain wheat.',
        priority: 'high',
      },
      {
        id: 'asian-tempura',
        question: 'Are tempura, crispy toppings, and fried rolls prepared separately?',
        note: 'Batter and shared fryers are frequent risks.',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'mexican',
    patterns: [/mexican|taco|burrito|tortilla|quesadilla|enchilada|taqueria/i],
    items: [
      {
        id: 'mexican-tortillas',
        question: 'Are the tortillas 100% corn, and are they warmed away from flour tortillas?',
        note: 'Shared tortilla warmers and grills can transfer flour.',
        priority: 'high',
      },
      {
        id: 'mexican-chips',
        question: 'Are chips fried in a dedicated fryer?',
        note: 'Chips may share oil with breaded or flour items.',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'burger',
    patterns: [/burger|sandwich|deli|sub|bun|fries|fried chicken/i],
    items: [
      {
        id: 'burger-bun-grill',
        question: 'Can the burger or sandwich be made lettuce-wrapped or with a sealed GF bun?',
        note: 'Confirm the bun is stored and toasted separately.',
        priority: 'medium',
      },
      {
        id: 'burger-fries',
        question: 'Are fries cooked in oil that never touches breaded items?',
        note: 'A dedicated fryer matters more than the potato ingredients.',
        priority: 'high',
      },
    ],
  },
];

export function getDiningChecklist(
  restaurant: Restaurant,
  options: { strictCeliac?: boolean; safetyLevel?: MenuSafetyLevel } = {}
): DiningChecklistItem[] {
  const text = `${restaurant.name}\n${restaurant.rawMenuText ?? ''}\n${restaurant.gfMenu.join('\n')}`;
  const items = [...BASE_ITEMS];

  if (options.strictCeliac || options.safetyLevel === 'caution' || options.safetyLevel === 'unsafe') {
    items.unshift(STRICT_ITEM);
  }

  for (const rule of CUISINE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      items.push(...rule.items);
    }
  }

  return dedupeItems(items).slice(0, 7);
}

function dedupeItems(items: DiningChecklistItem[]): DiningChecklistItem[] {
  const seen = new Set<string>();
  const deduped: DiningChecklistItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}
