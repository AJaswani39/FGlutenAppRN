import { Restaurant } from '../../types/restaurant';
import { getDiningChecklist } from '../diningChecklist';

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'place',
    name: 'Cafe',
    address: '123 Main',
    latitude: 1,
    longitude: 2,
    rating: null,
    openNow: null,
    hasGFMenu: false,
    gfMenu: [],
    distanceMeters: 0,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'NOT_STARTED',
    menuScanTimestamp: 0,
    favoriteStatus: null,
    ...overrides,
  };
}

describe('diningChecklist', () => {
  it('includes core cross-contact questions for every restaurant', () => {
    const checklist = getDiningChecklist(restaurant());

    expect(checklist.map((item) => item.id)).toEqual(
      expect.arrayContaining(['dedicated-prep', 'dedicated-fryer', 'sauces-marinades'])
    );
  });

  it('adds strict celiac protocol questions in strict mode', () => {
    const checklist = getDiningChecklist(restaurant(), { strictCeliac: true });

    expect(checklist[0]).toMatchObject({
      id: 'celiac-protocol',
      priority: 'high',
    });
  });

  it('adds Italian-specific pasta and pizza prompts', () => {
    const checklist = getDiningChecklist(
      restaurant({
        name: 'Bella Trattoria',
        rawMenuText: 'Gluten-free pasta and pizza available',
      })
    );

    expect(checklist.map((item) => item.id)).toEqual(
      expect.arrayContaining(['italian-pasta-water', 'italian-pizza-surface'])
    );
  });

  it('adds Asian-specific soy sauce prompts from menu text', () => {
    const checklist = getDiningChecklist(
      restaurant({
        name: 'City Grill',
        rawMenuText: 'Sushi rolls, tempura, and teriyaki bowls',
      })
    );

    expect(checklist.map((item) => item.id)).toEqual(
      expect.arrayContaining(['asian-soy-sauce', 'asian-tempura'])
    );
  });

  it('adds caution protocol questions for risky safety levels', () => {
    const checklist = getDiningChecklist(restaurant(), { safetyLevel: 'caution' });

    expect(checklist.map((item) => item.id)).toContain('celiac-protocol');
  });
});
