import { logger } from '../util/logger';

/**
 * Service to interact with Puter.js AI for deep menu analysis
 * and interactive Celiac safety questions.
 */
export class GeminiService {
  private static apiKey: string | null = null;
  private static baseUrl = 'https://api.puter.com/v1/ai/chat';

  static init(apiKey: string) {
    // Puter might not need the Gemini key, but we'll store it in case 
    // we use a Puter-compatible proxy or token.
    this.apiKey = apiKey;
  }

  /**
   * Performs a comprehensive analysis of a menu using Puter AI.
   */
  static async analyzeMenu(
    menuText: string, 
    options: { strictCeliac?: boolean; dairyFree?: boolean; nutFree?: boolean; soyFree?: boolean } = {}
  ): Promise<string> {
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

      // Using Puter's free AI endpoint
      // Note: In a production app, you'd use your Puter API Key here.
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': `Bearer ${this.apiKey}` // Uncomment if using a Puter Token
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Puter often supports gpt-4o-mini for free
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`Puter API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.message?.content || '';
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
    try {
      const prompt = `
        You are "FGluten AI", a strictly cautious Celiac Disease dining assistant. 
        MENU: "${menuText}"
        QUESTION: "${question}"
        Rules: Be conservative. Use emojis ✅, ⚠️, ❌.
      `;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok) throw new Error(`Puter API error: ${response.status}`);
      const data = await response.json();
      return data.message?.content || '';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Puter chat failed: ${message}`);
      throw new Error(`AI Chat failed: ${message}`);
    }
  }
}
