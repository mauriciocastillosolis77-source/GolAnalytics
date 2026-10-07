import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { supabase } from './supabaseClient';

// ─── Constantes ───────────────────────────────────────────────────────────────

const RAILWAY_URL = 'https://golanalytics-api-production.up.railway.app';
const POLLING_INTERVAL_MS = 3000;
const MAX_POLLING_ATTEMPTS = 400; // 20 minutos máximo

// El tracking se hace POR JUGADA (un tramo corto), no por video completo:
// solo así se puede mandar a resolución completa, que es lo que YOLO necesita
// para ver a los jugadores lejanos en una toma de cancha completa.
export const MAX_PLAY_SECONDS = 15;
// Cuadros por segundo que se mandan a analizar. A 2 por segundo el seguimiento
// perdía a los jugadores; a 10 se mantiene mucho mejor.
export const TRACKING_FPS = 10;
// Ancho máximo que se manda. El panorámico de 2 celulares mide ~3280 px.
const MAX_ENCODE_WIDTH = 3840;
const SUPABASE_PAGE_SIZE = 1000; // límite por defecto de filas por consulta en Supabase

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TrackingPlayer {
  track_id: number;
  x: number;        // esquina superior izquierda, normalizado 0-1
  y: number;        // esquina superior izquierda, normalizado 0-1
  width: number;    // normalizado 0-1
  height: number;   // normalizado 0-1
  confidence: number;
}

export interface TrackingFrame {
  frame_number: number;
  second_in_video: number;
  players: TrackingPlayer[];
}

export interface TrackingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_frames: number | null;
  processed_frames: number;
  error_message: string | null;
}

export type ProgressCallback = (phase: string, percent: number) => void;

// ─── Codificación de la jugada con WebCodecs + mp4-muxer ─────────────────────
//
// Estrategia:
//   1. Leer metadata del video (duración, dimensiones) con <video>
//   2. Extraer SOLO los cuadros del tramo [startSecond, endSecond] a 10 fps,
//      a la resolución original del video (antes: todo el video, a 640 px y 2 fps)
//   3. Encodear cada cuadro con VideoEncoder (H.264 / avc1)
//   4. Empaquetar en MP4 válido con mp4-muxer (ArrayBufferTarget)
//
// No requiere SharedArrayBuffer, COEP ni COOP.
// Compatible con Edge 94+ y Chrome 94+.

export async function compressVideo(
  videoFile: File,
  startSecond: number,
  endSecond: number,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress('Preparando la jugada...', 0);

  const videoURL = URL.createObjectURL(videoFile);

  try {
    return await encodeToMp4(videoURL, startSecond, endSecond, onProgress);
  } finally {
    URL.revokeObjectURL(videoURL);
  }
}

// Un intento de codificación: tamaño de salida + códec.
interface EncodeAttempt {
  config: VideoEncoderConfig;
  muxerCodec: 'avc' | 'vp9';
}

// Códecs H.264 a probar según el tamaño del cuadro. El nivel 3.1 (el que se
// usaba antes) solo admite hasta 1280x720; un panorámico de 3280x1048 necesita
// nivel 5.x. Se prueban varios perfiles porque cada navegador/equipo soporta
// combinaciones distintas.
function h264Candidates(width: number, height: number): string[] {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  if (macroblocks <= 3600) return ['avc1.42001f', 'avc1.4d001f', 'avc1.64001f'];        // ≤ 1280x720
  if (macroblocks <= 8704) return ['avc1.42002a', 'avc1.4d002a', 'avc1.64002a'];        // ≤ ~2048x1088
  return ['avc1.640033', 'avc1.4d0033', 'avc1.420033', 'avc1.640034', 'avc1.420034'];   // hasta 4096x2304
}

// Lista ordenada de intentos que ESTE equipo dice soportar. Lo más importante
// es no perder resolución (de eso depende que YOLO vea a los jugadores lejanos),
// así que el orden es: resolución completa en H.264, resolución completa en VP9,
// y solo después tamaños más chicos.
async function listEncodeAttempts(
  videoWidth: number,
  videoHeight: number
): Promise<EncodeAttempt[]> {
  const widths = [Math.min(MAX_ENCODE_WIDTH, videoWidth), 2560, 1920, 1280]
    .filter((w, i, arr) => w <= videoWidth && arr.indexOf(w) === i);

  const attempts: EncodeAttempt[] = [];

  for (const targetWidth of widths) {
    const scale = targetWidth / videoWidth;
    const outWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
    const outHeightRaw = Math.round(videoHeight * scale);
    const outHeight = outHeightRaw % 2 === 0 ? outHeightRaw : outHeightRaw - 1;
    // ~0.25 bits por pixel: suficiente para que YOLO vea bien a los jugadores lejanos
    const bitrate = Math.round(Math.min(16_000_000, Math.max(1_000_000, outWidth * outHeight * TRACKING_FPS * 0.25)));

    const candidates: { codec: string; muxerCodec: 'avc' | 'vp9' }[] = [
      ...h264Candidates(outWidth, outHeight).map(codec => ({ codec, muxerCodec: 'avc' as const })),
      { codec: 'vp09.00.51.08', muxerCodec: 'vp9' as const },
    ];

    let h264Added = false;
    for (const { codec, muxerCodec } of candidates) {
      if (muxerCodec === 'avc' && h264Added) continue; // un solo H.264 por tamaño
      const config: VideoEncoderConfig = {
        codec,
        width: outWidth,
        height: outHeight,
        bitrate,
        framerate: TRACKING_FPS,
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) {
          attempts.push({ config, muxerCodec });
          if (muxerCodec === 'avc') h264Added = true;
        }
      } catch { /* probar el siguiente */ }
    }
  }

  return attempts;
}

async function encodeToMp4(
  videoURL: string,
  startSecond: number,
  endSecond: number,
  onProgress: ProgressCallback
): Promise<Blob> {
  // ── Paso 1: Metadata ──────────────────────────────────────────────────────
  const { videoWidth, videoHeight, duration } = await getVideoMetadata(videoURL);

  const start = Math.max(0, Math.min(startSecond, duration));
  const end = Math.max(start, Math.min(endSecond, duration));
  const playDuration = end - start;
  if (playDuration < 0.5) throw new Error('La jugada marcada es demasiado corta.');
  if (playDuration > MAX_PLAY_SECONDS + 0.5) {
    throw new Error(`La jugada no puede durar más de ${MAX_PLAY_SECONDS} segundos.`);
  }

  if (typeof VideoEncoder === 'undefined') {
    throw new Error('Tu navegador no soporta WebCodecs. Usa Edge o Chrome versión 94 o superior.');
  }

  onProgress('Iniciando codificador...', 2);

  // ── Paso 2: Elegir códec y tamaño que este equipo sí soporte ──────────────
  const attempts = await listEncodeAttempts(videoWidth, videoHeight);
  if (!attempts.length) {
    throw new Error('Tu navegador no pudo codificar el video para el tracking. Usa Edge o Chrome actualizado.');
  }

  // ── Paso 3: Cargar el video una sola vez ──────────────────────────────────
  const videoEl = document.createElement('video');
  videoEl.src = videoURL;
  videoEl.muted = true;
  videoEl.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    videoEl.onloadeddata = () => resolve();
    videoEl.onerror = () => reject(new Error('No se pudo cargar el video para compresión.'));
    videoEl.load();
  });

  // ── Paso 4: Codificar. Si un intento falla a media codificación (pasa con
  // algunos codificadores por hardware en cuadros muy grandes), se prueba el
  // siguiente de la lista en vez de dejar al usuario sin tracking.
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const blob = await encodeAttempt(videoEl, attempt, start, playDuration, duration, onProgress);
      console.info(`[tracking] Jugada codificada: ${attempt.config.width}x${attempt.config.height}, ${attempt.config.codec}, ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      onProgress(`Jugada lista para enviar (${attempt.config.width}×${attempt.config.height})`, 100);
      return blob;
    } catch (err) {
      lastError = err;
      console.warn(`[tracking] Falló la codificación con ${attempt.config.codec} a ${attempt.config.width}x${attempt.config.height}; se prueba la siguiente opción.`, err);
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('No se pudo codificar la jugada.'));
}

async function encodeAttempt(
  videoEl: HTMLVideoElement,
  attempt: EncodeAttempt,
  start: number,
  playDuration: number,
  videoDuration: number,
  onProgress: ProgressCallback
): Promise<Blob> {
  const outWidth = attempt.config.width;
  const outHeight = attempt.config.height;
  const FPS = TRACKING_FPS;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: attempt.muxerCodec,
      width: outWidth,
      height: outHeight,
    },
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => { encodeError = err; },
  });
  encoder.configure(attempt.config);

  try {
    const totalFrames = Math.max(1, Math.floor(playDuration * FPS) + 1);

    const canvas = new OffscreenCanvas(outWidth, outHeight);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    for (let i = 0; i < totalFrames; i++) {
      if (encodeError) throw encodeError;

      // Tiempo dentro del clip (0, 0.1, 0.2…) y su posición real en el video original
      const clipSeconds = i / FPS;
      const target = Math.min(start + clipSeconds, Math.max(0, videoDuration - 0.01));

      // Si el video ya está exactamente en ese cuadro no hay nada que esperar
      // (algunos navegadores no avisan "seeked" cuando el tiempo no cambia).
      if (!(Math.abs(videoEl.currentTime - target) < 0.001 && videoEl.readyState >= 2 && !videoEl.seeking)) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { videoEl.onseeked = null; reject(new Error('El video tardó demasiado en avanzar al cuadro pedido.')); }, 20000);
          videoEl.onseeked = () => { clearTimeout(timer); videoEl.onseeked = null; resolve(); };
          videoEl.currentTime = target;
        });
      }

      ctx.drawImage(videoEl, 0, 0, outWidth, outHeight);

      const timestampUs = Math.round(clipSeconds * 1_000_000); // microsegundos
      const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: Math.round(1_000_000 / FPS) });

      // Keyframe cada 2 segundos (requerimiento del muxer WebM/MP4)
      const isKeyFrame = i % (FPS * 2) === 0;
      encoder.encode(frame, { keyFrame: isKeyFrame });
      frame.close();

      // No dejar que se acumulen cuadros grandes sin codificar en memoria
      while (encoder.encodeQueueSize > 4) {
        await new Promise<void>(r => setTimeout(r, 10));
        if (encodeError) throw encodeError;
      }

      const percent = 5 + Math.round((i / totalFrames) * 80);
      onProgress(`Preparando la jugada... ${i + 1}/${totalFrames} cuadros`, percent);
    }

    onProgress('Finalizando archivo...', 87);
    await encoder.flush();
    if (encodeError) throw encodeError;

    muxer.finalize();
    const { buffer } = muxer.target;
    return new Blob([buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

// ── Helper: leer metadata de video ───────────────────────────────────────────

function getVideoMetadata(
  url: string
): Promise<{ videoWidth: number; videoHeight: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ videoWidth: v.videoWidth, videoHeight: v.videoHeight, duration: v.duration });
    };
    v.onerror = () => reject(new Error('No se pudo leer la metadata del video.'));
  });
}

// ─── Verificar que el servicio de Railway esté actualizado ───────────────────
//
// La versión anterior del servicio analizaba a 640 px e ignoraba el segundo de
// inicio de la jugada: las posiciones quedarían desfasadas respecto al video.
// La versión nueva reporta "max_imgsz" en /health; si no lo trae, no se sigue.

export async function checkTrackingService(): Promise<void> {
  let info: any = null;
  try {
    const response = await fetch(`${RAILWAY_URL}/health`);
    if (response.ok) info = await response.json();
  } catch { /* se reporta abajo */ }

  if (!info) {
    throw new Error('No se pudo conectar con el servicio de tracking (Railway). Revisa que esté encendido e intenta de nuevo.');
  }
  if (info.max_imgsz === undefined) {
    throw new Error('El servicio de tracking en Railway todavía tiene la versión anterior. Hay que subir el main.py nuevo antes de usar el tracking por jugada.');
  }
}

// ─── Crear job en Supabase ────────────────────────────────────────────────────

export async function createTrackingJob(params: {
  videoId: string;
  matchId: string;
  teamId: string;
  createdBy: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('tracking_jobs')
    .insert({
      video_id: params.videoId,
      match_id: params.matchId,
      team_id: params.teamId,
      created_by: params.createdBy,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Error creando job: ${error.message}`);
  return data.id;
}

// ─── Upload a Railway ─────────────────────────────────────────────────────────

export async function uploadToRailway(params: {
  videoBlob: Blob;
  jobId: string;
  videoId: string;
  matchId: string;
  teamId: string;
  startSecond: number;   // segundo del video original donde empieza la jugada
  onProgress: ProgressCallback;
}): Promise<void> {
  const { videoBlob, jobId, videoId, matchId, teamId, startSecond, onProgress } = params;

  onProgress('Subiendo la jugada a Railway...', 0);

  const formData = new FormData();
  formData.append('file', videoBlob, 'video.mp4');
  formData.append('job_id', jobId);
  formData.append('video_id', videoId);
  formData.append('match_id', matchId);
  formData.append('team_id', teamId);
  formData.append('start_second', String(startSecond));

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(`Subiendo la jugada a Railway... ${percent}%`, percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Railway respondió con status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Error de red al subir a Railway'));
    xhr.ontimeout = () => reject(new Error('Timeout al subir a Railway'));

    xhr.timeout = 30 * 60 * 1000; // 30 minutos máximo
    xhr.open('POST', `${RAILWAY_URL}/process-video`);
    xhr.send(formData);
  });
}

// ─── Polling de progreso ──────────────────────────────────────────────────────

export async function pollJobStatus(
  jobId: string,
  onProgress: ProgressCallback
): Promise<void> {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      attempts++;

      if (attempts > MAX_POLLING_ATTEMPTS) {
        clearInterval(interval);
        reject(new Error('Timeout: el procesamiento tardó demasiado'));
        return;
      }

      try {
        const response = await fetch(`${RAILWAY_URL}/job-status/${jobId}`);
        if (!response.ok) throw new Error(`Status ${response.status}`);

        const job: TrackingJob = await response.json();

        if (job.status === 'completed') {
          clearInterval(interval);
          onProgress('Procesamiento completado', 100);
          resolve();
          return;
        }

        if (job.status === 'failed') {
          clearInterval(interval);
          reject(new Error(job.error_message || 'El procesamiento falló en Railway'));
          return;
        }

        if (job.status === 'processing' && job.total_frames && job.total_frames > 0) {
          const percent = Math.round((job.processed_frames / job.total_frames) * 100);
          onProgress(
            `Analizando con YOLO... ${job.processed_frames}/${job.total_frames} cuadros`,
            percent
          );
        } else if (job.status === 'pending') {
          onProgress('En espera de turno en Railway...', 0);
        } else {
          onProgress('Iniciando análisis YOLO...', 0);
        }
      } catch (err) {
        console.warn('Error en polling (reintentando):', err);
      }
    }, POLLING_INTERVAL_MS);
  });
}

// ─── Leer frames de Supabase ──────────────────────────────────────────────────
//
// Supabase devuelve como máximo 1,000 filas por consulta. Se lee por páginas
// para no quedarse solo con el principio del tracking.

export async function fetchTrackingFrames(
  jobId: string,
  secondStart?: number,
  secondEnd?: number
): Promise<TrackingFrame[]> {
  const all: TrackingFrame[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    let query = supabase
      .from('player_tracking')
      .select('frame_number, second_in_video, players')
      .eq('job_id', jobId)
      .order('second_in_video', { ascending: true })
      .order('frame_number', { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (secondStart !== undefined) query = query.gte('second_in_video', secondStart);
    if (secondEnd !== undefined) query = query.lte('second_in_video', secondEnd);

    const { data, error } = await query;
    if (error) throw new Error(`Error leyendo tracking: ${error.message}`);

    const rows = (data || []) as TrackingFrame[];
    all.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) break;
  }

  return all;
}

// ─── Jugadas ya procesadas de un video ────────────────────────────────────────
//
// Cada jugada procesada es un job. Para no volver a esperar el análisis de una
// jugada que ya se procesó, se listan los jobs terminados del video junto con el
// tramo que cubren. Los trackings antiguos (video completo a 2 cuadros por
// segundo y 640 px) se descartan: no sirven para marcar jugadores.

export interface ProcessedPlay {
  jobId: string;
  startSecond: number;
  endSecond: number;
}

export async function listProcessedPlays(videoId: string): Promise<ProcessedPlay[]> {
  const { data: jobs, error } = await supabase
    .from('tracking_jobs')
    .select('id, total_frames, created_at')
    .eq('video_id', videoId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error || !jobs) return [];

  const plays: ProcessedPlay[] = [];

  for (const job of jobs as { id: string; total_frames: number | null }[]) {
    const edge = async (ascending: boolean): Promise<number | null> => {
      const { data } = await supabase
        .from('player_tracking')
        .select('second_in_video')
        .eq('job_id', job.id)
        .order('second_in_video', { ascending })
        .limit(1);
      return data && data.length ? Number(data[0].second_in_video) : null;
    };

    const first = await edge(true);
    const last = await edge(false);
    if (first === null || last === null || last <= first) continue;

    const seconds = last - first;
    const framesPerSecond = (job.total_frames ?? 0) / seconds;
    // Solo jugadas cortas analizadas con suficientes cuadros por segundo
    if (seconds > MAX_PLAY_SECONDS + 1 || framesPerSecond < 5) continue;

    plays.push({ jobId: job.id, startSecond: first, endSecond: last });
  }

  return plays.sort((a, b) => a.startSecond - b.startSecond);
}

// ─── Interpolación de posición entre frames ───────────────────────────────────

export interface InterpolatedPlayer {
  track_id: number;
  cx: number;   // centro X normalizado 0-1
  cy: number;   // centro Y normalizado 0-1
  width: number;
  height: number;
}

export function interpolatePlayers(
  frames: TrackingFrame[],
  currentSecond: number
): InterpolatedPlayer[] {
  if (!frames.length) return [];

  let prevFrame: TrackingFrame | null = null;
  let nextFrame: TrackingFrame | null = null;

  for (let i = 0; i < frames.length; i++) {
    if (frames[i].second_in_video <= currentSecond) {
      prevFrame = frames[i];
    } else {
      nextFrame = frames[i];
      break;
    }
  }

  if (!prevFrame && !nextFrame) return [];
  if (!prevFrame) return playersFromFrame(nextFrame!);
  if (!nextFrame) return playersFromFrame(prevFrame);

  const range = nextFrame.second_in_video - prevFrame.second_in_video;
  const t = range > 0 ? (currentSecond - prevFrame.second_in_video) / range : 0;

  const result: InterpolatedPlayer[] = [];
  const nextMap = new Map(nextFrame.players.map(p => [p.track_id, p]));

  for (const prev of prevFrame.players) {
    const next = nextMap.get(prev.track_id);
    if (!next) {
      result.push({
        track_id: prev.track_id,
        cx: prev.x + prev.width / 2,
        cy: prev.y + prev.height / 2,
        width: prev.width,
        height: prev.height,
      });
      continue;
    }

    const prevCx = prev.x + prev.width / 2;
    const prevCy = prev.y + prev.height / 2;
    const nextCx = next.x + next.width / 2;
    const nextCy = next.y + next.height / 2;

    result.push({
      track_id: prev.track_id,
      cx: prevCx + (nextCx - prevCx) * t,
      cy: prevCy + (nextCy - prevCy) * t,
      width: prev.width + (next.width - prev.width) * t,
      height: prev.height + (next.height - prev.height) * t,
    });
  }

  return result;
}

function playersFromFrame(frame: TrackingFrame): InterpolatedPlayer[] {
  return frame.players.map(p => ({
    track_id: p.track_id,
    cx: p.x + p.width / 2,
    cy: p.y + p.height / 2,
    width: p.width,
    height: p.height,
  }));
}

