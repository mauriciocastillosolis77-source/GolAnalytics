import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match, Tag, Player, AnalysisHistory } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { ACTION_GROUPS } from '../constants/actionGroups';
import { analyzePlayerPerformance, type PerformanceAnalysis } from '../services/geminiPerformanceService';
import { getCachedAnalysis, saveAnalysis, getPlayerAnalysisHistory, formatHistoryDate } from '../services/analysisHistoryService';
import { exportPlayerAnalysisToPDF } from '../services/pdfExportService';

const RendimientoPage: React.FC = () => {
    const { profile } = useAuth();
    const [matches, setMatches] = useState<Match[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
    const [filters, setFilters] = useState<{
        torneo?: string;
        categoria?: string;
        equipo?: string;
        jornadaMin?: number;
        jornadaMax?: number;
    }>({});
    const [showFilters, setShowFilters] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<PerformanceAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistory[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isFromCache, setIsFromCache] = useState(false);
    const [showAISection, setShowAISection] = useState(false);

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Get user's team_id
                const userTeamId = profile?.team_id;

                // Fetch matches (with team filter for non-admin)
                let matchesQuery = supabase.from('matches').select('*').order('fecha', { ascending: false });
                if (profile?.rol !== 'admin' && userTeamId) {
                    matchesQuery = matchesQuery.eq('team_id', userTeamId);
                }
                const { data: matchesData, error: matchesError } = await matchesQuery;
                if (matchesError) throw matchesError;
                setMatches(matchesData || []);

                // Fetch tags with pagination AND team filter for non-admin
                const pageSize = 1000;
                let tagsBaseQuery = supabase.from('tags').select('*', { count: 'exact' });
                
                // Apply team filter for non-admin users
                if (profile?.rol !== 'admin' && userTeamId) {
                    tagsBaseQuery = tagsBaseQuery.eq('team_id', userTeamId);
                }
                
                const { data: firstPageData, count, error: firstError } = await tagsBaseQuery.range(0, pageSize - 1);
                if (firstError) throw firstError;

                let allTags = firstPageData || [];
                console.log('[Rendimiento] tags count (total reported):', count, 'firstPageRows:', allTags.length);

                if (typeof count === 'number' && count > allTags.length) {
                    // Fetch remaining pages with same team filter
                    for (let from = allTags.length; from < count; from += pageSize) {
                        const to = Math.min(from + pageSize - 1, count - 1);
                        let pageQuery = supabase.from('tags').select('*');
                        
                        if (profile?.rol !== 'admin' && userTeamId) {
                            pageQuery = pageQuery.eq('team_id', userTeamId);
                        }
                        
                        const { data: pageData, error: pageError } = await pageQuery.range(from, to);
                        if (pageError) throw pageError;
                        allTags = allTags.concat(pageData || []);
                        console.log(`[Rendimiento] fetched tags range ${from}-${to}, got ${pageData?.length || 0}`);
                    }
                }

                setTags(allTags || []);
                console.log('[Rendimiento] total tags loaded into state:', (allTags || []).length);

                // Fetch players (with team filter for non-admin)
                let playersQuery = supabase.from('players').select('*').order('nombre', { ascending: true });
                if (profile?.rol !== 'admin' && userTeamId) {
                    playersQuery = playersQuery.eq('team_id', userTeamId);
                }
                const { data: playersData, error: playersError } = await playersQuery;
                if (playersError) throw playersError;
                setPlayers(playersData || []);

                // Set first player as selected by default
                if (playersData && playersData.length > 0) {
                    setSelectedPlayerId(playersData[0].id);
                }
            } catch (err) {
                console.error('Error fetching data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [profile]);

    // Get unique torneos and categorias for filter dropdowns
    const availableTorneos = useMemo(() => {
        const unique = Array.from(new Set(matches.map(m => m.torneo))).filter(Boolean).sort();
        return unique;
    }, [matches]);

    const availableCategorias = useMemo(() => {
        const unique = Array.from(new Set(matches.map(m => m.categoria))).filter(Boolean).sort();
        return unique;
    }, [matches]);

    const availableEquipos = useMemo(() => {
        const unique = Array.from(new Set(matches.map(m => m.nombre_equipo))).filter(Boolean).sort();
        return unique;
    }, [matches]);

    // Get global jornada bounds
    const jornadaBounds = useMemo(() => {
        if (matches.length === 0) return { min: 1, max: 1 };
        const jornadas = matches.map(m => m.jornada);
        return {
            min: Math.min(...jornadas),
            max: Math.max(...jornadas)
        };
    }, [matches]);

    // Apply filters to matches
    const filteredMatches = useMemo(() => {
        return matches.filter(match => {
            if (filters.torneo && match.torneo !== filters.torneo) return false;
            if (filters.categoria && match.categoria !== filters.categoria) return false;
            if (filters.equipo && match.nombre_equipo !== filters.equipo) return false;
            if (filters.jornadaMin !== undefined && match.jornada < filters.jornadaMin) return false;
            if (filters.jornadaMax !== undefined && match.jornada > filters.jornadaMax) return false;
            return true;
        });
    }, [matches, filters]);

    // Get filtered match IDs for efficient tag filtering
    const filteredMatchIds = useMemo(() => {
        return new Set(filteredMatches.map(m => m.id));
    }, [filteredMatches]);

    // Create match lookup map for performance
    const matchLookup = useMemo(() => {
        const map = new Map<string, Match>();
        matches.forEach(match => map.set(match.id, match));
        return map;
    }, [matches]);

    // Filter tags for selected player AND filtered matches
    const playerTags = useMemo(() => {
        if (!selectedPlayerId) return [];
        return tags.filter(tag => 
            tag.player_id === selectedPlayerId && 
            filteredMatchIds.has(tag.match_id)
        );
    }, [tags, selectedPlayerId, filteredMatchIds]);

    // Clear all filters
    const clearFilters = () => {
        setFilters({});
    };

    // Calculate KPIs
    const kpis = useMemo(() => {
        if (playerTags.length === 0) {
            return {
                totalAcciones: 0,
                efectividadGlobal: 0,
                mejorJornada: null,
                peorJornada: null
            };
        }

        const totalAcciones = playerTags.length;
        const accionesLogradas = playerTags.filter(tag => tag.resultado === 'logrado').length;
        const efectividadGlobal = Math.round((accionesLogradas / totalAcciones) * 100);

        // Group by jornada
        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matchLookup.get(tag.match_id);
            if (!match) return acc;

            const jornada = match.jornada;
            if (!acc[jornada]) {
                acc[jornada] = { logradas: 0, total: 0 };
            }
            acc[jornada].total++;
            if (tag.resultado === 'logrado') {
                acc[jornada].logradas++;
            }
            return acc;
        }, {} as Record<number, { logradas: number; total: number }>);

        // Find best and worst jornada
        let mejorJornada: { jornada: number; efectividad: number } | null = null;
        let peorJornada: { jornada: number; efectividad: number } | null = null;

        (Object.entries(byJornada) as [string, { logradas: number; total: number }][]).forEach(([jornada, stats]) => {
            const efectividad = Math.round((stats.logradas / stats.total) * 100);
            if (!mejorJornada || efectividad > mejorJornada.efectividad) {
                mejorJornada = { jornada: parseInt(jornada), efectividad };
            }
            if (!peorJornada || efectividad < peorJornada.efectividad) {
                peorJornada = { jornada: parseInt(jornada), efectividad };
            }
        });

        return {
            totalAcciones,
            efectividadGlobal,
            mejorJornada,
            peorJornada
        };
    }, [playerTags, matchLookup]);

    // Calculate data for effectiveness chart (by jornada)
    const efectividadPorJornadaData = useMemo(() => {
        if (playerTags.length === 0) return [];

        // Group by jornada
        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matchLookup.get(tag.match_id);
            if (!match) return acc;

            const jornada = match.jornada;
            if (!acc[jornada]) {
                acc[jornada] = { jornada, logradas: 0, falladas: 0, total: 0 };
            }
            acc[jornada].total++;
            if (tag.resultado === 'logrado') {
                acc[jornada].logradas++;
            } else {
                acc[jornada].falladas++;
            }
            return acc;
        }, {} as Record<number, { jornada: number; logradas: number; falladas: number; total: number }>);

        return (Object.values(byJornada) as { jornada: number; logradas: number; falladas: number; total: number }[])
            .map(stats => ({
                jornada: `J${stats.jornada}`,
                efectividad: Math.round((stats.logradas / stats.total) * 100),
                logradas: stats.logradas,
                falladas: stats.falladas
            }))
            .sort((a, b) => parseInt(a.jornada.slice(1)) - parseInt(b.jornada.slice(1)));
    }, [playerTags, matchLookup]);

    // Calculate data for volume chart (stacked bar)
    const volumenPorJornadaData = useMemo(() => {
        if (playerTags.length === 0) return [];

        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matchLookup.get(tag.match_id);
            if (!match) return acc;

            const jornada = match.jornada;
            if (!acc[jornada]) {
                acc[jornada] = { jornada, logradas: 0, falladas: 0 };
            }
            if (tag.resultado === 'logrado') {
                acc[jornada].logradas++;
            } else {
                acc[jornada].falladas++;
            }
            return acc;
        }, {} as Record<number, { jornada: number; logradas: number; falladas: number }>);

        return (Object.values(byJornada) as { jornada: number; logradas: number; falladas: number }[])
            .map(stats => ({
                jornada: `J${stats.jornada}`,
                logradas: stats.logradas,
                falladas: stats.falladas
            }))
            .sort((a, b) => parseInt(a.jornada.slice(1)) - parseInt(b.jornada.slice(1)));
    }, [playerTags, matchLookup]);

    // Helper function to aggregate tags by jornada for specific action types (using exact action names)
    const getActionDataByJornada = (actionNames: readonly string[]) => {
        const filteredTags = playerTags.filter(tag => actionNames.includes(tag.accion));
        
        if (filteredTags.length === 0) return [];

        const byJornada = filteredTags.reduce((acc, tag) => {
            const match = matchLookup.get(tag.match_id);
            if (!match) return acc;

            const jornada = match.jornada;
            if (!acc[jornada]) {
                acc[jornada] = { jornada, logrados: 0, fallados: 0 };
            }
            if (tag.resultado === 'logrado') {
                acc[jornada].logrados++;
            } else {
                acc[jornada].fallados++;
            }
            return acc;
        }, {} as Record<number, { jornada: number; logrados: number; fallados: number }>);

        return (Object.values(byJornada) as { jornada: number; logrados: number; fallados: number }[])
            .map(stats => ({
                jornada: `J${stats.jornada}`,
                logrados: stats.logrados,
                fallados: stats.fallados
            }))
            .sort((a, b) => parseInt(a.jornada.slice(1)) - parseInt(b.jornada.slice(1)));
    };

    // Helper function for actions that only count total (no logrado/fallado distinction)
    const getActionCountByJornada = (actionNames: readonly string[]) => {
        const filteredTags = playerTags.filter(tag => actionNames.includes(tag.accion));
        
        if (filteredTags.length === 0) return [];

        const byJornada = filteredTags.reduce((acc, tag) => {
            const match = matchLookup.get(tag.match_id);
            if (!match) return acc;

            const jornada = match.jornada;
            if (!acc[jornada]) {
                acc[jornada] = { jornada, total: 0 };
            }
            acc[jornada].total++;
            return acc;
        }, {} as Record<number, { jornada: number; total: number }>);

        return (Object.values(byJornada) as { jornada: number; total: number }[])
            .map(stats => ({
                jornada: `J${stats.jornada}`,
                total: stats.total
            }))
            .sort((a, b) => parseInt(a.jornada.slice(1)) - parseInt(b.jornada.slice(1)));
    };

    // PASES - Cortos (TOTAL: ofensivos + defensivos)
    const pasesCortosData = useMemo(() => 
        getActionDataByJornada(ACTION_GROUPS.PASES_CORTOS)
    , [playerTags, matchLookup]);

    // PASES - Largos (TOTAL: ofensivos + defensivos)
    const pasesLargosData = useMemo(() => 
        getActionDataByJornada(ACTION_GROUPS.PASES_LARGOS)
    , [playerTags, matchLookup]);

    // DUELOS - 1v1 (TOTAL: ofensivos + defensivos)
    const duelos1v1Data = useMemo(() => 
        getActionDataByJornada(ACTION_GROUPS.DUELOS_1V1)
    , [playerTags, matchLookup]);

    // DUELOS - Aéreos (TOTAL: ofensivos + defensivos)
    const duelosAereosData = useMemo(() => 
        getActionDataByJornada(ACTION_GROUPS.DUELOS_AEREOS)
    , [playerTags, matchLookup]);

    // FINALIZACIÓN - Tiros a portería (solo cuenta total, no hay logrado/fallado)
    const tirosGolData = useMemo(() => 
        getActionCountByJornada(ACTION_GROUPS.TIROS_GOL)
    , [playerTags, matchLookup]);

    // FINALIZACIÓN - Goles (solo cuenta total, no hay logrado/fallado)
    const golesData = useMemo(() => 
        getActionCountByJornada(ACTION_GROUPS.GOLES)
    , [playerTags, matchLookup]);

    // FINALIZACIÓN - Gráfica combinada Tiros + Goles (apilada)
    const tirosYGolesData = useMemo(() => {
        // Obtener todas las jornadas únicas de ambas métricas
        const allJornadas = new Set<string>();
        tirosGolData.forEach(d => allJornadas.add(d.jornada));
        golesData.forEach(d => allJornadas.add(d.jornada));

        return Array.from(allJornadas)
            .map(jornada => {
                const tiros = tirosGolData.find(d => d.jornada === jornada)?.total || 0;
                const goles = golesData.find(d => d.jornada === jornada)?.total || 0;
                return {
                    jornada,
                    tiros,
                    goles
                };
            })
            .sort((a, b) => parseInt(a.jornada.slice(1)) - parseInt(b.jornada.slice(1)));
    }, [tirosGolData, golesData]);

    // DEFENSA - Atajadas (solo cuenta total, no hay logrado/fallado)
    const atajadasData = useMemo(() => 
        getActionCountByJornada(ACTION_GROUPS.ATAJADAS)
    , [playerTags, matchLookup]);

    // DEFENSA - Goles Recibidos (solo cuenta total, no hay logrado/fallado)
    const golesRecibidosData = useMemo(() => 
        getActionCountByJornada(ACTION_GROUPS.GOLES_RECIBIDOS)
    , [playerTags, matchLookup]);

    // DEFENSA - Recuperaciones de Balón (solo cuenta total, no hay logrado/fallado)
    const recuperacionesData = useMemo(() => 
        getActionCountByJornada(ACTION_GROUPS.RECUPERACIONES)
    , [playerTags, matchLookup]);

    // Table data
    const tablaRendimiento = useMemo(() => {
        if (playerTags.length === 0) return [];

        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matchLookup.get(tag.match_id);
            if (!match) return acc;

            const jornada = match.jornada;
            if (!acc[jornada]) {
                acc[jornada] = {
                    jornada,
                    rival: match.rival,
                    logradas: 0,
                    falladas: 0,
                    total: 0
                };
            }
            acc[jornada].total++;
            if (tag.resultado === 'logrado') {
                acc[jornada].logradas++;
            } else {
                acc[jornada].falladas++;
            }
            return acc;
        }, {} as Record<number, { jornada: number; rival: string; logradas: number; falladas: number; total: number }>);

        return (Object.values(byJornada) as { jornada: number; rival: string; logradas: number; falladas: number; total: number }[])
            .map(stats => ({
                ...stats,
                efectividad: Math.round((stats.logradas / stats.total) * 100)
            }))
            .sort((a, b) => a.jornada - b.jornada);
    }, [playerTags, matchLookup]);

    // Filter players by selected equipo filter
    const filteredPlayers = useMemo(() => {
        if (!filters.equipo) return players;
        // Find matches for this equipo to get team_id
        const equipoMatches = matches.filter(m => m.nombre_equipo === filters.equipo);
        if (equipoMatches.length === 0) return players;
        const teamIds = new Set(equipoMatches.map(m => m.team_id));
        return players.filter(p => teamIds.has(p.team_id));
    }, [players, matches, filters.equipo]);

    // Reset selected player when equipo filter changes
    useEffect(() => {
        if (filteredPlayers.length > 0 && !filteredPlayers.find(p => p.id === selectedPlayerId)) {
            setSelectedPlayerId(filteredPlayers[0].id);
        }
    }, [filteredPlayers, selectedPlayerId]);

    const selectedPlayer = players.find(p => p.id === selectedPlayerId);

    // Calculate action stats for AI analysis
    const actionStats = useMemo(() => {
        const stats = new Map<string, { total: number; logradas: number }>();
        playerTags.forEach(tag => {
            const current = stats.get(tag.accion) || { total: 0, logradas: 0 };
            current.total++;
            if (tag.resultado === 'logrado') current.logradas++;
            stats.set(tag.accion, current);
        });
        return Array.from(stats.entries()).map(([accion, data]) => ({
            accion,
            total: data.total,
            logradas: data.logradas,
            efectividad: data.total > 0 ? Math.round((data.logradas / data.total) * 100) : 0
        })).sort((a, b) => b.total - a.total);
    }, [playerTags]);

    // Jornada stats for AI analysis
    const jornadaStatsForAI = useMemo(() => {
        return tablaRendimiento.map(row => ({
            jornada: row.jornada,
            total: row.total,
            logradas: row.logradas,
            falladas: row.falladas,
            efectividad: row.efectividad,
            rival: row.rival
        }));
    }, [tablaRendimiento]);

    // Function to run AI analysis with cache support
    const runAIAnalysis = async (forceNew: boolean = false) => {
        if (!selectedPlayer || playerTags.length === 0) return;
        
        setIsAnalyzing(true);
        setAnalysisError(null);
        setAiAnalysis(null);
        setIsFromCache(false);
        
        try {
            // Check cache first (unless forcing new analysis)
            if (!forceNew) {
                const cached = await getCachedAnalysis(
                    selectedPlayer.id,
                    kpis.totalAcciones,
                    kpis.efectividadGlobal,
                    filters
                );
                
                if (cached) {
                    setAiAnalysis(cached.analysis_data as PerformanceAnalysis);
                    setIsFromCache(true);
                    setIsAnalyzing(false);
                    return;
                }
            }
            
            // Generate new analysis with AI
            const analysis = await analyzePlayerPerformance(
                selectedPlayer,
                jornadaStatsForAI,
                actionStats,
                kpis.totalAcciones,
                kpis.efectividadGlobal
            );
            setAiAnalysis(analysis);
            
            // Save to history
            await saveAnalysis({
                playerId: selectedPlayer.id,
                teamId: profile?.team_id,
                analysisData: analysis,
                filtersUsed: filters,
                totalAcciones: kpis.totalAcciones,
                efectividadGlobal: kpis.efectividadGlobal
            });
            
            // Refresh history
            const history = await getPlayerAnalysisHistory(selectedPlayer.id);
            setAnalysisHistory(history);
            
        } catch (err) {
            console.error('Error analyzing performance:', err);
            setAnalysisError('Error al generar el analisis. Intenta de nuevo.');
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    // Load analysis history when player changes
    useEffect(() => {
        const loadHistory = async () => {
            if (selectedPlayerId) {
                const history = await getPlayerAnalysisHistory(selectedPlayerId);
                setAnalysisHistory(history);
            }
        };
        loadHistory();
    }, [selectedPlayerId]);

    // Excel Export Function
    const exportToExcel = useCallback(() => {
        // Guard against empty data or missing XLSX library
        if (!tablaRendimiento || tablaRendimiento.length === 0) {
            alert('No hay datos para exportar');
            return;
        }

        if (!(window as any).XLSX) {
            alert('Error: Biblioteca XLSX no disponible');
            return;
        }

        const XLSX = (window as any).XLSX;

        // Map data to Excel rows with Spanish headers
        const excelData = [
            ['Jornada', 'Rival', 'Acciones Logradas', 'Acciones Falladas', 'Total Acciones', 'Efectividad (%)'],
            ...tablaRendimiento.map(row => [
                `Jornada ${row.jornada}`,
                row.rival,
                row.logradas,
                row.falladas,
                row.total,
                `${row.efectividad}%`
            ])
        ];

        // Create worksheet and workbook
        const worksheet = XLSX.utils.aoa_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Rendimiento');

        // Generate filename with player name and date
        const playerName = selectedPlayer?.nombre?.replace(/\s+/g, '_') || 'Jugador';
        const currentDate = new Date().toISOString().slice(0, 10);
        const filename = `Rendimiento_${playerName}_${currentDate}.xlsx`;

        // Download file
        XLSX.writeFile(workbook, filename);
    }, [tablaRendimiento, selectedPlayer]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Spinner size="h-12 w-12" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-white">Rendimiento Individual</h1>

            {/* Player Selector */}
            <div className="mb-6">
                <label className="block text-sm font-medium mb-2 text-gray-300">Seleccionar Jugador</label>
                <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="w-full md:w-96 bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                    {filteredPlayers.map(player => (
                        <option key={player.id} value={player.id}>
                            {player.nombre} - #{player.numero} - {player.posicion}
                        </option>
                    ))}
                </select>
            </div>

            {/* Filters Panel */}
            <div className="mb-6">
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-medium mb-3"
                >
                    <span>{showFilters ? '▼' : '▶'}</span>
                    <span>Filtros Avanzados</span>
                </button>
                
                {showFilters && (
                    <div className="bg-gray-800 rounded-lg p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Torneo Filter */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Torneo</label>
                                <select
                                    value={filters.torneo || ''}
                                    onChange={(e) => setFilters({ ...filters, torneo: e.target.value || undefined })}
                                    className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                    <option value="">Todos</option>
                                    {availableTorneos.map(torneo => (
                                        <option key={torneo} value={torneo}>{torneo}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Categoría Filter */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Categoría</label>
                                <select
                                    value={filters.categoria || ''}
                                    onChange={(e) => setFilters({ ...filters, categoria: e.target.value || undefined })}
                                    className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                    <option value="">Todas</option>
                                    {availableCategorias.map(categoria => (
                                        <option key={categoria} value={categoria}>{categoria}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Equipo Filter */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Equipo</label>
                                <select
                                    value={filters.equipo || ''}
                                    onChange={(e) => setFilters({ ...filters, equipo: e.target.value || undefined })}
                                    className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                >
                                    <option value="">Todos</option>
                                    {availableEquipos.map(equipo => (
                                        <option key={equipo} value={equipo}>{equipo}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Jornada Min Filter */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Jornada Desde</label>
                                <input
                                    type="number"
                                    min={jornadaBounds.min}
                                    max={jornadaBounds.max}
                                    value={filters.jornadaMin ?? ''}
                                    onChange={(e) => setFilters({ ...filters, jornadaMin: e.target.value ? parseInt(e.target.value) : undefined })}
                                    placeholder={`Min: ${jornadaBounds.min}`}
                                    className={`w-full bg-gray-700 text-white p-2 rounded border ${
                                        filters.jornadaMin && filters.jornadaMax && filters.jornadaMin > filters.jornadaMax 
                                            ? 'border-red-500' 
                                            : 'border-gray-600'
                                    } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                                />
                                {filters.jornadaMin && filters.jornadaMax && filters.jornadaMin > filters.jornadaMax && (
                                    <p className="text-red-400 text-xs mt-1">El valor mínimo no puede ser mayor al máximo</p>
                                )}
                            </div>

                            {/* Jornada Max Filter */}
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-300">Jornada Hasta</label>
                                <input
                                    type="number"
                                    min={jornadaBounds.min}
                                    max={jornadaBounds.max}
                                    value={filters.jornadaMax ?? ''}
                                    onChange={(e) => setFilters({ ...filters, jornadaMax: e.target.value ? parseInt(e.target.value) : undefined })}
                                    placeholder={`Max: ${jornadaBounds.max}`}
                                    className={`w-full bg-gray-700 text-white p-2 rounded border ${
                                        filters.jornadaMin && filters.jornadaMax && filters.jornadaMin > filters.jornadaMax 
                                            ? 'border-red-500' 
                                            : 'border-gray-600'
                                    } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                                />
                            </div>
                        </div>

                        {/* Clear Filters Button */}
                        <div className="flex justify-end">
                            <button
                                onClick={clearFilters}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-medium"
                            >
                                Limpiar Filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {playerTags.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 text-center">
                    <p className="text-gray-400 text-lg">
                        {filteredMatches.length === 0 && (filters.torneo || filters.categoria || filters.equipo || filters.jornadaMin || filters.jornadaMax) 
                            ? 'Sin datos con los filtros actuales. Intenta limpiar los filtros.' 
                            : 'Este jugador no tiene datos registrados aún.'}
                    </p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-lg p-6 shadow-lg">
                            <p className="text-cyan-100 text-sm mb-1">Total Acciones</p>
                            <p className="text-white text-3xl font-bold">{kpis.totalAcciones}</p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-6 shadow-lg">
                            <p className="text-blue-100 text-sm mb-1">Efectividad Global</p>
                            <p className="text-white text-3xl font-bold">{kpis.efectividadGlobal}%</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-6 shadow-lg">
                            <p className="text-green-100 text-sm mb-1">Mejor Jornada</p>
                            <p className="text-white text-3xl font-bold">
                                {kpis.mejorJornada ? `J${kpis.mejorJornada.jornada} (${kpis.mejorJornada.efectividad}%)` : '-'}
                            </p>
                        </div>
                        <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-lg p-6 shadow-lg">
                            <p className="text-orange-100 text-sm mb-1">Peor Jornada</p>
                            <p className="text-white text-3xl font-bold">
                                {kpis.peorJornada ? `J${kpis.peorJornada.jornada} (${kpis.peorJornada.efectividad}%)` : '-'}
                            </p>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        {/* Effectiveness by Jornada */}
                        <div className="bg-gray-800 rounded-lg p-6">
                            <h3 className="text-xl font-semibold mb-4 text-white">Efectividad por Jornada</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={efectividadPorJornadaData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" domain={[0, 100]} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                        labelStyle={{ color: '#F3F4F6' }}
                                    />
                                    <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                    <Line
                                        type="monotone"
                                        dataKey="efectividad"
                                        stroke="#06B6D4"
                                        strokeWidth={3}
                                        name="Efectividad (%)"
                                        dot={{ fill: '#06B6D4', r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Volume by Jornada */}
                        <div className="bg-gray-800 rounded-lg p-6">
                            <h3 className="text-xl font-semibold mb-4 text-white">Volumen de Acciones por Jornada</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={volumenPorJornadaData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                        labelStyle={{ color: '#F3F4F6' }}
                                    />
                                    <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                    <Bar dataKey="logradas" stackId="a" fill="#10B981" name="Logradas" />
                                    <Bar dataKey="falladas" stackId="a" fill="#EF4444" name="Falladas" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* SECTION 1: ANÁLISIS DE PASES */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-700 pb-3">
                            🎯 ANÁLISIS DE PASES
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Pases Cortos */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Pases Cortos</h3>
                                {pasesCortosData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de pases cortos</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={pasesCortosData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="logrados" stackId="a" fill="#10B981" name="Logrados" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Fallados" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            {/* Pases Largos */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Pases Largos</h3>
                                {pasesLargosData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de pases largos</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={pasesLargosData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="logrados" stackId="a" fill="#10B981" name="Logrados" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Fallados" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: ANÁLISIS DE DUELOS */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-700 pb-3">
                            ⚔️ ANÁLISIS DE DUELOS
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Duelos 1v1 */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Duelos 1v1</h3>
                                {duelos1v1Data.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de duelos 1v1</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={duelos1v1Data}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="logrados" stackId="a" fill="#10B981" name="Ganados" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Perdidos" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            {/* Duelos Aéreos */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Duelos Aéreos</h3>
                                {duelosAereosData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de duelos aéreos</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={duelosAereosData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="logrados" stackId="a" fill="#10B981" name="Ganados" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Perdidos" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION 3: FINALIZACIÓN Y ATAQUE */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-700 pb-3">
                            ⚽ FINALIZACIÓN Y ATAQUE
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Tiros a Portería y Goles (Combinado) */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Tiros a Portería y Goles</h3>
                                {tirosYGolesData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de tiros y goles</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={tirosYGolesData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="tiros" stackId="conversion" fill="#10B981" name="Tiros a Portería" />
                                            <Bar dataKey="goles" stackId="conversion" fill="#06B6D4" name="Goles" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            {/* Recuperaciones de Balón */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Recuperaciones de Balón</h3>
                                {recuperacionesData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de recuperaciones</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={recuperacionesData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="total" fill="#10B981" name="Recuperaciones" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION 4: DEFENSA Y PORTERÍA */}
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-700 pb-3">
                            🛡️ DEFENSA Y PORTERÍA
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Atajadas */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Atajadas</h3>
                                {atajadasData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de atajadas</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={atajadasData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="total" fill="#10B981" name="Atajadas" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>

                            {/* Goles Recibidos */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Goles Recibidos</h3>
                                {golesRecibidosData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de goles recibidos</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={golesRecibidosData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="total" fill="#10B981" name="Goles Recibidos" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Performance Table */}
                    <div className="bg-gray-800 rounded-lg p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">Desglose por Jornada</h3>
                            <button
                                onClick={exportToExcel}
                                disabled={tablaRendimiento.length === 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                                    tablaRendimiento.length === 0
                                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                        : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                                title={tablaRendimiento.length === 0 ? 'No hay datos para exportar' : 'Exportar tabla a Excel'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                <span>Exportar a Excel</span>
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-white">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="p-3">Jornada</th>
                                        <th className="p-3">Rival</th>
                                        <th className="p-3 text-center">Acciones</th>
                                        <th className="p-3 text-center">Logradas</th>
                                        <th className="p-3 text-center">Falladas</th>
                                        <th className="p-3 text-center">Efectividad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tablaRendimiento.map((row) => (
                                        <tr key={row.jornada} className="border-b border-gray-700 hover:bg-gray-750">
                                            <td className="p-3">Jornada {row.jornada}</td>
                                            <td className="p-3">{row.rival}</td>
                                            <td className="p-3 text-center">{row.total}</td>
                                            <td className="p-3 text-center text-green-400">{row.logradas}</td>
                                            <td className="p-3 text-center text-red-400">{row.falladas}</td>
                                            <td className="p-3 text-center font-semibold">{row.efectividad}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* AI Performance Analysis Section - COLAPSABLE */}
                    <div className="bg-gray-800 rounded-lg overflow-hidden">
                        {/* Header colapsable */}
                        <button
                            onClick={() => setShowAISection(!showAISection)}
                            className="w-full flex items-center justify-between p-4 hover:bg-gray-750 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-r from-purple-600 to-cyan-600 p-2 rounded-lg">
                                    <span className="text-2xl">⚽</span>
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-semibold text-white">Analisis especializado GolAnalytics</h3>
                                    <p className="text-xs text-gray-400">Obtén un análisis claro, accionable y comparado contra estándares profesionales por posición.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {aiAnalysis && (
                                    <span className={`text-xs px-2 py-1 rounded ${
                                        aiAnalysis.tendencia === 'mejorando' ? 'bg-green-900/50 text-green-400' :
                                        aiAnalysis.tendencia === 'bajando' ? 'bg-red-900/50 text-red-400' :
                                        'bg-yellow-900/50 text-yellow-400'
                                    }`}>
                                        {aiAnalysis.tendencia}
                                    </span>
                                )}
                                <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    className={`h-5 w-5 text-gray-400 transition-transform ${showAISection ? 'rotate-180' : ''}`} 
                                    viewBox="0 0 20 20" 
                                    fill="currentColor"
                                >
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </button>

                        {/* Contenido colapsable */}
                        {showAISection && (
                            <div className="p-6 pt-2 border-t border-gray-700">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                    <div>
                                        <p className="text-sm text-gray-300">Jugador: <span className="font-semibold text-white">{selectedPlayer?.nombre || 'No seleccionado'}</span></p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => runAIAnalysis(false)}
                                                disabled={isAnalyzing || playerTags.length === 0}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                                                    isAnalyzing || playerTags.length === 0
                                                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                                        : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white'
                                                }`}
                                            >
                                                {isAnalyzing ? (
                                                    <>
                                                        <Spinner size="h-4 w-4" />
                                                        <span>Analizando...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>⚽</span>
                                                        <span>Generar Análisis Ejecutivo del Jugador</span>
                                                    </>
                                                )}
                                            </button>
                                            {analysisHistory.length > 0 && (
                                                <button
                                                    onClick={() => setShowHistory(!showHistory)}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                                    </svg>
                                                    <span>Historial ({analysisHistory.length})</span>
                                                </button>
                                            )}
                                        </div>
                                        {isFromCache && aiAnalysis && (
                                            <div className="flex items-center gap-2 text-xs text-amber-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h8V3a1 1 0 112 0v1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2V3a1 1 0 011-1zm9 6H6v8h8V8z" clipRule="evenodd" />
                                                </svg>
                                                <span>Análisis reciente (guardado)</span>
                                                <button 
                                                    onClick={() => runAIAnalysis(true)}
                                                    className="underline hover:text-amber-300"
                                                >
                                                    Generar nuevo
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Analysis History Panel */}
                                {showHistory && analysisHistory.length > 0 && (
                                    <div className="bg-gray-700/50 rounded-lg p-4 mb-4 border border-gray-600">
                                        <h4 className="text-sm font-semibold text-gray-300 mb-3">Historial de Análisis</h4>
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {analysisHistory.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => {
                                                        setAiAnalysis(item.analysis_data as PerformanceAnalysis);
                                                        setIsFromCache(true);
                                                        setShowHistory(false);
                                                    }}
                                                    className="w-full text-left p-3 rounded bg-gray-800 hover:bg-gray-750 border border-gray-600 transition-colors"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-white">{formatHistoryDate(item.created_at)}</span>
                                                        <span className={`text-xs px-2 py-1 rounded ${
                                                            item.analysis_data.tendencia === 'mejorando' ? 'bg-green-900/50 text-green-400' :
                                                            item.analysis_data.tendencia === 'bajando' ? 'bg-red-900/50 text-red-400' :
                                                            'bg-yellow-900/50 text-yellow-400'
                                                        }`}>
                                                            {item.analysis_data.tendencia}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {item.total_acciones} acciones | {item.efectividad_global}% efectividad
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {analysisError && (
                                    <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
                                        <p className="text-red-300">{analysisError}</p>
                                    </div>
                                )}

                                {playerTags.length === 0 && !aiAnalysis && (
                                    <div className="text-center py-8 text-gray-400">
                                        <p>Selecciona un jugador con datos de rendimiento para generar un analisis.</p>
                                    </div>
                                )}

                                {aiAnalysis && (
                                    <div className="space-y-6">
                                        {/* Tendencia */}
                                        <div className={`rounded-lg p-4 ${
                                            aiAnalysis.tendencia === 'mejorando' ? 'bg-green-900/30 border border-green-500' :
                                            aiAnalysis.tendencia === 'bajando' ? 'bg-red-900/30 border border-red-500' :
                                            'bg-yellow-900/30 border border-yellow-500'
                                        }`}>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-2xl">
                                                    {aiAnalysis.tendencia === 'mejorando' ? '📈' : 
                                                     aiAnalysis.tendencia === 'bajando' ? '📉' : '📊'}
                                                </span>
                                                <h4 className="text-lg font-semibold text-white">
                                                    Tendencia: {aiAnalysis.tendencia === 'mejorando' ? 'Mejorando' : 
                                                                aiAnalysis.tendencia === 'bajando' ? 'Bajando' : 'Estable'}
                                                </h4>
                                            </div>
                                            <p className="text-gray-300">{aiAnalysis.tendenciaDescripcion}</p>
                                        </div>

                                        {/* Fortalezas y Areas de Mejora */}
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="bg-green-900/20 rounded-lg p-4 border border-green-700">
                                                <h4 className="text-lg font-semibold text-green-400 mb-3 flex items-center gap-2">
                                                    <span>💪</span> Fortalezas
                                                </h4>
                                                <ul className="space-y-2">
                                                    {aiAnalysis.fortalezas.map((f, i) => (
                                                        <li key={i} className="text-gray-300 flex items-start gap-2">
                                                            <span className="text-green-400 mt-1">✓</span>
                                                            <span>{f}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            <div className="bg-orange-900/20 rounded-lg p-4 border border-orange-700">
                                                <h4 className="text-lg font-semibold text-orange-400 mb-3 flex items-center gap-2">
                                                    <span>🎯</span> Areas de Mejora
                                                </h4>
                                                <ul className="space-y-2">
                                                    {aiAnalysis.areasDeMejora.map((a, i) => (
                                                        <li key={i} className="text-gray-300 flex items-start gap-2">
                                                            <span className="text-orange-400 mt-1">→</span>
                                                            <span>{a}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        {/* Comparativo Profesional */}
                                        <div className="bg-cyan-900/20 rounded-lg p-4 border border-cyan-700">
                                            <h4 className="text-lg font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                                                <span>⚽</span> Estándar Profesional esperado ({aiAnalysis.comparativoProfesional.posicion})
                                            </h4>
                                            <p className="text-xs text-gray-400 mb-3 italic">El análisis se basa en estándares de rendimiento profesional para la posición, utilizados como referencia formativa.</p>
                                            <div className="mb-3">
                                                <p className="text-sm text-gray-400 mb-2">Metricas clave para esta posicion:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {aiAnalysis.comparativoProfesional.metricasReferencia.map((m, i) => (
                                                        <span key={i} className="bg-cyan-800/50 text-cyan-300 px-3 py-1 rounded-full text-sm">
                                                            {m}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-gray-300">{aiAnalysis.comparativoProfesional.analisis}</p>
                                        </div>

                                        {/* Resumen General */}
                                        <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                                            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                                <span>📋</span> Resumen y Recomendaciones
                                            </h4>
                                            <p className="text-gray-300">{aiAnalysis.resumenGeneral}</p>
                                        </div>

                                        {/* Botón Descargar PDF */}
                                        <div className="flex justify-center pt-4">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await exportPlayerAnalysisToPDF(aiAnalysis, {
                                                            userName: profile?.nombre || 'Usuario',
                                                            teamName: `Academia ${profile?.nombre || 'GolAnalytics'}`,
                                                            playerName: selectedPlayer?.nombre,
                                                            playerNumber: selectedPlayer?.numero,
                                                            playerPosition: selectedPlayer?.posicion
                                                        });
                                                    } catch (error) {
                                                        console.error('Error exporting PDF:', error);
                                                        alert('Error al generar el PDF. Intenta de nuevo.');
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                                <span>Descargar PDF</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default RendimientoPage;

