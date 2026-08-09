import {
  extractGfEvidence,
  extractRawMenuText,
  findMenuLink,
} from '../htmlUtils';

describe('htmlUtils', () => {
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

  it('excludes utility and cookie-consent text while preserving menu content', () => {
    const html = `
      <div class="menu-drawer__utility-name">hover.menu-drawer__utility-name</div>
      <div id="cookie-consent">Revoke Cookie Consent</div>
      <div aria-hidden="true">Hidden navigation label</div>
      <main>
        <h1>Menu</h1>
        <p>Gluten-free pasta</p>
      </main>
    `;

    const menuText = extractRawMenuText(html);

    expect(menuText).toContain('Gluten-free pasta');
    expect(menuText).not.toContain('menu-drawer__utility-name');
    expect(menuText).not.toContain('Revoke Cookie Consent');
    expect(menuText).not.toContain('Hidden navigation label');
  });

  it('filters standalone cookie-control phrases from extracted segments', () => {
    const html = `
      <main>
        <h1>Menu</h1>
        <p>Gluten-free pasta</p>
        <p>Revoke Cookie Consent</p>
      </main>
    `;

    const menuText = extractRawMenuText(html);

    expect(menuText).toContain('Gluten-free pasta');
    expect(menuText).not.toContain('Revoke Cookie Consent');
  });

  it('does not use CSS-like fallback text as menu content', () => {
    const html = `
      <div>OUR MENU Zyka .sZzeLbv .sTeeFV</div>
      <div>display: flex; font-family: sans-serif;</div>
    `;

    expect(extractRawMenuText(html)).toBe('');
  });

  it('decodes common and numeric HTML entities in menu text', () => {
    const html = `
      <main>
        <h1>Menu</h1>
        <p>Cr&egrave;me br&ucirc;l&eacute;e &amp; jalape&#241;o</p>
      </main>
    `;

    expect(extractRawMenuText(html)).toContain('Crème brûlée & jalapeño');
  });

  it('does not treat a generic homepage as menu content when no menu section is found', () => {
    const html = `
      <main>
        <h1>Welcome to our restaurant</h1>
        <p>Join us for events, catering, and private dining.</p>
      </main>
    `;

    expect(extractRawMenuText(html)).toBe('');
  });

  it('finds the first valid menu link and skips junk hrefs', () => {
    const html = `
      <a href="#menu">Jump</a>
      <a href="javascript:void(0)">Fake</a>
      <a href="/menu">View Menu</a>
    `;

    expect(findMenuLink(html, 'https://example.com/restaurants')).toBe('https://example.com/menu');
  });

  it('selects the strongest menu candidate instead of the first matching link', () => {
    const html = `
      <a href="/private-dining">Private Dining</a>
      <a href="/food">Food</a>
      <a href="/menu">Our Menu</a>
    `;

    expect(findMenuLink(html, 'https://example.com')).toBe('https://example.com/menu');
  });

  it('skips non-menu pages that contain menu-like keywords', () => {
    const html = `
      <a href="/privacy?topic=menu">Privacy</a>
      <a href="/events">Events and Dining</a>
      <a href="/menu">Menu</a>
    `;

    expect(findMenuLink(html, 'https://example.com')).toBe('https://example.com/menu');
  });

  it('rejects file links when the extension is followed by a query string', () => {
    const html = `
      <a href="/menu.pdf?download=1">PDF Menu</a>
      <a href="/menu">HTML Menu</a>
    `;

    expect(findMenuLink(html, 'https://example.com')).toBe('https://example.com/menu');
  });

  it('deduplicates menu links that differ only by a fragment', () => {
    const html = `
      <a href="/menu#lunch">Lunch</a>
      <a href="/menu#dinner">Dinner</a>
    `;

    expect(findMenuLink(html, 'https://example.com')).toBe('https://example.com/menu');
  });

  it('does not reject a menu path because a query parameter contains an excluded word', () => {
    const html = '<a href="/menu?category=delivery">Menu</a>';

    expect(findMenuLink(html, 'https://example.com')).toBe('https://example.com/menu?category=delivery');
  });
});
