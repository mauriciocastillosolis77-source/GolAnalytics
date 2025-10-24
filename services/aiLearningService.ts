import { supabase } from './supabaseClient';
import type { Tag } from '../types';

export interface AIFeedback {
  id?: string;
  match_id: string;
  suggestion_timestamp: number;
  suggested_action: string;
  suggested_player_id?: string;
  was_accepted: boolean;
  actual_action?: string;
  actual_player_id?: string;
  frame_features?: any;
  created_at?: string;
}

export interface LearningContext {
  historicalTags: Tag[];
  teamPatterns: TeamPattern[];
  actionFrequency: Record<string, number>;
  playerPreferences: Record<string, string[]>;
  temporalPatterns: TemporalPattern[];
  successRate: number;
}

export interface TeamPattern {
  action: string;
  avgDuration: number;
  commonPlayers: string[];
  successRate: number;
  timingPattern: string;
}

export interface TemporalPattern {
  action: string;
  typicalTimestamps: number[];
  followUpActions: string[];
}

/**
 * Guarda el feedback de una sugerencia de IA
 */
export async function saveFeedback(feedback: AIFeedback): Promise<void> {
  const { error } = await supabase
    .from('ai_feedback')
    .insert([feedback]);

  if (error) {
    console.error('Error saving AI feedback:', error);
    throw error;
  }
}

/**
 * Obtiene todo el feedback histórico para análisis
 */
export async function getAllFeedback(limit?: number): Promise<AIFeedback[]> {
  let query = supabase
    .from('ai_feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching feedback:', error);
    return [];
  }

  return data || [];
}

/**
 * Construye el contexto de aprendizaje basado en etiquetas históricas
 */
export async function buildLearningContext(matchId?: string): Promise<LearningContext> {
  // Obtener todas las etiquetas (o solo del partido actual)
  let query = supabase
    .from('tags')
    .select('*')
    .order('timestamp', { ascending: true });

  if (matchId) {
    // Para contexto del partido actual, también incluir partidos anteriores
    const { data: matches } = await supabase
      .from('matches')
      .select('id, torneo, categoria, nombre_equipo')
      .limit(10);

    if (matches && matches.length > 0) {
      const matchIds = matches.map(m => m.id);
      query = query.in('match_id', matchIds);
    }
  }

  const { data: tags } = await query;
  const historicalTags = tags || [];

  // Analizar frecuencia de acciones
  const actionFrequency: Record<string, number> = {};
  historicalTags.forEach(tag => {
    const key = tag.accion;
    actionFrequency[key] = (actionFrequency[key] || 0) + 1;
  });

  // Analizar preferencias por jugador
  const playerPreferences: Record<string, string[]> = {};
  historicalTags.forEach(tag => {
    if (!tag.player_id) return;
    if (!playerPreferences[tag.player_id]) {
      playerPreferences[tag.player_id] = [];
    }
    playerPreferences[tag.player_id].push(tag.accion);
  });

  // Calcular las acciones más comunes por jugador
  Object.keys(playerPreferences).forEach(playerId => {
    const actions = playerPreferences[playerId];
    const frequency: Record<string, number> = {};
    actions.forEach(a => {
      frequency[a] = (frequency[a] || 0) + 1;
    });
    playerPreferences[playerId] = Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action]) => action);
  });

  // Analizar patrones de equipo
  const teamPatterns: TeamPattern[] = Object.keys(actionFrequency).map(action => {
    const actionTags = historicalTags.filter(t => t.accion === action);
    const successCount = actionTags.filter(t => t.resultado === 'logrado').length;
    const playerCounts: Record<string, number> = {};
    
    actionTags.forEach(t => {
      if (t.player_id) {
        playerCounts[t.player_id] = (playerCounts[t.player_id] || 0) + 1;
      }
    });

    const commonPlayers = Object.entries(playerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id]) => id);

    const avgTimestamp = actionTags.reduce((sum, t) => sum + t.timestamp, 0) / actionTags.length;
    let timingPattern = 'mid';
    if (avgTimestamp < 1500) timingPattern = 'early';
    else if (avgTimestamp > 3600) timingPattern = 'late';

    return {
      action,
      avgDuration: 0,
      commonPlayers,
      successRate: actionTags.length > 0 ? successCount / actionTags.length : 0,
      timingPattern
    };
  });

  // Analizar patrones temporales
  const temporalPatterns: TemporalPattern[] = [];
  const actionSequences: Record<string, string[]> = {};

  for (let i = 0; i < historicalTags.length - 1; i++) {
    const current = historicalTags[i];
    const next = historicalTags[i + 1];
    
    if (current.match_id === next.match_id && 
        Math.abs(next.timestamp - current.timestamp) < 30) {
      if (!actionSequences[current.accion]) {
        actionSequences[current.accion] = [];
      }
      actionSequences[current.accion].push(next.accion);
    }
  }

  Object.entries(actionSequences).forEach(([action, followUps]) => {
    const frequency: Record<string, number> = {};
    followUps.forEach(a => {
      frequency[a] = (frequency[a] || 0) + 1;
    });
    
    const topFollowUps = Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([act]) => act);

    const timestamps = historicalTags
      .filter(t => t.accion === action)
      .map(t => t.timestamp);

    temporalPatterns.push({
      action,
      typicalTimestamps: timestamps,
      followUpActions: topFollowUps
    });
  });

  // Calcular tasa de éxito global del feedback de IA
  const { data: feedback } = await supabase
    .from('ai_feedback')
    .select('was_accepted');

  const successRate = feedback && feedback.length > 0
    ? feedback.filter(f => f.was_accepted).length / feedback.length
    : 0;

  return {
    historicalTags,
    teamPatterns,
    actionFrequency,
    playerPreferences,
    temporalPatterns,
    successRate
  };
}

/**
 * Obtiene estadísticas de aprendizaje para mostrar al usuario
 */
export async function getLearningStats(): Promise<{
  totalFeedback: number;
  acceptanceRate: number;
  mostAcceptedActions: Array<{action: string; count: number}>;
  improvementTrend: number;
}> {
  const { data: feedback } = await supabase
    .from('ai_feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (!feedback || feedback.length === 0) {
    return {
      totalFeedback: 0,
      acceptanceRate: 0,
      mostAcceptedActions: [],
      improvementTrend: 0
    };
  }

  const totalFeedback = feedback.length;
  const accepted = feedback.filter(f => f.was_accepted);
  const acceptanceRate = accepted.length / totalFeedback;

  const actionCounts: Record<string, number> = {};
  accepted.forEach(f => {
    const action = f.actual_action || f.suggested_action;
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  });

  const mostAcceptedActions = Object.entries(actionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }));

  const recent = feedback.slice(0, Math.min(20, feedback.length));
  const old = feedback.slice(-Math.min(20, feedback.length));
  
  const recentRate = recent.filter(f => f.was_accepted).length / recent.length;
  const oldRate = old.filter(f => f.was_accepted).length / old.length;
  const improvementTrend = recentRate - oldRate;

  return {
    totalFeedback,
    acceptanceRate,
    mostAcceptedActions,
    improvementTrend
  };
}
```

### **3. Guardar el archivo:**
- `Ctrl + S` (Windows) o `Cmd + S` (Mac)

---

## ✅ VERIFICACIÓN:

Deberías tener ahora:
```
services/
├── aiLearningService.ts ← NUEVO (295 líneas)
├── geminiService.ts
├── supabaseClient.ts
└── videosService.ts
