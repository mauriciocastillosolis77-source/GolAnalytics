import { supabase } from './supabaseClient';
import type { ModeloPilar, ModeloCalificacion, Semaforo } from '../utils/modeloJuego';

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de juego (mejora 3): lectura y guardado en Supabase.
// Tablas: modelo_pilares (pilares por equipo) y modelo_calificaciones
// (semáforo + nota por partido y pilar). Leer: usuarios autenticados.
// Escribir: solo admin (lo controla Supabase con RLS).
// ─────────────────────────────────────────────────────────────────────────────

// Pilares del equipo. Por defecto solo los activos (un pilar "quitado" se
// desactiva, no se borra, para no perder sus calificaciones pasadas).
export async function fetchPilares(teamId: string, incluirInactivos = false): Promise<ModeloPilar[]> {
    let q = supabase.from('modelo_pilares').select('*').eq('team_id', teamId).order('orden', { ascending: true });
    if (!incluirInactivos) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as ModeloPilar[];
}

export interface PilarEditable {
    id?: string;          // sin id = pilar nuevo
    nombre: string;
    fase: string;
    zona: string | null;
}

// Guarda el modelo completo del equipo: actualiza los que existen, crea los
// nuevos y desactiva los que se quitaron.
export async function guardarModelo(teamId: string, pilares: PilarEditable[], idsAnteriores: string[]): Promise<void> {
    const limpios = pilares.map((p, i) => ({ ...p, nombre: p.nombre.trim(), orden: i })).filter(p => p.nombre);
    const existentes = limpios.filter(p => p.id);
    const nuevos = limpios.filter(p => !p.id);

    for (const p of existentes) {
        const { error } = await supabase.from('modelo_pilares')
            .update({ nombre: p.nombre, fase: p.fase, zona: p.zona || null, orden: p.orden, activo: true })
            .eq('id', p.id as string);
        if (error) throw error;
    }
    if (nuevos.length > 0) {
        const { error } = await supabase.from('modelo_pilares').insert(
            nuevos.map(p => ({ team_id: teamId, nombre: p.nombre, fase: p.fase, zona: p.zona || null, orden: p.orden, activo: true }))
        );
        if (error) throw error;
    }
    const quedan = new Set(existentes.map(p => p.id));
    const quitados = idsAnteriores.filter(id => !quedan.has(id));
    if (quitados.length > 0) {
        const { error } = await supabase.from('modelo_pilares').update({ activo: false }).in('id', quitados);
        if (error) throw error;
    }
}

// Calificaciones de un partido.
export async function fetchCalificacionesPartido(matchId: string): Promise<ModeloCalificacion[]> {
    const { data, error } = await supabase.from('modelo_calificaciones').select('*').eq('match_id', matchId);
    if (error) throw error;
    return (data || []) as ModeloCalificacion[];
}

// Calificaciones de una lista de pilares (para el seguimiento mensual).
export async function fetchCalificacionesDePilares(pilarIds: string[]): Promise<ModeloCalificacion[]> {
    if (pilarIds.length === 0) return [];
    const { data, error } = await supabase.from('modelo_calificaciones').select('*').in('pilar_id', pilarIds);
    if (error) throw error;
    return (data || []) as ModeloCalificacion[];
}

export interface FilaCalificacion { pilar_id: string; semaforo: Semaforo; nota: string; }

// Guarda la calificación de un partido. Regla de siempre: un pilar SIN nota
// significa "no se revisó en este partido", así que no se guarda (y si antes
// estaba guardado, se borra).
export async function guardarCalificaciones(matchId: string, filas: FilaCalificacion[]): Promise<number> {
    const conNota = filas.filter(f => f.nota.trim());
    const sinNota = filas.filter(f => !f.nota.trim()).map(f => f.pilar_id);
    if (conNota.length > 0) {
        const { error } = await supabase.from('modelo_calificaciones').upsert(
            conNota.map(f => ({ match_id: matchId, pilar_id: f.pilar_id, semaforo: f.semaforo, nota: f.nota.trim(), updated_at: new Date().toISOString() })),
            { onConflict: 'match_id,pilar_id' }
        );
        if (error) throw error;
    }
    if (sinNota.length > 0) {
        const { error } = await supabase.from('modelo_calificaciones').delete().eq('match_id', matchId).in('pilar_id', sinNota);
        if (error) throw error;
    }
    return conNota.length;
}

// ── Lectura del mes con IA (Gemini, mismo patrón que el resto del repo) ──────
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
function getGeminiApiKey(): string {
    const env = (import.meta as any).env;
    const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('Falta la API key de Gemini (VITE_API_KEY).');
    return apiKey;
}

export interface DatoPilarMes {
    nombre: string;
    fase: string;
    zona: string | null;
    partidos: { rival: string; jornada: number | string; semaforo: Semaforo; nota: string }[];
    mesAnterior?: { verdes: number; calificados: number } | null;
}

export async function generarLecturaMes(p: { equipo: string; mes: string; pilares: DatoPilarMes[] }): Promise<string> {
    const detalle = p.pilares.map(pl => {
        const partidos = pl.partidos.length === 0
            ? '   (sin calificar este mes)'
            : pl.partidos.map(x => `   - J${x.jornada} vs ${x.rival}: ${x.semaforo.toUpperCase()} — ${x.nota}`).join('\n');
        const antes = pl.mesAnterior ? ` (mes anterior: ${pl.mesAnterior.verdes} de ${pl.mesAnterior.calificados} en verde)` : '';
        return `- ${pl.nombre} [fase: ${pl.fase}${pl.zona ? `, zona: ${pl.zona}` : ''}]${antes}\n${partidos}`;
    }).join('\n');

    const prompt = `Eres el analista táctico de un equipo de fútbol juvenil (${p.equipo}). El cuerpo técnico definió su modelo de juego como una lista de pilares, cada uno con su fase y a veces su zona del campo. En cada partido califican cada pilar con semáforo (VERDE = se cumplió, ÁMBAR = a medias, ROJO = no se cumplió) y una nota.

Mes: ${p.mes}
Calificaciones del mes por pilar:
${detalle}

Escribe la "Lectura del mes" comparando lo que el equipo quiere hacer (los pilares) contra lo que realmente pasó. Usa EXACTAMENTE este formato, tres líneas, en español, sin Markdown ni asteriscos:
Lo que se cumple: (1 a 2 oraciones)
Lo que no se cumple: (1 a 2 oraciones; si las notas repiten una causa, menciónala)
Para entrenar: (1 oración con un foco concreto de entrenamiento, ligado a la fase o zona del pilar)

Tono formativo y constructivo. Si hay mes anterior, menciona si un pilar mejoró o empeoró. No inventes datos que no estén arriba. Responde ÚNICAMENTE con las tres líneas.`;

    const response = await fetch(`${GEMINI_API_URL}?key=${getGeminiApiKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) {
        console.error('Gemini API error (lectura del mes):', await response.text());
        if (response.status === 429) throw new Error('Se agotó por ahora la cuota gratuita de Gemini. Intenta de nuevo en unos minutos.');
        throw new Error(`Error de Gemini: ${response.status}`);
    }
    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
}
