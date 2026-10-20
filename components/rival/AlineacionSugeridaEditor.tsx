import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { mejorarRedaccionChecklist } from '../../services/reportExportService';
import { esJugadorFicticio } from '../../utils/efectividad';
import type { Player, RivalAnalysis } from '../../types';
import {
  LISTA_FORMACIONES, alineacionNueva, cambiarFormacion, nombrePuesto, nombreCorto,
  type AlineacionSugerida,
} from '../../utils/alineacion';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Alineación sugerida" de Análisis del Rival.
// El admin elige formación, mueve las casillas, asigna un jugador ACTIVO por
// puesto y escribe por qué. El auxiliar la ve en modo lectura.
// Sale en el PDF del rival y en el PowerPoint del partido (sección Próximo rival).
// ─────────────────────────────────────────────────────────────────────────────

const limitar = (v: number) => Math.max(4, Math.min(96, Math.round(v * 10) / 10));

const AlineacionSugeridaEditor: React.FC<{
  analisis: RivalAnalysis;
  jugadores: Player[];
  editable: boolean;
  onGuardada: (a: RivalAnalysis) => void;
}> = ({ analisis, jugadores, editable, onGuardada }) => {
  const inicial = () => (analisis.alineacion && Array.isArray(analisis.alineacion.puestos) ? analisis.alineacion : alineacionNueva());
  const [al, setAl] = useState<AlineacionSugerida>(inicial);
  const [original, setOriginal] = useState(() => JSON.stringify(inicial()));
  const [guardando, setGuardando] = useState(false);
  const [mejorando, setMejorando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const cancha = useRef<HTMLDivElement>(null);

  useEffect(() => { const a = inicial(); setAl(a); setOriginal(JSON.stringify(a)); setMsg(null); }, [analisis.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const porId = useMemo(() => new Map(jugadores.map((p) => [p.id, p])), [jugadores]);
  // En la lista solo salen los activos (y el que ya esté elegido, aunque se haya dado de baja).
  const elegibles = useMemo(
    () => jugadores.filter((p) => !esJugadorFicticio(p.nombre) && p.activo !== false).sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.nombre.localeCompare(b.nombre)),
    [jugadores],
  );
  const usados = new Set(al.puestos.map((p) => p.player_id).filter(Boolean) as string[]);
  const hayCambios = JSON.stringify(al) !== original;

  const setPuesto = (clave: string, cambio: Partial<AlineacionSugerida['puestos'][number]>) =>
    setAl((a) => ({ ...a, puestos: a.puestos.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)) }));

  // ── Arrastrar casillas ──
  const mover = (e: React.PointerEvent) => {
    if (!arrastrando || !cancha.current) return;
    const r = cancha.current.getBoundingClientRect();
    setPuesto(arrastrando, { x: limitar(((e.clientX - r.left) / r.width) * 100), y: limitar(((e.clientY - r.top) / r.height) * 100) });
  };

  const guardar = async () => {
    setGuardando(true); setMsg(null);
    try {
      const limpia: AlineacionSugerida = {
        formacion: al.formacion,
        puestos: al.puestos.map((p) => ({ ...p, motivo: p.motivo.trim() })),
        nota: al.nota.trim(),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('rival_analysis').update({ alineacion: limpia }).eq('id', analisis.id).select().single();
      if (error) throw error;
      setAl(limpia); setOriginal(JSON.stringify(limpia));
      onGuardada(data as RivalAnalysis);
      setMsg({ texto: 'Alineación guardada. Sale en el PDF del rival y en el PowerPoint del partido.', ok: true });
    } catch (err: any) {
      const m = String(err?.message || err || '');
      setMsg({ texto: /alineacion/.test(m) ? 'Falta la columna "alineacion" en Supabase. Corre el SQL de esta entrega y vuelve a intentar.' : `No se pudo guardar la alineación. ${m}`, ok: false });
    } finally {
      setGuardando(false);
    }
  };

  const mejorar = async (clave: string | 'nota') => {
    const texto = clave === 'nota' ? al.nota : al.puestos.find((p) => p.clave === clave)?.motivo || '';
    if (!texto.trim()) return;
    setMejorando(clave); setMsg(null);
    try {
      const pilar = clave === 'nota' ? `Alineación sugerida contra ${analisis.rival_name} — nota general` : `Alineación sugerida contra ${analisis.rival_name} — ${nombrePuesto(clave, al.formacion)}`;
      const nuevo = await mejorarRedaccionChecklist(pilar, texto.trim());
      if (clave === 'nota') setAl((a) => ({ ...a, nota: nuevo })); else setPuesto(clave, { motivo: nuevo });
    } catch (err: any) {
      setMsg({ texto: err?.message || 'No se pudo mejorar el texto. Intenta de nuevo.', ok: false });
    } finally {
      setMejorando(null);
    }
  };

  const etiquetaJugador = (id: string | null) => {
    const p = id ? porId.get(id) : undefined;
    return p ? `${p.numero != null ? '#' + p.numero + ' ' : ''}${p.nombre}` : '';
  };

  const asignados = al.puestos.filter((p) => p.player_id);
  if (!editable && asignados.length === 0) {
    return <div className="bg-gray-800 rounded-lg p-6 text-gray-400 text-sm">Todavía no hay una alineación sugerida para este rival.</div>;
  }

  return (
    <div className="space-y-4" data-alineacion>
      {editable && (
        <p className="text-xs text-gray-500">
          Elige la formación, mueve las casillas si quieres otro dibujo y asigna un jugador activo por puesto con el porqué (opcional).
          Los puestos vacíos no salen en los reportes. Sale en el PDF del rival y en el PowerPoint del partido, en la sección del próximo rival.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        {/* ── Cancha ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-400">Formación</span>
            {editable ? (
              <select value={al.formacion} data-formacion
                onChange={(e) => setAl((a) => cambiarFormacion(a, e.target.value))}
                className="bg-gray-700 text-white rounded-md px-2 py-1.5 text-sm">
                {LISTA_FORMACIONES.map((f) => <option key={f} value={f}>1-{f}</option>)}
              </select>
            ) : <span className="text-sm font-semibold text-white">1-{al.formacion}</span>}
            {editable && (
              <button type="button" onClick={() => setAl((a) => { const b = alineacionNueva(a.formacion); return { ...a, puestos: a.puestos.map((p) => { const q = b.puestos.find((x) => x.clave === p.clave); return q ? { ...p, x: q.x, y: q.y } : p; }) }; })}
                className="text-xs text-cyan-400 hover:text-cyan-300 ml-auto">Acomodar como la formación</button>
            )}
          </div>
          <div ref={cancha} data-cancha
            onPointerMove={mover} onPointerUp={() => setArrastrando(null)} onPointerLeave={() => setArrastrando(null)}
            className="relative w-full rounded-lg overflow-hidden select-none touch-none"
            style={{ aspectRatio: '68 / 100', background: 'repeating-linear-gradient(180deg,#3d8b40 0 10%,#367c39 10% 20%)' }}>
            <svg viewBox="0 0 68 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" fill="none" stroke="#e8f5e9" strokeWidth="0.4">
              <rect x="2" y="2" width="64" height="96" /><line x1="2" y1="50" x2="66" y2="50" /><circle cx="34" cy="50" r="7" />
              <rect x="17" y="2" width="34" height="14" /><rect x="26" y="2" width="16" height="5" />
              <rect x="17" y="84" width="34" height="14" /><rect x="26" y="93" width="16" height="5" />
            </svg>
            {al.puestos.map((p) => {
              const j = p.player_id ? porId.get(p.player_id) : undefined;
              return (
                <div key={p.clave} data-casilla={p.clave}
                  onPointerDown={editable ? (e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setArrastrando(p.clave); } : undefined}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 text-center ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, width: 76 }}>
                  <div className={`mx-auto w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${j ? 'bg-amber-300 border-gray-900 text-gray-900' : 'bg-gray-900/60 border-white/60 text-white/80'}`}>
                    {j ? (j.numero ?? '•') : p.clave}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight font-semibold text-white drop-shadow">{j ? nombreCorto(j.nombre) : nombrePuesto(p.clave, al.formacion)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Jugador y porqué por puesto ── */}
        <div className="space-y-2">
          {(editable ? al.puestos : asignados).map((p) => (
            <div key={p.clave} className="bg-gray-800 rounded-lg p-3" data-fila-puesto={p.clave}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300 w-44 shrink-0">{nombrePuesto(p.clave, al.formacion)}</span>
                {editable ? (
                  <select value={p.player_id || ''} onChange={(e) => setPuesto(p.clave, { player_id: e.target.value || null })}
                    className="flex-1 min-w-[180px] bg-gray-700 text-white rounded-md px-2 py-1.5 text-sm">
                    <option value="">— Sin jugador —</option>
                    {p.player_id && !elegibles.some((x) => x.id === p.player_id) && <option value={p.player_id}>{etiquetaJugador(p.player_id) || 'Jugador'} (inactivo)</option>}
                    {elegibles.map((x) => (
                      <option key={x.id} value={x.id} disabled={usados.has(x.id) && x.id !== p.player_id}>
                        {x.numero != null ? `#${x.numero} ` : ''}{x.nombre}{usados.has(x.id) && x.id !== p.player_id ? ' (ya está en otro puesto)' : ''}
                      </option>
                    ))}
                  </select>
                ) : <span className="text-sm font-semibold text-white">{etiquetaJugador(p.player_id)}</span>}
              </div>
              {editable ? (
                <div className="flex gap-2 mt-2">
                  <input value={p.motivo} onChange={(e) => setPuesto(p.clave, { motivo: e.target.value })} placeholder="¿Por qué? (opcional)"
                    className="flex-1 bg-gray-900 text-white rounded-md px-2 py-1.5 text-sm placeholder-gray-500" />
                  <button type="button" onClick={() => mejorar(p.clave)} disabled={!p.motivo.trim() || mejorando !== null}
                    className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-md px-2">{mejorando === p.clave ? '…' : '✨ Mejorar'}</button>
                </div>
              ) : p.motivo ? <p className="text-sm text-gray-300 mt-1">{p.motivo}</p> : null}
            </div>
          ))}

          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300 mb-2">Nota general</p>
            {editable ? (
              <div className="flex gap-2">
                <textarea rows={2} value={al.nota} onChange={(e) => setAl((a) => ({ ...a, nota: e.target.value }))} placeholder="Opcional — por ejemplo, un ajuste para el segundo tiempo."
                  className="flex-1 bg-gray-900 text-white rounded-md px-2 py-1.5 text-sm placeholder-gray-500" />
                <button type="button" onClick={() => mejorar('nota')} disabled={!al.nota.trim() || mejorando !== null}
                  className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-md px-2">{mejorando === 'nota' ? '…' : '✨ Mejorar'}</button>
              </div>
            ) : <p className="text-sm text-gray-300">{al.nota || <span className="text-gray-500 italic">Sin nota.</span>}</p>}
          </div>

          {editable && (
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <button type="button" onClick={guardar} disabled={guardando || !hayCambios}
                className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-5 rounded-md text-sm">
                {guardando ? 'Guardando…' : 'Guardar alineación'}
              </button>
              {hayCambios && <span className="text-xs text-amber-400">Hay cambios sin guardar.</span>}
            </div>
          )}
          {msg && <div className={`p-3 rounded-md text-sm ${msg.ok ? 'bg-green-900/40 text-green-200' : 'bg-red-900 text-red-200'}`}>{msg.texto}</div>}
        </div>
      </div>
    </div>
  );
};

export default AlineacionSugeridaEditor;
