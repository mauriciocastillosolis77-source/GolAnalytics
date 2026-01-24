import type { Tag, Match, Player } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function getApiKey(): string {
    if (typeof window === 'undefined') {
        throw new Error('Gemini client can only be used in browser');
    }
    const env = (import.meta as any).env;
    const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('Gemini API key not configured. Check VITE_API_KEY.');
    }
    return apiKey;
}

export interface PerformanceAnalysis {
    tendencia: 'mejorando' | 'estable' | 'bajando';
    tendenciaDescripcion: string;
    fortalezas: string[];
    areasDeMejora: string[];
    comparativoProfesional: {
        posicion: string;
        metricasReferencia: string[];
        analisis: string;
    };
    resumenGeneral: string;
}

interface JornadaStats {
    jornada: number;
    total: number;
    logradas: number;
    falladas: number;
    efectividad: number;
    rival: string;
}

interface ActionStats {
    accion: string;
    total: number;
    logradas: number;
    efectividad: number;
}

function buildPrompt(
    player: Player,
    jornadaStats: JornadaStats[],
    actionStats: ActionStats[],
    totalAcciones: number,
    efectividadGlobal: number
): string {
    const jornadasStr = jornadaStats.map(j => 
        `Jornada ${j.jornada} vs ${j.rival}: ${j.total} acciones, ${j.logradas} logradas, ${j.efectividad}% efectividad`
    ).join('\n');

    const actionsStr = actionStats.map(a => 
        `${a.accion}: ${a.total} total, ${a.logradas} logradas, ${a.efectividad}% efectividad`
    ).join('\n');

    return `Eres un formador de talento en una academia de futbol amateur, especializado en el desarrollo integral de jovenes jugadores. Tu enfoque es constructivo, motivacional y orientado al crecimiento.

DATOS DEL JUGADOR:
- Nombre: ${player.nombre}
- Numero: ${player.numero}
- Posicion: ${player.posicion || 'No especificada'}
- Total de acciones registradas: ${totalAcciones}
- Efectividad global: ${efectividadGlobal}%

RENDIMIENTO POR JORNADA (ordenado cronologicamente):
${jornadasStr || 'Sin datos de jornadas'}

ESTADISTICAS POR TIPO DE ACCION:
${actionsStr || 'Sin datos de acciones'}

INSTRUCCIONES:
Analiza estos datos y proporciona un informe en formato JSON con la siguiente estructura:

1. "tendencia": Indica si el rendimiento del jugador esta "mejorando", "estable" o "bajando" basandote en la progresion de las jornadas.

2. "tendenciaDescripcion": Explica brevemente (2-3 oraciones) por que llegaste a esa conclusion sobre la tendencia. Usa un tono motivacional y constructivo.

3. "fortalezas": Lista de 2-4 aspectos en los que el jugador destaca positivamente (basado en acciones con alta efectividad).

4. "areasDeMejora": Lista de 2-4 oportunidades de desarrollo que el jugador puede trabajar (basado en acciones con menor efectividad). Formula cada punto como una oportunidad de crecimiento, no como una debilidad.

5. "comparativoProfesional": Un objeto con:
   - "posicion": La posicion del jugador
   - "metricasReferencia": 6-8 metricas clave que un profesional en esa posicion domina (como referencia formativa)
   - "analisis": Evaluacion constructiva (4-6 oraciones) comparando el nivel actual del jugador con los estandares profesionales de su posicion, destacando el potencial de desarrollo y las areas donde puede acercarse a esos estandares con entrenamiento adecuado.

6. "resumenGeneral": Un parrafo de 4-6 oraciones con recomendaciones concretas y motivacionales para el entrenador sobre como potenciar el desarrollo de este jugador.

IMPORTANTE - TONO FORMATIVO:
- Usa lenguaje constructivo y orientado al crecimiento
- EVITA palabras negativas como: "nula", "pobre", "deficiente", "incapaz", "muy por debajo"
- USA alternativas positivas como: "en desarrollo", "con oportunidad de mejora", "en proceso de consolidacion", "con potencial para crecer"
- Recuerda que son jugadores en formacion, no profesionales
- Basa tus conclusiones SOLO en los datos proporcionados
- Si no hay suficientes datos para una conclusion, indicalo
- Responde SOLO con el JSON, sin texto adicional`;
}

export const analyzePlayerPerformance = async (
    player: Player,
    jornadaStats: JornadaStats[],
    actionStats: ActionStats[],
    totalAcciones: number,
    efectividadGlobal: number
): Promise<PerformanceAnalysis> => {
    const apiKey = getApiKey();
    
    const prompt = buildPrompt(player, jornadaStats, actionStats, totalAcciones, efectividadGlobal);

    const requestBody = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseMimeType: "application/json"
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
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const analysis: PerformanceAnalysis = JSON.parse(text.trim());
    return analysis;
};

