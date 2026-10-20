import { supabase } from './supabaseClient';
import type { Match } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Análisis Post Partido DT: biblioteca de reportes en PDF que el admin publica
// para el cuerpo técnico (usuarios auxiliares) de cada equipo.
//
//  · Tabla `reportes_dt`: un PDF por partido (match_id es la llave).
//  · Archivo en Storage, carpeta privada `reportes-dt`, ruta `<team_id>/<match_id>.pdf`.
//  · Supabase (RLS) se encarga de que un auxiliar solo lea los de SU equipo;
//    solo el admin puede publicar, reemplazar o quitar.
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = 'reportes-dt';
/** Tamaño máximo del PDF (el plan gratuito de Supabase acepta hasta 50 MB por archivo). */
export const TAMANO_MAXIMO_MB = 25;

export interface ReporteDT {
  match_id: string;
  team_id: string;
  archivo: string;
  nombre_archivo: string | null;
  tamano: number | null;
  publicado_por?: string | null;
  updated_at: string;
}
export type ReporteDTConPartido = ReporteDT & { partido: Match | null };

function traducirError(error: any, accion: string): Error {
  const msg = String(error?.message || error || '');
  if (/reportes_dt|reportes-dt|bucket/i.test(msg) && /(does not exist|not found|schema cache|not find)/i.test(msg)) {
    return new Error('Falta crear la tabla o la carpeta de Análisis Post Partido DT en Supabase. Corre el SQL de esta entrega y vuelve a intentar.');
  }
  if (/row-level security|permission|not authorized|unauthorized|403/i.test(msg)) {
    return new Error(`No se pudo ${accion}: Supabase no dio permiso. Revisa que el SQL de esta entrega se haya corrido completo.`);
  }
  return new Error(`No se pudo ${accion}. ${msg}`);
}

/** Reportes publicados de un equipo (o de todos, si no se manda equipo — solo el admin los ve todos). */
export async function listarReportesDT(teamId?: string | null): Promise<ReporteDTConPartido[]> {
  let q = supabase.from('reportes_dt').select('*');
  if (teamId) q = q.eq('team_id', teamId);
  const { data, error } = await q;
  if (error) throw traducirError(error, 'cargar los reportes');
  const filas = (data || []) as ReporteDT[];
  if (filas.length === 0) return [];
  const { data: partidos } = await supabase.from('matches').select('*').in('id', filas.map((f) => f.match_id));
  const porId = new Map<string, Match>(((partidos || []) as Match[]).map((m) => [m.id, m]));
  return filas
    .map((f) => ({ ...f, partido: porId.get(f.match_id) || null }))
    .sort((a, b) => String(b.partido?.fecha || '').localeCompare(String(a.partido?.fecha || '')) || b.updated_at.localeCompare(a.updated_at));
}

/** Sube (o reemplaza) el PDF de un partido y lo deja visible para el DT de ese equipo. */
export async function publicarReporteDT(match: Match, archivo: File): Promise<void> {
  if (!match.team_id) throw new Error('Este partido no tiene equipo asignado: no se puede publicar para un DT.');
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
  if (!esPdf) throw new Error('El archivo debe ser un PDF. Exporta el reporte desde PowerPoint con "Guardar como PDF".');
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) throw new Error(`El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${TAMANO_MAXIMO_MB} MB.`);

  const ruta = `${match.team_id}/${match.id}.pdf`;
  const subida = await supabase.storage.from(BUCKET).upload(ruta, archivo, { upsert: true, contentType: 'application/pdf' });
  if (subida.error) throw traducirError(subida.error, 'subir el PDF');

  const { data: sesion } = await supabase.auth.getUser();
  const { error } = await supabase.from('reportes_dt').upsert({
    match_id: match.id,
    team_id: match.team_id,
    archivo: ruta,
    nombre_archivo: archivo.name,
    tamano: archivo.size,
    publicado_por: sesion?.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'match_id' });
  if (error) throw traducirError(error, 'guardar el reporte publicado');
}

/** Quita el reporte: el DT deja de verlo y se borra el PDF de Storage. */
export async function quitarReporteDT(reporte: ReporteDT): Promise<void> {
  const { error } = await supabase.from('reportes_dt').delete().eq('match_id', reporte.match_id);
  if (error) throw traducirError(error, 'quitar el reporte');
  const borrado = await supabase.storage.from(BUCKET).remove([reporte.archivo]);
  if (borrado.error) console.warn('El reporte se quitó, pero el PDF no se pudo borrar de Storage:', borrado.error.message);
}

/** Dirección temporal (10 minutos) para ver o descargar el PDF. */
export async function urlReporteDT(reporte: ReporteDT, descargarComo?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(reporte.archivo, 600, descargarComo ? { download: descargarComo } : undefined);
  if (error || !data?.signedUrl) throw traducirError(error || 'sin dirección', 'abrir el PDF');
  return data.signedUrl;
}

/** Nombre con el que se descarga: "Analisis_Post_Partido_ML7_J4_vs_Pumas.pdf". */
export function nombreDescarga(r: ReporteDTConPartido): string {
  const p = r.partido;
  const base = p ? `Analisis_Post_Partido_${p.nombre_equipo}_J${p.jornada}_vs_${p.rival}` : (r.nombre_archivo || 'Analisis_Post_Partido').replace(/\.pdf$/i, '');
  return `${base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_')}.pdf`;
}

/** Fecha del partido sin el desfase de zona horaria ("2026-10-03" → 3 de octubre, no 2). */
export function fechaPartido(fecha: string | null | undefined): string {
  if (!fecha) return '';
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return String(fecha);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Fecha en que se publicó (es un momento exacto: se muestra en la hora local). */
export function fechaPublicado(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
