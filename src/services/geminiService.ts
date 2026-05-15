import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../util/logger';

/**
 * Service to interact with Google Gemini AI for deep menu analysis
 * and interactive Celiac safety questions.
 */
export class GeminiService {
  private static genAI: GoogleGenerativeAI | null = null;
  private static modelName = 'gemini-1.5-flash';

  static init(apiKey: string) {
    if (!apiKey) return;
    this.genAI = new GoogleGenerativeAI(apiKey, { apiVersion: 'v1' });
  }

  /**
   * Performs a comprehensive analysis of a menu based on multiple dietary restrictions.
   */
  static async analyzeMenu(
    menuText: string, 
    options: { strictCeliac?: boolean; dairyFree?: boolean; nutFree?: boolean; soyFree?: boolean } = {}
  ): Promise<string> {
    if (!this.genAI) {
      throw new Error('Gemini API key is not configured.');
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction: `
          You are "FGluten AI", a strictly cautious dietary safety assistant. 
          Analyze restaurant menus for multiple safety requirements simultaneously.
          
          ALWAYS check for:
          1. Gluten-Free (Primary focus).
          ${options.dairyFree ? '2. Dairy-Free (User is highly sensitive to dairy/lactose).' : ''}
          ${options.nutFree ? '3. Nut-Free (User has a severe allergy to peanuts and tree nuts).' : ''}
          ${options.soyFree ? '4. Soy-Free (User avoids soy and soy-based ingredients).' : ''}
          
          RULES:
          - Be extremely conservative. 
          - Prioritize cross-contamination risks.
          - If the menu mentions shared equipment or a "shared kitchen", highlight it.
          - Identify specific items that are safe vs unsafe for ALL selected restrictions combined.
          
          OUTPUT FORMAT:
          You must respond with a JSON object ONLY. Do not include markdown blocks or preamble.
          {
            "overallSafety": "SAFE" | "CAUTION" | "UNSAFE",
            "summary": "...",
            "safeItems": ["..."],
            "warningItems": ["..."],
            "crossContamRisk": "...",
            "riskBreakdown": [
              { "factor": "Shared Equipment", "severity": 0.0 to 1.0, "description": "..." },
              { "factor": "Ingredient Quality", "severity": 0.0 to 1.0, "description": "..." },
              { "factor": "Kitchen Procedures", "severity": 0.0 to 1.0, "description": "..." }
            ]
          }
        `,
      });

      const prompt = `
        ANALYSIS REQUEST:
        Analyze the following menu text for:
        - Gluten-Free (Mandatory)
        ${options.dairyFree ? '- Dairy-Free' : ''}
        ${options.nutFree ? '- Nut-Free' : ''}
        ${options.soyFree ? '- Soy-Free' : ''}

        MENU TEXT:
        """
        ${menuText}
        """
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Clean up potential markdown formatting if Gemini includes it
      return text.replace(/```json|```/gi, '').trim();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Gemini deep analysis failed: ${message}`);
      throw new Error(`AI Deep Analysis failed: ${message}`);
    }
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
