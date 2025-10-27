// services/geminiService.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LearningContext } from './aiLearningService';

const GEMINI_API_KEY = import.meta.env.VITE_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY no configurada');
}

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// ============================================
// CONFIGURACIÓN DE MÉTRICAS
// ============================================

const FOOTBALL_METRICS = {
  // Pases (8 variantes)
  pases: [
    'pase_corto_ofensivo',
    'pase_corto_defensivo',
    'pase_largo_ofensivo',
    'pase_largo_defensivo',
    'pase_filtrado',
    'cambio_orientacion',
    'centro_area',
    'asistencia_gol'
  ],
  // Duelos 1v1 (4 variantes)
  duelos: [
    'duelo_1v1_ofensivo',
    'duelo_1v1_defensivo',
    'duelo_1v1_ganado',
    'duelo_1v1_perdido'
  ],
  // Aéreos (4 variantes)
  aereos: [
    'duelo_aereo_ganado',
    'duelo_aereo_perdido',
    'despeje_cabeza',
    'remate_cabeza'
  ],
  // Portería (4 tipos)
  porteria: [
    'tiro_puerta',
    'tiro_fuera',
    'gol',
    'atajada_portero'
  ],
  // Recuperación/Pérdida (2 tipos)
  recuperacion: [
    'recuperacion_balon',
    'perdida_balon'
  ],
  // Transición (2 variantes)
  transicion: [
    'transicion_ofensiva',
    'transicion_defensiva'
  ]
};

const ALL_METRICS = Object.values(FOOTBALL_METRICS).flat();

// ============================================
// ANÁLISIS DE VIDEO CON CONTEXTO
// ============================================

/**
 * Analiza un segmento de video con contexto de aprendizaje
 */
export async function analyzeVideoSegment(
  videoUrl: string,
  currentTime: number,
  context?: LearningContext
): Promise<any[]> {
  
  if (!genAI) {
    throw new Error('Gemini API no está configurada');
  }

  try {
    console.log('🎥 Analizando video en tiempo:', currentTime);
    
    // 1. Obtener frame del video
    const frameData = await captureVideoFrame(videoUrl, currentTime);
    
    // 2. Construir prompt con contexto
    const prompt = buildAnalysisPrompt(context, currentTime);
    
    // 3. Analizar con Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: frameData
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // 4. Parsear respuesta
    const suggestions = parseGeminiResponse(text, currentTime);
    
    console.log(`✅ Gemini encontró ${suggestions.length} jugadas`);
    return suggestions;

  } catch (error) {
    console.error('❌ Error en análisis Gemini:', error);
    throw error;
  }
}

/**
 * Construye el prompt con contexto de aprendizaje
 */
function buildAnalysisPrompt(
  context?: LearningContext,
  currentTime?: number
): string {
  let prompt = `Eres un analista experto de fútbol infantil. Analiza esta imagen del partido y detecta jugadas en curso o recién completadas.

MÉTRICAS A DETECTAR (23 en total):
${ALL_METRICS.map((m, i) => `${i + 1}. ${m.replace(/_/g, ' ')}`).join('\n')}

INSTRUCCIONES:
1. Identifica SOLO jugadas claras y visibles
2. Para cada jugada detectada, proporciona:
   - Métrica exacta (usa el nombre exacto de la lista)
   - Categoría (ofensivo/defensivo/neutro)
   - Confianza (0-100%)
   - Descripción breve
   - Jugador involucrado (número de camiseta si es visible)

3. Prioriza CALIDAD sobre CANTIDAD (mejor 1 jugada correcta que 3 dudosas)
4. Si no hay jugadas claras, responde "NINGUNA"`;

  // Agregar contexto de patrones aprendidos
  if (context && context.team_patterns.length > 0) {
    const topPatterns = context.team_patterns
      .slice(0, 5)
      .map(p => `- ${p.metric_name} (${p.frequency} veces)`)
      .join('\n');
    
    prompt += `\n\n📊 PATRONES FRECUENTES DE ESTE EQUIPO:
${topPatterns}

🎯 NOTA: Este equipo tiende a realizar estas jugadas con más frecuencia. Si detectas algo similar, aumenta tu confianza.`;
  }

  // Agregar feedback reciente
  if (context && context.recent_feedback.length > 0) {
    const recentCorrections = context.recent_feedback
      .filter((f: any) => !f.accepted && f.correct_metric)
      .slice(0, 3);
    
    if (recentCorrections.length > 0) {
      prompt += `\n\n⚠️ CORRECCIONES RECIENTES DEL ENTRENADOR:
${recentCorrections.map((f: any) => 
  `- Antes sugerí "${f.ai_suggestions?.metric_name}", pero era "${f.correct_metric}"`
).join('\n')}

Aprende de estos errores y ajusta tu análisis.`;
    }
  }

  prompt += `\n\nFORMATO DE RESPUESTA (JSON):
{
  "plays": [
    {
      "metric": "nombre_exacto_metrica",
      "category": "ofensivo/defensivo/neutro",
      "confidence": 85,
      "description": "Descripción breve",
      "player_number": "10"
    }
  ]
}

Si no hay jugadas: {"plays": []}`;

  return prompt;
}

/**
 * Captura un frame del video en el tiempo especificado
 */
async function captureVideoFrame(
  videoUrl: string,
  time: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.currentTime = time;
    
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo crear contexto de canvas');
        
        ctx.drawImage(video, 0, 0);
        
        // Convertir a base64
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        resolve(base64);
        
        // Limpiar
        video.remove();
        canvas.remove();
        
      } catch (error) {
        reject(error);
      }
    });
    
    video.addEventListener('error', reject);
  });
}

/**
 * Parsea la respuesta de Gemini a formato estructurado
 */
function parseGeminiResponse(
  text: string,
  timestamp: number
): any[] {
  try {
    // Intentar parsear JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ Respuesta sin formato JSON válido');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!parsed.plays || !Array.isArray(parsed.plays)) {
      return [];
    }

    // Convertir a formato de sugerencias
    return parsed.plays
      .filter((play: any) => play.metric && play.confidence > 50)
      .map((play: any) => ({
        metric_name: play.metric,
        category: play.category || 'neutro',
        confidence: play.confidence / 100, // Convertir a 0-1
        timestamp: timestamp,
        reasoning: play.description || 'Análisis visual',
        player_id: play.player_number ? parseInt(play.player_number) : undefined,
        frame_context: `Minuto ${Math.floor(timestamp / 60)}:${String(Math.floor(timestamp % 60)).padStart(2, '0')}`
      }));

  } catch (error) {
    console.error('Error parseando respuesta Gemini:', error);
    console.log('Respuesta original:', text);
    return [];
  }
}

// ============================================
// ESTADÍSTICAS Y UTILIDADES
// ============================================

/**
 * Verifica si la API de Gemini está configurada
 */
export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY && !!genAI;
}

/**
 * Obtiene límite de uso de API gratuita
 */
export function getUsageInfo(): {
  daily_limit: number;
  current_usage: number;
  remaining: number;
} {
  // Plan gratuito: 60 análisis/día
  const dailyLimit = 60;
  
  // Obtener uso del día desde localStorage
  const today = new Date().toDateString();
  const stored = localStorage.getItem('gemini_usage');
  
  let usage = { date: today, count: 0 };
  
  if (stored) {
    try {
      usage = JSON.parse(stored);
      if (usage.date !== today) {
        usage = { date: today, count: 0 };
      }
    } catch {
      usage = { date: today, count: 0 };
    }
  }
  
  return {
    daily_limit: dailyLimit,
    current_usage: usage.count,
    remaining: Math.max(0, dailyLimit - usage.count)
  };
}

/**
 * Incrementa contador de uso
 */
export function incrementUsage(): void {
  const info = getUsageInfo();
  const newUsage = {
    date: new Date().toDateString(),
    count: info.current_usage + 1
  };
  localStorage.setItem('gemini_usage', JSON.stringify(newUsage));
}

/**
 * Obtiene todas las métricas disponibles
 */
export function getAvailableMetrics(): string[] {
  return ALL_METRICS;
}

/**
 * Obtiene métricas por categoría
 */
export function getMetricsByCategory(): typeof FOOTBALL_METRICS {
  return FOOTBALL_METRICS;
}
