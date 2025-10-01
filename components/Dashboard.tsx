
import React, { useMemo, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap, Cell, LineChart, Line, LabelList } from 'recharts';
import type { Tag, Player, Match } from '../types';
import { ActionType } from '../types';
import { CHART_COLORS, RESULT_COLORS, COLORS } from '../constants';

// Define a type for player statistics to ensure type safety in charts.
interface PlayerStat {
    name: string;
    'Tiros a Porteria Realizados': number;
    'Pases Cortos Logrados': number;
    'Pases Largos Logrados': number;
    '1 a 1 Logrados': number;
    'Duelos Aéreos Ganados': number;
    [key: string]: string | number;
}

const KpiCard: React.FC<{ title: string; value: string; subValue?: string }> = ({ title, value, subValue }) => (
    <div className="bg-[#1e2a47] p-6 rounded-xl shadow-lg border-l-4 border-[#00c6ff] flex flex-col justify-center items-center transform hover:scale-105 transition-transform duration-300 min-h-[140px]">
        <h3 className="text-5xl font-extrabold text-white">{value}</h3>
        <p className="text-lg font-semibold text-gray-400 mt-2 text-center">{title}</p>
        {subValue && <p className="text-sm text-gray-500">{subValue}</p>}
    </div>
);


const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#0a192f] p-3 border border-[#00c6ff] rounded-lg shadow-lg">
                <p className="label text-white font-bold">{`${label}`}</p>
                {payload.map((pld: any, index: number) => (
                     <p key={index} style={{ color: pld.color }}>
                        {`${pld.name}: ${'value' in pld ? (pld.value.toFixed(2) + '%') : 'N/A'}`}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export const Dashboard: React.FC<{ 
    tags: Tag[], 
    players: Player[], 
    matches: Match[],
    mode: 'coach' | 'viewer',
    handleImportState: (event: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ tags, players, matches, mode, handleImportState }) => {
    const [view, setView] = useState<'general' | 'players'>('general');
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        importInputRef.current?.click();
    };
    
    // In viewer mode, if there are no tags, show an informative message.
    if (mode === 'viewer' && tags.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] bg-[#1e2a47] p-8 rounded-xl shadow-lg border border-dashed border-gray-600 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-[#00c6ff] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-2xl font-bold text-white mb-2">Esperando Datos del Entrenador</h2>
                <p className="text-gray-400 max-w-md mx-auto mb-6">
                    El tablero está listo. Las gráficas aparecerán aquí en tiempo real tan pronto como el entrenador comience a etiquetar las jugadas.
                </p>
            </div>
        );
    }


    const { totalActions, effectiveness } = useMemo(() => {
        const successfulActions = tags.filter(tag => tag.result === 'Logrado' || tag.result === 'Gol' || tag.result === 'Ganado' || tag.result === 'Atajada').length;
        const total = tags.length;
        return {
            totalActions: total,
            effectiveness: total > 0 ? ((successfulActions / total) * 100).toFixed(2) + '%' : '0%',
        };
    }, [tags]);

    // --- PHASE 2: Detailed Analytics Panels Data ---

    const shortPassAnalysisData = useMemo(() => {
        const data = {
            'P. Cortos Ofensivos': { name: 'P. Cortos Of.', Logrados: 0, 'No Logrados': 0 },
            'P. Cortos Defensivos': { name: 'P. Cortos Def.', Logrados: 0, 'No Logrados': 0 },
        };
        tags.forEach(tag => {
            switch (tag.action) {
                case ActionType.PASE_CORTO_OFENSIVO_LOGRADO: data['P. Cortos Ofensivos'].Logrados++; break;
                case ActionType.PASE_CORTO_OFENSIVO_NO_LOGRADO: data['P. Cortos Ofensivos']['No Logrados']++; break;
                case ActionType.PASE_CORTO_DEFENSIVO_LOGRADO: data['P. Cortos Defensivos'].Logrados++; break;
                case ActionType.PASE_CORTO_DEFENSIVO_NO_LOGRADO: data['P. Cortos Defensivos']['No Logrados']++; break;
            }
        });
        return Object.values(data);
    }, [tags]);

    const longPassAnalysisData = useMemo(() => {
        const data = {
            'P. Largos Ofensivos': { name: 'P. Largos Of.', Logrados: 0, 'No Logrados': 0 },
            'P. Largos Defensivos': { name: 'P. Largos Def.', Logrados: 0, 'No Logrados': 0 },
        };
        tags.forEach(tag => {
            switch (tag.action) {
                case ActionType.PASE_LARGO_OFENSIVO_LOGRADO: data['P. Largos Ofensivos'].Logrados++; break;
                case ActionType.PASE_LARGO_OFENSIVO_NO_LOGRADO: data['P. Largos Ofensivos']['No Logrados']++; break;
                case ActionType.PASE_LARGO_DEFENSIVO_LOGRADO: data['P. Largos Defensivos'].Logrados++; break;
                case ActionType.PASE_LARGO_DEFENSIVO_NO_LOGRADO: data['P. Largos Defensivos']['No Logrados']++; break;
            }
        });
        return Object.values(data);
    }, [tags]);


    const duelAnalysisData = useMemo(() => {
        const data = {
            '1 vs 1 Ofensivo': { name: '1 vs 1 Of.', Logrados: 0, 'No Logrados': 0 },
            '1 vs 1 Defensivo': { name: '1 vs 1 Def.', Logrados: 0, 'No Logrados': 0 },
            'Aéreo Ofensivo': { name: 'Aéreo Of.', Ganados: 0, Perdidos: 0 },
            'Aéreo Defensivo': { name: 'Aéreo Def.', Ganados: 0, Perdidos: 0 },
        };
        tags.forEach(tag => {
            switch(tag.action) {
                case ActionType.UNO_A_UNO_OFENSIVO_LOGRADO: data['1 vs 1 Ofensivo'].Logrados++; break;
                case ActionType.UNO_A_UNO_OFENSIVO_NO_LOGRADO: data['1 vs 1 Ofensivo']['No Logrados']++; break;
                case ActionType.UNO_A_UNO_DEFENSIVO_LOGRADO: data['1 vs 1 Defensivo'].Logrados++; break;
                case ActionType.UNO_A_UNO_DEFENSIVO_NO_LOGRADO: data['1 vs 1 Defensivo']['No Logrados']++; break;
                case ActionType.AEREO_OFENSIVO_GANADO: data['Aéreo Ofensivo'].Ganados++; break;
                case ActionType.AEREO_OFENSIVO_PERDIDO: data['Aéreo Ofensivo'].Perdidos++; break;
                case ActionType.AEREO_DEFENSIVO_GANADO: data['Aéreo Defensivo'].Ganados++; break;
                case ActionType.AEREO_DEFENSIVO_PERDIDO: data['Aéreo Defensivo'].Perdidos++; break;
            }
        });
        return Object.values(data);
    }, [tags]);

    const offensiveGoalActions = useMemo(() => {
        const tiros = tags.filter(t => t.action === ActionType.TIRO_A_PORTERIA_REALIZADO || t.action === ActionType.GOL_A_FAVOR).length;
        const goles = tags.filter(t => t.action === ActionType.GOL_A_FAVOR).length;
        return { tiros, goles, conversionRate: tiros > 0 ? ((goles / tiros) * 100).toFixed(1) + '%' : '0%' };
    }, [tags]);

    const defensiveGoalActions = useMemo(() => {
        const tirosRecibidos = tags.filter(t => t.action === ActionType.TIRO_A_PORTERIA_RECIBIDO || t.action === ActionType.ATAJADA_REALIZADA || t.action === ActionType.GOL_RECIBIDO).length;
        const atajadas = tags.filter(t => t.action === ActionType.ATAJADA_REALIZADA).length;
        const golesRecibidos = tags.filter(t => t.action === ActionType.GOL_RECIBIDO).length;
        return [
            { name: 'Atajadas', value: atajadas },
            { name: 'Goles Recibidos', value: golesRecibidos },
        ];
    }, [tags]);

    const effectivenessByJornadaData = useMemo(() => {
        const jornadasData: { [key: string]: { total: number; successful: number } } = {};

        tags.forEach(tag => {
            const match = matches.find(m => m.id === tag.matchId);
            if (match) {
                const jornadaKey = `Jornada ${match.jornada}`;
                if (!jornadasData[jornadaKey]) {
                    jornadasData[jornadaKey] = { total: 0, successful: 0 };
                }
                jornadasData[jornadaKey].total++;
                if (['Logrado', 'Gol', 'Ganado', 'Atajada'].includes(tag.result)) {
                    jornadasData[jornadaKey].successful++;
                }
            }
        });

        const chartData = Object.entries(jornadasData).map(([jornada, data]) => ({
            jornada,
            Efectividad: data.total > 0 ? (data.successful / data.total) * 100 : 0,
        }));
        
        return chartData.sort((a, b) => {
            const numA = parseInt(a.jornada.replace('Jornada ', ''));
            const numB = parseInt(b.jornada.replace('Jornada ', ''));
            return numA - numB;
        });
    }, [tags, matches]);


    const playerStats = useMemo(() => {
        const stats: Record<string, PlayerStat> = {};
        players.forEach(p => {
            stats[p.id] = { name: p.name, 'Tiros a Porteria Realizados': 0, 'Pases Cortos Logrados': 0, 'Pases Largos Logrados': 0, '1 a 1 Logrados': 0, 'Duelos Aéreos Ganados': 0 };
        });
        tags.forEach(tag => {
            if (!stats[tag.playerId]) return;
            if (tag.action === ActionType.TIRO_A_PORTERIA_REALIZADO || tag.action === ActionType.GOL_A_FAVOR) stats[tag.playerId]['Tiros a Porteria Realizados']++;
            if (tag.action.includes('Pase Corto') && tag.result === 'Logrado') stats[tag.playerId]['Pases Cortos Logrados']++;
            if (tag.action.includes('Pase Largo') && tag.result === 'Logrado') stats[tag.playerId]['Pases Largos Logrados']++;
            if (tag.action.includes('1 a 1') && (tag.result === 'Logrado' || tag.result === 'Ganado')) stats[tag.playerId]['1 a 1 Logrados']++;
            if (tag.action.includes('Aereo') && tag.result === 'Ganado') stats[tag.playerId]['Duelos Aéreos Ganados']++;
        });
        return Object.values(stats);
    }, [tags, players]);

    const TreemapContent = (props: any) => {
        const { x, y, width, height, index, name, value } = props;
        const color = CHART_COLORS[index % CHART_COLORS.length];
        return (
            <g>
                <rect x={x} y={y} width={width} height={height} style={{ fill: color, stroke: '#fff', strokeWidth: 2 }} />
                <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="12">
                    {name}
                </text>
                 <text x={x + width / 2} y={y + height / 2 + 14} textAnchor="middle" fill="#fff" fontSize="10">
                    ({value})
                </text>
            </g>
        );
    };

    const renderPlayerChart = (
        dataKey: 'Pases Cortos Logrados' | 'Pases Largos Logrados' | '1 a 1 Logrados' | 'Duelos Aéreos Ganados', 
        title: string,
        color: string
    ) => (
        <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg h-80">
            <h3 className="text-lg font-bold text-[#00c6ff] mb-4">{title}</h3>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={playerStats.filter(p => p[dataKey] > 0).sort((a,b) => (b[dataKey] as number) - (a[dataKey] as number))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="#8892b0" />
                    <YAxis type="category" dataKey="name" stroke="#8892b0" width={80} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 198, 255, 0.1)' }} />
                    <Bar dataKey={dataKey} name={title} fill={color} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
    
    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <KpiCard title="Acciones Totales" value={totalActions.toString()} />
                <KpiCard title="Efectividad General" value={effectiveness} />
            </div>

            <div className="flex justify-center my-6">
                <div className="flex space-x-1 bg-[#1e2a47] p-1 rounded-lg">
                    <button onClick={() => setView('general')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'general' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}`}>Análisis General</button>
                    <button onClick={() => setView('players')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'players' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}`}>Análisis por Jugador</button>
                </div>
            </div>

            {view === 'general' ? (
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4">Efectividad por Jornada</h3>
                        <ResponsiveContainer width="100%" height="90%">
                           <LineChart data={effectivenessByJornadaData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="jornada" stroke="#8892b0" />
                                <YAxis stroke="#8892b0" domain={[0, 100]} tickFormatter={(tick) => `${tick}%`} />
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey="Efectividad" stroke={COLORS.AQUA} strokeWidth={3} dot={{ r: 5, fill: COLORS.AQUA }} activeDot={{ r: 8, stroke: COLORS.AQUA, fill: COLORS.NAVY }}>
                                    <LabelList dataKey="Efectividad" position="top" formatter={(value: number) => `${value.toFixed(2)}%`} style={{ fill: '#e6f1ff' }} />
                                </Line>
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4">Análisis de Pases Cortos</h3>
                        <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={shortPassAnalysisData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" stroke="#8892b0" />
                                <YAxis stroke="#8892b0" />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Bar dataKey="Logrados" fill={RESULT_COLORS.Logrado} />
                                <Bar dataKey="No Logrados" fill={RESULT_COLORS['No Logrado']} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                     <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4">Análisis de Pases Largos</h3>
                        <ResponsiveContainer width="100%" height="90%">
                            <BarChart data={longPassAnalysisData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" stroke="#8892b0" />
                                <YAxis stroke="#8892b0" />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Bar dataKey="Logrados" fill={RESULT_COLORS.Logrado} />
                                <Bar dataKey="No Logrados" fill={RESULT_COLORS['No Logrado']} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4">Análisis de Duelos</h3>
                        <ResponsiveContainer width="100%" height="90%">
                             <BarChart data={duelAnalysisData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" stroke="#8892b0" />
                                <YAxis stroke="#8892b0" />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Bar dataKey="Logrados" name="1v1 Logrados" fill={RESULT_COLORS.Logrado} />
                                <Bar dataKey="No Logrados" name="1v1 No Logrados" fill={RESULT_COLORS['No Logrado']} />
                                <Bar dataKey="Ganados" name="Aéreos Ganados" fill={RESULT_COLORS.Ganado} />
                                <Bar dataKey="Perdidos" name="Aéreos Perdidos" fill={RESULT_COLORS.Perdido} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4 text-center">Rendimiento Ofensivo en Portería</h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <KpiCard title="Tiros a Portería" value={offensiveGoalActions.tiros.toString()} />
                            <KpiCard title="Goles a Favor" value={offensiveGoalActions.goles.toString()} />
                            <KpiCard title="Tasa de Conversión" value={offensiveGoalActions.conversionRate} />
                        </div>
                    </div>

                    <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4">Rendimiento Defensivo en Portería</h3>
                        <ResponsiveContainer width="100%" height="90%">
                           <BarChart data={defensiveGoalActions} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis type="number" stroke="#8892b0" />
                                <YAxis type="category" dataKey="name" stroke="#8892b0" />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="value" name="Total">
                                    {defensiveGoalActions.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.name === 'Goles Recibidos' ? RESULT_COLORS.Perdido : RESULT_COLORS.Atajada} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-[#1e2a47] p-4 rounded-xl shadow-lg lg:col-span-2 h-80">
                        <h3 className="text-lg font-bold text-[#00c6ff] mb-4">Tiros a Portería Realizados</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={playerStats.filter(p => p['Tiros a Porteria Realizados'] > 0)}
                                dataKey="Tiros a Porteria Realizados"
                                nameKey="name"
                                aspectRatio={4/3}
                                stroke="#fff"
                                content={<TreemapContent />}
                            />
                        </ResponsiveContainer>
                    </div>
                    {renderPlayerChart('Pases Cortos Logrados', 'Pases Cortos Logrados', COLORS.DARK_BLUE)}
                    {renderPlayerChart('Pases Largos Logrados', 'Pases Largos Logrados', COLORS.AQUA)}
                    {renderPlayerChart('1 a 1 Logrados', '1 a 1 Logrados', COLORS.ORANGE)}
                    {renderPlayerChart('Duelos Aéreos Ganados', 'Aéreos Ganados', COLORS.YELLOW)}
                </div>
            )}

        </div>
    );
};
