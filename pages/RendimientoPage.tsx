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

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const userTeamId = profile?.team_id;

                let matchesQuery = supabase.from('matches').select('*').order('jornada', { ascending: true });
                if (profile?.rol !== 'admin' && userTeamId) {
                    matchesQuery = matchesQuery.eq('team_id', userTeamId);
                }
                const { data: matchesData } = await matchesQuery;

                let playersQuery = supabase.from('players').select('*').order('nombre', { ascending: true });
                if (profile?.rol !== 'admin' && userTeamId) {
                    playersQuery = playersQuery.eq('team_id', userTeamId);
                }
                const { data: playersData } = await playersQuery;

                let tagsQuery = supabase.from('tags').select('*');
                if (profile?.rol !== 'admin' && userTeamId) {
                    tagsQuery = tagsQuery.eq('team_id', userTeamId);
                }
                const { data: tagsData } = await tagsQuery;

                setMatches(matchesData || []);
                setPlayers(playersData || []);
                setTags(tagsData || []);

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

    const playerTags = useMemo(() => {
        if (!selectedPlayerId) return [];
        return tags.filter(tag => tag.player_id === selectedPlayerId);
    }, [tags, selectedPlayerId]);

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

    const efectividadPorJornadaData = useMemo(() => {
        if (playerTags.length === 0) return [];

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

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
