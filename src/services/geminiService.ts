import { logger } from '../util/logger';

/**
 * Service to interact with Puter.js AI for deep menu analysis.
 * Uses Puter's OpenAI-compatible stable endpoint.
 */
export class GeminiService {
  private static apiKey: string | null = null;
  // Puter's OpenAI-compatible endpoint
  private static baseUrl = 'https://api.puter.com/puterai/openai/v1/chat/completions';
  // Puter's gpt-4o-mini identifier
  private static modelName = 'openai/gpt-4o-mini';

  static init(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Performs a comprehensive analysis of a menu using Puter AI.
   */
  static async analyzeMenu(
    menuText: string, 
    options: { strictCeliac?: boolean; dairyFree?: boolean; nutFree?: boolean; soyFree?: boolean } = {}
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Puter Auth Token is missing. Please add it to your .env file.');
    }

    try {
      const prompt = `
        You are "FGluten AI", a strictly cautious dietary safety assistant. 
        Analyze restaurant menus for multiple safety requirements simultaneously.
        
        REQUIREMENTS:
        1. Gluten-Free (Primary focus).
        ${options.dairyFree ? '2. Dairy-Free' : ''}
        ${options.nutFree ? '3. Nut-Free' : ''}
        ${options.soyFree ? '4. Soy-Free' : ''}
        
        RULES:
        - Be extremely conservative. 
        - Identify cross-contamination risks.
        - OUTPUT ONLY A VALID JSON OBJECT. NO PREAMBLE.
        
        JSON FORMAT:
        {
          "overallSafety": "SAFE" | "CAUTION" | "UNSAFE",
          "summary": "...",
          "safeItems": ["..."],
          "warningItems": ["..."],
          "crossContamRisk": "...",
          "riskBreakdown": [
            { "factor": "Shared Equipment", "severity": 0.5, "description": "..." },
            { "factor": "Ingredient Quality", "severity": 0.3, "description": "..." },
            { "factor": "Kitchen Procedures", "severity": 0.2, "description": "..." }
          ]
        }

        MENU TEXT:
        "${menuText}"
      `;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Puter API error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      return text.replace(/```json|```/gi, '').trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Puter analysis failed: ${message}`);
      throw new Error(`AI Analysis failed: ${message}`);
    }
  }

  /**
   * Asks a specific question.
   */
  static async askQuestion(menuText: string, question: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Puter Auth Token is missing.');
    }

    try {
      const prompt = `
        You are "FGluten AI", a strictly cautious Celiac Disease dining assistant. 
        MENU: "${menuText}"
        QUESTION: "${question}"
        Rules: Be conservative. Use emojis ✅, ⚠️, ❌.
      `;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) throw new Error(`Puter API error: ${response.status}`);
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Puter chat failed: ${message}`);
      throw new Error(`AI Chat failed: ${message}`);
    }
  }
}
