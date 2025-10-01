
import React, { useMemo, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap, Cell, LineChart, Line, LabelList } from 'recharts';
import { ActionType } from '../types.js';
import { CHART_COLORS, RESULT_COLORS, COLORS } from '../constants.js';

const KpiCard = ({ title, value, subValue }) => (
    React.createElement("div", { className: "bg-[#1e2a47] p-6 rounded-xl shadow-lg border-l-4 border-[#00c6ff] flex flex-col justify-center items-center transform hover:scale-105 transition-transform duration-300 min-h-[140px]" },
        React.createElement("h3", { className: "text-5xl font-extrabold text-white" }, value),
        React.createElement("p", { className: "text-lg font-semibold text-gray-400 mt-2 text-center" }, title),
        subValue && React.createElement("p", { className: "text-sm text-gray-500" }, subValue)
    )
);

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            React.createElement("div", { className: "bg-[#0a192f] p-3 border border-[#00c6ff] rounded-lg shadow-lg" },
                React.createElement("p", { className: "label text-white font-bold" }, `${label}`),
                payload.map((pld, index) => (
                     React.createElement("p", { key: index, style: { color: pld.color } },
                        `${pld.name}: ${'value' in pld ? (pld.value.toFixed(2) + '%') : 'N/A'}`
                    )
                ))
            )
        );
    }
    return null;
};

export const Dashboard = ({ tags, players, matches, mode, handleImportState }) => {
    const [view, setView] = useState('general');
    const importInputRef = useRef(null);

    const handleImportClick = () => {
        importInputRef.current?.click();
    };
    
    if (mode === 'viewer' && tags.length === 0) {
        return (
            React.createElement("div", { className: "flex flex-col items-center justify-center h-[60vh] bg-[#1e2a47] p-8 rounded-xl shadow-lg border border-dashed border-gray-600 text-center" },
                React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-16 w-16 text-[#00c6ff] mb-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2" },
                  React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })
                ),
                React.createElement("h2", { className: "text-2xl font-bold text-white mb-2" }, "Esperando Datos del Entrenador"),
                React.createElement("p", { className: "text-gray-400 max-w-md mx-auto mb-6" },
                    "El tablero está listo. Las gráficas aparecerán aquí en tiempo real tan pronto como el entrenador comience a etiquetar las jugadas."
                )
            )
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
        const jornadasData = {};

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
        const stats = {};
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

    const TreemapContent = (props) => {
        const { x, y, width, height, index, name, value } = props;
        const color = CHART_COLORS[index % CHART_COLORS.length];
        return (
            React.createElement("g", null,
                React.createElement("rect", { x: x, y: y, width: width, height: height, style: { fill: color, stroke: '#fff', strokeWidth: 2 } }),
                React.createElement("text", { x: x + width / 2, y: y + height / 2, textAnchor: "middle", dominantBaseline: "middle", fill: "#fff", fontSize: "12" },
                    name
                ),
                 React.createElement("text", { x: x + width / 2, y: y + height / 2 + 14, textAnchor: "middle", fill: "#fff", fontSize: "10" },
                    `(${value})`
                )
            )
        );
    };

    const renderPlayerChart = (
        dataKey, 
        title,
        color
    ) => (
        React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg h-80" },
            React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, title),
            React.createElement(ResponsiveContainer, { width: "100%", height: "100%" },
                React.createElement(BarChart, { data: playerStats.filter(p => p[dataKey] > 0).sort((a,b) => b[dataKey] - a[dataKey]), layout: "vertical" },
                    React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }),
                    React.createElement(XAxis, { type: "number", stroke: "#8892b0" }),
                    React.createElement(YAxis, { type: "category", dataKey: "name", stroke: "#8892b0", width: 80, tick: { fontSize: 12 } }),
                    React.createElement(Tooltip, { content: React.createElement(CustomTooltip, null), cursor: { fill: 'rgba(0, 198, 255, 0.1)' } }),
                    React.createElement(Bar, { dataKey: dataKey, name: title, fill: color })
                )
            )
        )
    );
    
    return (
        React.createElement("div", null,
            React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mb-6" },
                React.createElement(KpiCard, { title: "Acciones Totales", value: totalActions.toString() }),
                React.createElement(KpiCard, { title: "Efectividad General", value: effectiveness })
            ),
            React.createElement("div", { className: "flex justify-center my-6" },
                React.createElement("div", { className: "flex space-x-1 bg-[#1e2a47] p-1 rounded-lg" },
                    React.createElement("button", { onClick: () => setView('general'), className: `px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'general' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}` }, "Análisis General"),
                    React.createElement("button", { onClick: () => setView('players'), className: `px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'players' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}` }, "Análisis por Jugador")
                )
            ),
            view === 'general' ? (
                 React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6" },
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, "Efectividad por Jornada"),
                        React.createElement(ResponsiveContainer, { width: "100%", height: "90%" },
                           React.createElement(LineChart, { data: effectivenessByJornadaData, margin: { top: 20, right: 30, left: 0, bottom: 5 } },
                                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }),
                                React.createElement(XAxis, { dataKey: "jornada", stroke: "#8892b0" }),
                                React.createElement(YAxis, { stroke: "#8892b0", domain: [0, 100], tickFormatter: (tick) => `${tick}%` }),
                                React.createElement(Tooltip, { content: React.createElement(CustomTooltip, null) }),
                                React.createElement(Line, { type: "monotone", dataKey: "Efectividad", stroke: COLORS.AQUA, strokeWidth: 3, dot: { r: 5, fill: COLORS.AQUA }, activeDot: { r: 8, stroke: COLORS.AQUA, fill: COLORS.NAVY } },
                                    React.createElement(LabelList, { dataKey: "Efectividad", position: "top", formatter: (value) => `${value.toFixed(2)}%`, style: { fill: '#e6f1ff' } })
                                )
                            )
                        )
                    ),
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, "Análisis de Pases Cortos"),
                        React.createElement(ResponsiveContainer, { width: "100%", height: "90%" },
                            React.createElement(BarChart, { data: shortPassAnalysisData, margin: { top: 20, right: 30, left: 20, bottom: 5 } },
                                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }),
                                React.createElement(XAxis, { dataKey: "name", stroke: "#8892b0" }),
                                React.createElement(YAxis, { stroke: "#8892b0" }),
                                React.createElement(Tooltip, { content: React.createElement(CustomTooltip, null) }),
                                React.createElement(Legend, null),
                                React.createElement(Bar, { dataKey: "Logrados", fill: RESULT_COLORS.Logrado }),
                                React.createElement(Bar, { dataKey: "No Logrados", fill: RESULT_COLORS['No Logrado'] })
                            )
                        )
                    ),
                     React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, "Análisis de Pases Largos"),
                        React.createElement(ResponsiveContainer, { width: "100%", height: "90%" },
                            React.createElement(BarChart, { data: longPassAnalysisData, margin: { top: 20, right: 30, left: 20, bottom: 5 } },
                                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }),
                                React.createElement(XAxis, { dataKey: "name", stroke: "#8892b0" }),
                                React.createElement(YAxis, { stroke: "#8892b0" }),
                                React.createElement(Tooltip, { content: React.createElement(CustomTooltip, null) }),
                                React.createElement(Legend, null),
                                React.createElement(Bar, { dataKey: "Logrados", fill: RESULT_COLORS.Logrado }),
                                React.createElement(Bar, { dataKey: "No Logrados", fill: RESULT_COLORS['No Logrado'] })
                            )
                        )
                    ),
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, "Análisis de Duelos"),
                        React.createElement(ResponsiveContainer, { width: "100%", height: "90%" },
                             React.createElement(BarChart, { data: duelAnalysisData, margin: { top: 20, right: 30, left: 20, bottom: 5 } },
                                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }),
                                React.createElement(XAxis, { dataKey: "name", stroke: "#8892b0" }),
                                React.createElement(YAxis, { stroke: "#8892b0" }),
                                React.createElement(Tooltip, { content: React.createElement(CustomTooltip, null) }),
                                React.createElement(Legend, null),
                                React.createElement(Bar, { dataKey: "Logrados", name: "1v1 Logrados", fill: RESULT_COLORS.Logrado }),
                                React.createElement(Bar, { dataKey: "No Logrados", name: "1v1 No Logrados", fill: RESULT_COLORS['No Logrado'] }),
                                React.createElement(Bar, { dataKey: "Ganados", name: "Aéreos Ganados", fill: RESULT_COLORS.Ganado }),
                                React.createElement(Bar, { dataKey: "Perdidos", name: "Aéreos Perdidos", fill: RESULT_COLORS.Perdido })
                            )
                        )
                    ),
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4 text-center" }, "Rendimiento Ofensivo en Portería"),
                        React.createElement("div", { className: "grid grid-cols-3 gap-4 text-center" },
                            React.createElement(KpiCard, { title: "Tiros a Portería", value: offensiveGoalActions.tiros.toString() }),
                            React.createElement(KpiCard, { title: "Goles a Favor", value: offensiveGoalActions.goles.toString() }),
                            React.createElement(KpiCard, { title: "Tasa de Conversión", value: offensiveGoalActions.conversionRate })
                        )
                    ),
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg h-96" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, "Rendimiento Defensivo en Portería"),
                        React.createElement(ResponsiveContainer, { width: "100%", height: "90%" },
                           React.createElement(BarChart, { data: defensiveGoalActions, layout: "vertical", margin: { top: 20, right: 30, left: 20, bottom: 5 } },
                                React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }),
                                React.createElement(XAxis, { type: "number", stroke: "#8892b0" }),
                                React.createElement(YAxis, { type: "category", dataKey: "name", stroke: "#8892b0" }),
                                React.createElement(Tooltip, { content: React.createElement(CustomTooltip, null) }),
                                React.createElement(Bar, { dataKey: "value", name: "Total" },
                                    defensiveGoalActions.map((entry, index) => (
                                        React.createElement(Cell, { key: `cell-${index}`, fill: entry.name === 'Goles Recibidos' ? RESULT_COLORS.Perdido : RESULT_COLORS.Atajada })
                                    ))
                                )
                            )
                        )
                    )
                )
            ) : (
                React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6" },
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-xl shadow-lg lg:col-span-2 h-80" },
                        React.createElement("h3", { className: "text-lg font-bold text-[#00c6ff] mb-4" }, "Tiros a Portería Realizados"),
                        React.createElement(ResponsiveContainer, { width: "100%", height: "100%" },
                            React.createElement(Treemap, {
                                data: playerStats.filter(p => p['Tiros a Porteria Realizados'] > 0),
                                dataKey: "Tiros a Porteria Realizados",
                                nameKey: "name",
                                aspectRatio: 4/3,
                                stroke: "#fff",
                                content: React.createElement(TreemapContent, null)
                            })
                        )
                    ),
                    renderPlayerChart('Pases Cortos Logrados', 'Pases Cortos Logrados', COLORS.DARK_BLUE),
                    renderPlayerChart('Pases Largos Logrados', 'Pases Largos Logrados', COLORS.AQUA),
                    renderPlayerChart('1 a 1 Logrados', '1 a 1 Logrados', COLORS.ORANGE),
                    renderPlayerChart('Duelos Aéreos Ganados', 'Aéreos Ganados', COLORS.YELLOW)
                )
            )
        )
    );
};
