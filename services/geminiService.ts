import { GoogleGenAI, Type } from "@google/genai";
import type { AISuggestion, Tag } from '../types';
import { METRICS } from '../constants';

// IMPORTANT: This service requires a Gemini API Key provided via an environment variable.
// FIX: In Vite projects, environment variables exposed to the client must be accessed via `import.meta.env`.
// FIX: Corrected TypeScript error "Property 'env' does not exist on type 'ImportMeta'".
const apiKey = (import.meta as any)?.env?.VITE_API_KEY;

if (!apiKey) {
    // FIX: Updated warning to refer to the correct environment variable name for Vite.
    console.warn('Gemini API Key not found. AI features will not work. Please provide it in your environment variables as VITE_API_KEY.');
}

// Initialize with a check for apiKey to prevent crashing if it's missing.
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;


const getPrompt = (existingTags: Tag[] = []) => `You are an expert soccer analyst. Analyze the following sequence of frames from a soccer match.
The frames represent the last 15-20 seconds of play. Your task is to identify key plays and tag them according to a predefined list of metrics.

Metrics list:
${METRICS.join('\n')}

Here are the tags that have already been created for this match. Do not suggest duplicates.
${/* FIX: Use `t.accion` and `t.resultado` to construct the full action name, as `t.action` does not exist on the Tag type. */ existingTags.map(t => `- ${[t.accion, t.resultado].filter(Boolean).join(' ')} at ${t.timestamp.toFixed(2)}s`).join('\n')}

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
        alert("Gemini API Key not configured. AI analysis is disabled.");
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