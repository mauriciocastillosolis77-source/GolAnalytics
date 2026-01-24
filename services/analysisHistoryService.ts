import { supabase } from './supabaseClient';
import type { AnalysisHistory } from '../types';
import type { PerformanceAnalysis } from './geminiPerformanceService';

const CACHE_HOURS = 24;

interface SaveAnalysisParams {
    playerId: string;
    teamId?: string;
    analysisData: PerformanceAnalysis;
    filtersUsed?: {
        torneo?: string;
        categoria?: string;
        jornadaMin?: number;
        jornadaMax?: number;
    };
    totalAcciones: number;
    efectividadGlobal: number;
}

export const saveAnalysis = async (params: SaveAnalysisParams): Promise<AnalysisHistory | null> => {
    const { playerId, teamId, analysisData, filtersUsed, totalAcciones, efectividadGlobal } = params;

    const normalizedFilters = {
        torneo: filtersUsed?.torneo || null,
        categoria: filtersUsed?.categoria || null,
        jornadaMin: filtersUsed?.jornadaMin || null,
        jornadaMax: filtersUsed?.jornadaMax || null
    };

    const { data, error } = await supabase
        .from('analysis_history')
        .insert({
            player_id: playerId,
            team_id: teamId,
            analysis_data: analysisData,
            filters_used: normalizedFilters,
            total_acciones: totalAcciones,
            efectividad_global: efectividadGlobal
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving analysis:', error);
        return null;
    }

    return data as AnalysisHistory;
};

const normalizeFilters = (filters?: {
    torneo?: string;
    categoria?: string;
    jornadaMin?: number;
    jornadaMax?: number;
}): string => {
    if (!filters) return '{}';
    const normalized = {
        torneo: filters.torneo || null,
        categoria: filters.categoria || null,
        jornadaMin: filters.jornadaMin || null,
        jornadaMax: filters.jornadaMax || null
    };
    return JSON.stringify(normalized);
};

export const getCachedAnalysis = async (
    playerId: string,
    totalAcciones: number,
    efectividadGlobal: number,
    filtersUsed?: {
        torneo?: string;
        categoria?: string;
        jornadaMin?: number;
        jornadaMax?: number;
    }
): Promise<AnalysisHistory | null> => {
    const cacheThreshold = new Date();
    cacheThreshold.setHours(cacheThreshold.getHours() - CACHE_HOURS);

    const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('player_id', playerId)
        .eq('total_acciones', totalAcciones)
        .eq('efectividad_global', efectividadGlobal)
        .gte('created_at', cacheThreshold.toISOString())
        .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
        return null;
    }

    const normalizedCurrentFilters = normalizeFilters(filtersUsed);
    const matchingEntry = data.find(entry => 
        normalizeFilters(entry.filters_used) === normalizedCurrentFilters
    );

    return matchingEntry as AnalysisHistory || null;
};

export const getPlayerAnalysisHistory = async (
    playerId: string,
    limit: number = 10
): Promise<AnalysisHistory[]> => {
    const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching analysis history:', error);
        return [];
    }

    return (data || []) as AnalysisHistory[];
};

export const formatHistoryDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};
