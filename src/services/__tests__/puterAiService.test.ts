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

  it('sends restaurant identity and bounded conversation context with chat questions', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Ask about the fryer.' } }] }),
    });

    await PuterAiService.askQuestion('Gluten-free pasta', 'What about the sauce?', undefined, {
      restaurantName: 'Pasta House',
      history: [
        { role: 'user', text: 'Is the pasta gluten-free?', timestamp: 1 },
        { role: 'model', text: 'The menu lists it as gluten-free.', timestamp: 2 },
      ],
    });

    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.messages[0].content).toContain('Pasta House');
    expect(body.messages[0].content).toContain('User: Is the pasta gluten-free?');
    expect(body.messages[0].content).toContain('What about the sauce?');
  });
});
