import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import type { Match } from '../types';
import { fetchTeams, type Team } from '../services/teamsService';
import { fetchPilares, guardarModelo, fetchCalificacionesDePilares, generarLecturaMes, type PilarEditable, type DatoPilarMes } from '../services/modeloJuegoService';
import {
    FASES, ZONAS_MODELO, PILARES_SUGERIDOS, SEMAFORO_COLOR, SEMAFORO_LABEL,
    agruparPorFase, claveMes, etiquetaMes, resumirCelda,
    type ModeloPilar, type ModeloCalificacion,
} from '../utils/modeloJuego';

// ─────────────────────────────────────────────────────────────────────────────
// Página "Modelo de juego" (mejora 3, opción B con fase y zona):
//  1. Definir el modelo del equipo (una vez; se edita cuando cambie).
//  2. La calificación de cada partido se hace en Generar Reportes.
//  3. Seguimiento mensual: semáforo que más se repitió + partidos en verde.
//  4. Lectura del mes con IA (solo con botón, para cuidar la cuota de Gemini).
// Todos pueden ver; solo el admin edita (Supabase lo refuerza con RLS).
// ─────────────────────────────────────────────────────────────────────────────

const ModeloJuegoPage: React.FC = () => {
    const { profile } = useAuth();
    const isAdmin = profile?.rol === ROLES.ADMIN;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [matches, setMatches] = useState<Match[]>([]);
    const [teamId, setTeamId] = useState('');
    const [torneo, setTorneo] = useState('');

    const [pilares, setPilares] = useState<ModeloPilar[]>([]);
    const [edit, setEdit] = useState<PilarEditable[]>([]);
    const [editando, setEditando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const [califs, setCalifs] = useState<ModeloCalificacion[]>([]);
    const [celda, setCelda] = useState<{ pilarId: string; mes: string } | null>(null);

    const [mesLectura, setMesLectura] = useState('');
    const [lecturas, setLecturas] = useState<Record<string, string>>({});
    const [generando, setGenerando] = useState(false);
    const [lecturaError, setLecturaError] = useState<string | null>(null);

    // Equipos y partidos
    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [t, m] = await Promise.all([
                    fetchTeams(),
                    supabase.from('matches').select('*').order('fecha', { ascending: true }),
                ]);
                if (m.error) throw m.error;
                setTeams(t);
                setMatches((m.data || []) as Match[]);
                const propio = profile?.team_id && t.find(x => x.id === profile.team_id) ? profile.team_id : null;
                const conPartidos = t.find(x => (m.data || []).some((mm: Match) => mm.team_id === x.id));
                setTeamId(propio || conPartidos?.id || t[0]?.id || '');
            } catch (err) {
                console.error(err);
                setError('No se pudieron cargar los equipos y partidos.');
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Modelo y calificaciones del equipo elegido
    const cargarModelo = async (id: string) => {
        if (!id) return;
        setError(null);
        try {
            const pil = await fetchPilares(id);
            setPilares(pil);
            setEdit(pil.map(p => ({ id: p.id, nombre: p.nombre, fase: p.fase, zona: p.zona })));
            setEditando(false);
            const cs = await fetchCalificacionesDePilares(pil.map(p => p.id));
            setCalifs(cs);
        } catch (err: any) {
            console.error(err);
            setPilares([]); setEdit([]); setCalifs([]);
            setError('No se pudo leer el modelo de juego. Si es la primera vez, revisa que ya corriste el SQL de las tablas nuevas en Supabase.');
        }
    };
    useEffect(() => { setCelda(null); setLecturas({}); setMsg(null); cargarModelo(teamId); }, [teamId]);

    const teamName = teams.find(t => t.id === teamId)?.nombre || 'Equipo';
    const matchesEquipo = useMemo(() => matches.filter(m => m.team_id === teamId), [matches, teamId]);
    const torneos = useMemo(() => Array.from(new Set(matchesEquipo.map(m => m.torneo).filter(Boolean))).sort(), [matchesEquipo]);
    const matchesFiltrados = useMemo(() => matchesEquipo.filter(m => !torneo || m.torneo === torneo), [matchesEquipo, torneo]);
    const matchPorId = useMemo(() => new Map(matchesFiltrados.map(m => [m.id, m])), [matchesFiltrados]);

    // Calificaciones de los partidos visibles, por pilar y mes
    const califsVisibles = useMemo(() => califs.filter(c => matchPorId.has(c.match_id)), [califs, matchPorId]);
    const meses = useMemo(() => {
        const set = new Set<string>();
        califsVisibles.forEach(c => { const k = claveMes(matchPorId.get(c.match_id)?.fecha); if (k) set.add(k); });
        return Array.from(set).sort();
    }, [califsVisibles, matchPorId]);
    const porPilarMes = useMemo(() => {
        const m = new Map<string, ModeloCalificacion[]>();
        califsVisibles.forEach(c => {
            const k = claveMes(matchPorId.get(c.match_id)?.fecha);
            if (!k) return;
            const key = `${c.pilar_id}|${k}`;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(c);
        });
        return m;
    }, [califsVisibles, matchPorId]);

    useEffect(() => { if (meses.length > 0 && !meses.includes(mesLectura)) setMesLectura(meses[meses.length - 1]); }, [meses, mesLectura]);

    // ── Definir el modelo ──
    const empezarConSugeridos = () => {
        setEdit(PILARES_SUGERIDOS.map(p => ({ nombre: p.nombre, fase: p.fase, zona: p.zona })));
        setEditando(true);
        setMsg(null);
    };
    const actualizar = (i: number, patch: Partial<PilarEditable>) => setEdit(prev => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const mover = (i: number, d: number) => setEdit(prev => {
        const j = i + d; if (j < 0 || j >= prev.length) return prev;
        const copia = [...prev]; [copia[i], copia[j]] = [copia[j], copia[i]]; return copia;
    });
    const handleGuardarModelo = async () => {
        if (!teamId) return;
        if (edit.filter(p => p.nombre.trim()).length === 0) { setMsg({ text: 'Agrega al menos un pilar.', ok: false }); return; }
        setGuardando(true);
        try {
            await guardarModelo(teamId, edit, pilares.map(p => p.id));
            await cargarModelo(teamId);
            setMsg({ text: 'Modelo guardado.', ok: true });
        } catch (err: any) {
            console.error(err);
            setMsg({ text: 'No se pudo guardar el modelo. ' + (err?.message || ''), ok: false });
        } finally {
            setGuardando(false);
        }
    };

    // ── Lectura del mes ──
    const handleLectura = async () => {
        if (!mesLectura) return;
        setGenerando(true);
        setLecturaError(null);
        try {
            const idx = meses.indexOf(mesLectura);
            const mesAnterior = idx > 0 ? meses[idx - 1] : null;
            const datos: DatoPilarMes[] = agruparPorFase<ModeloPilar>(pilares).flatMap(g => g.pilares).map(p => {
                const cs = porPilarMes.get(`${p.id}|${mesLectura}`) || [];
                const ant = mesAnterior ? resumirCelda(porPilarMes.get(`${p.id}|${mesAnterior}`) || []) : null;
                return {
                    nombre: p.nombre, fase: p.fase, zona: p.zona,
                    partidos: cs.map(c => { const m = matchPorId.get(c.match_id); return { rival: m?.rival || '', jornada: m?.jornada ?? '', semaforo: c.semaforo, nota: c.nota || '' }; }),
                    mesAnterior: ant ? { verdes: ant.verdes, calificados: ant.calificados } : null,
                };
            });
            const texto = await generarLecturaMes({ equipo: teamName, mes: etiquetaMes(mesLectura, true), pilares: datos });
            setLecturas(prev => ({ ...prev, [mesLectura]: texto }));
        } catch (err: any) {
            console.error(err);
            setLecturaError(err?.message || 'No se pudo generar la lectura.');
        } finally {
            setGenerando(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

    const pilarCelda = celda ? pilares.find(p => p.id === celda.pilarId) : null;
    const califsCelda = celda ? (porPilarMes.get(`${celda.pilarId}|${celda.mes}`) || []) : [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Modelo de juego · {teamName}</h1>
                <p className="text-gray-400 text-sm mt-1">Lo que el equipo quiere hacer, calificado partido a partido y seguido mes a mes.</p>
            </div>

            <div className="flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Equipo</label>
                    <select value={teamId} onChange={e => setTeamId(e.target.value)} className="bg-gray-700 text-white p-2 rounded border border-gray-600 min-w-[180px]">
                        {teams.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Torneo</label>
                    <select value={torneo} onChange={e => setTorneo(e.target.value)} className="bg-gray-700 text-white p-2 rounded border border-gray-600 min-w-[180px]">
                        <option value="">Todos</option>
                        {torneos.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

            {/* 1 · Definir el modelo */}
            <section className="bg-gray-800 rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="text-lg font-semibold text-white">1 · Modelo del equipo</h2>
                    {isAdmin && pilares.length > 0 && !editando && (
                        <button onClick={() => { setEditando(true); setMsg(null); }} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white">Editar modelo</button>
                    )}
                </div>

                {pilares.length === 0 && !editando && (
                    <div className="text-sm text-gray-300 space-y-2">
                        <p>Este equipo todavía no tiene su modelo guardado.</p>
                        {isAdmin && (
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={empezarConSugeridos} className="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-sm text-white font-medium">Empezar con mis 8 pilares</button>
                                <button onClick={() => { setEdit([{ nombre: '', fase: 'General', zona: null }]); setEditando(true); }} className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white">Empezar vacío</button>
                            </div>
                        )}
                    </div>
                )}

                {editando ? (
                    <div className="space-y-2">
                        <div className="hidden md:grid gap-2 text-xs text-gray-400 px-2" style={{ gridTemplateColumns: 'minmax(0,1fr) 200px 150px 110px' }}>
                            <span>Pilar / principio</span><span>Fase</span><span>Zona (opcional)</span><span />
                        </div>
                        {edit.map((p, i) => (
                            <div key={p.id || `nuevo-${i}`} className="grid gap-2 items-center bg-gray-900 rounded p-2 md:grid-cols-[minmax(0,1fr)_200px_150px_110px]">
                                <input value={p.nombre} onChange={e => actualizar(i, { nombre: e.target.value })} placeholder="Ej: Salida combinativa" className="bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm" />
                                <select value={p.fase} onChange={e => actualizar(i, { fase: e.target.value })} className="bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm">
                                    {FASES.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <select value={p.zona || ''} onChange={e => actualizar(i, { zona: e.target.value || null })} className="bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm">
                                    <option value="">Sin zona</option>
                                    {ZONAS_MODELO.map(z => <option key={z} value={z}>{z}</option>)}
                                </select>
                                <div className="flex gap-1 justify-end">
                                    <button onClick={() => mover(i, -1)} aria-label="Subir" className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white">↑</button>
                                    <button onClick={() => mover(i, 1)} aria-label="Bajar" className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-white">↓</button>
                                    <button onClick={() => setEdit(prev => prev.filter((_, idx) => idx !== i))} title="Quitar un pilar no borra sus calificaciones pasadas; solo deja de aparecer para calificar." className="px-2 py-1 rounded text-xs text-red-400 hover:text-red-300">Quitar</button>
                                </div>
                            </div>
                        ))}
                        <button onClick={() => setEdit(prev => [...prev, { nombre: '', fase: 'General', zona: null }])} className="text-sm text-cyan-400 hover:text-cyan-300">+ Agregar pilar</button>
                        <div className="flex gap-2 items-center flex-wrap">
                            <button onClick={handleGuardarModelo} disabled={guardando} className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-sm text-white font-medium disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar modelo'}</button>
                            <button onClick={() => { setEdit(pilares.map(p => ({ id: p.id, nombre: p.nombre, fase: p.fase, zona: p.zona }))); setEditando(false); }} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white">Cancelar</button>
                        </div>
                    </div>
                ) : pilares.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                        {agruparPorFase<ModeloPilar>(pilares).map(g => (
                            <div key={g.fase} className="bg-gray-900 rounded p-3">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{g.fase}</p>
                                {g.pilares.map(p => (
                                    <p key={p.id} className="text-sm text-gray-100">{p.nombre}{p.zona && <span className="text-xs text-gray-400"> · {p.zona}</span>}</p>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
                {msg && <p className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}
            </section>

            {/* 2 · Seguimiento mensual */}
            <section className="bg-gray-800 rounded-lg p-5 space-y-2">
                <h2 className="text-lg font-semibold text-white">2 · Seguimiento mensual</h2>
                {pilares.length > 0 && meses.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    {([['verde', 'Se cumplió'], ['ambar', 'A medias'], ['rojo', 'No se cumplió']] as const).map(([k, l]) => (
                        <span key={k} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: SEMAFORO_COLOR[k] }} />{l}</span>
                    ))}
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-700" />Sin calificar</span>
                    <span><span className="font-semibold text-gray-200">3/4</span> = partidos en verde</span>
                </div>
                )}
                {pilares.length === 0 ? (
                    <p className="text-sm text-gray-400">Primero guarda el modelo del equipo.</p>
                ) : meses.length === 0 ? (
                    <p className="text-sm text-gray-400">Todavía no hay partidos calificados{torneo ? ' en este torneo' : ''}.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[520px] space-y-1">
                            <div className="grid gap-1 text-xs text-gray-400" style={{ gridTemplateColumns: `220px repeat(${meses.length}, minmax(56px, 96px))` }}>
                                <span />
                                {meses.map(m => <span key={m} className="text-center">{etiquetaMes(m)}</span>)}
                            </div>
                            {agruparPorFase<ModeloPilar>(pilares).map(g => (
                                <div key={g.fase} className="space-y-1">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide pt-2">{g.fase}</p>
                                    {g.pilares.map(p => (
                                        <div key={p.id} className="grid gap-1 items-center text-sm" style={{ gridTemplateColumns: `220px repeat(${meses.length}, minmax(56px, 96px))` }}>
                                            <span className="text-gray-100 truncate" title={p.nombre}>{p.nombre}</span>
                                            {meses.map(m => {
                                                const r = resumirCelda(porPilarMes.get(`${p.id}|${m}`) || []);
                                                const activa = celda?.pilarId === p.id && celda?.mes === m;
                                                return (
                                                    <button
                                                        key={m}
                                                        onClick={() => r && setCelda(activa ? null : { pilarId: p.id, mes: m })}
                                                        disabled={!r}
                                                        className={`text-center py-1.5 rounded text-xs font-bold text-white ${activa ? 'ring-2 ring-white' : ''}`}
                                                        style={{ backgroundColor: r ? SEMAFORO_COLOR[r.color] : '#374151', cursor: r ? 'pointer' : 'default' }}
                                                        title={r ? `${SEMAFORO_LABEL[r.color]} · ${r.verdes} de ${r.calificados} partidos en verde · clic para ver las notas` : 'Sin calificar'}
                                                    >
                                                        {r ? `${r.verdes}/${r.calificados}` : '—'}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {pilarCelda && celda && (
                    <div className="bg-gray-900 rounded p-3 space-y-1.5">
                        <p className="text-sm font-semibold text-white">{pilarCelda.nombre} · {etiquetaMes(celda.mes, true)}</p>
                        {califsCelda
                            .map(c => ({ c, m: matchPorId.get(c.match_id) }))
                            .sort((a, b) => String(a.m?.fecha || '').localeCompare(String(b.m?.fecha || '')))
                            .map(({ c, m }) => (
                                <p key={c.match_id} className="text-sm text-gray-300">
                                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: SEMAFORO_COLOR[c.semaforo] }} />
                                    J{m?.jornada} vs {m?.rival}: {c.nota}
                                </p>
                            ))}
                    </div>
                )}
            </section>

            {/* 3 · Lectura del mes (IA) */}
            <section className="bg-gray-800 rounded-lg p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">3 · Lectura del mes (IA)</h2>
                {meses.length === 0 ? (
                    <p className="text-sm text-gray-400">Aparece cuando haya partidos calificados.</p>
                ) : (
                    <>
                        <div className="flex gap-2 items-center flex-wrap">
                            <select value={mesLectura} onChange={e => setMesLectura(e.target.value)} className="bg-gray-700 text-white p-2 rounded border border-gray-600 text-sm">
                                {meses.map(m => <option key={m} value={m}>{etiquetaMes(m, true)}</option>)}
                            </select>
                            <button onClick={handleLectura} disabled={generando} className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-700 text-sm text-white font-medium disabled:opacity-50">
                                {generando ? 'Generando…' : lecturas[mesLectura] ? '✨ Volver a generar' : '✨ Generar lectura'}
                            </button>
                                                    </div>
                        {lecturaError && <p className="text-sm text-red-400">{lecturaError}</p>}
                        {lecturas[mesLectura] && (
                            <div className="bg-gray-900 rounded p-4 space-y-1.5 text-sm leading-relaxed text-gray-200">
                                {lecturas[mesLectura].split('\n').filter(l => l.trim()).map((linea, i) => {
                                    const m = linea.match(/^(Lo que se cumple|Lo que no se cumple|Para entrenar):\s*(.*)$/i);
                                    if (!m) return <p key={i}>{linea}</p>;
                                    const color = /no se cumple/i.test(m[1]) ? 'text-red-400' : /entrenar/i.test(m[1]) ? 'text-yellow-300' : 'text-green-400';
                                    return <p key={i}><span className={`font-semibold ${color}`}>{m[1]}:</span> {m[2]}</p>;
                                })}
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
};

export default ModeloJuegoPage;
