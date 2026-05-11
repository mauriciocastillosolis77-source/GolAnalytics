import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import type { Match, TacticalAnalysis, TacticalAnnotation, TacticalAnalysisInsert, AnnotationType } from '../types';
import { fetchVideosForMatch, type Video as VideoMeta } from '../services/videosService';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TOOL_COLORS = [
  '#FACC15', // amarillo
  '#F97316', // naranja
  '#EF4444', // rojo
  '#22C55E', // verde
  '#06B6D4', // cyan
  '#3B82F6', // azul
  '#A855F7', // violeta
  '#FFFFFF', // blanco
];

const STROKE_WIDTHS = [2, 4, 6, 8];
const DEFAULT_SECONDS_BEFORE = 5;

interface ToolDef {
  type: AnnotationType;
  label: string;
  icon: React.ReactNode;
  cursor: string;
}

const TOOLS: ToolDef[] = [
  {
    type: 'arrow',
    label: 'Flecha recta',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <line x1="5" y1="19" x2="19" y2="5" />
        <polyline points="19,5 13,5 19,11" />
      </svg>
    ),
  },
  {
    type: 'arrow_curved',
    label: 'Flecha curva',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M5 19 Q12 4 19 5" />
        <polyline points="19,5 14,6 18,11" />
      </svg>
    ),
  },
  {
    type: 'arrow_player',
    label: 'Movimiento jugador',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" className="w-5 h-5">
        <line x1="5" y1="19" x2="19" y2="5" />
        <polyline points="19,5 13,5 19,11" strokeDasharray="0" />
      </svg>
    ),
  },
  {
    type: 'line',
    label: 'Línea recta',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <line x1="4" y1="20" x2="20" y2="4" />
      </svg>
    ),
  },
  {
    type: 'line_dashed',
    label: 'Línea fuera de juego',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" className="w-5 h-5">
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    ),
  },
  {
    type: 'zone_rect',
    label: 'Zona rectangular',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="4" y="6" width="16" height="12" rx="1" fillOpacity="0.3" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: 'zone_ellipse',
    label: 'Zona elíptica',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <ellipse cx="12" cy="12" rx="9" ry="6" fillOpacity="0.3" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: 'spotlight',
    label: 'Spotlight jugador',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    type: 'player_circle',
    label: 'Círculo jugador',
    cursor: 'crosshair',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="8" />
        <text x="12" y="16" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none">6</text>
      </svg>
    ),
  },
  {
    type: 'text',
    label: 'Texto táctico',
    cursor: 'text',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <polyline points="4,7 4,4 20,4 20,7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Convierte segundos a MM:SS o HH:MM:SS
const formatTime = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Convierte string MM:SS a segundos
const parseOffset = (str: string): number => {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  size: number = 14
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: TacticalAnnotation,
  W: number,
  H: number
) {
  const x1 = ann.x1 * W;
  const y1 = ann.y1 * H;
  const x2 = (ann.x2 ?? ann.x1) * W;
  const y2 = (ann.y2 ?? ann.y1) * H;
  const sw = ann.strokeWidth ?? 3;
  const opacity = ann.opacity ?? 0.28;

  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (ann.type) {
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      drawArrowhead(ctx, x1, y1, x2, y2, 10 + sw * 2);
      break;
    }
    case 'arrow_curved': {
      const curve = ann.curvature ?? 0.35;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const cpx = mx - dy * curve;
      const cpy = my + dx * curve;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
      ctx.stroke();
      const tx = x2 - cpx;
      const ty = y2 - cpy;
      const tlen = Math.sqrt(tx * tx + ty * ty) || 1;
      drawArrowhead(ctx, x2 - (tx / tlen) * 10, y2 - (ty / tlen) * 10, x2, y2, 10 + sw * 2);
      break;
    }
    case 'arrow_player': {
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawArrowhead(ctx, x1, y1, x2, y2, 10 + sw * 2);
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;
    }
    case 'line_dashed': {
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'zone_rect': {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      ctx.globalAlpha = opacity;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.globalAlpha = 1;
      ctx.strokeRect(rx, ry, rw, rh);
      break;
    }
    case 'zone_ellipse': {
      const ecx = (x1 + x2) / 2;
      const ecy = (y1 + y2) / 2;
      const erx = Math.abs(x2 - x1) / 2;
      const ery = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, erx, ery, 0, 0, Math.PI * 2);
      ctx.globalAlpha = opacity;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    }
    case 'spotlight': {
      const scx = (x1 + x2) / 2;
      const scy = (y1 + y2) / 2;
      const sr = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(scx, scy, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(scx, scy, sr, 0, Math.PI * 2);
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = sw;
      ctx.stroke();
      break;
    }
    case 'player_circle': {
      const pcx = (x1 + x2) / 2;
      const pcy = (y1 + y2) / 2;
      const pr = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / 2;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      if (ann.label) {
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(10, pr * 0.9)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.label.slice(0, 3), pcx, pcy);
      }
      break;
    }
    case 'text': {
      if (ann.text) {
        const fontSize = 14 + sw * 2;
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const metrics = ctx.measureText(ann.text);
        const pad = 4;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x1 - pad, y1 - pad, metrics.width + pad * 2, fontSize + pad * 2);
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, x1, y1);
      }
      break;
    }
  }
  ctx.restore();
}

// ─── Componente principal ─────────────────────────────────────────────────────

const AnalisisTacticoPage: React.FC = () => {
  const { profile, user } = useAuth();
  const isAdmin = profile?.rol === ROLES.ADMIN;

  // ── Estado general ──
  const [matches, setMatches] = useState<Match[]>([]);
  const [analyses, setAnalyses] = useState<TacticalAnalysis[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filtros de lista ──
  const [filterMatchId, setFilterMatchId] = useState<string>('all');
  const [filterTorneo, setFilterTorneo] = useState<string>('all');
  const [filterCategoria, setFilterCategoria] = useState<string>('all');

  // ── Selección de partido y video (igual que VideoTaggerPage) ──
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [matchVideos, setMatchVideos] = useState<VideoMeta[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<VideoMeta | null>(null);

  // ── Video físico y frame ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [frameTimestamp, setFrameTimestamp] = useState<number | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [secondsBefore, setSecondsBefore] = useState<number>(DEFAULT_SECONDS_BEFORE);

  // ── Canvas de dibujo ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotations, setAnnotations] = useState<TacticalAnnotation[]>([]);
  const [activeTool, setActiveTool] = useState<AnnotationType>('arrow');
  const [activeColor, setActiveColor] = useState<string>(TOOL_COLORS[0]);
  const [activeStroke, setActiveStroke] = useState<number>(3);
  const [description, setDescription] = useState<string>('');
  const [playerLabel, setPlayerLabel] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const isDrawing = useRef(false);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [previewAnn, setPreviewAnn] = useState<TacticalAnnotation | null>(null);

  // ── Revisión ──
  const [selectedAnalysis, setSelectedAnalysis] = useState<TacticalAnalysis | null>(null);
  const reviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const [reviewVideoUrl, setReviewVideoUrl] = useState<string | null>(null);

  // ── Vista activa ──
  const [view, setView] = useState<'list' | 'create' | 'review'>('list');

  // ─── Carga inicial ─────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        let matchQuery = supabase.from('matches').select('*').order('fecha', { ascending: false });
        if (!isAdmin && profile?.team_id) {
          matchQuery = matchQuery.eq('team_id', profile.team_id);
        }
        const { data: matchesData, error: mErr } = await matchQuery;
        if (mErr) throw mErr;
        setMatches(matchesData || []);

        let analysisQuery = supabase
          .from('tactical_analysis')
          .select('*')
          .order('created_at', { ascending: false });
        if (!isAdmin && profile?.team_id) {
          analysisQuery = analysisQuery.eq('team_id', profile.team_id);
        }
        const { data: analysisData, error: aErr } = await analysisQuery;
        if (aErr) throw aErr;
        setAnalyses(analysisData || []);
      } catch (err: any) {
        setError('No se pudieron cargar los datos.');
        console.error(err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [isAdmin, profile?.team_id]);

  // ─── Cuando cambia el partido, cargar sus videos (igual que VideoTaggerPage) ──

  useEffect(() => {
    if (!selectedMatchId) {
      setMatchVideos([]);
      setSelectedVideoId('');
      setSelectedVideo(null);
      return;
    }
    const loadVideos = async () => {
      setLoadingVideos(true);
      try {
        const videosData = await fetchVideosForMatch(selectedMatchId);
        setMatchVideos(videosData || []);
        // Auto-seleccionar el primero si hay videos
        if (videosData && videosData.length > 0) {
          setSelectedVideoId(videosData[0].id);
          setSelectedVideo(videosData[0]);
        } else {
          setSelectedVideoId('');
          setSelectedVideo(null);
        }
      } catch (err) {
        console.warn('No se pudieron cargar los videos del partido', err);
        setMatchVideos([]);
      } finally {
        setLoadingVideos(false);
      }
    };
    loadVideos();
  }, [selectedMatchId]);

  // Sincronizar selectedVideo cuando cambia selectedVideoId
  useEffect(() => {
    const v = matchVideos.find(x => x.id === selectedVideoId) || null;
    setSelectedVideo(v);
    // Resetear frame y anotaciones al cambiar de video
    setFrameDataUrl(null);
    setFrameTimestamp(null);
    setAnnotations([]);
  }, [selectedVideoId, matchVideos]);

  // ─── Opciones de filtro para la lista ─────────────────────────────────────

  const torneos = [...new Set(matches.map(m => m.torneo).filter(Boolean))];
  const categorias = [...new Set(matches.map(m => m.categoria).filter(Boolean))];

  const filteredAnalyses = analyses.filter(a => {
    if (filterMatchId !== 'all' && a.match_id !== filterMatchId) return false;
    if (filterTorneo !== 'all') {
      const match = matches.find(m => m.id === a.match_id);
      if (!match || match.torneo !== filterTorneo) return false;
    }
    if (filterCategoria !== 'all') {
      const match = matches.find(m => m.id === a.match_id);
      if (!match || match.categoria !== filterCategoria) return false;
    }
    return true;
  });

  // ─── Helpers de tiempo ─────────────────────────────────────────────────────

  // Timestamp absoluto del partido = offset del video + segundos dentro del archivo
  const getAbsoluteTimestamp = (video: VideoMeta, tsInFile: number): number => {
    const offset = parseOffset(video.start_offset_seconds?.toString() ?? '0');
    return offset + tsInFile;
  };

  const getMatchLabel = (matchId: string) => {
    const m = matches.find(x => x.id === matchId);
    if (!m) return matchId;
    return `${m.nombre_equipo} vs ${m.rival} — J${m.jornada} (${m.torneo})`;
  };

  // ─── Cargar video físico ───────────────────────────────────────────────────

  const handleVideoLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFileName(file.name);
    setFrameDataUrl(null);
    setFrameTimestamp(null);
    setAnnotations([]);
  };

  // ─── Capturar frame ───────────────────────────────────────────────────────

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const ts = video.currentTime;
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth;
    offscreen.height = video.videoHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setFrameDataUrl(offscreen.toDataURL('image/jpeg', 0.92));
    setFrameTimestamp(ts);
    setAnnotations([]);
    setPreviewAnn(null);
  }, []);

  // ─── Dibujar en canvas ─────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameDataUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      annotations.forEach(a => drawAnnotation(ctx, a, canvas.width, canvas.height));
      if (previewAnn) drawAnnotation(ctx, previewAnn, canvas.width, canvas.height);
    };
    img.src = frameDataUrl;
  }, [frameDataUrl, annotations, previewAnn]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX / canvas.width,
      y: (e.clientY - rect.top) * scaleY / canvas.height,
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    isDrawing.current = true;
    drawStart.current = { x, y };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !drawStart.current) return;
    const { x, y } = getCanvasCoords(e);
    if (activeTool === 'text') return;
    setPreviewAnn({
      id: '__preview__',
      type: activeTool,
      x1: drawStart.current.x,
      y1: drawStart.current.y,
      x2: x,
      y2: y,
      color: activeColor,
      strokeWidth: activeStroke,
      opacity: 0.28,
      label: playerLabel || undefined,
    });
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !drawStart.current) return;
    isDrawing.current = false;
    const { x, y } = getCanvasCoords(e);
    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newAnn: TacticalAnnotation = {
      id,
      type: activeTool,
      x1: drawStart.current.x,
      y1: drawStart.current.y,
      x2: activeTool === 'text' ? undefined : x,
      y2: activeTool === 'text' ? undefined : y,
      color: activeColor,
      strokeWidth: activeStroke,
      opacity: 0.28,
      label: activeTool === 'player_circle' ? (playerLabel || '?') : undefined,
      text: activeTool === 'text' ? (textInput || 'Texto') : undefined,
      dashed: activeTool === 'arrow_player' || activeTool === 'line_dashed',
    };
    setAnnotations(prev => [...prev, newAnn]);
    setPreviewAnn(null);
    drawStart.current = null;
  };

  const undoLast = () => setAnnotations(prev => prev.slice(0, -1));
  const clearAll = () => setAnnotations([]);

  // ─── Guardar análisis ─────────────────────────────────────────────────────

  const saveAnalysis = async () => {
    if (!selectedMatchId || !selectedVideoId || frameTimestamp === null || annotations.length === 0) return;
    setSaving(true);
    try {
      const match = matches.find(m => m.id === selectedMatchId);
      const teamId = match?.team_id ?? profile?.team_id ?? '';
      const payload: TacticalAnalysisInsert = {
        match_id: selectedMatchId,
        team_id: teamId,
        video_id: selectedVideoId,
        timestamp_video: frameTimestamp,
        annotations,
        description: description.trim() || undefined,
        created_by: user!.id,
      };
      const { data, error: insertErr } = await supabase
        .from('tactical_analysis')
        .insert(payload)
        .select()
        .single();
      if (insertErr) throw insertErr;
      setAnalyses(prev => [data, ...prev]);
      // Reset
      setFrameDataUrl(null);
      setFrameTimestamp(null);
      setAnnotations([]);
      setDescription('');
      setSelectedMatchId('');
      setSelectedVideoId('');
      setSelectedVideo(null);
      setMatchVideos([]);
      setView('list');
    } catch (err: any) {
      setError('Error al guardar el análisis.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Abrir revisión ───────────────────────────────────────────────────────

  const openReview = (analysis: TacticalAnalysis) => {
    setSelectedAnalysis(analysis);
    setReviewVideoUrl(null);
    setView('review');
  };

  const handleReviewVideoLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (reviewVideoUrl) URL.revokeObjectURL(reviewVideoUrl);
    setReviewVideoUrl(URL.createObjectURL(file));
  };

  const handleReviewVideoLoaded = () => {
    const video = reviewVideoRef.current;
    if (!video || !selectedAnalysis) return;
    video.currentTime = selectedAnalysis.timestamp_video;
  };

  const handleReviewSeeked = () => {
    const video = reviewVideoRef.current;
    const canvas = reviewCanvasRef.current;
    if (!video || !canvas || !selectedAnalysis) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    selectedAnalysis.annotations.forEach(a =>
      drawAnnotation(ctx, a, canvas.width, canvas.height)
    );
  };

  const playFromBefore = () => {
    const video = reviewVideoRef.current;
    if (!video || !selectedAnalysis) return;
    const startAt = Math.max(0, selectedAnalysis.timestamp_video - secondsBefore);
    video.currentTime = startAt;
    video.play();
    const stopAt = selectedAnalysis.timestamp_video;
    const checkTime = () => {
      if (video.currentTime >= stopAt) {
        video.pause();
        video.removeEventListener('timeupdate', checkTime);
      }
    };
    video.addEventListener('timeupdate', checkTime);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  // ── Vista: Revisión ──
  if (view === 'review' && selectedAnalysis) {
    // Buscar el video registrado para mostrar su nombre y calcular timestamp absoluto
    const reviewVideo = analyses
      ? null
      : null; // se resuelve abajo con un efecto si se necesita
    const match = matches.find(m => m.id === selectedAnalysis.match_id);
    const date = new Date(selectedAnalysis.created_at).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('list'); setSelectedAnalysis(null); setReviewVideoUrl(null); }}
            className="flex items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver
          </button>
          <h2 className="text-lg font-bold text-white">Revisión de Análisis</h2>
        </div>

        {/* Info del análisis */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-2">
          <p className="text-cyan-400 text-sm font-medium">{getMatchLabel(selectedAnalysis.match_id)}</p>
          <div className="flex flex-wrap gap-4 text-xs text-gray-400">
            <span>
              ⏱ En el video: <span className="text-white font-medium">{formatTime(selectedAnalysis.timestamp_video)}</span>
            </span>
            <span className="text-gray-600">·</span>
            <span>{date}</span>
          </div>
          {selectedAnalysis.description && (
            <p className="text-gray-300 text-sm bg-gray-700/50 rounded p-2 mt-1">{selectedAnalysis.description}</p>
          )}
        </div>

        {/* Canvas reconstruido */}
        {reviewVideoUrl ? (
          <>
            <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
              <canvas ref={reviewCanvasRef} className="w-full h-auto" />
            </div>
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-gray-400">
                  Reproducir desde <span className="text-white font-medium">{secondsBefore}s</span> antes del frame
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Segundos antes:</label>
                  <input
                    type="number"
                    min={1} max={30}
                    value={secondsBefore}
                    onChange={e => setSecondsBefore(Number(e.target.value))}
                    className="w-14 bg-gray-700 text-white text-center rounded px-2 py-1 text-sm border border-gray-600"
                  />
                </div>
              </div>
              <button
                onClick={playFromBefore}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Reproducir contexto
              </button>
              <video
                ref={reviewVideoRef}
                src={reviewVideoUrl}
                className="w-full rounded-lg"
                controls
                onLoadedData={handleReviewVideoLoaded}
                onSeeked={handleReviewSeeked}
              />
            </div>
          </>
        ) : (
          <div className="bg-gray-800 rounded-xl p-6 text-center space-y-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 mx-auto text-gray-600">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <div>
              <p className="text-gray-400 text-sm">
                Carga el archivo <span className="text-white font-medium">{selectedAnalysis.video_id}</span> para reconstruir el frame y reproducir el contexto
              </p>
              <p className="text-gray-600 text-xs mt-1">
                El frame se posicionará automáticamente en {formatTime(selectedAnalysis.timestamp_video)}
              </p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Cargar video
              <input type="file" accept="video/*" className="hidden" onChange={handleReviewVideoLoad} />
            </label>
          </div>
        )}
      </div>
    );
  }

  // ── Vista: Crear análisis (solo Admin) ──
  if (view === 'create' && isAdmin) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('list')}
            className="flex items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver
          </button>
          <h2 className="text-lg font-bold text-white">Nuevo Análisis Táctico</h2>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-500 rounded-lg p-3 text-red-300 text-sm">{error}</div>
        )}

        {/* Paso 1: Partido */}
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <span className="bg-cyan-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">1</span>
            Selecciona el partido
          </h3>
          <select
            value={selectedMatchId}
            onChange={e => {
              setSelectedMatchId(e.target.value);
              setFrameDataUrl(null);
              setFrameTimestamp(null);
              setAnnotations([]);
            }}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">Selecciona un partido</option>
            {matches.map(m => (
              <option key={m.id} value={m.id}>
                {m.nombre_equipo} vs {m.rival} — J{m.jornada} · {m.torneo} · {m.categoria}
              </option>
            ))}
          </select>
        </div>

        {/* Paso 2: Video registrado */}
        {selectedMatchId && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <span className="bg-cyan-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">2</span>
              Selecciona el video del partido
            </h3>

            {loadingVideos ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Spinner /> Cargando videos...
              </div>
            ) : matchVideos.length === 0 ? (
              <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3">
                <p className="text-amber-300 text-sm">Este partido no tiene videos registrados. Regístralos primero en el Etiquetador.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {matchVideos.map(v => {
                  const offset = parseOffset(v.start_offset_seconds?.toString() ?? '0');
                  return (
                    <label
                      key={v.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedVideoId === v.id
                          ? 'border-cyan-500 bg-cyan-900/20'
                          : 'border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="video"
                        value={v.id}
                        checked={selectedVideoId === v.id}
                        onChange={() => setSelectedVideoId(v.id)}
                        className="accent-cyan-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{v.video_file}</p>
                        <p className="text-gray-500 text-xs">
                          Inicia en el minuto <span className="text-gray-300">{formatTime(offset)}</span> del partido
                        </p>
                      </div>
                      {selectedVideoId === v.id && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-cyan-400 flex-shrink-0">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Paso 3: Archivo físico del video */}
        {selectedVideoId && selectedVideo && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <span className="bg-cyan-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">3</span>
              Carga el archivo de video
            </h3>
            <p className="text-gray-500 text-xs">
              Carga el archivo que corresponde a <span className="text-gray-300 font-medium">{selectedVideo.video_file}</span>
            </p>
            {videoFileName ? (
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-green-400 flex-shrink-0">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400 text-sm truncate">{videoFileName}</span>
                <label className="ml-auto text-xs text-gray-500 cursor-pointer hover:text-gray-300 underline flex-shrink-0">
                  Cambiar
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideoLoad} />
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors w-fit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Seleccionar archivo
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoLoad} />
              </label>
            )}
          </div>
        )}

        {/* Paso 4: Capturar frame */}
        {videoUrl && selectedVideo && (
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <span className="bg-cyan-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">4</span>
              Captura el frame a analizar
            </h3>
            {frameTimestamp !== null && selectedVideo && (
              <div className="flex items-center gap-4 text-xs bg-gray-700/50 rounded-lg px-3 py-2">
                <span className="text-gray-400">
                  En el video: <span className="text-white font-medium">{formatTime(frameTimestamp)}</span>
                </span>
                <span className="text-gray-600">→</span>
                <span className="text-gray-400">
                  Minuto del partido: <span className="text-cyan-400 font-medium">
                    {formatTime(getAbsoluteTimestamp(selectedVideo, frameTimestamp))}
                  </span>
                </span>
              </div>
            )}
            <video ref={videoRef} src={videoUrl} className="w-full rounded-lg" controls />
            <button
              onClick={captureFrame}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Capturar frame actual
            </button>
          </div>
        )}

        {/* Paso 5: Dibujar anotaciones */}
        {frameDataUrl && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <span className="bg-cyan-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">5</span>
                Dibuja las anotaciones
              </h3>

              {/* Herramientas */}
              <div className="flex flex-wrap gap-1.5">
                {TOOLS.map(tool => (
                  <button
                    key={tool.type}
                    title={tool.label}
                    onClick={() => setActiveTool(tool.type)}
                    className={`p-2 rounded-lg transition-all ${
                      activeTool === tool.type
                        ? 'bg-cyan-600 text-white ring-2 ring-cyan-400'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {tool.icon}
                  </button>
                ))}
              </div>

              {/* Colores */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Color:</span>
                {TOOL_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setActiveColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      activeColor === c ? 'border-white scale-125' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={activeColor}
                  onChange={e => setActiveColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border border-gray-600"
                  title="Color personalizado"
                />
              </div>

              {/* Grosor */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Grosor:</span>
                {STROKE_WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => setActiveStroke(w)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      activeStroke === w
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>

              {/* Opciones contextuales */}
              {activeTool === 'player_circle' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14 flex-shrink-0">Número:</span>
                  <input
                    type="text"
                    maxLength={3}
                    value={playerLabel}
                    onChange={e => setPlayerLabel(e.target.value)}
                    placeholder="6"
                    className="w-16 bg-gray-700 text-white text-center rounded px-2 py-1 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              )}
              {activeTool === 'text' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14 flex-shrink-0">Texto:</span>
                  <input
                    type="text"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder="Ej. Presión alta"
                    className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Acciones */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
                <button
                  onClick={undoLast}
                  disabled={annotations.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg text-xs transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M3 10h10a5 5 0 010 10H3" />
                    <path d="M3 10l4-4M3 10l4 4" />
                  </svg>
                  Deshacer
                </button>
                <button
                  onClick={clearAll}
                  disabled={annotations.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-red-900/60 disabled:opacity-40 text-gray-300 hover:text-red-400 rounded-lg text-xs transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                  Limpiar todo
                </button>
                <span className="ml-auto text-xs text-gray-500">
                  {annotations.length} anotacion{annotations.length !== 1 ? 'es' : ''}
                </span>
              </div>
            </div>

            {/* Canvas */}
            <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
              <canvas
                ref={canvasRef}
                className="w-full h-auto block"
                style={{ cursor: TOOLS.find(t => t.type === activeTool)?.cursor || 'crosshair' }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => {
                  if (isDrawing.current) {
                    isDrawing.current = false;
                    setPreviewAnn(null);
                  }
                }}
              />
            </div>

            {/* Descripción y guardar */}
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descripción táctica (opcional)..."
                rows={2}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none resize-none"
              />
              <button
                onClick={saveAnalysis}
                disabled={saving || !selectedMatchId || !selectedVideoId || frameTimestamp === null || annotations.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? <Spinner /> : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z" />
                    <path d="M17 21v-8H7v8M7 3v5h8" />
                  </svg>
                )}
                Guardar análisis
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Vista: Lista ──
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Análisis Táctico</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {isAdmin
              ? 'Crea y revisa análisis tácticos con anotaciones sobre frames de video.'
              : 'Revisa los análisis tácticos de tu equipo.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setView('create')}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo análisis
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 rounded-lg p-3 text-red-300 text-sm">{error}</div>
      )}

      {/* Filtros */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Torneo</label>
            <select
              value={filterTorneo}
              onChange={e => setFilterTorneo(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">Todos</option>
              {torneos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Categoría</label>
            <select
              value={filterCategoria}
              onChange={e => setFilterCategoria(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Partido</label>
            <select
              value={filterMatchId}
              onChange={e => setFilterMatchId(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">Todos</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nombre_equipo} vs {m.rival} — J{m.jornada}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista de análisis */}
      {filteredAnalyses.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 mx-auto mb-3 opacity-40">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p className="text-sm">
            No hay análisis tácticos{filterMatchId !== 'all' || filterTorneo !== 'all' || filterCategoria !== 'all' ? ' con estos filtros' : ' guardados'}.
          </p>
          {isAdmin && (
            <button
              onClick={() => setView('create')}
              className="mt-3 text-cyan-400 hover:text-cyan-300 text-sm underline"
            >
              Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAnalyses.map(analysis => {
            const match = matches.find(m => m.id === analysis.match_id);
            const date = new Date(analysis.created_at).toLocaleDateString('es-MX', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            return (
              <div
                key={analysis.id}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-cyan-700 transition-colors cursor-pointer group"
                onClick={() => openReview(analysis)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {match ? `${match.nombre_equipo} vs ${match.rival}` : 'Partido desconocido'}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {match ? `${match.torneo} · J${match.jornada}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded ml-2 flex-shrink-0">
                    {formatTime(analysis.timestamp_video)}
                  </span>
                </div>

                {analysis.description && (
                  <p className="text-gray-400 text-xs mb-3 line-clamp-2">{analysis.description}</p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 flex-wrap">
                    {[...new Set(analysis.annotations.map(a => a.type))].slice(0, 4).map(type => (
                      <span key={type} className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                        {TOOLS.find(t => t.type === type)?.label.split(' ')[0] ?? type}
                      </span>
                    ))}
                    {analysis.annotations.length > 0 && (
                      <span className="text-xs text-gray-500 ml-1">{analysis.annotations.length} ann.</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">{date}</span>
                </div>

                <div className="mt-3 flex items-center gap-1 text-cyan-500 group-hover:text-cyan-400 text-xs transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Ver análisis
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnalisisTacticoPage;

