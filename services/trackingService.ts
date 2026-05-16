import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
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

// ─── FFmpeg singleton ─────────────────────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  ffmpegInstance = new FFmpeg();

  // Cargar FFmpeg desde CDN (evita problemas de bundling con Vite)
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegLoaded = true;
  return ffmpegInstance;
}

// ─── Compresión de video ──────────────────────────────────────────────────────

export async function compressVideo(
  videoFile: File,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress('Iniciando compresor...', 0);

  const ffmpeg = await getFFmpeg();

  ffmpeg.on('progress', ({ progress }) => {
    const percent = Math.round(progress * 100);
    onProgress(`Comprimiendo video... ${percent}%`, percent);
  });

  // Escribir archivo de entrada en el sistema de archivos virtual de FFmpeg
  await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

  // Comprimir: 640px ancho, H.264, 500kbps video, sin audio
  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-vf', 'scale=640:-2',          // 640px ancho, alto proporcional
    '-c:v', 'libx264',              // codec H.264
    '-b:v', '500k',                 // 500 kbps video
    '-preset', 'fast',              // balance velocidad/calidad
    '-an',                          // sin audio (no necesario para YOLO)
    '-movflags', '+faststart',      // optimizado para streaming
    'output.mp4'
  ]);

  // Leer resultado
  const data = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([data], { type: 'video/mp4' });

  // Limpiar archivos temporales
  await ffmpeg.deleteFile('input.mp4');
  await ffmpeg.deleteFile('output.mp4');

  onProgress('Compresión completada', 100);
  return blob;
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

  // XMLHttpRequest para poder reportar progreso de upload
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

        // En progreso: calcular porcentaje
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
        // No cancelar por errores transitorios de red — seguir intentando
        console.warn('Error en polling (reintentando):', err);
      }
    }, POLLING_INTERVAL_MS);
  });
}

// ─── Leer frames de Supabase ──────────────────────────────────────────────────

export async function fetchTrackingFrames(
  jobId: string,
  secondStart?: number,   // opcional: filtrar desde este segundo
  secondEnd?: number      // opcional: filtrar hasta este segundo
): Promise<TrackingFrame[]> {
  let query = supabase
    .from('player_tracking')
    .select('frame_number, second_in_video, players')
    .eq('job_id', jobId)
    .order('second_in_video', { ascending: true });

  if (secondStart !== undefined) {
    query = query.gte('second_in_video', secondStart);
  }
  if (secondEnd !== undefined) {
    query = query.lte('second_in_video', secondEnd);
  }

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
// Dado el segundo actual del video, encuentra los dos frames más cercanos
// y calcula la posición interpolada de cada jugador.

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

  // Encontrar frame anterior y siguiente
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

  // Si solo tenemos un lado, usar ese frame directamente
  if (!prevFrame && !nextFrame) return [];
  if (!prevFrame) return playersFromFrame(nextFrame!);
  if (!nextFrame) return playersFromFrame(prevFrame);

  // Calcular factor de interpolación (0 = prevFrame, 1 = nextFrame)
  const range = nextFrame.second_in_video - prevFrame.second_in_video;
  const t = range > 0 ? (currentSecond - prevFrame.second_in_video) / range : 0;

  // Interpolar jugadores que aparecen en ambos frames por track_id
  const result: InterpolatedPlayer[] = [];
  const nextMap = new Map(nextFrame.players.map(p => [p.track_id, p]));

  for (const prev of prevFrame.players) {
    const next = nextMap.get(prev.track_id);
    if (!next) {
      // Jugador solo en prevFrame: mostrar sin interpolar
      result.push({
        track_id: prev.track_id,
        cx: prev.x + prev.width / 2,
        cy: prev.y + prev.height / 2,
        width: prev.width,
        height: prev.height,
      });
      continue;
    }

    // Interpolar posición
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
