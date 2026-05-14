import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../util/logger';

/**
 * Service to interact with Google Gemini AI for deep menu analysis
 * and interactive Celiac safety questions.
 */
export class GeminiService {
  private static genAI: GoogleGenerativeAI | null = null;
  private static modelName = 'gemini-1.5-flash'; // Fast and has a generous free tier

  static init(apiKey: string) {
    if (!apiKey) return;
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Asks a specific question about a menu's gluten-free safety.
   */
  static async askQuestion(menuText: string, question: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini API key is not configured.');
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction: `
          You are "FGluten AI", a strictly cautious Celiac Disease dining assistant. 
          Your goal is to analyze restaurant menus for gluten-free safety.
          
          RULES:
          1. Be extremely conservative. If an ingredient is suspicious (e.g., "miso", "soy sauce", "malt"), warn the user.
          2. Prioritize cross-contamination risks (shared fryers, flour in the air).
          3. If the user asks if something is safe and you aren't 100% sure, say "I cannot confirm this is safe without more information from the staff."
          4. Keep answers concise but informative.
          5. Use emojis to highlight safety levels: ✅ (Safe), ⚠️ (Caution), ❌ (Avoid).
        `,
      });

      const prompt = `
        MENU TEXT:
        """
        ${menuText}
        """

        USER QUESTION:
        "${question}"
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Gemini analysis failed: ${message}`);
      throw new Error(`AI Analysis failed: ${message}`);
    }
  }
}
