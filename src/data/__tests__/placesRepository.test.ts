import {
  distanceBetween,
  extractGfEvidence,
  extractRawMenuText,
  findMenuLink,
} from '../placesRepository';

describe('placesRepository helpers', () => {
  it('extracts gluten-free evidence from single-line html without duplicates', () => {
    const html =
      '<div><p>Menu</p><p>Gluten-Free Pizza</p><p>gluten free pizza</p><p>Celiac friendly pasta</p></div>';

    expect(extractGfEvidence(html)).toEqual(['Gluten-Free Pizza', 'Celiac friendly pasta']);
  });

  it('extracts the menu-focused text block', () => {
    const html = `
      <section>
        <h1>Welcome</h1>
        <p>About our restaurant</p>
        <h2>Menu</h2>
        <p>Appetizer</p>
        <p>Gluten-free buns available</p>
      </section>
    `;

    expect(extractRawMenuText(html)).toContain('Menu');
    expect(extractRawMenuText(html)).toContain('Gluten-free buns available');
  });

  it('finds the first valid menu link and skips junk hrefs', () => {
    const html = `
      <a href="#menu">Jump</a>
      <a href="javascript:void(0)">Fake</a>
      <a href="/menu">View Menu</a>
    `;

    expect(findMenuLink(html, 'https://example.com/restaurants')).toBe('https://example.com/menu');
  });

  it('calculates geographic distance', () => {
    expect(distanceBetween(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 5);
    expect(distanceBetween(40.7128, -74.006, 40.7138, -74.006)).toBeGreaterThan(100);
  });
});
