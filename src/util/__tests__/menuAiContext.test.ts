import { buildMenuAiContext } from '../menuAiContext';

describe('buildMenuAiContext', () => {
  it('leaves short menu text unchanged', () => {
    expect(buildMenuAiContext('Gluten-free pasta\n$18')).toBe('Gluten-free pasta\n$18');
  });

  it('prioritizes dietary evidence and priced menu items within the character budget', () => {
    const marketing = 'Welcome to our restaurant. '.repeat(20);
    const result = buildMenuAiContext(
      `${marketing}\nGluten-free pasta $18\nShared fryer warning\nBurger $14\n${marketing}`,
      80
    );

    expect(result).toContain('Gluten-free pasta $18');
    expect(result).toContain('Shared fryer warning');
    expect(result).toContain('Burger $14');
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it('falls back to a bounded prefix for one unbroken text block', () => {
    expect(buildMenuAiContext('a'.repeat(30), 12)).toBe('a'.repeat(12));
  });
});
