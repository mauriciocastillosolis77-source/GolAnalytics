import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { fetchTeams, type Team } from '../services/teamsService';
import { fetchScoutingPlayers, fetchScoutingPlayer, type ScoutingPlayerLista } from '../services/scoutingService';
import { fetchNumerosJugador } from '../services/scoutingStatsService';
import type { FiltrosReporte } from '../services/scoutingExportService';
import { ReporteEjecutivo, ChipMedia, BotonFiltro } from './ScoutingPage';
import {
  SECCIONES, CAJAS_442, puestoLabel, valoracionDe, mediaSeccion, mediaGeneral, edadDe, agruparNumeros, sumarNumeros,
  type ScoutingPlayer, type TotalesNumeros,
} from '../utils/scouting';

// ─────────────────────────────────────────────────────────────────────────────
// Scouting DT — solo lectura.
// El auxiliar (DT) ve las fichas que el admin compartió con SU equipo:
//  · Reporte ejecutivo de scouting (la cancha con los 3 mejores por puesto).
//  · Ficha del jugador: datos, posición en la cancha, números por competición
//    y promedio general; y la valoración final (etiqueta y los 4 textos).
// Sin editar, borrar ni exportar. No se muestra el valor de mercado.
// Supabase (RLS) se encarga de que el DT solo reciba las fichas compartidas.
// ─────────────────────────────────────────────────────────────────────────────

type Vista = 'reporte' | 'fichas';

const Dato: React.FC<{ label: string; valor: React.ReactNode }> = ({ label, valor }) => (
  <div className="grid grid-cols-[130px_1fr] gap-2 py-1 text-sm">
    <span className="text-gray-400">{label}</span>
    <span className="text-white font-semibold">{valor}</span>
  </div>
);

/** Cancha vertical (atacamos hacia arriba) con un punto en el puesto del jugador. */
const CanchaPuesto: React.FC<{ puesto: string | null }> = ({ puesto }) => {
  const caja = CAJAS_442.find((c) => c.puesto === puesto);
  return (
    <div>
      <div className="relative mx-auto rounded" style={{ width: 210, height: 290, background: 'repeating-linear-gradient(180deg,#3d8b40 0 32px,#367c39 32px 64px)' }}>
        <svg viewBox="0 0 100 138" className="absolute inset-0 w-full h-full" fill="none" stroke="#e8f5e9" strokeWidth="0.6">
          <rect x="3" y="3" width="94" height="132" />
          <line x1="3" y1="69" x2="97" y2="69" />
          <ellipse cx="50" cy="69" rx="9" ry="9" />
          <rect x="27" y="3" width="46" height="20" /><rect x="39" y="3" width="22" height="8" />
          <rect x="27" y="115" width="46" height="20" /><rect x="39" y="127" width="22" height="8" />
        </svg>
        {caja && (
          <div className="absolute w-6 h-6 rounded-full border-2 border-gray-900" data-punto-puesto
            style={{ background: '#fcd34d', left: `calc(${caja.x}% - 12px)`, top: `calc(${caja.y + 4}% - 12px)` }} />
        )}
      </div>
      <p className="text-center text-sm font-semibold text-white mt-2">{puestoLabel(puesto) || 'Sin puesto'}</p>
    </div>
  );
};

const FichaLectura: React.FC<{ id: string; onVolver: () => void }> = ({ id, onVolver }) => {
  const [ficha, setFicha] = useState<ScoutingPlayer | null>(null);
  const [numeros, setNumeros] = useState<{ grupos: TotalesNumeros[]; total: TotalesNumeros } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setFicha(null); setNumeros(null); setError(null);
    fetchScoutingPlayer(id)
      .then(async (f) => {
        if (cancelado) return;
        setFicha(f);
        try {
          const filas = await fetchNumerosJugador(f.id, f.player_id);
          if (!cancelado) setNumeros({ grupos: agruparNumeros(filas, 'torneo'), total: sumarNumeros('Total', filas) });
        } catch {
          if (!cancelado) setNumeros({ grupos: [], total: sumarNumeros('Total', []) });
        }
      })
      .catch((e) => { if (!cancelado) setError(e?.message || 'No se pudo abrir la ficha.'); });
    return () => { cancelado = true; };
  }, [id]);

  if (error) return <div className="p-4 rounded-md bg-red-900 text-red-200 text-sm">{error} <button onClick={onVolver} className="underline ml-2">Volver</button></div>;
  if (!ficha) return <div className="flex justify-center py-16"><Spinner size="h-10 w-10" /></div>;

  const general = mediaGeneral(ficha.cualidades);
  const edad = edadDe(ficha.fecha_nacimiento);
  const valoracion = valoracionDe(ficha.valoracion);
  const datos: Array<[string, React.ReactNode]> = [
    ['Puesto', puestoLabel(ficha.puesto)],
    ['Equipo', ficha.equipo],
    ['Competición', ficha.competicion],
    ['Dorsal', ficha.dorsal],
    ['Altura', ficha.altura_cm ? `${ficha.altura_cm} cm` : null],
    ['Peso', ficha.peso_kg ? `${ficha.peso_kg} kg` : null],
    ['Pierna', ficha.pierna],
    ['Edad', edad !== null ? `${edad} años` : null],
    ['Nacionalidad', ficha.nacionalidad],
    ['Tipo de jugador', ficha.tipo_jugador],
  ];
  const textos: Array<[string, string | null]> = [
    ['Descripción', ficha.descripcion], ['Modelo de juego', ficha.modelo_juego],
    ['Puntos fuertes', ficha.puntos_fuertes], ['Puntos débiles', ficha.puntos_debiles],
  ];
  const celda = 'px-2 py-1.5 text-center';

  return (
    <div className="space-y-4" data-ficha-lectura>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVolver} className="text-sm text-cyan-400 hover:text-cyan-300">← Volver</button>
        <h2 className="text-2xl font-bold text-white">{ficha.nombre}</h2>
        <span className="text-sm text-gray-400">{[puestoLabel(ficha.puesto), ficha.equipo].filter(Boolean).join(' · ')}</span>
      </div>

      {/* ── Ficha del jugador ── */}
      <div className="bg-gray-800 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Ficha del jugador</h3>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_240px_1fr] gap-6">
          <div>
            {ficha.foto
              ? <img src={ficha.foto} alt={ficha.nombre} className="w-40 h-40 object-cover rounded-lg mb-4" />
              : <div className="w-40 h-40 rounded-lg mb-4 flex items-center justify-center text-6xl font-bold" style={{ background: '#ecebfb', color: '#9a9ee0' }}>{ficha.nombre.trim().charAt(0).toUpperCase()}</div>}
            {datos.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([l, v]) => <Dato key={l} label={l} valor={v} />)}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">Posición en la cancha</p>
            <CanchaPuesto puesto={ficha.puesto} />
          </div>
          <div className="space-y-6 min-w-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">Números por competición</p>
              {!numeros ? <Spinner /> : numeros.grupos.length === 0 ? (
                <p className="text-sm text-gray-400">Todavía no hay partidos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-gray-200" data-tabla-numeros>
                    <thead><tr className="bg-indigo-900 text-white text-xs">
                      <th className="px-2 py-1.5 text-left">Competición</th>
                      {['PJ', 'TIT', 'SUP', 'MIN', 'GOL', 'ASIS', 'TA', 'TR'].map((h) => <th key={h} className={celda}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {[...numeros.grupos, numeros.total].map((g, i) => {
                        const esTotal = i === numeros.grupos.length;
                        return (
                          <tr key={g.etiqueta + i} className={esTotal ? 'bg-gray-700 font-semibold' : i % 2 ? 'bg-gray-900' : ''}>
                            <td className="px-2 py-1.5">{g.etiqueta}</td>
                            {[g.pj, g.titular, g.suplente, g.minutos, g.goles, g.asistencias, g.amarillas, g.rojas].map((v, k) => <td key={k} className={celda}>{v}</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">Promedio general</p>
              <div className="flex flex-wrap gap-3">
                {SECCIONES.map((s) => (
                  <div key={s.clave} className="text-center">
                    <ChipMedia valor={mediaSeccion(ficha.cualidades, s.clave)} grande />
                    <p className="text-xs text-gray-400 mt-1">{s.corto}</p>
                  </div>
                ))}
                <div className="text-center">
                  <ChipMedia valor={general.media} grande />
                  <p className="text-xs text-white font-semibold mt-1">Promedio general</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Valoración final ── */}
      <div className="bg-gray-800 rounded-lg p-5">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h3 className="text-lg font-semibold text-white">Valoración final</h3>
          {valoracion
            ? <span className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: valoracion.color }} data-etiqueta-valoracion>{valoracion.label}</span>
            : <span className="text-sm text-gray-500">Sin valoración</span>}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {textos.map(([t, v]) => (
            <div key={t} className="bg-gray-900 rounded-lg p-4 min-h-[110px]">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">{t}</p>
              <p className={`text-sm whitespace-pre-line ${v ? 'text-gray-200' : 'text-gray-500 italic'}`}>{v || 'Sin información.'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ScoutingDTPage: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === ROLES.ADMIN;
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [todas, setTodas] = useState<ScoutingPlayerLista[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('reporte');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosReporte>({ competicion: '', tipo: '', equipo: '' });

  useEffect(() => {
    if (!profile) return;
    if (!isAdmin) { setTeamId(profile.team_id || ''); return; }
    fetchTeams().then((t) => { setTeams(t); setTeamId((actual) => actual || profile.team_id || t[0]?.id || ''); });
  }, [profile, isAdmin]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true); setError(null);
    fetchScoutingPlayers()
      .then((l) => { if (!cancelado) setTodas(l); })
      .catch((e) => { if (!cancelado) setError(e?.message || 'No se pudo cargar Scouting.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, []);

  // Solo las fichas compartidas con el equipo (para el auxiliar, Supabase ya filtra; aquí se repite el filtro).
  const lista = useMemo(() => (teamId ? todas.filter((f) => (f.compartir_con || []).includes(teamId)) : []), [todas, teamId]);
  useEffect(() => { setAbierta(null); setFiltros({ competicion: '', tipo: '', equipo: '' }); }, [teamId]);

  const nombreEquipo = isAdmin ? teams.find((t) => t.id === teamId)?.nombre : '';

  return (
    <div className="p-6 max-w-6xl mx-auto" data-pagina-scouting-dt>
      <h1 className="text-3xl font-bold mb-2 text-white">Scouting</h1>
      <p className="text-gray-400 mb-6">Jugadores que el analista compartió con {nombreEquipo ? <span className="text-gray-200">{nombreEquipo}</span> : 'tu equipo'}. Solo lectura.</p>

      {isAdmin && (
        <div className="mb-6 flex items-center gap-3 flex-wrap bg-gray-800 rounded-lg p-4">
          <span className="text-sm text-gray-400">Vista del DT de:</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="bg-gray-700 text-white rounded-md px-3 py-2 text-sm">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <span className="text-xs text-gray-500">Así ve esta página el DT de ese equipo. Para compartir una ficha, márcala en Scouting → ficha → Datos.</span>
        </div>
      )}

      {error && <div className="mb-4 p-3 rounded-md bg-red-900 text-red-200 text-sm">{error}</div>}

      {!isAdmin && !profile?.team_id ? (
        <div className="bg-gray-800 rounded-lg p-6 text-gray-300">Tu usuario todavía no tiene un equipo asignado. Pídele al administrador que te asigne a tu equipo.</div>
      ) : cargando ? (
        <div className="flex justify-center py-16"><Spinner size="h-10 w-10" /></div>
      ) : abierta ? (
        <FichaLectura id={abierta} onVolver={() => setAbierta(null)} />
      ) : lista.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 text-gray-300">Todavía no hay jugadores compartidos con este equipo.</div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <BotonFiltro activo={vista === 'reporte'} onClick={() => setVista('reporte')}>Reporte ejecutivo de scouting</BotonFiltro>
            <BotonFiltro activo={vista === 'fichas'} onClick={() => setVista('fichas')}>Fichas ({lista.length})</BotonFiltro>
          </div>
          {vista === 'reporte' ? (
            <ReporteEjecutivo lista={lista} onAbrir={setAbierta} filtros={filtros} onFiltros={setFiltros} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lista.map((f) => {
                const g = mediaGeneral(f.cualidades);
                const v = valoracionDe(f.valoracion);
                return (
                  <button key={f.id} onClick={() => setAbierta(f.id)} data-ficha-dt
                    className="text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-4 flex items-center gap-3 transition-colors">
                    <ChipMedia valor={g.media} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{f.nombre}</p>
                      <p className="text-xs text-gray-400 truncate">{[puestoLabel(f.puesto), f.equipo, f.competicion].filter(Boolean).join(' · ')}</p>
                    </div>
                    {v && <span className="text-xs font-semibold text-white rounded px-2 py-1" style={{ backgroundColor: v.color }}>{v.label}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ScoutingDTPage;
