import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match, Tag, Player } from '../types';
import { Spinner } from '../components/ui/Spinner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

const RendimientoPage: React.FC = () => {
    const { profile } = useAuth();
    const [matches, setMatches] = useState<Match[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Get user's team_id
                const userTeamId = profile?.team_id;

                // Fetch matches for user's team
                let matchesQuery = supabase.from('matches').select('*').order('jornada', { ascending: true });
                if (profile?.rol !== 'admin' && userTeamId) {
                    matchesQuery = matchesQuery.eq('team_id', userTeamId);
                }
                const { data: matchesData } = await matchesQuery;

                // Fetch players for user's team
                let playersQuery = supabase.from('players').select('*').order('nombre', { ascending: true });
                if (profile?.rol !== 'admin' && userTeamId) {
                    playersQuery = playersQuery.eq('team_id', userTeamId);
                }
                const { data: playersData } = await playersQuery;

                // Fetch all tags for user's team
                let tagsQuery = supabase.from('tags').select('*');
                if (profile?.rol !== 'admin' && userTeamId) {
                    tagsQuery = tagsQuery.eq('team_id', userTeamId);
                }
                const { data: tagsData } = await tagsQuery;

                setMatches(matchesData || []);
                setPlayers(playersData || []);
                setTags(tagsData || []);

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

    // Filter tags for selected player
    const playerTags = useMemo(() => {
        if (!selectedPlayerId) return [];
        return tags.filter(tag => tag.player_id === selectedPlayerId);
    }, [tags, selectedPlayerId]);

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
            const match = matches.find(m => m.id === tag.match_id);
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
    }, [playerTags, matches]);

    // Calculate data for effectiveness chart (by jornada)
    const efectividadPorJornadaData = useMemo(() => {
        if (playerTags.length === 0) return [];

        // Group by jornada
        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matches.find(m => m.id === tag.match_id);
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
    }, [playerTags, matches]);

    // Calculate data for volume chart (stacked bar)
    const volumenPorJornadaData = useMemo(() => {
        if (playerTags.length === 0) return [];

        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matches.find(m => m.id === tag.match_id);
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
    }, [playerTags, matches]);

    // Helper function to aggregate tags by jornada for specific action types
    const getActionDataByJornada = (actionFilter: (accion: string) => boolean) => {
        const filteredTags = playerTags.filter(tag => actionFilter(tag.accion.toLowerCase()));
        
        if (filteredTags.length === 0) return [];

        const byJornada = filteredTags.reduce((acc, tag) => {
            const match = matches.find(m => m.id === tag.match_id);
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

    // PASES - Cortos (TOTAL: ofensivos + defensivos)
    const pasesCortosData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('pase') && accion.includes('corto'))
    , [playerTags, matches]);

    // PASES - Largos (TOTAL: ofensivos + defensivos)
    const pasesLargosData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('pase') && accion.includes('largo'))
    , [playerTags, matches]);

    // DUELOS - 1v1 (TOTAL: ofensivos + defensivos)
    const duelos1v1Data = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('1 vs 1'))
    , [playerTags, matches]);

    // DUELOS - Aéreos (TOTAL: ofensivos + defensivos, normalize accents)
    const duelosAereosData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('aereo') || accion.includes('aéreo'))
    , [playerTags, matches]);

    // FINALIZACIÓN - Tiros a Gol
    const tirosGolData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('tiro a gol'))
    , [playerTags, matches]);

    // FINALIZACIÓN - Goles
    const golesData = useMemo(() => 
        getActionDataByJornada(accion => accion === 'gol')
    , [playerTags, matches]);

    // DEFENSA - Atajadas
    const atajadasData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('atajada'))
    , [playerTags, matches]);

    // DEFENSA - Goles Recibidos
    const golesRecibidosData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('gol recibido'))
    , [playerTags, matches]);

    // DEFENSA - Recuperaciones de Balón (normalize accents)
    const recuperacionesData = useMemo(() => 
        getActionDataByJornada(accion => accion.includes('recuperación') || accion.includes('recuperacion'))
    , [playerTags, matches]);

    // Table data
    const tablaRendimiento = useMemo(() => {
        if (playerTags.length === 0) return [];

        const byJornada = playerTags.reduce((acc, tag) => {
            const match = matches.find(m => m.id === tag.match_id);
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
    }, [playerTags, matches]);

    const selectedPlayer = players.find(p => p.id === selectedPlayerId);

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

            {playerTags.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 text-center">
                    <p className="text-gray-400 text-lg">
                        Este jugador no tiene datos registrados aún.
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
                                            <Bar dataKey="logrados" stackId="a" fill="#8B5CF6" name="Ganados" />
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
                                            <Bar dataKey="logrados" stackId="a" fill="#8B5CF6" name="Ganados" />
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
                            {/* Tiros a Gol */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Tiros a Gol</h3>
                                {tirosGolData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de tiros a gol</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={tirosGolData}>
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

                            {/* Goles */}
                            <div className="bg-gray-800 rounded-lg p-6">
                                <h3 className="text-lg font-semibold mb-4 text-white">Goles</h3>
                                {golesData.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">Sin datos de goles</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={golesData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="jornada" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                                                labelStyle={{ color: '#F3F4F6' }}
                                            />
                                            <Legend wrapperStyle={{ color: '#F3F4F6' }} />
                                            <Bar dataKey="logrados" stackId="a" fill="#F59E0B" name="Goles" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Fallados" />
                                        </BarChart>
                                        </ResponsiveContainer>
                                )}
                            </div>

                            {/* Recuperaciones */}
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
                                            <Bar dataKey="logrados" stackId="a" fill="#10B981" name="Logradas" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Falladas" />
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
                                            <Bar dataKey="logrados" stackId="a" fill="#3B82F6" name="Logradas" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Falladas" />
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
                                            <Bar dataKey="logrados" stackId="a" fill="#EF4444" name="Logrados" />
                                            <Bar dataKey="fallados" stackId="a" fill="#EF4444" name="Fallados" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Performance Table */}
                    <div className="bg-gray-800 rounded-lg p-6">
                        <h3 className="text-xl font-semibold mb-4 text-white">Desglose por Jornada</h3>
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

