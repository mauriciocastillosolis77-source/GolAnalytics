import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../components/ui/Spinner';
import { LOGO_BASE64 } from '../constants/logoBase64';
import { esJugadorFicticio } from '../utils/efectividad';
import {
    SECCIONES, PUESTOS, TIPOS_JUGADOR, PIERNAS, VALORACIONES, FICHA_VACIA,
    puestoLabel, valoracionDe, mediaSeccion, mediaGeneral, lineasCalificadas, edadDe, reducirFoto,
    PARTICIPACION_LABEL, PARTICIPACIONES_MANUALES, sumarNumeros, agruparNumeros,
    CAJAS_442, SCOUT_NOMBRE, mejoresPorPuesto, ordenarPorPromedio,
    type ScoutingPlayer, type SeccionClave, type ValoracionFinal, type PartidoJugador, type Participacion,
} from '../utils/scouting';
import { fetchNumerosJugador, guardarPartidoManual, eliminarPartidoManual, guardarTarjetas, type PartidoManual } from '../services/scoutingStatsService';
import {
    fetchScoutingPlayers, fetchScoutingPlayer, guardarScoutingPlayer, eliminarScoutingPlayer,
    fetchJugadoresEquipo, setJugadorActivo,
    type ScoutingPlayerLista, type JugadorEquipo,
} from '../services/scoutingService';

// ─────────────────────────────────────────────────────────────────────────────
// Página "Scouting" (solo admin) — entrega 1: la ficha del jugador.
//  · Lista de jugadores registrados, de mi equipo o de cualquier otro.
//  · Ficha por secciones: Datos, 5 secciones de cualidades (1 a 10) y Valoración.
//  · Los jugadores de mi equipo se ligan a su registro del Etiquetador; ahí vive
//    el interruptor Activo/Inactivo.
// Scouting y etiquetado son cosas distintas: un jugador de otro equipo que se
// registra aquí NUNCA aparece en el Etiquetador (vive en otra tabla).
// Entrega 2: pestaña "Números" (por jornada, mes o torneo). Los jugadores de mi
// equipo la llenan con el etiquetado; los de otros equipos se capturan a mano.
// Entrega 3: vista "Reporte ejecutivo de scouting" (cancha 4-4-2 con los 3
// mejores de cada puesto) y pestaña "Comparación" en la ficha.
// Pendiente: exportaciones a PDF y PowerPoint.
// ─────────────────────────────────────────────────────────────────────────────

type Borrador = Omit<ScoutingPlayer, 'id'> & { id?: string };
type Pestana = 'datos' | 'numeros' | SeccionClave | 'comparacion' | 'valoracion';

const PESTANAS: Array<{ clave: Pestana; label: string }> = [
    { clave: 'datos', label: 'Datos' },
    { clave: 'numeros', label: 'Números' },
    ...SECCIONES.map((s) => ({ clave: s.clave as Pestana, label: s.corto })),
    { clave: 'comparacion', label: 'Comparación' },
    { clave: 'valoracion', label: 'Valoración final' },
];

const inputCls = 'w-full bg-gray-700 text-white rounded-md px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none';

const Campo: React.FC<{ label: string; ayuda?: string; children: React.ReactNode; className?: string }> = ({ label, ayuda, children, className }) => (
    <div className={className}>
        <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
        {children}
        {ayuda && <p className="text-[11px] text-gray-500 mt-1">{ayuda}</p>}
    </div>
);

const colorMedia = (m: number | null) => (m === null ? '#4b5563' : m >= 7 ? '#16a34a' : m >= 5 ? '#d97706' : '#dc2626');

const ChipMedia: React.FC<{ valor: number | null; grande?: boolean }> = ({ valor, grande }) => (
    <span
        className={`inline-flex items-center justify-center rounded-md font-bold text-white ${grande ? 'text-xl w-14 h-11' : 'text-sm w-11 h-8'}`}
        style={{ backgroundColor: colorMedia(valor) }}
    >
        {valor === null ? '–' : valor.toFixed(1)}
    </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Números": minutos, partidos, goles, asistencias y tarjetas del
// jugador, vistos por jornada, por mes o por torneo.
// ─────────────────────────────────────────────────────────────────────────────
const PARTIDO_VACIO: PartidoManual = { fecha: null, torneo: null, jornada: null, rival: null, estatus: 'titular', minutos: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0 };
const fechaCorta = (f: string | null) => (f ? new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const COLS_TOTALES: Array<{ k: 'pj' | 'titular' | 'suplente' | 'minutos' | 'goles' | 'asistencias' | 'amarillas' | 'rojas'; t: string; titulo: string }> = [
    { k: 'pj', t: 'PJ', titulo: 'Partidos jugados' }, { k: 'titular', t: 'TIT', titulo: 'De titular' }, { k: 'suplente', t: 'SUP', titulo: 'Entrando de cambio' },
    { k: 'minutos', t: 'MIN', titulo: 'Minutos' }, { k: 'goles', t: 'GOL', titulo: 'Goles' }, { k: 'asistencias', t: 'ASIS', titulo: 'Asistencias' },
    { k: 'amarillas', t: 'TA', titulo: 'Tarjetas amarillas' }, { k: 'rojas', t: 'TR', titulo: 'Tarjetas rojas' },
];

const NumerosJugador: React.FC<{ fichaId?: string; playerId: string | null; competicion: string | null }> = ({ fichaId, playerId, competicion }) => {
    const [filas, setFilas] = useState<PartidoJugador[]>([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modo, setModo] = useState<'jornada' | 'mes' | 'torneo'>('jornada');
    const [form, setForm] = useState<PartidoManual | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [tarjetaOk, setTarjetaOk] = useState<string | null>(null);
    const esEquipo = !!playerId;

    const cargar = async () => {
        if (!fichaId) return;
        setCargando(true); setError(null);
        try {
            setFilas(await fetchNumerosJugador(fichaId, playerId));
        } catch (err: any) {
            setError(err?.message || 'No se pudieron cargar los números.');
        } finally {
            setCargando(false);
        }
    };
    useEffect(() => { setForm(null); if (fichaId) cargar(); else setFilas([]); }, [fichaId, playerId]);

    if (!fichaId) {
        return <div className="bg-gray-800 rounded-lg p-6 text-sm text-gray-400">Guarda la ficha primero; después aquí aparecen o se capturan los números del jugador.</div>;
    }

    const total = sumarNumeros('Total', filas);
    const grupos = modo === 'jornada' ? [] : agruparNumeros(filas, modo);
    const num = (v: string) => { const x = parseInt(v, 10); return isNaN(x) || x < 0 ? 0 : x; };

    const guardarPartido = async () => {
        if (!form) return;
        setGuardando(true); setError(null);
        try {
            await guardarPartidoManual(fichaId, form);
            setForm(null);
            await cargar();
        } catch (err: any) {
            setError(err?.message || 'No se pudo guardar el partido.');
        } finally {
            setGuardando(false);
        }
    };

    const borrarPartido = async (f: PartidoJugador) => {
        if (!f.id || !window.confirm(`¿Eliminar el partido${f.rival ? ` contra ${f.rival}` : ''} de los números de este jugador?`)) return;
        try { await eliminarPartidoManual(f.id); await cargar(); }
        catch (err: any) { setError(err?.message || 'No se pudo eliminar el partido.'); }
    };

    const cambiarTarjeta = async (f: PartidoJugador, campo: 'amarillas' | 'rojas', valor: number) => {
        if (!f.match_id || f[campo] === valor) return;
        const nuevo = { ...f, [campo]: valor };
        try {
            await guardarTarjetas(fichaId, f.match_id, nuevo.amarillas, nuevo.rojas);
            setFilas((fs) => fs.map((x) => (x.key === f.key ? nuevo : x)));
            setTarjetaOk(f.key); setTimeout(() => setTarjetaOk((k) => (k === f.key ? null : k)), 2000);
        } catch (err: any) {
            setError(err?.message || 'No se pudieron guardar las tarjetas.');
        }
    };

    const th = 'py-2 px-2 text-center font-medium';
    const td = 'py-2 px-2 text-center text-gray-200';

    return (
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-white">Números del jugador</h2>
                    <p className="text-xs text-gray-400 max-w-2xl">
                        {esEquipo
                            ? 'Se calculan solos con lo que etiquetas: minutos, titular o suplente, goles y asistencias. Las tarjetas las escribes tú en cada partido.'
                            : 'Como es de otro equipo, sus partidos se capturan a mano.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {(['jornada', 'mes', 'torneo'] as const).map((m) => (
                        <button key={m} onClick={() => setModo(m)} className={`px-3 py-1.5 rounded-lg text-sm ${modo === m ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                            {m === 'jornada' ? 'Por jornada' : m === 'mes' ? 'Por mes' : 'Por torneo'}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

            <div className="flex flex-wrap gap-2">
                {COLS_TOTALES.map((c) => (
                    <div key={c.k} title={c.titulo} className="bg-gray-900/60 rounded-md px-3 py-1.5 text-center min-w-[58px]">
                        <p className="text-white font-bold text-base leading-tight">{total[c.k]}</p>
                        <p className="text-[10px] text-gray-400">{c.t}</p>
                    </div>
                ))}
            </div>

            {!esEquipo && !form && (
                <button onClick={() => setForm({ ...PARTIDO_VACIO, torneo: competicion })} className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md text-sm">+ Agregar partido</button>
            )}

            {form && (
                <div className="border border-cyan-700 rounded-lg p-3 space-y-3">
                    <p className="text-sm font-semibold text-white">{form.id ? 'Editar partido' : 'Partido nuevo'}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        <Campo label="Fecha"><input type="date" value={form.fecha || ''} onChange={(e) => setForm({ ...form, fecha: e.target.value || null })} className={inputCls} /></Campo>
                        <Campo label="Torneo o liga"><input value={form.torneo || ''} onChange={(e) => setForm({ ...form, torneo: e.target.value || null })} className={inputCls} /></Campo>
                        <Campo label="Jornada"><input type="number" min={0} value={form.jornada ?? ''} onChange={(e) => setForm({ ...form, jornada: e.target.value === '' ? null : num(e.target.value) })} className={inputCls} /></Campo>
                        <Campo label="Rival" className="col-span-2 md:col-span-1 lg:col-span-2"><input value={form.rival || ''} onChange={(e) => setForm({ ...form, rival: e.target.value || null })} className={inputCls} /></Campo>
                        <Campo label="Participación">
                            <select value={form.estatus} onChange={(e) => setForm({ ...form, estatus: e.target.value as Participacion, ...(e.target.value === 'no_jugo' ? { minutos: 0 } : {}) })} className={inputCls}>
                                {PARTICIPACIONES_MANUALES.map((x) => <option key={x} value={x}>{PARTICIPACION_LABEL[x]}</option>)}
                            </select>
                        </Campo>
                        <Campo label="Minutos"><input type="number" min={0} value={form.minutos} disabled={form.estatus === 'no_jugo'} onChange={(e) => setForm({ ...form, minutos: num(e.target.value) })} className={`${inputCls} disabled:opacity-50`} /></Campo>
                        <Campo label="Goles"><input type="number" min={0} value={form.goles} onChange={(e) => setForm({ ...form, goles: num(e.target.value) })} className={inputCls} /></Campo>
                        <Campo label="Asistencias"><input type="number" min={0} value={form.asistencias} onChange={(e) => setForm({ ...form, asistencias: num(e.target.value) })} className={inputCls} /></Campo>
                        <Campo label="Amarillas"><input type="number" min={0} value={form.amarillas} onChange={(e) => setForm({ ...form, amarillas: num(e.target.value) })} className={inputCls} /></Campo>
                        <Campo label="Rojas"><input type="number" min={0} value={form.rojas} onChange={(e) => setForm({ ...form, rojas: num(e.target.value) })} className={inputCls} /></Campo>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={guardarPartido} disabled={guardando} className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md text-sm">{guardando ? 'Guardando…' : 'Guardar partido'}</button>
                        <button onClick={() => setForm(null)} disabled={guardando} className="bg-gray-700 hover:bg-gray-600 text-gray-200 py-2 px-4 rounded-md text-sm">Cancelar</button>
                    </div>
                </div>
            )}

            {cargando ? (
                <div className="flex justify-center py-6"><Spinner /></div>
            ) : filas.length === 0 ? (
                <p className="text-sm text-gray-500">
                    {esEquipo ? 'Todavía no hay partidos con alineación, goles o asistencias de este jugador.' : 'Todavía no hay partidos capturados.'}
                </p>
            ) : modo === 'jornada' ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-400 border-b border-gray-700">
                                <th className="py-2 px-2 text-left font-medium">Fecha</th>
                                <th className="py-2 px-2 text-left font-medium">Torneo</th>
                                <th className={th}>J</th>
                                <th className="py-2 px-2 text-left font-medium">Rival</th>
                                <th className="py-2 px-2 text-left font-medium">Participación</th>
                                <th className={th}>MIN</th><th className={th}>GOL</th><th className={th}>ASIS</th><th className={th}>TA</th><th className={th}>TR</th>
                                {!esEquipo && <th className={th}></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f) => (
                                <tr key={f.key} className="border-b border-gray-700/50">
                                    <td className="py-2 px-2 text-gray-300 whitespace-nowrap">{fechaCorta(f.fecha)}</td>
                                    <td className="py-2 px-2 text-gray-300">{f.torneo || '—'}</td>
                                    <td className={td}>{f.jornada ?? '—'}</td>
                                    <td className="py-2 px-2 text-white">{f.rival || '—'}</td>
                                    <td className="py-2 px-2 text-gray-300">{f.participacion ? PARTICIPACION_LABEL[f.participacion] : 'Sin alineación capturada'}</td>
                                    <td className={`${td} font-semibold`}>{f.minutos}</td>
                                    <td className={td}>{f.goles}</td>
                                    <td className={td}>{f.asistencias}</td>
                                    {esEquipo ? (
                                        <>
                                            <td className={td}><input type="number" min={0} aria-label={`Amarillas vs ${f.rival}`} key={`${f.key}-a-${f.amarillas}`} defaultValue={f.amarillas} onBlur={(e) => cambiarTarjeta(f, 'amarillas', num(e.target.value))} className="w-14 bg-gray-700 text-white text-center rounded px-1 py-1 border border-gray-600 focus:border-cyan-500 focus:outline-none" /></td>
                                            <td className={td}>
                                                <span className="inline-flex items-center gap-1">
                                                    <input type="number" min={0} aria-label={`Rojas vs ${f.rival}`} key={`${f.key}-r-${f.rojas}`} defaultValue={f.rojas} onBlur={(e) => cambiarTarjeta(f, 'rojas', num(e.target.value))} className="w-14 bg-gray-700 text-white text-center rounded px-1 py-1 border border-gray-600 focus:border-cyan-500 focus:outline-none" />
                                                    <span className={`text-green-400 text-xs w-3 ${tarjetaOk === f.key ? '' : 'invisible'}`}>✓</span>
                                                </span>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className={td}>{f.amarillas}</td>
                                            <td className={td}>{f.rojas}</td>
                                            <td className="py-2 px-2 text-right whitespace-nowrap">
                                                <button onClick={() => setForm({ id: f.id, fecha: f.fecha, torneo: f.torneo || null, jornada: f.jornada, rival: f.rival || null, estatus: (f.participacion as Participacion) || 'titular', minutos: f.minutos, goles: f.goles, asistencias: f.asistencias, amarillas: f.amarillas, rojas: f.rojas })} className="text-xs text-cyan-300 hover:underline mr-3">Editar</button>
                                                <button onClick={() => borrarPartido(f)} className="text-xs text-red-300 hover:underline">Eliminar</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {esEquipo && <p className="text-[11px] text-gray-500 mt-2">Las tarjetas se guardan solas al salir de la casilla.</p>}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-400 border-b border-gray-700">
                                <th className="py-2 px-2 text-left font-medium">{modo === 'mes' ? 'Mes' : 'Torneo'}</th>
                                {COLS_TOTALES.map((c) => <th key={c.k} className={th} title={c.titulo}>{c.t}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {grupos.map((g) => (
                                <tr key={g.etiqueta} className="border-b border-gray-700/50">
                                    <td className={`py-2 px-2 text-white ${modo === 'mes' ? 'capitalize' : ''}`}>{g.etiqueta}</td>
                                    {COLS_TOTALES.map((c) => <td key={c.k} className={td}>{g[c.k]}</td>)}
                                </tr>
                            ))}
                            <tr className="font-semibold">
                                <td className="py-2 px-2 text-white">Total</td>
                                {COLS_TOTALES.map((c) => <td key={c.k} className="py-2 px-2 text-center text-white">{total[c.k]}</td>)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Vista "Reporte ejecutivo de scouting": la cancha 4-4-2 con los 3 mejores de
// cada puesto exacto. El panel izquierdo (tipo de competición, tipo de jugador
// y equipo) filtra quiénes entran a la cancha. Se dibuja sobre hoja blanca,
// como la plantilla, porque es lo que después se va a exportar.
// ─────────────────────────────────────────────────────────────────────────────
const BotonFiltro: React.FC<{ activo: boolean; onClick: () => void; children: React.ReactNode }> = ({ activo, onClick, children }) => (
    <button onClick={onClick} aria-pressed={activo}
        className={`w-full px-2 py-1.5 text-xs font-semibold border-2 border-black text-center truncate ${activo ? 'bg-red-600 text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
        {children}
    </button>
);
const TituloPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="bg-gray-300 border-y-2 border-black px-2 py-1 text-xs font-black italic uppercase text-black text-center -skew-x-12"><span className="inline-block skew-x-12">{children}</span></div>
);

const ReporteEjecutivo: React.FC<{ lista: ScoutingPlayerLista[]; onAbrir: (id: string) => void }> = ({ lista, onAbrir }) => {
    const [competicion, setCompeticion] = useState('');
    const [tipo, setTipo] = useState('');
    const [equipo, setEquipo] = useState<'' | 'mio' | 'otros'>('');

    // Las competiciones salen de lo que se haya escrito en las fichas (sin repetir por mayúsculas o espacios).
    const competiciones = useMemo(() => {
        // Si la misma competición se escribió de varias formas, se muestra la forma más usada.
        const formas = new Map<string, Map<string, number>>();
        lista.forEach((f) => {
            const c = (f.competicion || '').trim();
            if (!c) return;
            const m = formas.get(c.toLowerCase()) || new Map<string, number>();
            m.set(c, (m.get(c) || 0) + 1);
            formas.set(c.toLowerCase(), m);
        });
        return Array.from(formas.values())
            .map((m) => Array.from(m.entries()).sort((x, y) => y[1] - x[1])[0][0])
            .sort((x, y) => x.localeCompare(y));
    }, [lista]);

    const filtrados = useMemo(() => lista.filter((f) => {
        if (competicion && (f.competicion || '').trim().toLowerCase() !== competicion.toLowerCase()) return false;
        if (tipo && f.tipo_jugador !== tipo) return false;
        if (equipo === 'mio' && !f.player_id) return false;
        if (equipo === 'otros' && f.player_id) return false;
        return true;
    }), [lista, competicion, tipo, equipo]);

    const mejores = useMemo(() => mejoresPorPuesto(filtrados, 3), [filtrados]);
    const sinCalificar = filtrados.filter((f) => mediaGeneral(f.cualidades).media === null).length;
    const sinPuesto = filtrados.filter((f) => !f.puesto).length;

    return (
        <div className="space-y-2">
            <div className="bg-white text-black rounded-lg overflow-hidden" data-reporte-ejecutivo>
                <div className="px-4 pt-3">
                    <div className="bg-gray-300 border-y-4 border-black py-2 text-center -skew-x-12">
                        <h2 className="inline-block skew-x-12 text-xl md:text-2xl font-black italic uppercase tracking-wide">Scouting de jugadores</h2>
                    </div>
                </div>
                <div className="p-4 flex flex-col lg:flex-row gap-4">
                    {/* Panel izquierdo: logo y filtros */}
                    <div className="lg:w-48 shrink-0 space-y-3">
                        <img src={LOGO_BASE64} alt="GolAnalytics" className="w-28 h-28 object-contain mx-auto" />
                        <TituloPanel>Tipo competición</TituloPanel>
                        <div className="space-y-1 max-h-44 overflow-y-auto">
                            <BotonFiltro activo={competicion === ''} onClick={() => setCompeticion('')}>Todas</BotonFiltro>
                            {competiciones.map((c) => <BotonFiltro key={c} activo={competicion.toLowerCase() === c.toLowerCase()} onClick={() => setCompeticion(c)}>{c}</BotonFiltro>)}
                        </div>
                        <TituloPanel>Tipo jugador</TituloPanel>
                        <div className="space-y-1">
                            <BotonFiltro activo={tipo === ''} onClick={() => setTipo('')}>Todos</BotonFiltro>
                            {TIPOS_JUGADOR.map((t) => <BotonFiltro key={t} activo={tipo === t} onClick={() => setTipo(t)}>{t}</BotonFiltro>)}
                        </div>
                        <TituloPanel>Equipo</TituloPanel>
                        <div className="space-y-1">
                            <BotonFiltro activo={equipo === ''} onClick={() => setEquipo('')}>Todos</BotonFiltro>
                            <BotonFiltro activo={equipo === 'mio'} onClick={() => setEquipo('mio')}>Mi equipo</BotonFiltro>
                            <BotonFiltro activo={equipo === 'otros'} onClick={() => setEquipo('otros')}>Otros equipos</BotonFiltro>
                        </div>
                    </div>

                    {/* Cancha 4-4-2 (el equipo ataca hacia arriba) */}
                    <div className="flex-1 min-w-0 overflow-x-auto">
                        <div className="relative mx-auto" style={{ minWidth: 640, maxWidth: 900, aspectRatio: '10 / 9', background: 'repeating-linear-gradient(180deg, #3f8f3f 0 11.11%, #378537 11.11% 22.22%)' }}>
                            <svg viewBox="0 0 100 90" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
                                <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.35">
                                    <rect x="3" y="3" width="94" height="84" />
                                    <line x1="3" y1="45" x2="97" y2="45" />
                                    <ellipse cx="50" cy="45" rx="9" ry="8.1" />
                                    <rect x="27" y="3" width="46" height="14" /><rect x="39" y="3" width="22" height="5.5" />
                                    <rect x="27" y="73" width="46" height="14" /><rect x="39" y="81.5" width="22" height="5.5" />
                                </g>
                            </svg>
                            {CAJAS_442.map((caja) => {
                                const jugadores = mejores[caja.puesto] || [];
                                return (
                                    <div key={caja.puesto} data-puesto={caja.puesto} className="absolute" style={{ left: `${caja.x}%`, top: `${caja.y}%`, width: '22%', transform: 'translateX(-50%)' }}>
                                        <p className="text-[9px] md:text-[10px] font-bold uppercase text-white text-center mb-0.5" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{puestoLabel(caja.puesto)}</p>
                                        <div className="space-y-0.5">
                                            {[0, 1, 2].map((i) => {
                                                const j = jugadores[i];
                                                if (!j) return <div key={i} className="h-6 border-2 border-black bg-white/60" />;
                                                return (
                                                    <button key={j.id} onClick={() => onAbrir(j.id)} title={`${j.nombre} · promedio ${j.promedio.toFixed(1)}${j.secciones < SECCIONES.length ? ` (${j.secciones} de ${SECCIONES.length} secciones)` : ''} · clic para abrir su ficha`}
                                                        className="w-full h-6 border-2 border-black bg-white hover:bg-yellow-100 flex items-center justify-between gap-1 px-1 text-left">
                                                        <span className="text-[9px] md:text-[10px] font-bold uppercase truncate">{j.nombre}{j.nacionalidad ? ` (${j.nacionalidad})` : ''}</span>
                                                        <span className="text-[9px] md:text-[10px] font-black shrink-0">{j.promedio.toFixed(1)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="border-t-2 border-black px-4 py-2 text-center text-xs font-semibold">Scout: {SCOUT_NOMBRE} | GolAnalytics</div>
            </div>
            <p className="text-xs text-gray-500">
                En cada caja van los 3 mejor calificados de ese puesto exacto, por promedio general. Da clic en un nombre para abrir su ficha.
                {sinCalificar > 0 && ` ${sinCalificar} jugador${sinCalificar === 1 ? '' : 'es'} sin calificar no aparece${sinCalificar === 1 ? '' : 'n'}.`}
                {sinPuesto > 0 && ` ${sinPuesto} sin puesto asignado tampoco.`}
            </p>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Comparación": las cinco medias del jugador contra las de otro de su
// mismo puesto. Por defecto, contra el mejor jugador de mi equipo en ese puesto
// ("nuestro mejor jugador en su puesto", como la plantilla).
// ─────────────────────────────────────────────────────────────────────────────
const ComparacionJugador: React.FC<{ ficha: Borrador; lista: ScoutingPlayerLista[] }> = ({ ficha, lista }) => {
    const candidatos = useMemo(() => ordenarPorPromedio(lista.filter((f) => f.id !== ficha.id && !!ficha.puesto && f.puesto === ficha.puesto)), [lista, ficha.id, ficha.puesto]);
    const mejorDeMiEquipo = candidatos.find((c) => !!c.player_id);
    const [elegidoId, setElegidoId] = useState<string>('');
    useEffect(() => { setElegidoId(''); }, [ficha.id, ficha.puesto]);
    const otro = candidatos.find((c) => c.id === elegidoId) || mejorDeMiEquipo;

    if (!ficha.puesto) {
        return <div className="bg-gray-800 rounded-lg p-6 text-sm text-gray-400">Elige primero el puesto del jugador en la pestaña Datos: la comparación es contra otro jugador de su mismo puesto.</div>;
    }

    const general = mediaGeneral(ficha.cualidades);
    const filas: Array<{ label: string; a: number | null; b: number | null; fuerte?: boolean }> = [
        ...SECCIONES.map((s) => ({ label: s.titulo, a: mediaSeccion(ficha.cualidades, s.clave), b: otro ? mediaSeccion(otro.cualidades, s.clave) : null })),
        { label: 'Promedio general', a: general.media, b: otro ? otro.promedio : null, fuerte: true },
    ];
    const barra = (v: number | null, color: string) => (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden"><div className="h-full rounded-sm" style={{ width: `${v === null ? 0 : Math.min(100, v * 10)}%`, backgroundColor: color }} /></div>
            <span className="w-8 text-right text-sm font-semibold text-white">{v === null ? '–' : v.toFixed(1)}</span>
        </div>
    );
    const COLOR_A = '#22d3ee', COLOR_B = '#f59e0b';

    return (
        <div className="bg-gray-800 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-white">Comparación</h2>
                    <p className="text-xs text-gray-400">Contra otro jugador de su mismo puesto: {puestoLabel(ficha.puesto)}.</p>
                </div>
                <div className="w-full sm:w-80">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Comparar contra</label>
                    <select value={otro?.id || ''} onChange={(e) => setElegidoId(e.target.value)} disabled={candidatos.length === 0} className={`${inputCls} disabled:opacity-50`}>
                        {candidatos.length === 0 && <option value="">No hay otro jugador calificado en este puesto</option>}
                        {candidatos.length > 0 && !otro && <option value="">— Elige un jugador —</option>}
                        {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.promedio.toFixed(1)}{c.player_id ? ' · mi equipo' : c.equipo ? ` · ${c.equipo}` : ''}</option>)}
                    </select>
                </div>
            </div>

            {!mejorDeMiEquipo && (
                <p className="text-xs text-amber-400">
                    {candidatos.length === 0
                        ? 'Todavía no hay otro jugador calificado en este puesto para comparar.'
                        : 'En tu equipo no hay ningún jugador con ficha calificada en este puesto. Puedes elegir a otro jugador de la lista.'}
                </p>
            )}
            {otro && mejorDeMiEquipo && otro.id === mejorDeMiEquipo.id && <p className="text-xs text-gray-400">{otro.nombre} es el mejor calificado de tu equipo en este puesto.</p>}

            {otro && (
                <>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                        <span className="flex items-center gap-2 text-white"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_A }} />{ficha.nombre.trim() || 'Este jugador'}</span>
                        <span className="flex items-center gap-2 text-white"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_B }} />{otro.nombre}</span>
                    </div>
                    <div className="divide-y divide-gray-700">
                        {filas.map((f) => {
                            const dif = f.a !== null && f.b !== null ? Math.round((f.a - f.b) * 10) / 10 : null;
                            return (
                                <div key={f.label} className="py-3 grid grid-cols-1 md:grid-cols-[14rem_1fr_5rem] gap-x-4 gap-y-1 items-center">
                                    <span className={`text-sm ${f.fuerte ? 'text-white font-semibold' : 'text-gray-200'}`}>{f.label}</span>
                                    <div className="space-y-1">{barra(f.a, COLOR_A)}{barra(f.b, COLOR_B)}</div>
                                    <span className={`text-sm font-semibold md:text-right ${dif === null ? 'text-gray-500' : dif > 0 ? 'text-green-400' : dif < 0 ? 'text-red-400' : 'text-gray-300'}`} title="Diferencia de este jugador contra el comparado">
                                        {dif === null ? 'sin dato' : `${dif > 0 ? '+' : ''}${dif.toFixed(1)}`}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-gray-500">La columna de la derecha es la diferencia de este jugador contra el comparado: en verde va arriba, en rojo va abajo.</p>
                </>
            )}
        </div>
    );
};

const ScoutingPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lista, setLista] = useState<ScoutingPlayerLista[]>([]);
    const [jugadoresEquipo, setJugadoresEquipo] = useState<JugadorEquipo[]>([]);

    const [vista, setVista] = useState<'lista' | 'ficha'>('lista');
    // Dentro de la lista: las fichas, o el reporte ejecutivo (la cancha con los 3 mejores por puesto).
    const [vistaLista, setVistaLista] = useState<'fichas' | 'reporte'>('fichas');
    const [busqueda, setBusqueda] = useState('');
    const [filtroPuesto, setFiltroPuesto] = useState('');

    const [ficha, setFicha] = useState<Borrador>(FICHA_VACIA);
    const [original, setOriginal] = useState<string>(JSON.stringify(FICHA_VACIA));
    const [origenNuevo, setOrigenNuevo] = useState<'' | 'equipo' | 'otro'>('');
    const [pestana, setPestana] = useState<Pestana>('datos');
    const [abriendo, setAbriendo] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
    const [cambiandoActivo, setCambiandoActivo] = useState(false);
    const fotoInput = useRef<HTMLInputElement>(null);

    const cargar = async () => {
        setError(null);
        try {
            const [fichas, jugadores] = await Promise.all([fetchScoutingPlayers(), fetchJugadoresEquipo().catch(() => [] as JugadorEquipo[])]);
            setLista(fichas);
            setJugadoresEquipo(jugadores.filter((p) => !esJugadorFicticio(p.nombre)));
        } catch (err: any) {
            setError(err?.message || 'No se pudo cargar Scouting.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { cargar(); }, []);

    const hayCambios = JSON.stringify(ficha) !== original;
    const jugadorLigado = ficha.player_id ? jugadoresEquipo.find((p) => p.id === ficha.player_id) : undefined;
    const general = mediaGeneral(ficha.cualidades);
    const edad = edadDe(ficha.fecha_nacimiento);

    // Jugadores del equipo que todavía no tienen ficha (para no capturarlos dos veces).
    const disponiblesEquipo = useMemo(() => {
        const yaLigados = new Set(lista.map((f) => f.player_id).filter(Boolean));
        return jugadoresEquipo.filter((p) => !yaLigados.has(p.id));
    }, [jugadoresEquipo, lista]);

    const listaVisible = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return lista.filter((f) => {
            if (filtroPuesto && f.puesto !== filtroPuesto) return false;
            if (!q) return true;
            return [f.nombre, f.equipo, f.competicion].some((t) => (t || '').toLowerCase().includes(q));
        });
    }, [lista, busqueda, filtroPuesto]);

    const set = <K extends keyof Borrador>(campo: K, valor: Borrador[K]) => setFicha((f) => ({ ...f, [campo]: valor }));
    const texto = (v: string) => (v.trim() === '' ? null : v);
    const entero = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
    const decimal = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n; };

    const abrirNueva = () => {
        setFicha(FICHA_VACIA); setOriginal(JSON.stringify(FICHA_VACIA));
        setOrigenNuevo(''); setPestana('datos'); setAviso(null); setVista('ficha');
    };

    const abrirFicha = async (id: string) => {
        setAbriendo(true); setAviso(null);
        try {
            const f = await fetchScoutingPlayer(id);
            setFicha(f); setOriginal(JSON.stringify(f));
            setOrigenNuevo(f.player_id ? 'equipo' : 'otro'); setPestana('datos'); setVista('ficha');
        } catch (err: any) {
            setError(err?.message || 'No se pudo abrir la ficha.');
        } finally {
            setAbriendo(false);
        }
    };

    const volver = () => {
        if (hayCambios && !window.confirm('Tienes cambios sin guardar en esta ficha. ¿Salir sin guardar?')) return;
        setVista('lista'); setAviso(null);
    };

    const elegirJugadorEquipo = (playerId: string) => {
        const p = jugadoresEquipo.find((j) => j.id === playerId);
        if (!p) { set('player_id', null); return; }
        setFicha((f) => ({ ...f, player_id: p.id, nombre: p.nombre, dorsal: p.numero ?? null, equipo: p.equipoNombre || f.equipo }));
    };

    const guardar = async () => {
        if (!ficha.nombre.trim()) { setAviso({ tipo: 'error', texto: 'Falta el nombre del jugador.' }); setPestana('datos'); return; }
        setGuardando(true); setAviso(null);
        try {
            const guardada = await guardarScoutingPlayer(ficha);
            setFicha(guardada); setOriginal(JSON.stringify(guardada));
            setOrigenNuevo(guardada.player_id ? 'equipo' : 'otro');
            setAviso({ tipo: 'ok', texto: 'Ficha guardada.' });
            setLista(await fetchScoutingPlayers());
        } catch (err: any) {
            setAviso({ tipo: 'error', texto: err?.message || 'No se pudo guardar la ficha.' });
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async () => {
        if (!ficha.id) return;
        if (!window.confirm(`¿Eliminar la ficha de scouting de ${ficha.nombre}? Sus calificaciones y su valoración se borran. Si es jugador de tu equipo, su etiquetado NO se toca.`)) return;
        setGuardando(true);
        try {
            await eliminarScoutingPlayer(ficha.id);
            setLista(await fetchScoutingPlayers());
            setVista('lista'); setAviso(null);
        } catch (err: any) {
            setAviso({ tipo: 'error', texto: err?.message || 'No se pudo eliminar la ficha.' });
        } finally {
            setGuardando(false);
        }
    };

    const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const archivo = e.target.files?.[0];
        e.target.value = '';
        if (!archivo) return;
        try {
            set('foto', await reducirFoto(archivo));
        } catch (err: any) {
            setAviso({ tipo: 'error', texto: err?.message || 'No se pudo leer la foto.' });
        }
    };

    const cambiarActivo = async (activo: boolean) => {
        if (!jugadorLigado) return;
        setCambiandoActivo(true); setAviso(null);
        try {
            await setJugadorActivo(jugadorLigado.id, activo);
            setJugadoresEquipo((js) => js.map((j) => (j.id === jugadorLigado.id ? { ...j, activo } : j)));
            setAviso({
                tipo: 'ok',
                texto: activo
                    ? `${jugadorLigado.nombre} vuelve a aparecer en el Etiquetador.`
                    : `${jugadorLigado.nombre} ya no aparece en el Etiquetador. Su historial se conserva en Tablero, Rendimiento y reportes.`,
            });
        } catch (err: any) {
            setAviso({ tipo: 'error', texto: err?.message || 'No se pudo cambiar el estado del jugador.' });
        } finally {
            setCambiandoActivo(false);
        }
    };

    const calificar = (seccion: SeccionClave, lineaClave: string, valor: number) => {
        setFicha((f) => {
            const sec = { ...(f.cualidades?.[seccion] || {}) };
            if (sec[lineaClave] === valor) delete sec[lineaClave]; // clic en el mismo número = quitar la calificación
            else sec[lineaClave] = valor;
            return { ...f, cualidades: { ...(f.cualidades || {}), [seccion]: sec } };
        });
    };

    if (loading) {
        return <div className="flex items-center justify-center min-h-[50vh]"><Spinner size="h-12 w-12" /></div>;
    }

    // ═══════════════════════════ VISTA: LISTA ═══════════════════════════
    if (vista === 'lista') {
        return (
            <div className="space-y-5">
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Scouting</h1>
                        <p className="text-gray-400 text-sm mt-1">Fichas de jugadores en seguimiento, de tu equipo o de cualquier otro. Es independiente del etiquetado.</p>
                    </div>
                    <button onClick={abrirNueva} className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-md text-sm">+ Nuevo jugador</button>
                </div>

                {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setVistaLista('fichas')} className={`px-3 py-2 rounded-lg text-sm transition-colors ${vistaLista === 'fichas' ? 'bg-white text-gray-900 font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Fichas</button>
                    <button onClick={() => setVistaLista('reporte')} className={`px-3 py-2 rounded-lg text-sm transition-colors ${vistaLista === 'reporte' ? 'bg-white text-gray-900 font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Reporte ejecutivo de scouting</button>
                </div>

                {vistaLista === 'reporte' ? (
                    <ReporteEjecutivo lista={lista} onAbrir={abrirFicha} />
                ) : (<>
                <div className="flex flex-wrap gap-3">
                    <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, equipo o competición" className={`${inputCls} max-w-sm`} />
                    <select value={filtroPuesto} onChange={(e) => setFiltroPuesto(e.target.value)} className={`${inputCls} max-w-[200px]`}>
                        <option value="">Todos los puestos</option>
                        {PUESTOS.map((p) => <option key={p.clave} value={p.clave}>{p.label}</option>)}
                    </select>
                    <span className="text-xs text-gray-500 self-center">{listaVisible.length} de {lista.length} fichas</span>
                </div>

                {lista.length === 0 && !error ? (
                    <div className="bg-gray-800 rounded-lg p-8 text-center">
                        <p className="text-white font-semibold">Todavía no hay jugadores registrados.</p>
                        <p className="text-gray-400 text-sm mt-1">Empieza con "+ Nuevo jugador": puede ser de tu equipo o de cualquier otro.</p>
                    </div>
                ) : listaVisible.length === 0 ? (
                    <p className="text-gray-500 text-sm">Ninguna ficha coincide con la búsqueda.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {listaVisible.map((f) => {
                            const g = mediaGeneral(f.cualidades);
                            const val = valoracionDe(f.valoracion);
                            const ligado = f.player_id ? jugadoresEquipo.find((p) => p.id === f.player_id) : undefined;
                            return (
                                <button key={f.id} onClick={() => abrirFicha(f.id)} disabled={abriendo}
                                    className="text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg p-4 transition-colors flex gap-3 items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold truncate">{f.nombre}</p>
                                        <p className="text-gray-400 text-xs mt-0.5 truncate">
                                            {[f.dorsal != null ? `#${f.dorsal}` : '', puestoLabel(f.puesto) || 'Sin puesto'].filter(Boolean).join(' · ')}
                                        </p>
                                        <p className="text-gray-500 text-xs truncate">{[f.equipo, f.competicion].filter(Boolean).join(' · ') || 'Sin equipo ni competición'}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {f.player_id && <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300">Mi equipo</span>}
                                            {ligado && ligado.activo === false && <span className="text-[11px] px-2 py-0.5 rounded bg-gray-600 text-gray-200">Inactivo</span>}
                                            {f.tipo_jugador && <span className="text-[11px] px-2 py-0.5 rounded bg-gray-700 text-gray-300">{f.tipo_jugador}</span>}
                                            {val && <span className="text-[11px] px-2 py-0.5 rounded text-white" style={{ backgroundColor: val.color }}>{val.label}</span>}
                                        </div>
                                    </div>
                                    <div className="text-center shrink-0">
                                        <ChipMedia valor={g.media} grande />
                                        <p className="text-[10px] text-gray-500 mt-1">{g.secciones === 0 ? 'sin calificar' : g.secciones < SECCIONES.length ? `${g.secciones} de ${SECCIONES.length} secc.` : 'promedio'}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
                </>)}
            </div>
        );
    }

    // ═══════════════════════════ VISTA: FICHA ═══════════════════════════
    const seccionActiva = SECCIONES.find((s) => s.clave === pestana);
    const esNueva = !ficha.id;
    // En una ficha nueva, primero se dice de dónde es el jugador (y si es de mi equipo, cuál).
    const faltaOrigen = esNueva && (origenNuevo === '' || (origenNuevo === 'equipo' && !ficha.player_id));

    return (
        <div className="space-y-4">
            <button onClick={volver} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>Scouting
            </button>

            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {ficha.foto
                        ? <img src={ficha.foto} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-600" />
                        : <div className="w-14 h-14 rounded-lg bg-gray-700 flex items-center justify-center text-gray-400 text-xl font-bold">{(ficha.nombre.trim()[0] || '?').toUpperCase()}</div>}
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-white truncate">{ficha.nombre.trim() || 'Nuevo jugador'}</h1>
                        <p className="text-gray-400 text-xs">
                            {[puestoLabel(ficha.puesto), ficha.equipo, ficha.competicion, edad !== null ? `${edad} años` : ''].filter(Boolean).join(' · ') || 'Completa los datos del jugador'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hayCambios && <span className="text-xs text-amber-400">Cambios sin guardar</span>}
                    {!esNueva && <button onClick={eliminar} disabled={guardando} className="px-3 py-2 rounded-md text-sm bg-gray-700 text-red-300 hover:bg-red-900/50 disabled:opacity-50">Eliminar</button>}
                    <button onClick={guardar} disabled={guardando || faltaOrigen || (!hayCambios && !esNueva)}
                        className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-5 rounded-md text-sm">
                        {guardando ? 'Guardando…' : 'Guardar ficha'}
                    </button>
                </div>
            </div>

            {aviso && (
                <div className={`rounded-lg p-3 text-sm border ${aviso.tipo === 'ok' ? 'bg-green-900/40 border-green-800 text-green-200' : 'bg-red-900/40 border-red-800 text-red-300'}`}>{aviso.texto}</div>
            )}

            {/* Resumen de medias: siempre visible, para ver el efecto de cada calificación */}
            <div className="bg-gray-800 rounded-lg p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-2">
                    <ChipMedia valor={general.media} grande />
                    <div>
                        <p className="text-white text-sm font-semibold">Promedio general</p>
                        <p className="text-[11px] text-gray-500">{general.secciones === 0 ? 'Sin calificar todavía' : `Promedio de ${general.secciones} de ${SECCIONES.length} secciones`}</p>
                    </div>
                </div>
                {SECCIONES.map((s) => (
                    <button key={s.clave} onClick={() => setPestana(s.clave)} className="flex items-center gap-2 text-left hover:opacity-80">
                        <ChipMedia valor={mediaSeccion(ficha.cualidades, s.clave)} />
                        <span className="text-xs text-gray-300">{s.corto}</span>
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                {PESTANAS.map((p) => (
                    <button key={p.clave} onClick={() => setPestana(p.clave)}
                        className={`px-3 py-2 rounded-lg text-sm transition-colors ${pestana === p.clave ? 'bg-white text-gray-900 font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                        {p.label}
                    </button>
                ))}
            </div>

            {/* ─────────── Pestaña: Datos ─────────── */}
            {pestana === 'datos' && (
                <div className="space-y-4">
                    {esNueva && (
                        <div className="bg-gray-800 rounded-lg p-4">
                            <p className="text-sm font-semibold text-white mb-2">¿De dónde es este jugador?</p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => { setOrigenNuevo('equipo'); }} className={`px-3 py-2 rounded-lg text-sm ${origenNuevo === 'equipo' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>De mi equipo</button>
                                <button onClick={() => { setOrigenNuevo('otro'); set('player_id', null); }} className={`px-3 py-2 rounded-lg text-sm ${origenNuevo === 'otro' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>De otro equipo</button>
                            </div>
                            {origenNuevo === 'equipo' && (
                                <div className="mt-3 max-w-md">
                                    {disponiblesEquipo.length === 0 ? (
                                        <p className="text-xs text-amber-400">Todos los jugadores de tu equipo ya tienen ficha de scouting.</p>
                                    ) : (
                                        <Campo label="Elige al jugador de tu lista del Etiquetador" ayuda="Se copian su nombre, dorsal y equipo, para no capturarlo dos veces.">
                                            <select value={ficha.player_id || ''} onChange={(e) => elegirJugadorEquipo(e.target.value)} className={inputCls}>
                                                <option value="">— Elige un jugador —</option>
                                                {disponiblesEquipo.map((p) => <option key={p.id} value={p.id}>#{p.numero} {p.nombre}{p.equipoNombre ? ` · ${p.equipoNombre}` : ''}{p.activo === false ? ' (inactivo)' : ''}</option>)}
                                            </select>
                                        </Campo>
                                    )}
                                </div>
                            )}
                            {origenNuevo === 'otro' && <p className="text-xs text-gray-500 mt-2">Este jugador solo existirá en Scouting. No aparecerá en el Etiquetador ni en las estadísticas de tu equipo.</p>}
                        </div>
                    )}

                    {jugadorLigado && (
                        <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <p className="text-sm font-semibold text-white">Jugador de tu equipo{jugadorLigado.equipoNombre ? ` · ${jugadorLigado.equipoNombre}` : ''}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {jugadorLigado.activo === false
                                        ? 'Inactivo: no aparece en la lista de jugadores del Etiquetador. Su historial se conserva.'
                                        : 'Activo: aparece en la lista de jugadores del Etiquetador.'}
                                </p>
                            </div>
                            <button onClick={() => cambiarActivo(jugadorLigado.activo === false)} disabled={cambiandoActivo}
                                className={`px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50 ${jugadorLigado.activo === false ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                                {cambiandoActivo ? 'Cambiando…' : jugadorLigado.activo === false ? 'Volver a activar' : 'Marcar como inactivo'}
                            </button>
                        </div>
                    )}

                    {!faltaOrigen && (
                        <div className="bg-gray-800 rounded-lg p-4 flex flex-col md:flex-row gap-5">
                            <div className="shrink-0 w-40">
                                <p className="text-xs font-medium text-gray-400 mb-1">Foto (opcional)</p>
                                {ficha.foto
                                    ? <img src={ficha.foto} alt="Foto del jugador" className="w-40 h-40 rounded-lg object-cover border border-gray-600" />
                                    : <div className="w-40 h-40 rounded-lg bg-gray-700 border border-dashed border-gray-500 flex items-center justify-center text-gray-500 text-xs text-center px-3">Sin foto</div>}
                                <input ref={fotoInput} type="file" accept="image/*" onChange={subirFoto} className="hidden" />
                                <div className="flex gap-2 mt-2">
                                    <button onClick={() => fotoInput.current?.click()} className="flex-1 px-2 py-1.5 rounded-md text-xs bg-gray-700 text-gray-200 hover:bg-gray-600">{ficha.foto ? 'Cambiar' : 'Subir foto'}</button>
                                    {ficha.foto && <button onClick={() => set('foto', null)} className="px-2 py-1.5 rounded-md text-xs bg-gray-700 text-red-300 hover:bg-gray-600">Quitar</button>}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1">Se guarda en tamaño chico.</p>
                            </div>

                            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <Campo label="Nombre" className="col-span-2">
                                    <input value={ficha.nombre} onChange={(e) => set('nombre', e.target.value)} className={inputCls} placeholder="Nombre del jugador" />
                                </Campo>
                                <Campo label="Equipo" className="col-span-2">
                                    <input value={ficha.equipo || ''} onChange={(e) => set('equipo', texto(e.target.value))} className={inputCls} placeholder="Equipo en el que juega" />
                                </Campo>
                                <Campo label="Tipo de competición" ayuda="Liga o torneo en la que juega." className="col-span-2">
                                    <input value={ficha.competicion || ''} onChange={(e) => set('competicion', texto(e.target.value))} className={inputCls} placeholder="Ej: Torneo de Verano, Prodefut 2026" />
                                </Campo>
                                <Campo label="Puesto">
                                    <select value={ficha.puesto || ''} onChange={(e) => set('puesto', e.target.value || null)} className={inputCls}>
                                        <option value="">— Elige —</option>
                                        {PUESTOS.map((p) => <option key={p.clave} value={p.clave}>{p.label}</option>)}
                                    </select>
                                </Campo>
                                <Campo label="Tipo de jugador">
                                    <select value={ficha.tipo_jugador || ''} onChange={(e) => set('tipo_jugador', e.target.value || null)} className={inputCls}>
                                        <option value="">— Elige —</option>
                                        {TIPOS_JUGADOR.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </Campo>
                                <Campo label="Dorsal">
                                    <input type="number" min={0} value={ficha.dorsal ?? ''} onChange={(e) => set('dorsal', entero(e.target.value))} className={inputCls} />
                                </Campo>
                                <Campo label="Pierna">
                                    <select value={ficha.pierna || ''} onChange={(e) => set('pierna', e.target.value || null)} className={inputCls}>
                                        <option value="">— Elige —</option>
                                        {PIERNAS.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </Campo>
                                <Campo label="Altura (cm)">
                                    <input type="number" min={0} value={ficha.altura_cm ?? ''} onChange={(e) => set('altura_cm', entero(e.target.value))} className={inputCls} />
                                </Campo>
                                <Campo label="Peso (kg)">
                                    <input type="number" min={0} step="0.1" value={ficha.peso_kg ?? ''} onChange={(e) => set('peso_kg', decimal(e.target.value))} className={inputCls} />
                                </Campo>
                                <Campo label="Fecha de nacimiento" ayuda={edad !== null ? `${edad} años` : undefined}>
                                    <input type="date" value={ficha.fecha_nacimiento || ''} onChange={(e) => set('fecha_nacimiento', e.target.value || null)} className={inputCls} />
                                </Campo>
                                <Campo label="Nacionalidad">
                                    <input value={ficha.nacionalidad || ''} onChange={(e) => set('nacionalidad', texto(e.target.value))} className={inputCls} placeholder="Ej: Mexicano" />
                                </Campo>
                                <Campo label="Valor de mercado" className="col-span-2">
                                    <input value={ficha.valor_mercado || ''} onChange={(e) => set('valor_mercado', texto(e.target.value))} className={inputCls} placeholder="Texto libre" />
                                </Campo>
                                <Campo label="Video (enlace)" className="col-span-2">
                                    <div className="flex gap-2">
                                        <input value={ficha.video_url || ''} onChange={(e) => set('video_url', texto(e.target.value))} className={inputCls} placeholder="https://…" />
                                        {ficha.video_url && /^https?:\/\//i.test(ficha.video_url) && (
                                            <a href={ficha.video_url} target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-2 rounded-md text-sm bg-gray-700 text-cyan-300 hover:bg-gray-600">Abrir</a>
                                        )}
                                    </div>
                                </Campo>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─────────── Pestaña: Números ─────────── */}
            {pestana === 'numeros' && <NumerosJugador fichaId={ficha.id} playerId={ficha.player_id} competicion={ficha.competicion} />}

            {/* ─────────── Pestañas de cualidades (1 a 10) ─────────── */}
            {seccionActiva && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                        <div>
                            <h2 className="text-lg font-semibold text-white">{seccionActiva.titulo}</h2>
                            <p className="text-xs text-gray-400">Califica del 1 al 10. Para quitar una calificación, da clic otra vez en el mismo número.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-right">
                                <p className="text-xs text-gray-400">Media</p>
                                <p className="text-[11px] text-gray-500">{lineasCalificadas(ficha.cualidades, seccionActiva.clave)} de {seccionActiva.lineas.length} calificadas</p>
                            </div>
                            <ChipMedia valor={mediaSeccion(ficha.cualidades, seccionActiva.clave)} grande />
                        </div>
                    </div>
                    <div className="divide-y divide-gray-700">
                        {seccionActiva.lineas.map((l) => {
                            const actual = ficha.cualidades?.[seccionActiva.clave]?.[l.clave];
                            return (
                                <div key={l.clave} className="py-2 flex items-center flex-wrap gap-x-4 gap-y-1.5">
                                    <span className="text-sm text-gray-200 w-52 shrink-0">{l.label}</span>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                            <button key={n} onClick={() => calificar(seccionActiva.clave, l.clave, n)} aria-label={`${l.label}: ${n}`}
                                                className={`w-8 h-8 rounded-md text-sm font-semibold transition-colors ${actual === n ? 'bg-cyan-500 text-white' : actual !== undefined && n < actual ? 'bg-cyan-900/60 text-cyan-200 hover:bg-cyan-800' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="text-xs text-gray-500">{actual === undefined ? 'Sin calificar' : ''}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─────────── Pestaña: Comparación ─────────── */}
            {pestana === 'comparacion' && <ComparacionJugador ficha={ficha} lista={lista} />}

            {/* ─────────── Pestaña: Valoración final ─────────── */}
            {pestana === 'valoracion' && (
                <div className="bg-gray-800 rounded-lg p-4 space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white mb-2">Valoración final</h2>
                        <div className="flex flex-wrap gap-2">
                            {VALORACIONES.map((v) => {
                                const activa = ficha.valoracion === v.clave;
                                return (
                                    <button key={v.clave} onClick={() => set('valoracion', activa ? null : (v.clave as ValoracionFinal))}
                                        className={`px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${activa ? 'text-white' : 'bg-gray-700 text-gray-300 border-transparent hover:bg-gray-600'}`}
                                        style={activa ? { backgroundColor: v.color, borderColor: v.color } : undefined}>
                                        {v.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Campo label="Descripción">
                            <textarea rows={4} value={ficha.descripcion || ''} onChange={(e) => set('descripcion', texto(e.target.value))} className={inputCls} placeholder="Cómo juega, qué le gusta hacer." />
                        </Campo>
                        <Campo label="Modelo de juego">
                            <textarea rows={4} value={ficha.modelo_juego || ''} onChange={(e) => set('modelo_juego', texto(e.target.value))} className={inputCls} placeholder="Cómo encajaría en nuestro modelo de juego." />
                        </Campo>
                        <Campo label="Puntos fuertes">
                            <textarea rows={3} value={ficha.puntos_fuertes || ''} onChange={(e) => set('puntos_fuertes', texto(e.target.value))} className={inputCls} />
                        </Campo>
                        <Campo label="Puntos débiles">
                            <textarea rows={3} value={ficha.puntos_debiles || ''} onChange={(e) => set('puntos_debiles', texto(e.target.value))} className={inputCls} />
                        </Campo>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScoutingPage;
