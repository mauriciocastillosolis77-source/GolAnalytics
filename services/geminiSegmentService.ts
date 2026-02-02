import type { AISuggestion, Tag } from '../types';
import { METRICS } from '../constants';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function getApiKey(): string {
    if (typeof window === 'undefined') {
        throw new Error('Gemini client can only be used in browser');
    }
    const env = (import.meta as any).env;
    const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('La clave de API de Gemini no está configurada. Verifica VITE_API_KEY.');
    }
    return apiKey;
}

const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getSegmentPrompt = (startTime: number, endTime: number, existingTags: Tag[] = [], teamName?: string, hasTeamUniform?: boolean, frameTimestamps?: number[]) => {
    const frameMapping = frameTimestamps 
        ? frameTimestamps.map((ts, idx) => `Frame ${idx + 1} = ${formatTimestamp(ts)}`).join(', ')
        : '';
    
    return `Eres un analista experto de fútbol. Analiza la siguiente secuencia de frames de un partido de fútbol.

Los frames representan el segmento del ${formatTimestamp(startTime)} al ${formatTimestamp(endTime)} del partido.

${hasTeamUniform ? `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    FILTRO DE EQUIPO - MÁXIMA PRIORIDAD                        ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║ La PRIMERA imagen adjunta muestra el UNIFORME del equipo a analizar.          ║
║ ${teamName ? `Equipo: ${teamName}` : 'Analiza SOLO este equipo.'}                                                        ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║ ANTES de incluir CUALQUIER jugada, VERIFICA:                                  ║
║ 1. ¿El jugador lleva el MISMO uniforme de la primera imagen?                  ║
║ 2. Si NO → DESCARTA la jugada inmediatamente                                  ║
║ 3. Si SÍ → Incluye la jugada                                                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║ EJEMPLOS DE DESCARTE:                                                         ║
║ - Uniforme de referencia: RAYAS → Jugador con camiseta LISA → DESCARTAR       ║
║ - Uniforme de referencia: AMARILLO → Jugador con camiseta ROJA → DESCARTAR    ║
║ - Uniforme de referencia: OSCURO → Jugador con camiseta CLARA → DESCARTAR     ║
║                                                                               ║
║ Las jugadas del equipo RIVAL son INVISIBLES para ti. NO EXISTEN.              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
` : ''}

MAPEO EXACTO DE FRAMES A TIMESTAMPS:
${frameMapping || 'Los frames están ordenados cronológicamente.'}
${hasTeamUniform ? 'NOTA: El primer frame es la imagen del uniforme de referencia, NO es parte del video.' : ''}

Tu tarea es identificar TODAS las jugadas significativas${hasTeamUniform ? ' DEL EQUIPO INDICADO' : ''} y etiquetarlas según la lista de métricas predefinida.

REGLAS CRÍTICAS DE TIMESTAMPS:
- USA EXACTAMENTE el timestamp del frame donde ocurre la jugada según el mapeo de arriba
- NO inventes timestamps - solo usa los que corresponden a los frames que ves
- Si una jugada ocurre entre el Frame 3 y Frame 4, usa el timestamp del Frame 3 (cuando inicia la acción)

REGLAS CRÍTICAS DEL RESULTADO (logrado/fallado):
- SIEMPRE incluye "logrado" o "fallado" en el nombre de la acción cuando aplique
- Un pase es "logrado" si en los frames siguientes un compañero del mismo equipo recibe el balón
- Un pase es "fallado" si en los frames siguientes el rival intercepta o el balón sale
- Un 1vs1 ofensivo es "logrado" si el jugador supera al defensor
- Un 1vs1 defensivo es "logrado" si el defensor recupera el balón o bloquea
- Si no puedes determinar el resultado, analiza los frames siguientes cuidadosamente
- NUNCA devuelvas acciones sin el resultado cuando la métrica lo requiere

${hasTeamUniform ? `FILTRO DE EQUIPO - VERIFICACIÓN OBLIGATORIA:
- Para CADA jugada que vayas a reportar, PRIMERO verifica el uniforme del jugador
- Si el uniforme NO coincide con la primera imagen → NO incluyas esa jugada
- Si el uniforme SÍ coincide con la primera imagen → Incluye la jugada
- El equipo rival NO EXISTE para este análisis, ignora todas sus acciones
- PENALIZACIÓN: Incluir jugadas del rival es un ERROR GRAVE` : ''}

OTRAS REGLAS:
- BUSCA ACTIVAMENTE todas las jugadas: pases, duelos, recuperaciones, pérdidas, tiros, etc.
- NO omitas jugadas solo porque parecen rutinarias - queremos TODAS las acciones del equipo
- Analiza TODO el segmento de video, no solo los primeros frames

Lista de métricas (USAR EXACTAMENTE estos nombres, incluyendo "logrado"/"fallado"):
${METRICS.join('\n')}

Jugadas ya etiquetadas en este partido (NO sugerir duplicados):
${existingTags.filter(t => t.timestamp >= startTime && t.timestamp <= endTime).map(t => `- ${t.accion} ${t.resultado ? '(' + t.resultado + ')' : ''} en ${formatTimestamp(t.timestamp)}`).join('\n') || 'Ninguna'}

Para cada jugada identificada, proporciona:
- timestamp: El minuto y segundo EXACTO de la jugada (formato "MM:SS") - USA el mapeo de frames de arriba
- action: El nombre EXACTO de la métrica de la lista (incluyendo logrado/fallado si aplica)
- description: Descripción breve de la jugada y el jugador involucrado (color de camiseta, número si visible)

Devuelve tus hallazgos como un array JSON. Si no encuentras jugadas significativas, devuelve un array vacío.
`;
};

export interface SegmentAnalysisProgress {
    phase: 'extracting' | 'analyzing' | 'complete';
    framesExtracted: number;
    totalFrames: number;
    message: string;
}

export interface TeamUniformContext {
    uniformBase64: string;
    uniformMimeType: string;
    teamName?: string;
}

export const analyzeVideoSegment = async (
    base64Frames: { data: string; mimeType: string; timestamp: number }[],
    startTime: number,
    endTime: number,
    existingTags: Tag[],
    onProgress?: (progress: SegmentAnalysisProgress) => void,
    teamUniformContext?: TeamUniformContext
): Promise<AISuggestion[]> => {
    const apiKey = getApiKey();
    
    if (base64Frames.length === 0) {
        throw new Error("No se pudieron extraer frames del segmento seleccionado.");
    }
    
    const hasTeamUniform = !!teamUniformContext?.uniformBase64;
    
    onProgress?.({
        phase: 'analyzing',
        framesExtracted: base64Frames.length,
        totalFrames: base64Frames.length,
        message: hasTeamUniform 
            ? `Analizando ${base64Frames.length} frames con filtro de equipo...`
            : `Analizando ${base64Frames.length} frames con Gemini...`
    });
    
    const imageParts: any[] = [];
    
    if (hasTeamUniform && teamUniformContext) {
        imageParts.push({
            inline_data: {
                mime_type: teamUniformContext.uniformMimeType,
                data: teamUniformContext.uniformBase64,
            },
        });
    }
    
    imageParts.push(...base64Frames.map(frame => ({
        inline_data: {
            mime_type: frame.mimeType,
            data: frame.data,
        },
    })));
    
    const frameTimestamps = base64Frames.map(f => f.timestamp);
    const prompt = getSegmentPrompt(startTime, endTime, existingTags, teamUniformContext?.teamName, hasTeamUniform, frameTimestamps);

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                ...imageParts
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        timestamp: { type: "STRING" },
                        action: { type: "STRING" },
                        description: { type: "STRING" },
                    },
                    required: ["timestamp", "action", "description"]
                }
            }
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        throw new Error(`Error de Gemini API: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const suggestions: AISuggestion[] = JSON.parse(text.trim());
    
    onProgress?.({
        phase: 'complete',
        framesExtracted: base64Frames.length,
        totalFrames: base64Frames.length,
        message: `Análisis completado. ${suggestions.length} jugadas encontradas.`
    });
    
    return suggestions;
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

