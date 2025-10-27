// services/aiLearningService.ts
import { supabase } from './supabaseClient';
import { analyzeVideoSegment } from './geminiService';

// ============================================
// TIPOS Y CONSTANTES
// ============================================

export interface PlayPattern {
  metric_name: string;
  category: string;
  frequency: number;
  avg_confidence: number;
  last_seen: string;
}

export interface AISuggestion {
  id: string;
  metric_name: string;
  category: string;
  player_id?: string;
  confidence: number;
  timestamp: number;
  reasoning: string;
  frame_context?: string;
}

export interface FeedbackData {
  suggestion_id: string;
  accepted: boolean;
  correct_metric?: string;
  correct_category?: string;
  user_notes?: string;
}

export interface LearningContext {
  match_id: string;
  team_patterns: PlayPattern[];
  recent_feedback: any[];
  total_tags: number;
}

// Métricas principales (las 5 más frecuentes para empezar)
export const TOP_5_METRICS = [
  'pase_corto_ofensivo',
  'pase_corto_defensivo',
  'recuperacion_balon',
  'duelo_1v1_ofensivo',
  'transicion_ofensiva'
];

// ============================================
// ANÁLISIS CON CONTEXTO DE APRENDIZAJE
// ============================================

/**
 * Analiza un segmento de video con contexto de aprendizaje previo
 */
export async function analyzeWithLearning(
  videoUrl: string,
  currentTime: number,
  matchId: string,
  userId: string
): Promise<AISuggestion[]> {
  try {
    console.log('🧠 Iniciando análisis con aprendizaje...');
    
    // 1. Obtener contexto de aprendizaje
    const context = await getLearningContext(matchId, userId);
    
    // 2. Analizar con Gemini + contexto
    const geminiResults = await analyzeVideoSegment(
      videoUrl,
      currentTime,
      context
    );
    
    // 3. Enriquecer sugerencias con patrones aprendidos
    const enrichedSuggestions = enrichWithPatterns(
      geminiResults,
      context.team_patterns
    );
    
    // 4. Guardar sugerencias para tracking
    await saveSuggestions(enrichedSuggestions, matchId, userId);
    
    console.log(`✅ ${enrichedSuggestions.length} sugerencias generadas`);
    return enrichedSuggestions;
    
  } catch (error) {
    console.error('❌ Error en análisis con aprendizaje:', error);
    throw error;
  }
}

/**
 * Obtiene el contexto de aprendizaje para un partido
 */
async function getLearningContext(
  matchId: string,
  userId: string
): Promise<LearningContext> {
  try {
    // 1. Obtener patrones del equipo (jugadas más frecuentes)
    const { data: patterns, error: patternsError } = await supabase
      .from('tags')
      .select('metric_name, category, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (patternsError) throw patternsError;

    // 2. Calcular frecuencias de métricas
    const patternMap = new Map<string, PlayPattern>();
    
    patterns?.forEach(tag => {
      const key = `${tag.metric_name}_${tag.category}`;
      if (!patternMap.has(key)) {
        patternMap.set(key, {
          metric_name: tag.metric_name,
          category: tag.category,
          frequency: 0,
          avg_confidence: 0,
          last_seen: tag.created_at
        });
      }
      const pattern = patternMap.get(key)!;
      pattern.frequency++;
    });

    // 3. Obtener feedback reciente (últimos 50)
    const { data: feedback, error: feedbackError } = await supabase
      .from('ai_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (feedbackError) throw feedbackError;

    return {
      match_id: matchId,
      team_patterns: Array.from(patternMap.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10), // Top 10 patrones
      recent_feedback: feedback || [],
      total_tags: patterns?.length || 0
    };

  } catch (error) {
    console.error('Error obteniendo contexto:', error);
    return {
      match_id: matchId,
      team_patterns: [],
      recent_feedback: [],
      total_tags: 0
    };
  }
}

/**
 * Enriquece sugerencias con patrones aprendidos
 */
function enrichWithPatterns(
  suggestions: any[],
  patterns: PlayPattern[]
): AISuggestion[] {
  return suggestions.map(suggestion => {
    // Buscar patrón similar
    const matchingPattern = patterns.find(
      p => p.metric_name === suggestion.metric_name && 
           p.category === suggestion.category
    );

    // Ajustar confianza basado en frecuencia de patrón
    let adjustedConfidence = suggestion.confidence;
    let reasoning = suggestion.reasoning || 'Análisis visual';

    if (matchingPattern) {
      // Aumentar confianza si es un patrón frecuente
      const frequencyBoost = Math.min(matchingPattern.frequency / 10, 0.15);
      adjustedConfidence = Math.min(adjustedConfidence + frequencyBoost, 1.0);
      
      reasoning += ` | Patrón frecuente: ${matchingPattern.frequency} veces`;
    }

    return {
      id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metric_name: suggestion.metric_name,
      category: suggestion.category,
      player_id: suggestion.player_id,
      confidence: adjustedConfidence,
      timestamp: suggestion.timestamp,
      reasoning,
      frame_context: suggestion.frame_context
    };
  });
}

/**
 * Guarda sugerencias en Supabase para tracking
 */
async function saveSuggestions(
  suggestions: AISuggestion[],
  matchId: string,
  userId: string
): Promise<void> {
  try {
    const records = suggestions.map(s => ({
      id: s.id,
      match_id: matchId,
      user_id: userId,
      metric_name: s.metric_name,
      category: s.category,
      player_id: s.player_id,
      confidence: s.confidence,
      timestamp: s.timestamp,
      reasoning: s.reasoning,
      status: 'pending' // pending, accepted, rejected
    }));

    const { error } = await supabase
      .from('ai_suggestions')
      .insert(records);

    if (error) throw error;

  } catch (error) {
    console.error('Error guardando sugerencias:', error);
  }
}

// ============================================
// FEEDBACK Y APRENDIZAJE
// ============================================

/**
 * Guarda feedback del usuario (✅ o ❌)
 */
export async function saveFeedback(
  feedbackData: FeedbackData,
  userId: string
): Promise<void> {
  try {
    // 1. Actualizar estado de sugerencia
    const { error: updateError } = await supabase
      .from('ai_suggestions')
      .update({ 
        status: feedbackData.accepted ? 'accepted' : 'rejected',
        feedback_at: new Date().toISOString()
      })
      .eq('id', feedbackData.suggestion_id);

    if (updateError) throw updateError;

    // 2. Guardar feedback detallado
    const { error: feedbackError } = await supabase
      .from('ai_feedback')
      .insert({
        suggestion_id: feedbackData.suggestion_id,
        user_id: userId,
        accepted: feedbackData.accepted,
        correct_metric: feedbackData.correct_metric,
        correct_category: feedbackData.correct_category,
        user_notes: feedbackData.user_notes
      });

    if (feedbackError) throw feedbackError;

    console.log(`✅ Feedback guardado: ${feedbackData.accepted ? 'Aceptado' : 'Rechazado'}`);

  } catch (error) {
    console.error('❌ Error guardando feedback:', error);
    throw error;
  }
}

/**
 * Obtiene estadísticas de aprendizaje de IA
 */
export async function getAIStats(userId: string): Promise<{
  total_suggestions: number;
  accepted: number;
  rejected: number;
  accuracy: number;
  top_metrics: { metric: string; count: number }[];
}> {
  try {
    // Obtener todas las sugerencias
    const { data: suggestions, error } = await supabase
      .from('ai_suggestions')
      .select('status, metric_name')
      .eq('user_id', userId);

    if (error) throw error;

    const total = suggestions?.length || 0;
    const accepted = suggestions?.filter(s => s.status === 'accepted').length || 0;
    const rejected = suggestions?.filter(s => s.status === 'rejected').length || 0;
    const accuracy = total > 0 ? (accepted / total) * 100 : 0;

    // Métricas más sugeridas
    const metricCounts = new Map<string, number>();
    suggestions?.forEach(s => {
      metricCounts.set(s.metric_name, (metricCounts.get(s.metric_name) || 0) + 1);
    });

    const topMetrics = Array.from(metricCounts.entries())
      .map(([metric, count]) => ({ metric, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total_suggestions: total,
      accepted,
      rejected,
      accuracy: Math.round(accuracy * 10) / 10,
      top_metrics: topMetrics
    };

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    return {
      total_suggestions: 0,
      accepted: 0,
      rejected: 0,
      accuracy: 0,
      top_metrics: []
    };
  }
}

// ============================================
// EXPORTACIÓN PARA ENTRENAMIENTO
// ============================================

/**
 * Exporta datos para entrenamiento del modelo propio
 * (Para usar en Google Colab)
 */
export async function exportTrainingData(userId: string): Promise<{
  tags: any[];
  feedback: any[];
  patterns: any[];
}> {
  try {
    console.log('📦 Exportando datos para entrenamiento...');

    // 1. Todas las etiquetas manuales
    const { data: tags } = await supabase
      .from('tags')
      .select(`
        *,
        matches(date, opponent, result),
        players(name, position, number)
      `)
      .order('created_at', { ascending: false });

    // 2. Todo el feedback de IA
    const { data: feedback } = await supabase
      .from('ai_feedback')
      .select(`
        *,
        ai_suggestions(*)
      `)
      .eq('user_id', userId);

    // 3. Patrones identificados
    const { data: patterns } = await supabase
      .from('tags')
      .select('metric_name, category, match_id, timestamp')
      .order('match_id');

    console.log(`✅ Exportados: ${tags?.length || 0} tags, ${feedback?.length || 0} feedbacks`);

    return {
      tags: tags || [],
      feedback: feedback || [],
      patterns: patterns || []
    };

  } catch (error) {
    console.error('Error exportando datos:', error);
    throw error;
  }
}
