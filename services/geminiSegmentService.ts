import { GoogleGenAI, Type } from "@google/genai";
import type { AISuggestion, Tag } from '../types';
import { METRICS } from '../constants';

const env = (import.meta as any).env;
const apiKey = env.VITE_API_KEY 
    || env.VITE_GEMINI_API_KEY 
    || env.GEMINI_API_KEY 
    || '';

const ai = apiKey ? new GoogleGenAI({apiKey: apiKey}) : null;

const getSegmentPrompt = (startTime: number, endTime: number, existingTags: Tag[] = []) => `Eres un analista experto de fútbol. Analiza la siguiente secuencia de frames de un partido de fútbol.

Los frames representan el segmento del minuto ${Math.floor(startTime/60)}:${String(Math.floor(startTime%60)).padStart(2,'0')} al minuto ${Math.floor(endTime/60)}:${String(Math.floor(endTime%60)).padStart(2,'0')} del partido.
Los frames están ordenados cronológicamente, con 1 segundo de diferencia entre cada uno.

Tu tarea es identificar TODAS las jugadas significativas y etiquetarlas según la lista de métricas predefinida.

IMPORTANTE: 
- Cada frame representa 1 segundo del video
- Presta atención a secuencias de frames para detectar el RESULTADO de cada acción (logrado/fallado)
- Un pase es "logrado" si en los frames siguientes un compañero recibe el balón
- Un pase es "fallado" si en los frames siguientes el rival intercepta o el balón sale
- Un 1vs1 ofensivo es "logrado" si el jugador supera al defensor
- Un 1vs1 defensivo es "logrado" si el defensor recupera el balón o bloquea

Lista de métricas (usar EXACTAMENTE estos nombres):
${METRICS.join('\n')}

Jugadas ya etiquetadas en este partido (NO sugerir duplicados):
${existingTags.filter(t => t.timestamp >= startTime && t.timestamp <= endTime).map(t => `- ${t.accion} ${t.resultado ? '(' + t.resultado + ')' : ''} en ${Math.floor(t.timestamp/60)}:${String(Math.floor(t.timestamp%60)).padStart(2,'0')}`).join('\n') || 'Ninguna'}

Para cada jugada identificada, proporciona:
- timestamp: El minuto y segundo aproximado de la jugada (formato "MM:SS", ejemplo: "05:23")
- action: El nombre EXACTO de la métrica de la lista (incluyendo logrado/fallado si aplica)
- description: Descripción breve de la jugada y el jugador involucrado (color de camiseta, número si visible)

Devuelve tus hallazgos como un array JSON. Si no encuentras jugadas significativas, devuelve un array vacío.
`;

export interface SegmentAnalysisProgress {
    phase: 'extracting' | 'analyzing' | 'complete';
    framesExtracted: number;
    totalFrames: number;
    message: string;
}

export const analyzeVideoSegment = async (
    base64Frames: { data: string; mimeType: string; timestamp: number }[],
    startTime: number,
    endTime: number,
    existingTags: Tag[],
    onProgress?: (progress: SegmentAnalysisProgress) => void
): Promise<AISuggestion[]> => {
    if (!ai) {
        const message = "La clave de API de Gemini no está configurada. Verifica tu variable VITE_API_KEY.";
        console.error(message);
        alert(message);
        return [];
    }
    
    if (base64Frames.length === 0) {
        alert("No se pudieron extraer frames del segmento seleccionado.");
        return [];
    }
    
    onProgress?.({
        phase: 'analyzing',
        framesExtracted: base64Frames.length,
        totalFrames: base64Frames.length,
        message: `Analizando ${base64Frames.length} frames con Gemini...`
    });
    
    try {
        const imageParts = base64Frames.map(frame => ({
            inlineData: {
                mimeType: frame.mimeType,
                data: frame.data,
            },
        }));
        
        const prompt = getSegmentPrompt(startTime, endTime, existingTags);

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
        
        onProgress?.({
            phase: 'complete',
            framesExtracted: base64Frames.length,
            totalFrames: base64Frames.length,
            message: `Análisis completado. ${suggestions.length} jugadas encontradas.`
        });
        
        return suggestions;
    } catch (error) {
        console.error('Error analyzing segment with Gemini:', error);
        alert(`Error durante el análisis: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
};

export const extractFramesFromSegment = async (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    startTime: number,
    endTime: number,
    framesPerSecond: number = 1,
    onProgress?: (progress: SegmentAnalysisProgress) => void
): Promise<{ data: string; mimeType: string; timestamp: number }[]> => {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('No se pudo obtener contexto del canvas');
    }
    
    const duration = endTime - startTime;
    const totalFrames = Math.floor(duration * framesPerSecond);
    const frameInterval = 1 / framesPerSecond;
    
    const frames: { data: string; mimeType: string; timestamp: number }[] = [];
    
    video.pause();
    
    for (let i = 0; i < totalFrames; i++) {
        const currentTime = startTime + (i * frameInterval);
        video.currentTime = currentTime;
        
        await new Promise(r => setTimeout(r, 150));
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
        if (blob) {
            const base64 = await blobToBase64(blob);
            if (base64) {
                frames.push({ 
                    data: base64, 
                    mimeType: 'image/jpeg',
                    timestamp: currentTime
                });
            }
        }
        
        onProgress?.({
            phase: 'extracting',
            framesExtracted: i + 1,
            totalFrames: totalFrames,
            message: `Extrayendo frames: ${i + 1}/${totalFrames}`
        });
    }
    
    return frames;
};

async function blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
    });
}
