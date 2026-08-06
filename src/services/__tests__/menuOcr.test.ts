import { extractMenuTextFromImage } from '../menuOcr';

describe('menuOcr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('extracts normalized text from fullTextAnnotation', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [
          {
            fullTextAnnotation: {
              text: 'Menu\r\nGluten-free pasta   \n\n\nCeliac friendly tacos',
            },
          },
        ],
      }),
    });

    await expect(extractMenuTextFromImage({ base64: 'abc123', apiKey: 'vision-key' })).resolves.toBe(
      'Menu\nGluten-free pasta\n\nCeliac friendly tacos'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://vision.googleapis.com/v1/images:annotate?key=vision-key',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"content":"abc123"'),
      })
    );
  });

  it('falls back to textAnnotations description', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        responses: [
          {
            textAnnotations: [{ description: 'GF salad bowl' }],
          },
        ],
      }),
    });

    await expect(extractMenuTextFromImage({ base64: 'abc123', apiKey: 'vision-key' })).resolves.toBe(
      'GF salad bowl'
    );
  });

  it('requires a Vision API key', async () => {
    await expect(extractMenuTextFromImage({ base64: 'abc123', apiKey: '' })).rejects.toThrow(
      'Vision API key is missing.'
    );
  });

  it('reports when no text is found', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [{}] }),
    });

    await expect(extractMenuTextFromImage({ base64: 'abc123', apiKey: 'vision-key' })).rejects.toThrow(
      'No readable menu text was found in that image.'
    );
  });
});
