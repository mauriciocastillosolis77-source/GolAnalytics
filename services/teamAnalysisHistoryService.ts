import { supabase } from './supabaseClient';
import type { TeamAnalysis, TeamAnalysisHistory } from '../types';

const CACHE_HOURS = 24;

interface SaveTeamAnalysisParams {
    teamId: string;
    teamName: string;
    analysisData: TeamAnalysis;
    filtersUsed?: {
        torneo?: string;
        categoria?: string;
        jornadaMin?: number;
        jornadaMax?: number;
    };
    totalPartidos: number;
    totalAcciones: number;
    efectividadGlobal: number;
}

export const saveTeamAnalysis = async (params: SaveTeamAnalysisParams): Promise<TeamAnalysisHistory | null> => {
    const { teamId, teamName, analysisData, filtersUsed, totalPartidos, totalAcciones, efectividadGlobal } = params;

    const normalizedFilters = {
        torneo: filtersUsed?.torneo || null,
        categoria: filtersUsed?.categoria || null,
        jornadaMin: filtersUsed?.jornadaMin || null,
        jornadaMax: filtersUsed?.jornadaMax || null
    };

    const { data, error } = await supabase
        .from('team_analysis_history')
        .insert({
            team_id: teamId,
            team_name: teamName,
            analysis_data: analysisData,
            filters_used: normalizedFilters,
            total_partidos: totalPartidos,
            total_acciones: totalAcciones,
            efectividad_global: efectividadGlobal
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving team analysis:', error);
        return null;
    }

    return data as TeamAnalysisHistory;
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

export const getCachedTeamAnalysis = async (
    teamId: string,
    totalPartidos: number,
    totalAcciones: number,
    efectividadGlobal: number,
    filtersUsed?: {
        torneo?: string;
        categoria?: string;
        jornadaMin?: number;
        jornadaMax?: number;
    }
): Promise<TeamAnalysisHistory | null> => {
    const cacheThreshold = new Date();
    cacheThreshold.setHours(cacheThreshold.getHours() - CACHE_HOURS);

    const { data, error } = await supabase
        .from('team_analysis_history')
        .select('*')
        .eq('team_id', teamId)
        .eq('total_partidos', totalPartidos)
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

    return matchingEntry as TeamAnalysisHistory || null;
};

export const getTeamAnalysisHistory = async (
    teamId: string,
    limit: number = 10
): Promise<TeamAnalysisHistory[]> => {
    const { data, error } = await supabase
        .from('team_analysis_history')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching team analysis history:', error);
        return [];
    }

    return data as TeamAnalysisHistory[];
};
