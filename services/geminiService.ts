import { GoogleGenAI, Type } from "@google/genai";
import type { AISuggestion, Tag, Player } from '../types';
import { METRICS } from '../constants';
import type { LearningContext } from './aiLearningService';

const apiKey = (import.meta as any)?.env?.VITE_API_KEY;
const ai = apiKey ? new GoogleGenAI({apiKey: apiKey}) : null;

/**
 * Genera un prompt enriquecido con contexto de aprendizaje
 */
const getEnhancedPrompt = (
  existingTags: Tag[] = [], 
  context?: LearningContext,
  players?: Player[],
  currentTimestamp?: number
) => {
  let prompt = `You are an expert soccer analyst with deep learning from previous matches. Analyze the following sequence of frames from a soccer match.

The frames represent the last 15-20 seconds of play. Your task is to identify key plays and tag them according to a predefined list of metrics.

## METRICS LIST:
${METRICS.join('\n')}

## CURRENT MATCH TAGS (already created - DO NOT DUPLICATE):
${existingTags.map(t => `- ${[t.accion, t.resultado].filter(Boolean).join(' ')} at ${formatSeconds(t.timestamp)} by ${getPlayerName(t.player_id, players)}`).join('\n')}
`;

  // Agregar contexto de aprendizaje si está disponible
  if (context) {
    prompt += `\n## LEARNED PATTERNS FROM PREVIOUS MATCHES:

### Most Common Actions (your training data):
${Object.entries(context.actionFrequency)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([action, count]) => `- ${action}: ${count} times`)
  .join('\n')}

### Team Success Rates by Action:
${context.teamPatterns
  .sort((a, b) => b.successRate - a.successRate)
  .slice(0, 8)
  .map(p => `- ${p.action}: ${(p.successRate * 100).toFixed(1)}% success rate (${p.timingPattern} game)`)
  .join('\n')}

### Player Specializations:
${Object.entries(context.playerPreferences)
  .slice(0, 5)
  .map(([playerId, actions]) => `- ${getPlayerName(playerId, players)}: commonly performs ${actions.slice(0, 3).join(', ')}`)
  .join('\n')}

### Sequential Patterns (actions that often follow each other):
${context.temporalPatterns
  .slice(0, 5)
  .map(p => `- After "${p.action}", typically see: ${p.followUpActions.join(', ')}`)
  .join('\n')}

### AI Learning Progress:
- Current accuracy: ${(context.successRate * 100).toFixed(1)}%
- Total historical plays analyzed: ${context.historicalTags.length}
`;

    if (currentTimestamp !== undefined) {
      const phase = currentTimestamp < 1500 ? 'early' : currentTimestamp > 3600 ? 'late' : 'mid';
      prompt += `\n### Current Game Phase: ${phase} game (${formatSeconds(currentTimestamp)})
- Expect more actions typical of ${phase} game based on learned patterns
`;
    }
  }

  prompt += `\n## ANALYSIS INSTRUCTIONS:

1. **Focus on Team Patterns**: Based on learned data, prioritize detecting actions that are common for this team
2. **Consider Player Roles**: Assign actions to players based on their typical behavior patterns
3. **Temporal Context**: Consider what actions typically happen at this point in the game
4. **Sequential Logic**: If you detected an action, consider what commonly follows it
5. **Quality over Quantity**: Only suggest plays you're confident about (>70% certainty)

## OUTPUT FORMAT:

For each significant play you identify, provide a JSON object with:
- timestamp: Approximate time in "MM:SS" format (e.g., "01:25")
- action: EXACT metric from the list above (must match exactly)
- description: Brief objective description mentioning jersey color/number if visible
- confidence: Your confidence level (0.0 to 1.0)
- reasoning: Brief explanation of why you identified this action based on learned patterns

Return a JSON array of these objects. If no new significant plays are found, return an empty array.

**CRITICAL**: Only suggest actions from the metrics list. Do not invent new actions.
`;

  return prompt;
};

const formatSeconds = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const getPlayerName = (playerId: string | undefined, players?: Player[]): string => {
  if (!playerId || !players) return 'Unknown';
  const player = players.find(p => p.id === playerId);
  return player ? `${player.nombre} (#${player.numero})` : 'Unknown';
};

/**
 * Analiza frames de video con contexto de aprendizaje mejorado
 */
export const analyzeVideoFrames = async (
  base64Frames: { data: string; mimeType: string }[],
  existingTags: Tag[],
  context?: LearningContext,
  players?: Player[],
  currentTimestamp?: number
): Promise<AISuggestion[]> => {
  if (!ai) {
    const message = "Gemini API key is not configured. Please check your VITE_API_KEY environment variable.";
    console.error(message);
    alert(message);
    return [];
  }
  
  try {
    const imageParts = base64Frames.map(frame => ({
      inlineData: {
        mimeType: frame.mimeType,
        data: frame.data,
      },
    }));
    
    const prompt = getEnhancedPrompt(existingTags, context, players, currentTimestamp);

    console.log('🧠 AI Analysis with learning context:', {
      historicalPlays: context?.historicalTags.length || 0,
      teamPatterns: context?.teamPatterns.length || 0,
      successRate: context?.successRate ? `${(context.successRate * 100).toFixed(1)}%` : 'N/A'
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: { parts: [{ text: prompt }, ...imageParts] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timestamp: { type: Type.STRING },
              action: { type: Type.STRING },
              description: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              reasoning: { type: Type.STRING }
            },
            required: ["timestamp", "action", "description"]
          }
        }
      }
    });

    const jsonString = response.text.trim();
    const suggestions: (AISuggestion & { confidence?: number; reasoning?: string })[] = JSON.parse(jsonString);
    
    // Filtrar sugerencias de baja confianza
    const filteredSuggestions = suggestions.filter(s => !s.confidence || s.confidence >= 0.7);
    
    console.log(`✅ AI suggested ${filteredSuggestions.length} plays (filtered from ${suggestions.length} total)`);
    
    return filteredSuggestions;
  } catch (error) {
    console.error('Error analyzing video with Gemini:', error);
    alert(`An error occurred during AI analysis: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
};
