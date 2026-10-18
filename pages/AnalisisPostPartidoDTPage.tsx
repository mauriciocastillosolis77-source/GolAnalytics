import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { fetchTeams, type Team } from '../services/teamsService';
import { listarReportesDT, urlReporteDT, nombreDescarga, fechaPartido, fechaPublicado, type ReporteDTConPartido } from '../services/reportesDTService';

// ─────────────────────────────────────────────────────────────────────────────
// Análisis Post Partido DT — biblioteca de solo lectura.
// El auxiliar (DT) ve los PDF que el admin publicó para SU equipo y puede
// verlos o descargarlos. El admin ve la misma pantalla y elige el equipo,
// para revisar exactamente lo que ve cada DT.
// ─────────────────────────────────────────────────────────────────────────────

const AnalisisPostPartidoDTPage: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === ROLES.ADMIN;
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string>('');
  const [reportes, setReportes] = useState<ReporteDTConPartido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  // Equipo que se muestra: el del auxiliar, o el que elija el admin.
  useEffect(() => {
    if (!profile) return;
    if (!isAdmin) { setTeamId(profile.team_id || ''); return; }
    fetchTeams().then((t) => { setTeams(t); setTeamId((actual) => actual || profile.team_id || t[0]?.id || ''); });
  }, [profile, isAdmin]);

  useEffect(() => {
    let cancelado = false;
    if (!teamId) { setReportes([]); setCargando(false); return; }
    setCargando(true); setError(null);
    listarReportesDT(teamId)
      .then((r) => { if (!cancelado) setReportes(r); })
      .catch((e) => { if (!cancelado) setError(e?.message || 'No se pudieron cargar los reportes.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [teamId]);

  // Agrupados por torneo; dentro, del partido más reciente al más antiguo.
  const porTorneo = useMemo(() => {
    const grupos = new Map<string, ReporteDTConPartido[]>();
    reportes.forEach((r) => {
      const t = r.partido?.torneo || 'Otros';
      if (!grupos.has(t)) grupos.set(t, []);
      grupos.get(t)!.push(r);
    });
    return Array.from(grupos.entries());
  }, [reportes]);

  const ver = async (r: ReporteDTConPartido) => {
    // La pestaña se abre antes de pedir la dirección para que el navegador no la bloquee.
    const pestana = window.open('', '_blank');
    setAbriendo(r.match_id); setError(null);
    try {
      const url = await urlReporteDT(r);
      if (pestana) pestana.location.href = url; else window.location.href = url;
    } catch (e: any) {
      pestana?.close();
      setError(e?.message || 'No se pudo abrir el PDF.');
    } finally {
      setAbriendo(null);
    }
  };

  const descargar = async (r: ReporteDTConPartido) => {
    setAbriendo(r.match_id); setError(null);
    try {
      const url = await urlReporteDT(r, nombreDescarga(r));
      const a = document.createElement('a');
      a.href = url; a.download = nombreDescarga(r);
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) {
      setError(e?.message || 'No se pudo descargar el PDF.');
    } finally {
      setAbriendo(null);
    }
  };

  const nombreEquipo = isAdmin ? teams.find((t) => t.id === teamId)?.nombre : reportes[0]?.partido?.nombre_equipo;

  return (
    <div className="p-6 max-w-4xl mx-auto" data-pagina-post-partido-dt>
      <h1 className="text-3xl font-bold mb-2 text-white">Análisis Post Partido</h1>
      <p className="text-gray-400 mb-6">
        Reportes que publicó el analista para {nombreEquipo ? <span className="text-gray-200">{nombreEquipo}</span> : 'tu equipo'}. Solo lectura.
      </p>

      {isAdmin && (
        <div className="mb-6 flex items-center gap-3 flex-wrap bg-gray-800 rounded-lg p-4">
          <span className="text-sm text-gray-400">Vista del DT de:</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="bg-gray-700 text-white rounded-md px-3 py-2 text-sm">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <span className="text-xs text-gray-500">Así ve esta página el DT de ese equipo. Para publicar o quitar, ve a Análisis Ejecutivo Post Partido.</span>
        </div>
      )}

      {error && <div className="mb-4 p-3 rounded-md bg-red-900 text-red-200 text-sm">{error}</div>}

      {!isAdmin && !profile?.team_id ? (
        <div className="bg-gray-800 rounded-lg p-6 text-gray-300">Tu usuario todavía no tiene un equipo asignado. Pídele al administrador que te asigne a tu equipo.</div>
      ) : cargando ? (
        <div className="flex justify-center py-16"><Spinner size="h-10 w-10" /></div>
      ) : reportes.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 text-gray-300">Todavía no hay reportes publicados para este equipo.</div>
      ) : (
        <div className="space-y-6">
          {porTorneo.map(([torneo, lista]) => (
            <div key={torneo} className="bg-gray-800 rounded-lg p-4 shadow-lg">
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">{torneo}</p>
              <div className="space-y-2">
                {lista.map((r) => (
                  <div key={r.match_id} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-3" data-reporte-dt>
                    <div className="bg-red-600 text-white text-xs font-bold rounded px-2 py-2 flex-shrink-0">PDF</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {r.partido ? `Jornada ${r.partido.jornada} · ${r.partido.nombre_equipo} vs ${r.partido.rival}` : (r.nombre_archivo || 'Reporte')}
                      </p>
                      <p className="text-xs text-gray-400">
                        {r.partido ? `${fechaPartido(r.partido.fecha)} · ` : ''}publicado {fechaPublicado(r.updated_at)}
                      </p>
                    </div>
                    <button type="button" onClick={() => ver(r)} disabled={abriendo === r.match_id}
                      className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white text-sm font-semibold rounded-md px-4 py-2">Ver</button>
                    <button type="button" onClick={() => descargar(r)} disabled={abriendo === r.match_id}
                      className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white text-sm font-semibold rounded-md px-4 py-2">Descargar</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnalisisPostPartidoDTPage;
