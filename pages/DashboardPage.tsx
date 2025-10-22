import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Match, Tag, Player } from '../types';
import { METRICS } from '../constants';
import { Spinner } from '../components/ui/Spinner';
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
    if (width < 35 || height < 20) return null; // Don't render text in very small boxes

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
                fontWeight="normal" // Ensure text is not bold
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
                fontWeight="normal" // Ensure text is not bold
            >
                ({size})
            </text>
        </g>
    );
};

/*
  Helper: parseTimeToSeconds
  - Convierte números (segundos) y strings "mm:ss" o "m:ss" en segundos (number).
  - También acepta formatos decimales con coma o punto, y objetos con campos comunes.
  - Devuelve null si no puede parsear.
*/
const parseTimeToSeconds = (value: any): number | null => {
    if (value === null || value === undefined) return null;

    // si ya viene como número
    if (typeof value === 'number' && !isNaN(value)) return value;

    // si viene como string
    if (typeof value === 'string') {
        let s = value.trim();

        // reemplazar coma decimal por punto (ej. "12,34")
        s = s.replace(',', '.');

        // si formato mm:ss o hh:mm:ss -> tomar últimas dos partes como minutos:segundos o horas:minutos:segundos
        if (s.includes(':')) {
            const parts = s.split(':').map(p => p.trim());
            // si vienen hh:mm:ss -> sumar horas
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

        // si es un solo número en texto, interpretarlo como segundos
        const num = parseFloat(s);
        return isNaN(num) ? null : num;
    }

    // si viene como objeto (ej. metadata)
    if (typeof value === 'object') {
        // comprobar campos comunes
        const candidate = (value as any).tiempo ?? (value as any).time ?? (value as any).duration ?? (value as any).seconds;
        if (candidate !== undefined) {
            return parseTimeToSeconds(candidate);
        }
    }

    return null;
};

/*
  Helper: getTagTime
  - Extrae el tiempo (en segundos) de un tag probando varios campos y normalizando
  - Si detecta valores extremadamente grandes (posible ms), divide por 1000
*/
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

    // Si parse devolvió null, intentar leer directamente tag.timestamp numérico
    if (seconds === null) {
        const maybeNum = Number(raw);
        if (!isNaN(maybeNum)) seconds = maybeNum;
    }

    if (seconds === null) return null;

    // Normalizar si parece estar en milisegundos (valores mayores a 10000 -> ms)
    if (seconds > 10000) {
        seconds = seconds / 1000;
    }

    return seconds;
};

/*
 Helper: formatear segundos a mm:ss o hh:mm:ss para mostrar en eje Y y tooltips
*/
const formatSecondsToMMSS = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(Number(value))) return '';
    const total = Math.floor(Number(value));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`; // hh:mm:ss
    }
    return `${minutes}:${pad(seconds)}`; // mm:ss
};

const DashboardPage: React.FC = () => {
    const [matches, setMatches] = useState<Match[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'player'>('general');
    
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

                // ---------- Reemplazo: obtener todos los tags en batches para evitar límite de 1000 filas ----------
                /*
                  Obtener todos los tags en páginas:
                  - Primero pedimos count exacto (select ... { count: 'exact' })
                  - Si hay más filas que la página inicial, hacemos requests con .range() en batches
                */
                const pageSize = 1000; // tamaño de batch: puedes reducirlo (p.ej. 500) si hay problemas de memoria
                const { data: firstPageData, count, error: firstError } = await supabase
                  .from('tags')
                  .select('*', { count: 'exact' })
                  .range(0, pageSize - 1);

                if (firstError) throw firstError;

                let allTags = firstPageData || [];
                console.log('[Dashboard] tags count (total reported):', count, 'firstPageRows:', allTags.length);

                if (typeof count === 'number' && count > allTags.length) {
                  // hay más filas: fetch por rangos
                  for (let from = allTags.length; from < count; from += pageSize) {
                    const to = Math.min(from + pageSize - 1, count - 1);
                    const { data: pageData, error: pageError } = await supabase
                      .from('tags')
                      .select('*')
                      .range(from, to);
                    if (pageError) throw pageError;
                    allTags = allTags.concat(pageData || []);
                    console.log(`[Dashboard] fetched tags range ${from}-${to}, got ${pageData?.length || 0}`);
                  }
                }

                setTags(allTags || []);
                console.log('[Dashboard] total tags loaded into state:', (allTags || []).length);
                // ---------- fin reemplazo ----------

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
            .slice(0, 10); // Top 10
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
            .slice(0, 10); // Top 10
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

    // === NUEVAS GRAFICAS ===

    // 1. Transiciones ofensivas logradas/no logradas (General)
    const transicionesOfensivasData = useMemo(() => {
        const logradas = filteredTags.filter(
            t => t.accion === 'Transición ofensiva lograda'
        ).length;
        const noLogradas = filteredTags.filter(
            t => t.accion === 'Transición ofensiva no lograda'
        ).length;
        return [
            { name: 'Logradas', value: logradas },
            { name: 'No logradas', value: noLogradas }
        ];
    }, [filteredTags]);

    // 2. Recuperación de balón por jornada (General)
    const recuperacionBalonPorJornada = useMemo(() => {
        const dataByJornada: { [jornada: string]: number } = {};
        filteredTags.forEach(tag => {
            if (tag.accion === 'Recuperación de balón') {
                const match = matches.find(m => m.id === tag.match_id);
                if (!match || !match.jornada) return;
                const jornada = String(match.jornada);
                if (!dataByJornada[jornada]) dataByJornada[jornada] = 0;
                dataByJornada[jornada]++;
            }
        });
        return Object.entries(dataByJornada)
            .map(([jornada, count]) => ({
                name: `Jornada ${jornada}`,
                value: count
            }))
            .sort((a, b) => parseInt(a.name.split(' ')[1]) - parseInt(b.name.split(' ')[1]));
    }, [filteredTags, matches]);

    // 3. Recuperación de balón por jugador (Jugador)
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
            .sort((a, b) => b.value - a.value);
    }, [filteredTags, players]);

    // === FIN NUEVAS GRAFICAS ===

    // === SCATTER CHART DATOS (AGREGADOS) ===
    // Grafica 1: Duración desde la recuperación hasta la transición ofensiva lograda
    const scatterTransicionesData = useMemo(() => {
        // Agrupar tags por match (usar filteredTags para respetar filtros)
        const tagsByMatch: Record<string, any[]> = {};
        filteredTags.forEach(tag => {
            if (!tag.match_id) return;
            const tSeconds = getTagTime(tag);
            if (tSeconds === null) return;
            if (!tagsByMatch[tag.match_id]) tagsByMatch[tag.match_id] = [];
            tagsByMatch[tag.match_id].push({
                ...tag,
                __timeSeconds: tSeconds
            });
        });

        const points: { jornadaNum: number; jornadaX: number; jornadaLabel: string; tiempo: number; tagId?: string }[] = [];

        Object.keys(tagsByMatch).forEach(matchId => {
            const list = tagsByMatch[matchId].sort((a, b) => a.__timeSeconds - b.__timeSeconds);
            const match = matches.find(m => m.id === matchId);
            const jornadaNum = match && match.jornada ? Number(match.jornada) : null;
            if (jornadaNum === null) return;

            // obtener solo recoveries y transiciones logradas
            const recoveries = list.filter((t: any) => t.accion === 'Recuperación de balón').map((r: any) => ({ time: r.__timeSeconds, id: r.id }));
            const transitions = list.filter((t: any) => t.accion === 'Transición ofensiva lograda' && t.resultado === 'logrado').map((tr: any) => ({ time: tr.__timeSeconds, id: tr.id }));

            if (transitions.length === 0 || recoveries.length === 0) return;

            transitions.forEach(tr => {
                // buscar la última recovery con tiempo < transition.time
                const prevs = recoveries.filter(r => r.time < tr.time);
                if (prevs.length === 0) return; // no contabilizar si no hay recovery previa
                const lastRec = prevs[prevs.length - 1];
                const duration = tr.time - lastRec.time;
                if (duration < 0) return;
                points.push({
                    jornadaNum,
                    jornadaX: jornadaNum, // jitter se aplicará luego
                    jornadaLabel: `Jornada ${jornadaNum}`,
                    tiempo: duration,
                    tagId: tr.id
                });
            });
        });

        // aplicar jitter horizontal por jornada
        const byJornada: Record<number, any[]> = {};
        points.forEach(p => {
            if (!byJornada[p.jornadaNum]) byJornada[p.jornadaNum] = [];
            byJornada[p.jornadaNum].push(p);
        });

        const spread = 0.12;
        const final: typeof points = [];
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

    // Grafica 2: Tiempo absoluto (en segundos) de las recuperaciones de balón
    // MODIFICADO: ahora calcula la duración desde la ÚLTIMA "Pérdida de balón" previa en el MISMO partido hasta la recuperación
    const scatterRecuperacionesData = useMemo(() => {
        const pts: { jornadaNum: number; jornadaX: number; jornadaLabel: string; tiempo: number; tagId?: string; lossTime?: number; recoveryTime?: number }[] = [];

        // Agrupar tags por match y normalizar tiempo (usar getTagTime)
        const tagsByMatch: Record<string, any[]> = {};
        filteredTags.forEach(tag => {
            if (!tag.match_id) return;
            const tSeconds = getTagTime(tag);
            if (tSeconds === null) return;
            if (!tagsByMatch[tag.match_id]) tagsByMatch[tag.match_id] = [];
            tagsByMatch[tag.match_id].push({
                ...tag,
                __timeSeconds: tSeconds
            });
        });

        // Para cada partido, ordenar cronológicamente y emparejar: recovery -> última loss previa
        Object.keys(tagsByMatch).forEach(matchId => {
            const list = tagsByMatch[matchId].sort((a, b) => a.__timeSeconds - b.__timeSeconds);
            const match = matches.find(m => m.id === matchId);
            const jornadaNum = match && match.jornada ? Number(match.jornada) : null;
            if (jornadaNum === null) return;

            const losses = list.filter((t: any) => t.accion === 'Pérdida de balón').map((l: any) => ({ time: l.__timeSeconds, id: l.id }));
            const recoveries = list.filter((t: any) => t.accion === 'Recuperación de balón').map((r: any) => ({ time: r.__timeSeconds, id: r.id }));

            if (recoveries.length === 0 || losses.length === 0) return;

            recoveries.forEach(rec => {
                // buscar la última pérdida con tiempo < recovery.time
                const prevLosses = losses.filter(l => l.time < rec.time);
                if (prevLosses.length === 0) return; // no hay pérdida previa -> no contabilizar
                const lastLoss = prevLosses[prevLosses.length - 1];
                const duration = rec.time - lastLoss.time;
                if (duration < 0) return;
                // Validación de rango (1s .. 65:59 = 3959s) para evitar outliers
                if (duration < 1 || duration > 3959) return;
                pts.push({
                    jornadaNum,
                    jornadaX: jornadaNum, // jitter aplicado después
                    jornadaLabel: `Jornada ${jornadaNum}`,
                    tiempo: duration,
                    tagId: rec.id,
                    lossTime: lastLoss.time,
                    recoveryTime: rec.time
                });
            });
        });

        // aplicar jitter horizontal similar al otro scatter
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

    const SCATTER_LINE_COLOR_1 = "#F97316"; // naranja intenso
    const SCATTER_LINE_COLOR_2 = "#22D3EE"; // cyan brillante

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

            {/* Tab Navigation */}
            <div className="flex justify-center">
                <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('general')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'general' ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Análisis General
                    </button>
                    <button onClick={() => setActiveTab('player')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'player' ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Análisis por Jugador
                    </button>
                </div>
            </div>

            {activeTab === 'general' && (
                <div className="space-y-6">
                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Row 1 */}
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                            <h3 className="text-lg font-semibold text-white mb-4">Efectividad por Jornada</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={effectivenessByJornada} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" domain={[0, 100]} tickFormatter={(tick) => `${tick}%`}/>
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend />
                                    <Line type="monotone" dataKey="Efectividad" stroke="#22D3EE" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }}/>
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                             <h3 className="text-lg font-semibold text-white mb-4">Análisis de Pases Cortos</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pasesCortosData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend />
                                    <Bar dataKey="Logrados" fill="#22C55E" />
                                    <Bar dataKey="No Logrados" fill="#EF4444" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        {/* Row 2 */}
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                             <h3 className="text-lg font-semibold text-white mb-4">Análisis de Pases Largos</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pasesLargosData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend />
                                    <Bar dataKey="Logrados" fill="#22C55E" />
                                    <Bar dataKey="No Logrados" fill="#EF4444" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                             <h3 className="text-lg font-semibold text-white mb-4">Análisis de Duelos</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={duelosData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Legend />
                                    <Bar dataKey="Logrados" fill="#22C55E" />
                                    <Bar dataKey="No Logrados" fill="#EF4444" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                     {/* Row 3 - Goalkeeping Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-80 flex flex-col">
                            <h3 className="text-lg font-semibold text-white mb-4">Rendimiento Ofensivo en Portería</h3>
                            <div className="flex-1 grid grid-cols-3 items-center text-center">
                                <div className="relative">
                                    <p className="text-5xl font-bold text-white">{rendimientoOfensivoPorteria.tirosAPorteria}</p>
                                    <p className="text-gray-400 mt-2">Tiros a Portería</p>
                                </div>
                                <div className="relative border-l border-r border-gray-700 h-1/2 flex flex-col justify-center">
                                    <p className="text-5xl font-bold text-white">{rendimientoOfensivoPorteria.golesAFavor}</p>
                                    <p className="text-gray-400 mt-2">Goles a Favor</p>
                                </div>
                                <div className="relative">
                                    <p className="text-5xl font-bold text-cyan-400">{rendimientoOfensivoPorteria.tasaConversion.toFixed(1)}%</p>
                                    <p className="text-gray-400 mt-2">Tasa de Conversión</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                            <h3 className="text-lg font-semibold text-white mb-4">Rendimiento Defensivo en Portería</h3>
                             <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={rendimientoDefensivoPorteria} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} tick={{ fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}} />
                                    <Bar dataKey="value" barSize={35}>
                                        {rendimientoDefensivoPorteria.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* === AGREGADO: NUEVAS GRAFICAS DE TRANSICIONES Y RECUPERACION BALON === */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                            <h3 className="text-lg font-semibold text-white mb-4">Transiciones Ofensivas (Logradas vs No Logradas)</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={transicionesOfensivasData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" allowDecimals={false} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    {/* Color verde para Logradas, rojo para No logradas */}
                                    <Bar dataKey="value">
                                        {transicionesOfensivasData.map((entry, idx) => (
                                            <Cell 
                                                key={`cell-transicion-${idx}`} 
                                                fill={entry.name === 'Logradas' ? '#22C55E' : '#EF4444'}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                            <h3 className="text-lg font-semibold text-white mb-4">Recuperación de Balón por Jornada</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={recuperacionBalonPorJornada} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="name" stroke="#9CA3AF" />
                                    <YAxis stroke="#9CA3AF" allowDecimals={false} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} />
                                    <Bar dataKey="value" fill="#16A34A" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* === AGREGADO: GRAFICAS SCATTER (AL FINAL COMO SOLICITASTE) === */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                            <h3 className="text-lg font-semibold text-white mb-4">Tiempo de Transiciones Ofensivas Logradas</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                                    <CartesianGrid stroke="#374151" />
                                    <XAxis 
                                        dataKey="x"
                                        type="number"
                                        name="Jornada"
                                        domain={['dataMin', 'dataMax']}
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
                                                    <div style={{ marginTop: 4 }}>Duración: {formatSecondsToMMSS(p.y)}</div>
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
                        <div className="bg-gray-800 p-6 rounded-lg h-80">
                            <h3 className="text-lg font-semibold text-white mb-4">Tiempo de Recuperación de Balón</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                                    <CartesianGrid stroke="#374151" />
                                    <XAxis 
                                        dataKey="x"
                                        type="number"
                                        name="Jornada"
                                        domain={['dataMin', 'dataMax']}
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
                                                    <div style={{ marginTop: 4 }}>Duración: {formatSecondsToMMSS(p.y)}</div>
                                                    <div style={{ marginTop: 4, fontSize: 12, color: '#D1D5DB' }}>Pérdida: {formatSecondsToMMSS(p.lossTime)} — Recuperación: {formatSecondsToMMSS(p.recoveryTime)}</div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Scatter 
                                        name="Recuperaciones de Balón" 
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
                    {/* === FIN GRAFICAS SCATTER === */}

                    {/* === FIN NUEVAS GRAFICAS === */}
                </div>
            )}

            {activeTab === 'player' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 p-6 rounded-lg h-96">
                        <h3 className="text-lg font-semibold text-white mb-4">Tiros a Portería Realizados</h3>
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
                            <h3 className="text-lg font-semibold text-white mb-4">Aéreos Logrados</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={duelosAereosLogradosData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                     <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                    <XAxis type="number" stroke="#9CA3AF" allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={80} tick={{ fontSize: 12, fill: '#D1D5DB' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563' }} cursor={{fill: 'rgba(107, 114, 128, 0.2)'}}/>
                                    <Bar dataKey="value" fill="#EC4899" name="Aéreos" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* === AGREGADO: RECUPERACION DE BALON POR JUGADOR === */}
                    <div className="bg-gray-800 p-6 rounded-lg h-96 flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-4">Recuperación de Balón por Jugador</h3>
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
                    {/* === FIN RECUPERACION DE BALON POR JUGADOR === */}
                </div>
            )}
        </div>
    );
};

export default DashboardPage;
