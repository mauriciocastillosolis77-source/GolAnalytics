import React, { useEffect, useRef, useState } from 'react';
import type { Match } from '../../types';
import {
  listarReportesDT, publicarReporteDT, quitarReporteDT, urlReporteDT, fechaPublicado, TAMANO_MAXIMO_MB,
  type ReporteDTConPartido,
} from '../../services/reportesDTService';

// ─────────────────────────────────────────────────────────────────────────────
// Bloque "Publicar para el DT" (solo admin, en Análisis Ejecutivo Post Partido).
// El admin sube el PDF final del partido elegido (lo exporta desde PowerPoint)
// y el DT de ese equipo lo ve en "Análisis Post Partido DT".
// ─────────────────────────────────────────────────────────────────────────────

const PublicarReporteDT: React.FC<{ match: Match; equipoNombre?: string }> = ({ match, equipoNombre }) => {
  const [publicados, setPublicados] = useState<ReporteDTConPartido[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const equipo = equipoNombre || match.nombre_equipo;

  useEffect(() => {
    let cancelado = false;
    if (!match.team_id) { setPublicados([]); return; }
    listarReportesDT(match.team_id)
      .then((r) => { if (!cancelado) setPublicados(r); })
      .catch((e) => { if (!cancelado) setMsg({ texto: e?.message || 'No se pudieron cargar los publicados.', ok: false }); });
    return () => { cancelado = true; };
  }, [match.team_id, recarga]);

  // Al cambiar de partido se limpia lo elegido.
  useEffect(() => { setArchivo(null); setMsg(null); if (input.current) input.current.value = ''; }, [match.id]);

  const yaPublicado = publicados.find((p) => p.match_id === match.id);

  const publicar = async () => {
    if (!archivo) return;
    setOcupado(true); setMsg(null);
    try {
      await publicarReporteDT(match, archivo);
      setMsg({ texto: `${yaPublicado ? 'Reporte reemplazado' : 'Reporte publicado'}. El DT de ${equipo} ya lo puede ver en "Análisis Post Partido DT".`, ok: true });
      setArchivo(null); if (input.current) input.current.value = '';
      setRecarga((n) => n + 1);
    } catch (e: any) {
      setMsg({ texto: e?.message || 'No se pudo publicar el PDF.', ok: false });
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (r: ReporteDTConPartido) => {
    const nombre = r.partido ? `J${r.partido.jornada} vs ${r.partido.rival}` : 'este reporte';
    if (!window.confirm(`¿Quitar ${nombre}? El DT dejará de verlo.`)) return;
    setOcupado(true); setMsg(null);
    try {
      await quitarReporteDT(r);
      setMsg({ texto: `Se quitó ${nombre}.`, ok: true });
      setRecarga((n) => n + 1);
    } catch (e: any) {
      setMsg({ texto: e?.message || 'No se pudo quitar el reporte.', ok: false });
    } finally {
      setOcupado(false);
    }
  };

  const ver = async (r: ReporteDTConPartido) => {
    const pestana = window.open('', '_blank');
    try {
      const url = await urlReporteDT(r);
      if (pestana) pestana.location.href = url; else window.location.href = url;
    } catch (e: any) {
      pestana?.close();
      setMsg({ texto: e?.message || 'No se pudo abrir el PDF.', ok: false });
    }
  };

  if (!match.team_id) {
    return (
      <div className="mt-6 bg-gray-800 rounded-lg p-6 shadow-lg text-sm text-amber-300">
        Este partido no tiene equipo asignado, así que no se puede publicar para un DT.
      </div>
    );
  }

  return (
    <div className="mt-6 bg-gray-800 rounded-lg p-6 shadow-lg border border-cyan-800" data-publicar-dt>
      <h2 className="text-lg font-semibold text-white">Publicar para el DT</h2>
      <p className="text-sm text-gray-400 mt-1 mb-4">
        Sube el PDF final de <span className="text-gray-200">J{match.jornada} · {match.nombre_equipo} vs {match.rival}</span> (en PowerPoint: Archivo → Guardar como → PDF).
        El DT de {equipo} lo verá en "Análisis Post Partido DT". Máximo {TAMANO_MAXIMO_MB} MB.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={input} type="file" accept="application/pdf,.pdf" disabled={ocupado}
          onChange={(e) => { setArchivo(e.target.files?.[0] || null); setMsg(null); }}
          className="text-sm text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-gray-700 file:px-3 file:py-2 file:text-white hover:file:bg-gray-600" />
        <button type="button" onClick={publicar} disabled={!archivo || ocupado}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-5 rounded-md text-sm">
          {ocupado ? 'Subiendo…' : yaPublicado ? 'Reemplazar el publicado' : 'Publicar'}
        </button>
      </div>
      {yaPublicado && !msg && <p className="text-xs text-gray-400 mt-2">Este partido ya tiene un PDF publicado ({fechaPublicado(yaPublicado.updated_at)}). Si subes otro, lo reemplaza.</p>}
      {msg && <div className={`mt-3 p-3 rounded-md text-sm ${msg.ok ? 'bg-green-900/40 text-green-200' : 'bg-red-900 text-red-200'}`}>{msg.texto}</div>}

      <div className="mt-5">
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Ya publicados para {equipo} ({publicados.length})</p>
        {publicados.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay ninguno.</p>
        ) : (
          <div className="space-y-2">
            {publicados.map((r) => (
              <div key={r.match_id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${r.match_id === match.id ? 'bg-cyan-900/30' : 'bg-gray-900'}`}>
                <div className="bg-red-600 text-white text-[10px] font-bold rounded px-1.5 py-1.5">PDF</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{r.partido ? `J${r.partido.jornada} · ${r.partido.nombre_equipo} vs ${r.partido.rival} · ${r.partido.torneo}` : (r.nombre_archivo || 'Reporte')}</p>
                  <p className="text-xs text-gray-400">publicado {fechaPublicado(r.updated_at)}{r.tamano ? ` · ${(r.tamano / 1024 / 1024).toFixed(1)} MB` : ''}</p>
                </div>
                <button type="button" onClick={() => ver(r)} className="text-sm text-cyan-400 hover:text-cyan-300 px-2">Ver</button>
                <button type="button" onClick={() => quitar(r)} disabled={ocupado} className="text-sm bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-100 rounded-md px-3 py-1.5">Quitar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicarReporteDT;
