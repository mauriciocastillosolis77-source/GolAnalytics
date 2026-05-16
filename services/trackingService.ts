import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { supabase } from './supabaseClient';

// ─── Constantes ───────────────────────────────────────────────────────────────

const RAILWAY_URL = 'https://golanalytics-api-production.up.railway.app';
const POLLING_INTERVAL_MS = 3000;
const MAX_POLLING_ATTEMPTS = 300; // 15 minutos máximo

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

// ─── Compresión de video con WebCodecs + mp4-muxer ───────────────────────────
//
// Estrategia:
//   1. Leer metadata del video (duración, dimensiones) con <video>
//   2. Extraer frames a 2fps con Canvas + seeked events
//   3. Encodear cada frame con VideoEncoder (H.264 / avc1)
//   4. Empaquetar en MP4 válido con mp4-muxer (ArrayBufferTarget)
//
// No requiere SharedArrayBuffer, COEP ni COOP.
// Compatible con Edge 94+ y Chrome 94+.

export async function compressVideo(
  videoFile: File,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress('Preparando video...', 0);

  const videoURL = URL.createObjectURL(videoFile);

  try {
    return await encodeToMp4(videoURL, onProgress);
  } finally {
    URL.revokeObjectURL(videoURL);
  }
}

async function encodeToMp4(
  videoURL: string,
  onProgress: ProgressCallback
): Promise<Blob> {
  // ── Paso 1: Metadata ──────────────────────────────────────────────────────
  const { videoWidth, videoHeight, duration } = await getVideoMetadata(videoURL);

  // Dimensiones de salida: máx 640px ancho, pares (requerimiento H.264)
  const targetWidth = Math.min(640, videoWidth);
  const scale = targetWidth / videoWidth;
  const outWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  const outHeightRaw = Math.round(videoHeight * scale);
  const outHeight = outHeightRaw % 2 === 0 ? outHeightRaw : outHeightRaw - 1;

  onProgress('Iniciando codificador...', 2);

  // ── Paso 2: Configurar mp4-muxer ─────────────────────────────────────────
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: outWidth,
      height: outHeight,
    },
    fastStart: 'in-memory',
  });

  // ── Paso 3: Configurar VideoEncoder ──────────────────────────────────────
  const FPS = 2;
  const encoderConfig: VideoEncoderConfig = {
    codec: 'avc1.42001f',    // H.264 Baseline Profile — máxima compatibilidad
    width: outWidth,
    height: outHeight,
    bitrate: 500_000,         // 500 kbps — suficiente para YOLO
    framerate: FPS,
  };

  // Verificar soporte antes de continuar
  const support = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!support.supported) {
    throw new Error(
      'Tu navegador no soporta WebCodecs H.264. Usa Edge o Chrome versión 94 o superior.'
    );
  }

  let encodeError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => { encodeError = err; },
  });
  encoder.configure(encoderConfig);

  // ── Paso 4: Extraer y encodear frames ────────────────────────────────────
  const totalFrames = Math.max(1, Math.floor(duration * FPS));

  const canvas = new OffscreenCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const videoEl = document.createElement('video');
  videoEl.src = videoURL;
  videoEl.muted = true;
  videoEl.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    videoEl.oncanplaythrough = () => resolve();
    videoEl.onerror = () => reject(new Error('No se pudo cargar el video para compresión.'));
    videoEl.load();
  });

  onProgress('Comprimiendo frames...', 5);

  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) throw encodeError;

    const timeSeconds = i / FPS;
    videoEl.currentTime = timeSeconds;

    await new Promise<void>((resolve) => {
      videoEl.onseeked = () => { videoEl.onseeked = null; resolve(); };
    });

    ctx.drawImage(videoEl, 0, 0, outWidth, outHeight);

    const timestampUs = Math.round(timeSeconds * 1_000_000); // microsegundos
    const frame = new VideoFrame(canvas, { timestamp: timestampUs });

    // Keyframe cada 2 segundos (requerimiento del muxer WebM/MP4)
    const isKeyFrame = i % (FPS * 2) === 0;
    encoder.encode(frame, { keyFrame: isKeyFrame });
    frame.close();

    const percent = 5 + Math.round((i / totalFrames) * 80);
    onProgress(`Comprimiendo video... ${i + 1}/${totalFrames} frames`, percent);
  }

  // ── Paso 5: Finalizar encoder y muxer ────────────────────────────────────
  onProgress('Finalizando archivo...', 87);
  await encoder.flush();
  encoder.close();

  if (encodeError) throw encodeError;

  muxer.finalize();

  const { buffer } = muxer.target;
  onProgress('Compresión completada', 100);

  return new Blob([buffer], { type: 'video/mp4' });
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
  onProgress: ProgressCallback;
}): Promise<void> {
  const { videoBlob, jobId, videoId, matchId, teamId, onProgress } = params;

  onProgress('Subiendo video a Railway...', 0);

  const formData = new FormData();
  formData.append('file', videoBlob, 'video.mp4');
  formData.append('job_id', jobId);
  formData.append('video_id', videoId);
  formData.append('match_id', matchId);
  formData.append('team_id', teamId);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(`Subiendo video a Railway... ${percent}%`, percent);
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
            `Analizando con YOLO... ${job.processed_frames}/${job.total_frames} frames`,
            percent
          );
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

export async function fetchTrackingFrames(
  jobId: string,
  secondStart?: number,
  secondEnd?: number
): Promise<TrackingFrame[]> {
  let query = supabase
    .from('player_tracking')
    .select('frame_number, second_in_video, players')
    .eq('job_id', jobId)
    .order('second_in_video', { ascending: true });

  if (secondStart !== undefined) query = query.gte('second_in_video', secondStart);
  if (secondEnd !== undefined) query = query.lte('second_in_video', secondEnd);

  const { data, error } = await query;
  if (error) throw new Error(`Error leyendo tracking: ${error.message}`);

  return (data || []) as TrackingFrame[];
}

// ─── Buscar job existente por video_id ───────────────────────────────────────

export async function findCompletedJob(videoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('tracking_jobs')
    .select('id')
    .eq('video_id', videoId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.id;
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

