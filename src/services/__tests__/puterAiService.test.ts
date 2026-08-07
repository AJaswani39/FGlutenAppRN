import { PuterAiService } from '../puterAiService';

describe('PuterAiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    PuterAiService.init('test-token', '');
  });

  it('reports malformed analysis responses instead of returning empty text', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{}] }),
    });

    await expect(PuterAiService.analyzeMenu('Gluten-free pasta')).rejects.toThrow(
      'AI Analysis failed: AI response did not include text.'
    );
  });

  it('reports malformed chat responses instead of returning empty text', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{}] }),
    });

    await expect(PuterAiService.askQuestion('Gluten-free pasta', 'Is this safe?')).rejects.toThrow(
      'AI Chat failed: AI response did not include text.'
    );
  });
});
