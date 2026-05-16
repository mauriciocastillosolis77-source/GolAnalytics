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

// ─── Compresión de video con WebCodecs ───────────────────────────────────────
//
// Estrategia:
//   1. Cargar el archivo en un <video> temporal
//   2. Usar VideoDecoder + VideoEncoder (WebCodecs) para recodificar
//      a 640px de ancho, VP9, ~500kbps, sin audio
//   3. Empaquetar los chunks en un WebM usando una implementación mínima
//
// WebCodecs está disponible en Edge 94+ y Chrome 94+ (sin headers especiales).
// No requiere SharedArrayBuffer ni COEP/COOP.

export async function compressVideo(
  videoFile: File,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress('Preparando video...', 0);

  // Crear URL temporal para el archivo
  const videoURL = URL.createObjectURL(videoFile);

  try {
    const result = await encodeWithWebCodecs(videoURL, videoFile, onProgress);
    return result;
  } finally {
    URL.revokeObjectURL(videoURL);
  }
}

async function encodeWithWebCodecs(
  videoURL: string,
  videoFile: File,
  onProgress: ProgressCallback
): Promise<Blob> {
  // ── Paso 1: Leer metadata del video con un elemento <video> ──────────────
  const { videoWidth, videoHeight, duration } = await getVideoMetadata(videoURL);

  // Calcular dimensiones de salida (máx 640px de ancho)
  const targetWidth = Math.min(640, videoWidth);
  const scale = targetWidth / videoWidth;
  // WebCodecs requiere dimensiones pares
  const outWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
  const outHeight = Math.round(videoHeight * scale);
  const outHeightEven = outHeight % 2 === 0 ? outHeight : outHeight - 1;

  onProgress('Iniciando codificador...', 2);

  // ── Paso 2: Capturar frames con Canvas a 2fps (igual que YOLO en Railway) ─
  // Esto evita necesitar VideoDecoder (que requiere demuxer separado).
  // Para videos de fútbol amateur, 2fps es suficiente para tracking.
  // El video comprimido resultante tendrá 2fps → mucho menor tamaño.
  const FPS = 2;
  const totalFrames = Math.floor(duration * FPS);

  const chunks: EncodedVideoChunk[] = [];
  const encoderConfig: VideoEncoderConfig = {
    codec: 'vp09.00.10.08',   // VP9 Profile 0
    width: outWidth,
    height: outHeightEven,
    bitrate: 500_000,          // 500 kbps — suficiente para YOLO
    framerate: FPS,
  };

  // Verificar soporte
  const support = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!support.supported) {
    throw new Error('WebCodecs VP9 no soportado en este navegador. Usa Edge o Chrome 94+.');
  }

  const encoder = new VideoEncoder({
    output: (chunk) => chunks.push(chunk),
    error: (err) => { throw err; },
  });
  encoder.configure(encoderConfig);

  // Canvas para extraer frames
  const canvas = new OffscreenCanvas(outWidth, outHeightEven);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

  const videoEl = document.createElement('video');
  videoEl.src = videoURL;
  videoEl.muted = true;
  videoEl.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    videoEl.oncanplaythrough = () => resolve();
    videoEl.onerror = () => reject(new Error('Error cargando video para compresión'));
    videoEl.load();
  });

  onProgress('Comprimiendo frames...', 5);

  for (let i = 0; i < totalFrames; i++) {
    const timeSeconds = i / FPS;
    videoEl.currentTime = timeSeconds;

    // Esperar a que el video salte al frame correcto
    await new Promise<void>((resolve) => {
      videoEl.onseeked = () => resolve();
    });

    ctx.drawImage(videoEl, 0, 0, outWidth, outHeightEven);

    const frameTimestampUs = Math.round(timeSeconds * 1_000_000); // microsegundos
    const videoFrame = new VideoFrame(canvas, { timestamp: frameTimestampUs });

    const isKeyFrame = i % (FPS * 2) === 0; // keyframe cada 2 segundos
    encoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    const percent = 5 + Math.round((i / totalFrames) * 80);
    onProgress(`Comprimiendo video... ${i + 1}/${totalFrames} frames`, percent);
  }

  // Vaciar el encoder
  await encoder.flush();
  encoder.close();

  onProgress('Empaquetando archivo...', 87);

  // ── Paso 3: Empaquetar en WebM ────────────────────────────────────────────
  const webmBlob = buildSimpleWebM(chunks, outWidth, outHeightEven, FPS, duration);

  onProgress('Compresión completada', 100);
  return webmBlob;
}

// ── Metadata helper ───────────────────────────────────────────────────────────

function getVideoMetadata(url: string): Promise<{ videoWidth: number; videoHeight: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ videoWidth: v.videoWidth, videoHeight: v.videoHeight, duration: v.duration });
    };
    v.onerror = () => reject(new Error('No se pudo leer metadata del video'));
  });
}

// ── WebM muxer mínimo ─────────────────────────────────────────────────────────
// Construye un WebM válido con los chunks VP9 encodados.
// Implementación liviana sin dependencias externas.

function buildSimpleWebM(
  chunks: EncodedVideoChunk[],
  width: number,
  height: number,
  fps: number,
  durationSec: number
): Blob {
  // Escribir EBML (Extensible Binary Meta Language) — formato base de WebM/MKV
  const writer = new EBMLWriter();

  // EBML Header
  writer.writeElement(0x1A45DFA3, (w) => {
    w.writeUint(0x4286, 1);           // EBMLVersion
    w.writeUint(0x42F7, 1);           // EBMLReadVersion
    w.writeUint(0x42F2, 4);           // EBMLMaxIDLength
    w.writeUint(0x42F3, 8);           // EBMLMaxSizeLength
    w.writeString(0x4282, 'webm');    // DocType
    w.writeUint(0x4287, 4);           // DocTypeVersion
    w.writeUint(0x4285, 2);           // DocTypeReadVersion
  });

  // Segment
  writer.writeElement(0x18538067, (w) => {
    // SeekHead (simplificado — sin seekhead para compatibilidad)
    // Info
    w.writeElement(0x1549A966, (info) => {
      info.writeFloat(0x2AD7B1, 1_000_000); // TimecodeScale (1ms = 1,000,000 ns)
      info.writeFloat(0x4489, durationSec * 1000); // Duration en ms
      info.writeString(0x4D80, 'GolAnalytics WebCodecs');
      info.writeString(0x5741, 'GolAnalytics WebCodecs');
    });

    // Tracks
    w.writeElement(0x1654AE6B, (tracks) => {
      tracks.writeElement(0xAE, (track) => {
        track.writeUint(0xD7, 1);           // TrackNumber
        track.writeUint(0x73C5, 1);         // TrackUID
        track.writeUint(0x83, 1);           // TrackType: video
        track.writeUint(0xB9, 1);           // FlagEnabled
        track.writeUint(0x88, 1);           // FlagDefault
        track.writeString(0x86, 'V_VP9');   // CodecID
        track.writeElement(0xE0, (video) => {
          video.writeUint(0xB0, width);
          video.writeUint(0xBA, height);
          video.writeFloat(0x2383E3, fps);  // FrameRate
        });
      });
    });

    // Cluster(s) — un cluster por chunk para simplicidad
    // Agrupar en clusters de ~1 segundo
    const clusterDuration = 1000; // ms
    let clusterStart = 0;
    let clusterChunks: EncodedVideoChunk[] = [];

    const flushCluster = (clusterTimecode: number, cks: EncodedVideoChunk[]) => {
      if (cks.length === 0) return;
      w.writeElement(0x1F43B675, (cluster) => {
        cluster.writeUint(0xE7, clusterTimecode); // Timecode en ms
        for (const chunk of cks) {
          const chunkTimeMs = Math.round(chunk.timestamp / 1000);
          const relativeTime = chunkTimeMs - clusterTimecode;
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);

          // SimpleBlock header
          const isKeyframe = chunk.type === 'key';
          const trackNum = encodeVarInt(1); // track 1
          const timecode = new Uint8Array([(relativeTime >> 8) & 0xFF, relativeTime & 0xFF]);
          const flags = new Uint8Array([isKeyframe ? 0x80 : 0x00]);
          const blockData = new Uint8Array(trackNum.length + 2 + 1 + data.length);
          blockData.set(trackNum, 0);
          blockData.set(timecode, trackNum.length);
          blockData.set(flags, trackNum.length + 2);
          blockData.set(data, trackNum.length + 3);
          cluster.writeRaw(0xA3, blockData); // SimpleBlock
        }
      });
    };

    for (const chunk of chunks) {
      const chunkTimeMs = Math.round(chunk.timestamp / 1000);
      if (chunkTimeMs >= clusterStart + clusterDuration) {
        flushCluster(clusterStart, clusterChunks);
        clusterStart = Math.floor(chunkTimeMs / clusterDuration) * clusterDuration;
        clusterChunks = [];
      }
      clusterChunks.push(chunk);
    }
    flushCluster(clusterStart, clusterChunks);
  });

  return new Blob([writer.getBuffer()], { type: 'video/webm' });
}

// ── EBML Writer ───────────────────────────────────────────────────────────────

class EBMLWriter {
  private parts: Uint8Array[] = [];

  writeElement(id: number, fn: (w: EBMLWriter) => void): void {
    const child = new EBMLWriter();
    fn(child);
    const body = child.getBuffer();
    this.parts.push(encodeEBMLId(id));
    this.parts.push(encodeVarInt(body.byteLength));
    this.parts.push(body);
  }

  writeUint(id: number, value: number): void {
    const bytes = encodeUint(value);
    this.parts.push(encodeEBMLId(id));
    this.parts.push(encodeVarInt(bytes.length));
    this.parts.push(bytes);
  }

  writeFloat(id: number, value: number): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value);
    const bytes = new Uint8Array(buf);
    this.parts.push(encodeEBMLId(id));
    this.parts.push(encodeVarInt(8));
    this.parts.push(bytes);
  }

  writeString(id: number, value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.parts.push(encodeEBMLId(id));
    this.parts.push(encodeVarInt(bytes.length));
    this.parts.push(bytes);
  }

  writeRaw(id: number, data: Uint8Array): void {
    this.parts.push(encodeEBMLId(id));
    this.parts.push(encodeVarInt(data.length));
    this.parts.push(data);
  }

  getBuffer(): Uint8Array {
    const totalLength = this.parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of this.parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
}

function encodeEBMLId(id: number): Uint8Array {
  if (id <= 0xFF) return new Uint8Array([id]);
  if (id <= 0xFFFF) return new Uint8Array([(id >> 8) & 0xFF, id & 0xFF]);
  if (id <= 0xFFFFFF) return new Uint8Array([(id >> 16) & 0xFF, (id >> 8) & 0xFF, id & 0xFF]);
  return new Uint8Array([(id >> 24) & 0xFF, (id >> 16) & 0xFF, (id >> 8) & 0xFF, id & 0xFF]);
}

function encodeVarInt(value: number): Uint8Array {
  if (value < 0x7F) return new Uint8Array([0x80 | value]);
  if (value < 0x3FFF) return new Uint8Array([0x40 | (value >> 8), value & 0xFF]);
  if (value < 0x1FFFFF) return new Uint8Array([0x20 | (value >> 16), (value >> 8) & 0xFF, value & 0xFF]);
  if (value < 0x0FFFFFFF) return new Uint8Array([0x10 | (value >> 24), (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);
  // Para tamaños grandes usar 8 bytes
  return new Uint8Array([0x01, 0x00, 0x00, 0x00, (value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);
}

function encodeUint(value: number): Uint8Array {
  if (value === 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xFF);
    v >>= 8;
  }
  return new Uint8Array(bytes);
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
  formData.append('file', videoBlob, 'video.webm');
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
