import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match, Tag, Player, TeamAnalysis, TeamAnalysisHistory } from '../types';
import { METRICS } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { analyzeTeamPerformance } from '../services/geminiTeamAnalysisService';
import { saveTeamAnalysis, getCachedTeamAnalysis, getTeamAnalysisHistory } from '../services/teamAnalysisHistoryService';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell, Treemap, ScatterChart, Scatter } from 'recharts';

type Filters = {
    matchId: string;
    torneo: string;
    categoria: string;
    jornada: string;
    equipo: string;
    jugador: string;
    accion: string;
};

const COLORS = ['#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#10B981', '#6366F1', '#F59E0B'];

const CustomizedContent = (props: any) => {
    const { depth, x, y, width, height, index, name, size } = props;
    if (width < 35 || height < 20) return null;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: COLORS[index % COLORS.length],
                    stroke: '#1F2937',
                    strokeWidth: 2,
                }}
            />
            <text
                x={x + width / 2}
                y={y + height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize={14}
                fontWeight="normal"
            >
                {name}
            </text>
            <text
                x={x + width / 2}
                y={y + height / 2 + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize={12}
                fontWeight="normal"
            >
                ({size})
            </text>
        </g>
    );
};

const parseTimeToSeconds = (value: any): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string') {
        let s = value.trim();
        s = s.replace(',', '.');
        if (s.includes(':')) {
            const parts = s.split(':').map(p => p.trim());
            if (parts.length === 3) {
                const hours = parseFloat(parts[0]) || 0;
                const mins = parseFloat(parts[1]) || 0;
                const secs = parseFloat(parts[2]) || 0;
                return hours * 3600 + mins * 60 + secs;
            }
            if (parts.length === 2) {
                const mins = parseFloat(parts[0]) || 0;
                const secs = parseFloat(parts[1]) || 0;
                return mins * 60 + secs;
            }
        }
        const num = parseFloat(s);
        return isNaN(num) ? null : num;
    }
    if (typeof value === 'object') {
        const candidate = (value as any).tiempo ?? (value as any).time ?? (value as any).duration ?? (value as any).seconds;
        if (candidate !== undefined) {
            return parseTimeToSeconds(candidate);
        }
    }
    return null;
};

const getTagTime = (tag: any): number | null => {
    if (!tag) return null;
    const raw = (tag as any).tiempo_transicion
        ?? (tag as any).tiempo_recuperacion
        ?? (tag as any).tiempo
        ?? (tag as any).time
        ?? (tag as any).duration
        ?? (tag as any).timestamp
        ?? (tag as any).metadata?.tiempo
        ?? (tag as any).metadata?.time
        ?? (tag as any).metadata?.seconds
        ?? (tag as any).timestamp_seconds;

    let seconds = parseTimeToSeconds(raw);
    if (seconds === null) {
        const maybeNum = Number(raw);
        if (!isNaN(maybeNum)) seconds = maybeNum;
    }
    if (seconds === null) return null;
    if (seconds > 10000) {
        seconds = seconds / 1000;
    }
    return seconds;
};

const formatSecondsToMMSS = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(Number(value))) return '';
    const total = Math.floor(Number(value));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
};

const formatHistoryDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const DashboardPage: React.FC = () => {
    const { profile } = useAuth();
    const [matches, setMatches] = useState<Match[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'player'>('general');
    
    const [teamAnalysis, setTeamAnalysis] = useState<TeamAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [isFromCache, setIsFromCache] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [analysisHistory, setAnalysisHistory] = useState<TeamAnalysisHistory[]>([]);
    
    const [filters, setFilters] = useState<Filters>({
        matchId: 'all',
        torneo: 'all',
        categoria: 'all',
        jornada: 'all',
        equipo: 'all',
        jugador: 'all',
        accion: 'all',
    });

    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: matchesData, error: matchesError } = await supabase.from('matches').select('*').order('fecha', { ascending: false });
                if (matchesError) throw matchesError;
                setMatches(matchesData || []);

                const pageSize = 1000;
                const { data: firstPageData, count, error: firstError } = await supabase
                  .from('tags')
                  .select('*', { count: 'exact' })
                  .range(0, pageSize - 1);

                if (firstError) throw firstError;

                let allTags = firstPageData || [];

                if (typeof count === 'number' && count > allTags.length) {
                  for (let from = allTags.length; from < count; from += pageSize) {
                    const to = Math.min(from + pageSize - 1, count - 1);
                    const { data: pageData, error: pageError } = await supabase
                      .from('tags')
                      .select('*')
                      .range(from, to);
                    if (pageError) throw pageError;
                    allTags = allTags.concat(pageData || []);
                  }
                }

                setTags(allTags || []);

                const { data: playersData, error: playersError } = await supabase.from('players').select('*');
                if (playersError) throw playersError;
                setPlayers(playersData || []);

            } catch (err: any) {
                console.error("Error fetching dashboard data:", err);
                setError("No se pudieron cargar los datos del tablero.");
            } finally {
                setLoading(false);
            }
        };
        fetchAllData();
    }, []);

    const filteredMatches = useMemo(() => {
        return matches.filter(match => {
            if (filters.torneo !== 'all' && match.torneo !== filters.torneo) return false;
            if (filters.jornada !== 'all' && String(match.jornada) !== filters.jornada) return false;
            if (filters.equipo !== 'all' && match.nombre_equipo !== filters.equipo) return false;
            if (filters.categoria !== 'all' && match.categoria !== filters.categoria) return false;
            return true;
        });
    }, [matches, filters]);

    const filteredTags = useMemo(() => {
        const matchIds = new Set(filteredMatches.map(m => m.id));
        return tags.filter(tag => {
            if (filters.matchId !== 'all' && tag.match_id !== filters.matchId) return false;
            if (filters.matchId === 'all' && !matchIds.has(tag.match_id)) return false;
            if (filters.jugador !== 'all' && tag.player_id !== filters.jugador) return false;
            if (filters.accion !== 'all' && tag.accion !== filters.accion) return false;
            return true;
        });
    }, [tags, filteredMatches, filters]);

    const filterOptions = useMemo(() => {
        const torneo = [...new Set(matches.map(m => m.torneo).filter(Boolean))];
        const categoria = [...new Set(matches.map(m => m.categoria).filter(Boolean))];
        const jornada = [...new Set(matches.map(m => m.jornada).filter(j => j !== null && j !== undefined))].sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
        const equipo = [...new Set(matches.map(m => m.nombre_equipo).filter(Boolean))];
        const jugador = players.sort((a,b) => a.nombre.localeCompare(b.nombre));
        const accion = [...new Set(tags.map(t => t.accion).filter(Boolean))];

        return { torneo, categoria, jornada, equipo, jugador, accion };
    }, [matches, tags, players]);

    const summaryData = useMemo(() => {
        const total = filteredTags.length;
        const logrados = filteredTags.filter(t => t.resultado === 'logrado').length;
        const efectividad = total > 0 ? (logrados / total) * 100 : 0;
        return { total, efectividad };
    }, [filteredTags]);

    const selectedTeamName = useMemo(() => {
        if (filters.equipo !== 'all') return filters.equipo;
        const teamNames = [...new Set(filteredMatches.map(m => m.nombre_equipo).filter(Boolean))];
        return teamNames.length === 1 ? teamNames[0] : teamNames.length > 1 ? 'Varios equipos' : 'Sin equipo';
    }, [filters.equipo, filteredMatches]);

    const selectedTeamId = useMemo(() => {
        if (filters.equipo !== 'all') {
            const match = matches.find(m => m.nombre_equipo === filters.equipo);
            return match?.team_id || null;
        }
        const teamIds = [...new Set(filteredMatches.map(m => m.team_id).filter(Boolean))];
        return teamIds.length === 1 ? teamIds[0] : null;
    }, [filters.equipo, filteredMatches, matches]);

    useEffect(() => {
        if (selectedTeamId) {
            getTeamAnalysisHistory(selectedTeamId).then(setAnalysisHistory);
        } else {
            setAnalysisHistory([]);
        }
    }, [selectedTeamId]);

    const runTeamAIAnalysis = async (forceNew: boolean = false) => {
        if (filteredTags.length === 0 || !selectedTeamId) return;

        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const totalAcciones = filteredTags.length;
            const totalLogradas = filteredTags.filter(t => t.resultado === 'logrado').length;
            const efectividadGlobal = totalAcciones > 0 ? Math.round((totalLogradas / totalAcciones) * 100) : 0;

            const currentFilters = {
                torneo: filters.torneo !== 'all' ? filters.torneo : undefined,
                categoria: filters.categoria !== 'all' ? filters.categoria : undefined,
            };

            if (!forceNew) {
                const cached = await getCachedTeamAnalysis(
                    selectedTeamId,
                    filteredMatches.length,
                    totalAcciones,
                    efectividadGlobal,
                    currentFilters
                );

                if (cached) {
                    setTeamAnalysis(cached.analysis_data);
                    setIsFromCache(true);
                    setIsAnalyzing(false);
                    return;
                }
            }

            const filteredPlayers = players.filter(p => {
                const playerTagIds = new Set(filteredTags.map(t => t.player_id));
                return playerTagIds.has(p.id);
            });

            const analysis = await analyzeTeamPerformance(
                selectedTeamName,
                filteredMatches,
                filteredTags,
                filteredPlayers
            );

            setTeamAnalysis(analysis);
            setIsFromCache(false);

            await saveTeamAnalysis({
                teamId: selectedTeamId,
                teamName: selectedTeamName,
                analysisData: analysis,
                filtersUsed: currentFilters,
                totalPartidos: filteredMatches.length,
                totalAcciones,
                efectividadGlobal
            });

            const updatedHistory = await getTeamAnalysisHistory(selectedTeamId);
            setAnalysisHistory(updatedHistory);

        } catch (err: any) {
            console.error('Error in team AI analysis:', err);
            setAnalysisError(err.message || 'Error al generar el analisis del equipo');
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const effectivenessByJornada = useMemo(() => {
        const dataByJornada: { [key: string]: { logradas: number, total: number } } = {};
        
        filteredTags.forEach(tag => {
            const match = matches.find(m => m.id === tag.match_id);
            if (!match || !match.jornada) return;

            const jornada = `Jornada ${match.jornada}`;
            if (!dataByJornada[jornada]) {
                dataByJornada[jornada] = { logradas: 0, total: 0 };
            }
            dataByJornada[jornada].total++;
            if (tag.resultado === 'logrado') {
                dataByJornada[jornada].logradas++;
            }
        });

        return Object.entries(dataByJornada)
            .map(([jornada, data]) => ({
                name: jornada,
                Efectividad: data.total > 0 ? parseFloat(((data.logradas / data.total) * 100).toFixed(2)) : 0,
            }))
            .sort((a, b) => parseInt(a.name.split(' ')[1]) - parseInt(b.name.split(' ')[1]));

    }, [filteredTags, matches]);

    const pasesCortosData = useMemo(() => {
        const data = {
            'P. Cortos Of.': { logrados: 0, noLogrados: 0 },
            'P. Cortos Def.': { logrados: 0, noLogrados: 0 },
        };
        filteredTags.forEach(tag => {
            if (tag.accion === 'Pase corto ofensivo') {
                if(tag.resultado === 'logrado') data['P. Cortos Of.'].logrados++;
                else data['P. Cortos Of.'].noLogrados++;
            } else if (tag.accion === 'Pase corto defensivo') {
                if(tag.resultado === 'logrado') data['P. Cortos Def.'].logrados++;
                else data['P. Cortos Def.'].noLogrados++;
            }
        });
        return [
            { name: 'P. Cortos Of.', Logrados: data['P. Cortos Of.'].logrados, 'No Logrados': data['P. Cortos Of.'].noLogrados },
            { name: 'P. Cortos Def.', Logrados: data['P. Cortos Def.'].logrados, 'No Logrados': data['P. Cortos Def.'].noLogrados },
        ];
    }, [filteredTags]);

    const pasesLargosData = useMemo(() => {
        const data = {
            'P. Largos Of.': { logrados: 0, noLogrados: 0 },
            'P. Largos Def.': { logrados: 0, noLogrados: 0 },
        };
        filteredTags.forEach(tag => {
            if (tag.accion === 'Pase largo ofensivo') {
                if(tag.resultado === 'logrado') data['P. Largos Of.'].logrados++;
                else data['P. Largos Of.'].noLogrados++;
            } else if (tag.accion === 'Pase largo defensivo') {
                if(tag.resultado === 'logrado') data['P. Largos Def.'].logrados++;
                else data['P. Largos Def.'].noLogrados++;
            }
        });
        return [
            { name: 'P. Largos Of.', Logrados: data['P. Largos Of.'].logrados, 'No Logrados': data['P. Largos Of.'].noLogrados },
            { name: 'P. Largos Def.', Logrados: data['P. Largos Def.'].logrados, 'No Logrados': data['P. Largos Def.'].noLogrados },
        ];
    }, [filteredTags]);
    
    const duelosData = useMemo(() => {
        const data = {
            '1 vs 1 Of.': { logrados: 0, noLogrados: 0 },
            '1 vs 1 Def.': { logrados: 0, noLogrados: 0 },
            'Aéreo Of.': { logrados: 0, noLogrados: 0 },
            'Aéreo Def.': { logrados: 0, noLogrados: 0 },
        };
        filteredTags.forEach(tag => {
            switch(tag.accion) {
                case '1 vs 1 ofensivo':
                    tag.resultado === 'logrado' ? data['1 vs 1 Of.'].logrados++ : data['1 vs 1 Of.'].noLogrados++;
                    break;
                case '1 vs 1 defensivo':
                     tag.resultado === 'logrado' ? data['1 vs 1 Def.'].logrados++ : data['1 vs 1 Def.'].noLogrados++;
                    break;
                case 'Aéreo ofensivo':
                     tag.resultado === 'logrado' ? data['Aéreo Of.'].logrados++ : data['Aéreo Of.'].noLogrados++;
                    break;
                case 'Aéreo defensivo':
                     tag.resultado === 'logrado' ? data['Aéreo Def.'].logrados++ : data['Aéreo Def.'].noLogrados++;
                    break;
            }
        });
        return [
            { name: '1 vs 1 Of.', Logrados: data['1 vs 1 Of.'].logrados, 'No Logrados': data['1 vs 1 Of.'].noLogrados },
            { name: '1 vs 1 Def.', Logrados: data['1 vs 1 Def.'].logrados, 'No Logrados': data['1 vs 1 Def.'].noLogrados },
            { name: 'Aéreo Of.', Logrados: data['Aéreo Of.'].logrados, 'No Logrados': data['Aéreo Of.'].noLogrados },
            { name: 'Aéreo Def.', Logrados: data['Aéreo Def.'].logrados, 'No Logrados': data['Aéreo Def.'].noLogrados },
        ];
    }, [filteredTags]);

    const rendimientoOfensivoPorteria = useMemo(() => {
        const tirosAPorteria = filteredTags.filter(t => t.accion === 'Tiros a portería').length;
        const golesAFavor = filteredTags.filter(t => t.accion === 'Goles a favor').length;
        const tasaConversion = tirosAPorteria > 0 ? (golesAFavor / tirosAPorteria) * 100 : 0;
        return { tirosAPorteria, golesAFavor, tasaConversion };
    }, [filteredTags]);

    const rendimientoDefensivoPorteria = useMemo(() => {
        const atajadas = filteredTags.filter(t => t.accion === 'Atajadas').length;
        const golesRecibidos = filteredTags.filter(t => t.accion === 'Goles recibidos').length;
        return [
            { name: 'Atajadas', value: atajadas, fill: '#EAB308' },
            { name: 'Goles Recibidos', value: golesRecibidos, fill: '#EF4444' },
        ];
    }, [filteredTags]);

    const treemapData = useMemo(() => {
        const shotsByPlayer: { [playerId: string]: number } = {};
        
        filteredTags
            .filter(tag => tag.accion === 'Tiros a portería')
            .forEach(tag => {
                if (tag.player_id) {
                    shotsByPlayer[tag.player_id] = (shotsByPlayer[tag.player_id] || 0) + 1;
                }
            });
            
        return Object.entries(shotsByPlayer)
            .map(([playerId, count]) => {
                const player = players.find(p => p.id === playerId);
                return {
                    name: player ? player.nombre : 'Desconocido',
                    size: count,
                };
            })
            .sort((a, b) => b.size - a.size);

    }, [filteredTags, players]);

    const pasesCortosLogradosData = useMemo(() => {
        const counts: { [playerId: string]: number } = {};
        filteredTags
            .filter(tag => (tag.accion === 'Pase corto ofensivo' || tag.accion === 'Pase corto defensivo') && tag.resultado === 'logrado')
            .forEach(tag => {
                if (tag.player_id) {
                    counts[tag.player_id] = (counts[tag.player_id] || 0) + 1;
                }
            });
        
        return Object.entries(counts)
            .map(([playerId, count]) => ({
                name: players.find(p => p.id === playerId)?.nombre || 'Desconocido',
                value: count,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredTags, players]);

    const pasesLargosLogradosData = useMemo(() => {
        const counts: { [playerId: string]: number } = {};
        filteredTags
            .filter(tag => (tag.accion === 'Pase largo ofensivo' || tag.accion === 'Pase largo defensivo') && tag.resultado === 'logrado')
            .forEach(tag => {
                if (tag.player_id) {
                    counts[tag.player_id] = (counts[tag.player_id] || 0) + 1;
                }
            });
        
        return Object.entries(counts)
            .map(([playerId, count]) => ({
                name: players.find(p => p.id === playerId)?.nombre || 'Desconocido',
                value: count,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredTags, players]);
    
    const duelos1v1LogradosData = useMemo(() => {
        const counts: { [playerId: string]: number } = {};
        filteredTags
            .filter(tag => (tag.accion === '1 vs 1 ofensivo' || tag.accion === '1 vs 1 defensivo') && tag.resultado === 'logrado')
            .forEach(tag => {
                if (tag.player_id) {
                    counts[tag.player_id] = (counts[tag.player_id] || 0) + 1;
                }
            });
        
        return Object.entries(counts)
            .map(([playerId, count]) => ({
                name: players.find(p => p.id === playerId)?.nombre || 'Desconocido',
                value: count,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredTags, players]);

    const duelosAereosLogradosData = useMemo(() => {
        const counts: { [playerId: string]: number } = {};
        filteredTags
            .filter(tag => (tag.accion === 'Aéreo ofensivo' || tag.accion === 'Aéreo defensivo') && tag.resultado === 'logrado')
            .forEach(tag => {
                if (tag.player_id) {
                    counts[tag.player_id] = (counts[tag.player_id] || 0) + 1;
                }
            });
        
        return Object.entries(counts)
            .map(([playerId, count]) => ({
                name: players.find(p => p.id === playerId)?.nombre || 'Desconocido',
                value: count,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredTags, players]);

    const transicionesOfensivasData = useMemo(() => {
        const logradas = filteredTags.filter(
            t => t.accion === 'Transición ofensiva lograda'
        ).length;
        const noLogradas = filteredTags.filter(
            t => t.accion === 'Transición ofensiva no lograda'
        ).length;
        return [
            { name: 'Logradas', value: logradas, fill: '#10B981' },
            { name: 'No Logradas', value: noLogradas, fill: '#EF4444' },
        ];
    }, [filteredTags]);

    const transicionesDefensivasData = useMemo(() => {
        const logradas = filteredTags.filter(
            t => t.accion === 'Transición defensiva lograda'
        ).length;
        const noLogradas = filteredTags.filter(
            t => t.accion === 'Transición defensiva no lograda'
        ).length;
        return [
            { name: 'Logradas', value: logradas, fill: '#3B82F6' },
            { name: 'No Logradas', value: noLogradas, fill: '#F97316' },
        ];
    }, [filteredTags]);

    const recuperacionBalonPorJugador = useMemo(() => {
        const counts: { [playerId: string]: number } = {};
        filteredTags
            .filter(tag => tag.accion === 'Recuperación de balón')
            .forEach(tag => {
                if (tag.player_id) {
                    counts[tag.player_id] = (counts[tag.player_id] || 0) + 1;
                }
            });
        return Object.entries(counts)
            .map(([playerId, count]) => ({
                name: players.find(p => p.id === playerId)?.nombre || 'Desconocido',
                value: count,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [filteredTags, players]);

    const scatterTransicionesData = useMemo(() => {
        const transiciones = filteredTags.filter(t =>
            t.accion === 'Transición ofensiva lograda' || t.accion === 'Transición ofensiva no lograda'
        );

        const pts: { jornadaNum: number; jornadaX: number; jornadaLabel: string; tiempo: number; tagId: string | number }[] = [];

        transiciones.forEach(tag => {
            const match = matches.find(m => m.id === tag.match_id);
            if (!match || !match.jornada) return;
            const time = getTagTime(tag);
            if (time === null) return;
            pts.push({
                jornadaNum: match.jornada,
                jornadaX: match.jornada,
                jornadaLabel: `Jornada ${match.jornada}`,
                tiempo: time,
                tagId: tag.id
            });
        });

        const byJornada: Record<number, typeof pts> = {};
        pts.forEach(p => {
            if (!byJornada[p.jornadaNum]) byJornada[p.jornadaNum] = [];
            byJornada[p.jornadaNum].push(p);
        });

        const spread = 0.12;
        const final: typeof pts = [];
        Object.keys(byJornada).forEach(k => {
            const j = Number(k);
            const arr = byJornada[j];
            const count = arr.length;
            arr.forEach((item, idx) => {
                const offset = (count === 1) ? 0 : ((idx - (count - 1) / 2) * spread);
                final.push({
                    ...item,
                    jornadaX: item.jornadaNum + offset
                });
            });
        });

        return final.sort((a, b) => a.jornadaNum - b.jornadaNum || a.jornadaX - b.jornadaX);
    }, [filteredTags, matches]);

    const scatterRecuperacionesData = useMemo(() => {
        const perdidas = filteredTags.filter(t => t.accion === 'Perdida de balon');
        const recuperaciones = filteredTags.filter(t => t.accion === 'Recuperación de balón');

        const pts: { jornadaNum: number; jornadaX: number; jornadaLabel: string; tiempo: number; tagId: string | number; lossTime: number; recoveryTime: number }[] = [];

        const perdidasPorPartido: Record<string, { id: string | number; time: number }[]> = {};
        const recuperacionesPorPartido: Record<string, { id: string | number; time: number }[]> = {};

        perdidas.forEach(tag => {
            const time = getTagTime(tag);
            if (time === null) return;
            if (!perdidasPorPartido[tag.match_id]) perdidasPorPartido[tag.match_id] = [];
            perdidasPorPartido[tag.match_id].push({ id: tag.id, time });
        });

        recuperaciones.forEach(tag => {
            const time = getTagTime(tag);
            if (time === null) return;
            if (!recuperacionesPorPartido[tag.match_id]) recuperacionesPorPartido[tag.match_id] = [];
            recuperacionesPorPartido[tag.match_id].push({ id: tag.id, time });
        });

        Object.keys(perdidasPorPartido).forEach(matchId => {
            const match = matches.find(m => m.id === matchId);
            if (!match || !match.jornada) return;
            const jornadaNum = match.jornada;

            const losses = perdidasPorPartido[matchId].sort((a, b) => a.time - b.time);
            const recoveries = (recuperacionesPorPartido[matchId] || []).sort((a, b) => a.time - b.time);

            if (recoveries.length === 0 || losses.length === 0) return;

            recoveries.forEach(rec => {
                const prevLosses = losses.filter(l => l.time < rec.time);
                if (prevLosses.length === 0) return;
                const lastLoss = prevLosses[prevLosses.length - 1];
                const duration = rec.time - lastLoss.time;
                if (duration < 0) return;
                if (duration < 1 || duration > 3959) return;
                pts.push({
                    jornadaNum,
                    jornadaX: jornadaNum,
                    jornadaLabel: `Jornada ${jornadaNum}`,
                    tiempo: duration,
                    tagId: rec.id,
                    lossTime: lastLoss.time,
                    recoveryTime: rec.time
                });
            });
        });

        const byJornada: Record<number, any[]> = {};
        pts.forEach(p => {
            if (!byJornada[p.jornadaNum]) byJornada[p.jornadaNum] = [];
            byJornada[p.jornadaNum].push(p);
        });

        const spread = 0.12;
        const final: typeof pts = [];
        Object.keys(byJornada).forEach(k => {
            const j = Number(k);
            const arr = byJornada[j];
            const count = arr.length;
            arr.forEach((item: any, idx: number) => {
                const offset = (count === 1) ? 0 : ((idx - (count - 1) / 2) * spread);
                final.push({
                    ...item,
                    jornadaX: item.jornadaNum + offset
                });
            });
        });

        return final.sort((a, b) => a.jornadaNum - b.jornadaNum || a.jornadaX - b.jornadaX);
    }, [filteredTags, matches]);

    const SCATTER_LINE_COLOR_1 = "#F97316";
    const SCATTER_LINE_COLOR_2 = "#22D3EE";

    if (loading) return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    if (error) return <div className="text-center text-red-400 p-8">{error}</div>;

    return (
        <div className="p-4 space-y-6 bg-gray-900 text-white">
            {/* Filter Panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 bg-gray-800 p-4 rounded-lg">
                {['torneo', 'categoria', 'jornada', 'equipo', 'jugador', 'accion'].map(key => (
                    <div key={key}>
                        <label htmlFor={key} className="block text-xs font-medium text-gray-400 capitalize mb-1">{key}</label>
                        <select 
                            id={key}
                            value={filters[key as keyof Filters]} 
                            onChange={e => setFilters(prev => ({...prev, [key]: e.target.value}))}
                            className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                        >
                            <option value="all">Todos</option>
                            {key === 'jugador' ? 
                                filterOptions.jugador.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>) :
                                (filterOptions[key as keyof typeof filterOptions] || []).map((opt: any) => <option key={opt} value={opt}>{opt}</option>)
                            }
                        </select>
                    </div>
                ))}
                 <div>
                    <label className="block text-xs font-medium text-gray-400 capitalize mb-1">&nbsp;</label>
                    <button onClick={() => setFilters({ matchId: 'all', torneo: 'all', categoria: 'all', jornada: 'all', equipo: 'all', jugador: 'all', accion: 'all' })} className="w-full bg-gray-600 hover:bg-gray-500 text-white p-2 rounded text-sm transition-colors">Limpiar Filtros</button>
                 </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 p-6 rounded-lg text-center">
                    <h3 className="text-gray-400 text-lg">Acciones Totales</h3>
                    <p className="text-5xl font-bold mt-2 text-white">{summaryData.total}</p>
                </div>
                 <div className="bg-gray-800 p-6 rounded-lg text-center">
                    <h3 className="text-gray-400 text-lg">Efectividad General</h3>
                    <p className="text-5xl font-bold mt-2 text-cyan-400">{summaryData.efectividad.toFixed(2)}%</p>
                </div>
            </div>

            {/* AI Team Analysis Section */}
            {profile?.rol === 'admin' && (
                <div className="bg-gray-800 rounded-lg p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div>
                            <h3 className="text-xl font-semibold text-white">Analisis IA del Equipo: {selectedTeamName}</h3>
                            <p className="text-xs text-gray-400 mt-1">Genera un resumen ejecutivo del rendimiento colectivo con recomendaciones de entrenamiento.</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => runTeamAIAnalysis(false)}
                                    disabled={isAnalyzing || filteredTags.length === 0 || !selectedTeamId}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                                        isAnalyzing || filteredTags.length === 0 || !selectedTeamId
                                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white'
                                    }`}
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Spinner size="h-4 w-4" />
                                            <span>Analizando equipo...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                            </svg>
                                            <span>Generar Analisis del Equipo</span>
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
                            {isFromCache && teamAnalysis && (
                                <div className="flex items-center gap-2 text-xs text-amber-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h8V3a1 1 0 112 0v1a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2V3a1 1 0 011-1zm9 6H6v8h8V8z" clipRule="evenodd" />
                                    </svg>
                                    <span>Analisis reciente (guardado)</span>
                                    <button 
                                        onClick={() => runTeamAIAnalysis(true)}
                                        className="underline hover:text-amber-300"
                                    >
                                        Generar nuevo
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* History Panel */}
                    {showHistory && analysisHistory.length > 0 && (
                        <div className="bg-gray-700/50 rounded-lg p-4 mb-4 border border-gray-600">
                            <h4 className="text-sm font-semibold text-gray-300 mb-3">Historial de Analisis del Equipo</h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {analysisHistory.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            setTeamAnalysis(item.analysis_data);
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
                                            {item.total_partidos} partidos | {item.total_acciones} acciones | {item.efectividad_global}% efectividad
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

                    {!selectedTeamId && filteredTags.length > 0 && (
                        <div className="text-center py-4 text-amber-400">
                            <p>Selecciona un equipo especifico en los filtros para generar el analisis.</p>
                        </div>
                    )}

                    {filteredTags.length === 0 && !teamAnalysis && (
                        <div className="text-center py-8 text-gray-400">
                            <p>No hay datos disponibles con los filtros seleccionados.</p>
                        </div>
                    )}

                    {teamAnalysis && (
                        <div className="space-y-6">
                            {/* Tendencia */}
                            <div className={`rounded-lg p-4 ${
                                teamAnalysis.tendencia === 'mejorando' ? 'bg-green-900/30 border border-green-500' :
                                teamAnalysis.tendencia === 'bajando' ? 'bg-red-900/30 border border-red-500' :
                                'bg-yellow-900/30 border border-yellow-500'
                            }`}>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-2xl">
                                        {teamAnalysis.tendencia === 'mejorando' ? '📈' : teamAnalysis.tendencia === 'bajando' ? '📉' : '➡️'}
                                    </span>
                                    <h4 className="text-lg font-semibold capitalize">{teamAnalysis.tendencia}</h4>
                                </div>
                                <p className="text-gray-300">{teamAnalysis.tendenciaDescripcion}</p>
                            </div>

                            {/* Analisis por Linea */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {['defensa', 'medio', 'ataque'].map((linea) => {
                                    const lineaData = teamAnalysis.analisisPorLinea[linea as keyof typeof teamAnalysis.analisisPorLinea];
                                    return (
                                        <div key={linea} className="bg-gray-700/50 rounded-lg p-4">
                                            <h5 className="text-sm font-semibold text-gray-300 capitalize mb-2">{linea}</h5>
                                            <p className="text-2xl font-bold text-cyan-400">{lineaData.efectividad}%</p>
                                            <p className="text-xs text-gray-400 mt-1">{lineaData.observacion}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Fortalezas y Areas de Mejora */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-green-900/20 rounded-lg p-4 border border-green-800">
                                    <h4 className="text-lg font-semibold text-green-400 mb-3">Fortalezas Colectivas</h4>
                                    <ul className="space-y-2">
                                        {teamAnalysis.fortalezasColectivas.map((f, i) => (
                                            <li key={i} className="flex items-start gap-2 text-gray-300">
                                                <span className="text-green-400 mt-1">✓</span>
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-800">
                                    <h4 className="text-lg font-semibold text-amber-400 mb-3">Oportunidades de Mejora</h4>
                                    <ul className="space-y-2">
                                        {teamAnalysis.areasDeMejoraColectivas.map((a, i) => (
                                            <li key={i} className="flex items-start gap-2 text-gray-300">
                                                <span className="text-amber-400 mt-1">→</span>
                                                <span>{a}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Jugadores Destacados */}
                            <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-800">
                                <h4 className="text-lg font-semibold text-purple-400 mb-3">Jugadores Destacados</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {teamAnalysis.jugadoresDestacados.map((j, i) => (
                                        <div key={i} className="bg-gray-800/50 rounded p-3">
                                            <p className="font-semibold text-white">{j.nombre}</p>
                                            <p className="text-sm text-gray-400">{j.razon}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Resumen Ejecutivo */}
                            <div className="bg-gray-700/50 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-white mb-3">Resumen Ejecutivo</h4>
                                <p className="text-gray-300 leading-relaxed">{teamAnalysis.resumenEjecutivo}</p>
                            </div>

                            {/* Recomendaciones de Entrenamiento */}
                            <div className="bg-cyan-900/20 rounded-lg p-4 border border-cyan-800">
                                <h4 className="text-lg font-semibold text-cyan-400 mb-3">Recomendaciones de Entrenamiento</h4>
                                <ul className="space-y-2">
                                    {teamAnalysis.recomendacionesEntrenamiento.map((r, i) => (
                                        <li key={i} className="flex items-start gap-2 text-gray-300">
                                            <span className="bg-cyan-600 text-white text-xs px-2 py-0.5 rounded mt-0.5">{i + 1}</span>
                                            <span>{r}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex justify-center">
                <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('general')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'general' ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Analisis General
                    </button>
                    <button onClick={() => setActiveTab('player')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'player' ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Analisis por Jugador
                    </button>
                </div>
            </div>

            {activeTab === 'general' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 p-6 rounded-lg h-80">
                        <h3 className="text-lg font-semibold text-white mb-4">Efectividad por Jornada</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={effectivenessByJornada}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                <YAxis stroke="#9CA3AF" domain={[0, 100]} tickFormatter={(val) => `${val}%`} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} formatter={(value: number) => [`${value.toFixed(2)}%`, 'Efectividad']} />
                                <Line type="monotone" dataKey="Efectividad" stroke="#06B6D4" strokeWidth={2} dot={{ fill: '#06B6D4' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-80 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Pases Cortos</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pasesCortosData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <YAxis stroke="#9CA3AF" allowDecimals={false} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="Logrados" fill="#10B981" />
                                    <Bar dataKey="No Logrados" fill="#EF4444" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-80 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Pases Largos</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pasesLargosData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <YAxis stroke="#9CA3AF" allowDecimals={false} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="Logrados" fill="#3B82F6" />
                                    <Bar dataKey="No Logrados" fill="#F97316" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-80 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Duelos</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={duelosData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 10, fill: '#D1D5DB' }} />
                                    <YAxis stroke="#9CA3AF" allowDecimals={false} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                                    <Bar dataKey="Logrados" fill="#8B5CF6" />
                                    <Bar dataKey="No Logrados" fill="#EC4899" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-white mb-4">Rendimiento Ofensivo</h3>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-3xl font-bold text-cyan-400">{rendimientoOfensivoPorteria.tirosAPorteria}</p>
                                    <p className="text-sm text-gray-400">Tiros a Porteria</p>
                                </div>
                                <div>
                                    <p className="text-3xl font-bold text-green-400">{rendimientoOfensivoPorteria.golesAFavor}</p>
                                    <p className="text-sm text-gray-400">Goles a Favor</p>
                                </div>
                                <div>
                                    <p className="text-3xl font-bold text-yellow-400">{rendimientoOfensivoPorteria.tasaConversion.toFixed(1)}%</p>
                                    <p className="text-sm text-gray-400">Tasa Conversion</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-60 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Rendimiento Defensivo (Porteria)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={rendimientoDefensivoPorteria} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Bar dataKey="value" name="Cantidad">
                                        {rendimientoDefensivoPorteria.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-60 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Transiciones Ofensivas</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={transicionesOfensivasData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Bar dataKey="value" name="Cantidad">
                                        {transicionesOfensivasData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-60 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Transiciones Defensivas</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={transicionesDefensivasData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Bar dataKey="value" name="Cantidad">
                                        {transicionesDefensivasData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-80 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4" style={{ color: SCATTER_LINE_COLOR_1 }}>Tiempos de Transiciones Ofensivas por Jornada</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis 
                                        dataKey="x"
                                        type="number"
                                        name="Jornada"
                                        domain={['dataMin - 0.5', 'dataMax + 0.5']}
                                        ticks={Array.from(new Set(scatterTransicionesData.map(d => d.jornadaNum))).sort((a,b)=>a-b)}
                                        tickFormatter={(val) => `Jornada ${Math.round(Number(val))}`}
                                        tick={{ fill: SCATTER_LINE_COLOR_1, fontWeight: 'bold' }}
                                        label={{ value: 'Jornada', position: 'insideBottom', fill: SCATTER_LINE_COLOR_1, offset: 0 }}
                                    />
                                    <YAxis 
                                        dataKey="y"
                                        name="Tiempo"
                                        tickFormatter={(val) => formatSecondsToMMSS(val as number)}
                                        tick={{ fill: SCATTER_LINE_COLOR_1, fontWeight: 'bold' }}
                                        label={{ value: 'Tiempo', angle: -90, position: 'insideLeft', fill: SCATTER_LINE_COLOR_1, offset: 0 }}
                                    />
                                    <Tooltip 
                                        cursor={{ strokeDasharray: '3 3' }}
                                        contentStyle={{ backgroundColor: '#1F2937', border: `1px solid ${SCATTER_LINE_COLOR_1}`, color: '#fff' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const p = payload[0].payload as any;
                                            return (
                                                <div style={{ padding: 8, background: '#0b1220', color: '#fff', border: `1px solid ${SCATTER_LINE_COLOR_1}` }}>
                                                    <div style={{ fontWeight: 700 }}>{p.jornadaLabel ?? `Jornada ${Math.round(p.jornadaNum || p.x)}`}</div>
                                                    <div style={{ marginTop: 4 }}>Duracion: {formatSecondsToMMSS(p.tiempo)}</div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Scatter 
                                        name="Transiciones Ofensivas" 
                                        data={scatterTransicionesData.map(d => ({ x: d.jornadaX, y: d.tiempo, jornadaNum: d.jornadaNum, jornadaLabel: d.jornadaLabel }))} 
                                        fill={SCATTER_LINE_COLOR_1}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                            <div className="text-center text-sm mt-2" style={{ color: SCATTER_LINE_COLOR_1 }}>
                                {`Puntos encontrados: ${scatterTransicionesData.length}`}
                            </div>
                        </div>

                        <div className="bg-gray-800 p-6 rounded-lg h-80 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4" style={{ color: SCATTER_LINE_COLOR_2 }}>Duracion Perdida-Recuperacion por Jornada</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis 
                                        dataKey="x"
                                        type="number"
                                        name="Jornada"
                                        domain={['dataMin - 0.5', 'dataMax + 0.5']}
                                        ticks={Array.from(new Set(scatterRecuperacionesData.map(d => d.jornadaNum))).sort((a,b)=>a-b)}
                                        tickFormatter={(val) => `Jornada ${Math.round(Number(val))}`}
                                        tick={{ fill: SCATTER_LINE_COLOR_2, fontWeight: 'bold' }}
                                        label={{ value: 'Jornada', position: 'insideBottom', fill: SCATTER_LINE_COLOR_2, offset: 0 }}
                                    />
                                    <YAxis 
                                        dataKey="y"
                                        name="Tiempo"
                                        tickFormatter={(val) => formatSecondsToMMSS(val as number)}
                                        tick={{ fill: SCATTER_LINE_COLOR_2, fontWeight: 'bold' }}
                                        label={{ value: 'Tiempo', angle: -90, position: 'insideLeft', fill: SCATTER_LINE_COLOR_2, offset: 0 }}
                                    />
                                    <Tooltip 
                                        cursor={{ strokeDasharray: '3 3' }}
                                        contentStyle={{ backgroundColor: '#1F2937', border: `1px solid ${SCATTER_LINE_COLOR_2}`, color: '#fff' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            const p = payload[0].payload as any;
                                            return (
                                                <div style={{ padding: 8, background: '#0b1220', color: '#fff', border: `1px solid ${SCATTER_LINE_COLOR_2}` }}>
                                                    <div style={{ fontWeight: 700 }}>{p.jornadaLabel ?? `Jornada ${Math.round(p.jornadaNum || p.x)}`}</div>
                                                    <div style={{ marginTop: 4 }}>Duracion: {formatSecondsToMMSS(p.y)}</div>
                                                    <div style={{ marginTop: 4, fontSize: 12, color: '#D1D5DB' }}>Perdida: {formatSecondsToMMSS(p.lossTime)} — Recuperacion: {formatSecondsToMMSS(p.recoveryTime)}</div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Scatter 
                                        name="Recuperaciones de Balon" 
                                        data={scatterRecuperacionesData.map(d => ({ x: d.jornadaX, y: d.tiempo, jornadaNum: d.jornadaNum, jornadaLabel: d.jornadaLabel, lossTime: d.lossTime, recoveryTime: d.recoveryTime }))} 
                                        fill={SCATTER_LINE_COLOR_2}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                            <div className="text-center text-sm mt-2" style={{ color: SCATTER_LINE_COLOR_2 }}>
                              {`Puntos encontrados: ${scatterRecuperacionesData.length}`}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'player' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 p-6 rounded-lg h-96">
                        <h3 className="text-lg font-semibold text-white mb-4">Tiros a Porteria Realizados</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={treemapData}
                                dataKey="size"
                                aspectRatio={4 / 1}
                                stroke="#1F2937"
                                fill="#111827"
                                content={<CustomizedContent />}
                            />
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Pases Cortos Logrados</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pasesCortosLogradosData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                     <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false}/>
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={80} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}}/>
                                    <Bar dataKey="value" fill="#0EA5E9" name="Pases Cortos" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                         <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Pases Largos Logrados</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pasesLargosLogradosData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                     <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={80} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}}/>
                                    <Bar dataKey="value" fill="#22D3EE" name="Pases Largos" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">1 a 1 Logrados</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={duelos1v1LogradosData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                     <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={80} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}}/>
                                    <Bar dataKey="value" fill="#8B5CF6" name="1 vs 1" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                         <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Aereos Logrados</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={duelosAereosLogradosData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                     <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={80} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}}/>
                                    <Bar dataKey="value" fill="#EC4899" name="Aereos" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-4">Recuperacion de Balon por Jugador</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={recuperacionBalonPorJugador} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} />
                                <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} tick={{ fontSize: 14, fill: '#D1D5DB' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}}/>
                                <Bar dataKey="value" fill="#16A34A" name="Recuperaciones" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardPage;

