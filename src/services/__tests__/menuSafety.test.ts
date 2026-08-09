import { Restaurant } from '../../types/restaurant';
import { analyseMenuText, getRestaurantSafetyScore } from '../menuSafety';

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

describe('menuSafety', () => {
  it('scores menus with clear gluten-free evidence as safe', () => {
    const result = analyseMenuText('Menu\nGluten-free pasta\nCeliac friendly tacos');

    expect(result.overallSafety).toBe('safe');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.glutenFreeItems).toEqual(['Gluten-free pasta', 'Celiac friendly tacos']);
  });

  it('flags cross-contact language as caution even with GF options', () => {
    const result = analyseMenuText('Gluten-free pizza available. Prepared in same fryer and shared kitchen.');

    expect(result.overallSafety).toBe('caution');
    expect(result.score).toBeLessThan(75);
    expect(result.warnings).toContain('Cross-contamination risk detected');
  });

  it('combines menu analysis and user status for restaurant safety score', () => {
    const result = getRestaurantSafetyScore(
      restaurant({
        rawMenuText: 'Gluten-free bowl\nGluten-free salad',
        gfMenu: ['Gluten-free bowl', 'Gluten-free salad'],
        favoriteStatus: 'safe',
        rating: 4.8,
        menuScanStatus: 'SUCCESS',
      })
    );

    expect(result.level).toBe('safe');
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.reasons).toContain('Marked safe by you');
  });

  it('penalizes cross-contact language more in strict celiac mode', () => {
    const base = restaurant({
      rawMenuText: 'Gluten-free fries available. Same fryer used for breaded chicken.',
      gfMenu: ['Gluten-free fries available'],
      menuScanStatus: 'SUCCESS',
    });

    const normal = getRestaurantSafetyScore(base);
    const strict = getRestaurantSafetyScore(base, { strictCeliac: true });

    expect(strict.score).toBeLessThan(normal.score);
    expect(strict.reasons).toContain('Strict mode: cross-contact language detected');
  });

  it('does not assign a numeric safety score when menu evidence is unavailable', () => {
    const result = getRestaurantSafetyScore(
      restaurant({
        menuScanStatus: 'NO_MENU_CONTENT',
        rawMenuText: null,
        gfMenu: [],
      }),
    );

    expect(result.level).toBe('unknown');
    expect(result.score).toBeNull();
    expect(result.title).toBe('Needs verification');
    expect(result.reasons).toContain('No menu evidence available');
  });

  it('ignores stale AI analysis when the current menu scan has no usable content', () => {
    const result = getRestaurantSafetyScore(
      restaurant({
        menuScanStatus: 'NO_MENU_CONTENT',
        rawMenuText: null,
        gfMenu: [],
        aiAnalysisResult: {
          overallSafety: 'unsafe',
          score: 10,
          glutenFreeItems: [],
          warnings: ['Old warning'],
          crossContamRisk: 'Old risk',
          summary: 'Old analysis result',
        },
      }),
    );

    expect(result.level).toBe('unknown');
    expect(result.score).toBeNull();
    expect(result.summary).toBe('The page loaded, but no menu content was found.');
  });
});
