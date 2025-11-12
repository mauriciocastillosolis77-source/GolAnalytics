import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match, Tag, Player } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { ACTION_GROUPS } from '../constants/actionGroups';

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
        jornadaMin?: number;
        jornadaMax?: number;
    }>({});
    const [showFilters, setShowFilters] = useState(false);

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

        Object.entries(byJornada).forEach(([jornada, stats]) => {
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

        return Object.values(byJornada)
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

        return Object.values(byJornada)
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

        return Object.values(byJornada)
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

        return Object.values(byJornada)
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

        return Object.values(byJornada)
            .map(stats => ({
                ...stats,
                efectividad: Math.round((stats.logradas / stats.total) * 100)
            }))
            .sort((a, b) => a.jornada - b.jornada);
    }, [playerTags, matchLookup]);

    const selectedPlayer = players.find(p => p.id === selectedPlayerId);

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
                    {players.map(player => (
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
                        {filteredMatches.length === 0 && (filters.torneo || filters.categoria || filters.jornadaMin || filters.jornadaMax) 
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
                </>
            )}
        </div>
    );
};

export default RendimientoPage;



