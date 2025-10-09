import { GoogleGenAI, Type } from "@google/genai";
import type { AISuggestion, Tag } from '../types';
import { METRICS } from '../constants';

// CRITICAL FIX: In Vite, client-side environment variables must be accessed via `import.meta.env`
// and must be prefixed with `VITE_`. Use optional chaining (?.) to prevent crashes if `env` is not defined.
const apiKey = (import.meta as any)?.env?.VITE_API_KEY;

// Initialize AI client only if the API key exists.
const ai = apiKey ? new GoogleGenAI({apiKey: apiKey}) : null;

const getPrompt = (existingTags: Tag[] = []) => `You are an expert soccer analyst. Analyze the following sequence of frames from a soccer match.
The frames represent the last 15-20 seconds of play. Your task is to identify key plays and tag them according to a predefined list of metrics.

Metrics list:
${METRICS.join('\n')}

Here are the tags that have already been created for this match. Do not suggest duplicates.
${existingTags.map(t => `- ${[t.accion, t.resultado].filter(Boolean).join(' ')} at ${t.timestamp.toFixed(2)}s`).join('\n')}

For each significant play you identify, provide the following information in a JSON object:
- timestamp: The approximate minute and second of the play (e.g., "01:25").
- action: The exact metric from the list provided.
- description: A brief, objective description of the play and the player involved (e.g., "Player in blue shirt #7 makes a successful short offensive pass.").

Return your findings as a JSON array of these objects. Ensure the JSON is well-formed. If no new significant plays are found, return an empty array.
`;

export const analyzeVideoFrames = async (
    base64Frames: { data: string; mimeType: string }[],
    existingTags: Tag[]
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
        
        const prompt = getPrompt(existingTags);

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
                        },
                        required: ["timestamp", "action", "description"]
                    }
                }
            }
        });

        const jsonString = response.text.trim();
        const suggestions: AISuggestion[] = JSON.parse(jsonString);
        return suggestions;
    } catch (error) {
        console.error('Error analyzing video with Gemini:', error);
        alert(`An error occurred during AI analysis: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
};