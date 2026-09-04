import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import type { RivalAnalysis, RivalAnalysisInsert, RivalMomento, RivalNotas, RivalTipo, RivalZona } from '../types';
import { fetchTeams, type Team } from '../services/teamsService';
import { exportRivalAnalysisToPDF } from '../services/pdfExportService';

// ─── Configuración de atributos por Tipo (contextual, igual que el mockup aprobado) ──
const ATTR_CONFIG: Record<RivalTipo, { lbl1: string; opts1: [string, string][]; lbl2: string; opts2: [string, string][] }> = {
  Ofensiva:   { lbl1: 'Estilo', opts1: [['Combinativo', '1'], ['Directo', '2']], lbl2: 'Carril', opts2: [['Izquierda', '1'], ['Centro', '2'], ['Derecha', '3']] },
  Defensiva:  { lbl1: 'Altura de presión', opts1: [['Alta', '1'], ['Media', '2'], ['Baja', '3']], lbl2: 'Número de hombres', opts2: [['Muchos', '1'], ['Pocos', '2']] },
  Transicion: { lbl1: 'Planteamiento', opts1: [['Contraataque', '1'], ['Ataque organizado', '2']], lbl2: 'Carril', opts2: [['Izquierda', '1'], ['Centro', '2'], ['Derecha', '3']] },
};
const TIPOS: RivalTipo[] = ['Ofensiva', 'Defensiva', 'Transicion'];
// El reporte y la impresión solo muestran Ofensiva y Defensiva — Transición sigue
// disponible para etiquetar (por si se usa con otro rival), pero no en el reporte.
const REPORT_TIPOS: RivalTipo[] = ['Ofensiva', 'Defensiva'];
const REPORT_QUESTION: Partial<Record<RivalTipo, string>> = {
  Ofensiva: '¿Cómo ataca el rival cuando tiene el balón?',
  Defensiva: '¿Cómo presiona el rival cuando no tiene el balón?',
};
const ZONAS: RivalZona[] = ['Inicio', 'Creacion', 'Finalizacion'];
const ZONA_LABEL: Record<RivalZona, string> = { Inicio: 'Inicio', Creacion: 'Creación', Finalizacion: 'Finalización' };
const EYEBROW: Record<RivalTipo, string> = { Ofensiva: 'FASE OFENSIVA', Defensiva: 'FASE DEFENSIVA', Transicion: 'TRANSICIÓN OFENSIVA' };
const ZONA_COLOR: Record<RivalZona, string> = { Inicio: '#D85A30', Creacion: '#EF9F27', Finalizacion: '#378ADD' };

let idCounter = 0;
const newLocalId = () => `m_${Date.now()}_${idCounter++}`;

const AnalisisRivalPage: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.rol === ROLES.ADMIN;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<RivalAnalysis[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const [view, setView] = useState<'list' | 'workspace'>('list');
  const [selected, setSelected] = useState<RivalAnalysis | null>(null);
  const [mode, setMode] = useState<'tag' | 'report'>('tag'); // el auxiliar siempre queda forzado a 'report'

  // ── Creación de un análisis nuevo ──
  const [newTeamId, setNewTeamId] = useState('');
  const [newRivalName, setNewRivalName] = useState('');

  // ── Video local (solo para ver mientras se etiqueta, nunca se guarda) ──
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const secondaryWindowRef = useRef<Window | null>(null);

  // ── Selección actual de etiquetado ──
  const [selTipo, setSelTipo] = useState<RivalTipo | null>(null);
  const [selZona, setSelZona] = useState<RivalZona | null>(null);
  const [selAttr1, setSelAttr1] = useState<string | null>(null);
  const [selAttr2, setSelAttr2] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  // ── Borrador (sin guardar) y guardado ──
  const [draftMomentos, setDraftMomentos] = useState<RivalMomento[]>([]);
  const [draftNotes, setDraftNotes] = useState<RivalNotas>({});
  const [notaTexto, setNotaTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Comando de voz (Deepgram, igual que VideoTaggerPage) ──
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const recognitionRef = useRef<any>(null); // guarda el MediaRecorder activo
  const voiceActiveRef = useRef(false);
  const processVoiceCommandRef = useRef<(t: string) => void>(() => {});

  // ── Vista de reporte (auxiliar y preview de admin) ──
  const [repTipo, setRepTipo] = useState<RivalTipo>('Ofensiva');
  const [repZona, setRepZona] = useState<RivalZona>('Inicio');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const teamsData = await fetchTeams();
        setTeams(teamsData);
        const { data, error: fe } = await supabase.from('rival_analysis').select('*').order('created_at', { ascending: false });
        if (fe) throw fe;
        setAnalyses(data || []);
      } catch (err) {
        console.error(err);
        setError('No se pudieron cargar los análisis de rival.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => () => { stopVoice(); if (videoUrl) URL.revokeObjectURL(videoUrl); }, []);

  const teamName = useCallback((teamId: string) => teams.find(t => t.id === teamId)?.nombre || 'Equipo', [teams]);

  // ─── Momentos combinados (guardados + borrador) para conteos en pantalla ──────
  const allMomentos = useMemo(() => [...(selected?.momentos || []), ...draftMomentos], [selected, draftMomentos]);
  const countsByTipo = useMemo(() => {
    const c: Record<RivalTipo, number> = { Ofensiva: 0, Defensiva: 0, Transicion: 0 };
    allMomentos.forEach(m => { c[m.tipo]++; });
    return c;
  }, [allMomentos]);

  // ─── Abrir un análisis existente ────────────────────────────────────────────
  const openAnalysis = (a: RivalAnalysis) => {
    setSelected(a);
    setDraftMomentos([]); setDraftNotes({});
    setSelTipo(null); setSelZona(null); setSelAttr1(null); setSelAttr2(null);
    setVideoUrl(null); setVideoFileName('');
    setSaveMsg(null);
    setMode(isAdmin ? 'tag' : 'report');
    setRepTipo('Ofensiva'); setRepZona('Inicio');
    setView('workspace');
  };

  const startNewAnalysis = () => {
    if (!isAdmin) return;
    setSelected(null);
    setNewTeamId(teams[0]?.id || '');
    setNewRivalName('');
    setDraftMomentos([]); setDraftNotes({});
    setSelTipo(null); setSelZona(null); setSelAttr1(null); setSelAttr2(null);
    setVideoUrl(null); setVideoFileName('');
    setSaveMsg(null);
    setMode('tag');
    setView('workspace');
  };

  const backToList = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    stopVoice();
    setView('list');
    setSelected(null);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoFileName(file.name);
  };

  const openSecondaryWindow = () => {
    if (!videoUrl) return;
    const sw = window.open('', '_blank', 'width=960,height=620');
    if (!sw) return;
    const navButton = (label: string, delta: number) => `<button onclick="seek(${delta})" style="background:#374151;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;">${label}</button>`;
    sw.document.write(`<title>${videoFileName || 'Video del rival'}</title><body style="margin:0;background:#000;display:flex;flex-direction:column;height:100vh;font-family:sans-serif;">
      <video id="v" src="${videoUrl}" controls autoplay style="flex:1;width:100%;min-height:0;"></video>
      <div style="background:#111827;padding:10px;display:flex;gap:8px;justify-content:center;">
        ${navButton('-10s', -10)}${navButton('-5s', -5)}${navButton('+5s', 5)}${navButton('+10s', 10)}
      </div>
      <script>
        var v = document.getElementById('v');
        function seek(d) {
          v.currentTime = Math.max(0, v.currentTime + d);
          if (window.opener) window.opener.postMessage({ type: 'gol_videocontrol_from_popup', action: 'seek', delta: d }, '*');
        }
        window.addEventListener('message', function(e) {
          if (!e.data || e.data.type !== 'gol_videocontrol') return;
          if (e.data.action === 'pause') v.pause();
          else if (e.data.action === 'play') v.play();
          else if (e.data.action === 'back') v.currentTime = Math.max(0, v.currentTime - 5);
          else if (e.data.action === 'forward') v.currentTime += 5;
          else if (e.data.action === 'seek') v.currentTime = Math.max(0, v.currentTime + e.data.delta);
        });
      </script>`);
    sw.document.close();
    secondaryWindowRef.current = sw;
  };

  // Avanza/retrocede el video principal, y si la ventana secundaria está abierta, la mantiene sincronizada.
  const stepVideo = (delta: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + delta));
    const sw = secondaryWindowRef.current;
    if (sw && !sw.closed) sw.postMessage({ type: 'gol_videocontrol', action: 'seek', delta }, '*');
  };

  // Recibe comandos de navegación que vienen DESDE la ventana secundaria (cuando usan sus
  // propios botones ahí), para que el reproductor principal se mantenga al día también.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'gol_videocontrol_from_popup') return;
      const v = videoRef.current;
      if (!v) return;
      if (e.data.action === 'seek') v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + e.data.delta));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ─── Selección de Tipo/Zona/Atributos ───────────────────────────────────────
  const selectTipo = (t: RivalTipo) => { setSelTipo(t); setSelAttr1(null); setSelAttr2(null); setTagError(null); };
  const selectZona = (z: RivalZona) => { setSelZona(z); setTagError(null); };
  const selectAttr1 = (v: string) => { setSelAttr1(v); setTagError(null); };
  const selectAttr2 = (v: string) => { setSelAttr2(v); setTagError(null); };

  const notaKey = selTipo && selZona ? `${selTipo}|${selZona}` : null;
  useEffect(() => {
    if (notaKey) {
      setNotaTexto(draftNotes[notaKey] ?? selected?.notas?.[notaKey] ?? '');
    } else {
      setNotaTexto('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notaKey]);

  const handleNotaChange = (v: string) => {
    setNotaTexto(v);
    if (notaKey) setDraftNotes(prev => ({ ...prev, [notaKey]: v }));
  };

  const registrarMomento = useCallback(() => {
    if (!selTipo || !selZona || !selAttr1) { setTagError('Selecciona tipo, zona y el primer atributo'); return; }
    setTagError(null);
    const momento: RivalMomento = {
      id: newLocalId(), tipo: selTipo, zona: selZona, attr1: selAttr1, attr2: selAttr2 || undefined,
      timestamp_video: videoRef.current ? Math.floor(videoRef.current.currentTime) : undefined,
    };
    setDraftMomentos(prev => [...prev, momento]);
    setSaveMsg(null);
    setSelZona(null); setSelAttr1(null); setSelAttr2(null);
  }, [selTipo, selZona, selAttr1, selAttr2]);

  const eliminarMomento = (id: string) => setDraftMomentos(prev => prev.filter(m => m.id !== id));

  // ─── Guardar (crea o actualiza el registro en Supabase) ─────────────────────
  const guardarAnalisis = useCallback(async () => {
    if (draftMomentos.length === 0 && Object.keys(draftNotes).length === 0) {
      setSaveMsg({ text: 'No hay nada nuevo para guardar', ok: false });
      return;
    }
    setSaving(true);
    try {
      const mergedMomentos = [...(selected?.momentos || []), ...draftMomentos];
      const mergedNotas: RivalNotas = { ...(selected?.notas || {}) };
      Object.entries(draftNotes).forEach(([k, v]) => { if (v.trim()) mergedNotas[k] = v; });

      if (selected) {
        const { data, error: ue } = await supabase.from('rival_analysis')
          .update({ momentos: mergedMomentos, notas: mergedNotas })
          .eq('id', selected.id).select().single();
        if (ue) throw ue;
        setSelected(data);
        setAnalyses(prev => prev.map(a => a.id === data.id ? data : a));
      } else {
        if (!newTeamId || !newRivalName.trim()) { setSaveMsg({ text: 'Elige el equipo y escribe el nombre del rival', ok: false }); setSaving(false); return; }
        const payload: RivalAnalysisInsert = {
          team_id: newTeamId, rival_name: newRivalName.trim(), video_path: videoFileName || null,
          momentos: mergedMomentos, notas: mergedNotas, created_by: user?.id || null,
        };
        const { data, error: ie } = await supabase.from('rival_analysis').insert(payload).select().single();
        if (ie) throw ie;
        setSelected(data);
        setAnalyses(prev => [data, ...prev]);
      }
      setDraftMomentos([]); setDraftNotes({});
      setSaveMsg({ text: 'Guardado correctamente', ok: true });
    } catch (err) {
      console.error(err);
      setSaveMsg({ text: 'No se pudo guardar. Intenta de nuevo.', ok: false });
    } finally {
      setSaving(false);
    }
  }, [selected, draftMomentos, draftNotes, newTeamId, newRivalName, videoFileName, user]);

  // ─── Comando de voz — Deepgram + MediaRecorder, misma implementación que ya
  // usas en VideoTaggerPage (WebSocket estable, no depende del navegador). ──────

  // Se reasigna en cada render para que siempre "vea" el estado más reciente
  // (selTipo, selZona, etc.) y evitar el bug de closures obsoletos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  processVoiceCommandRef.current = (transcript: string) => {
    const text = transcript.toLowerCase().trim().replace(/[.,;:!?¿¡]/g, '');
    const show = (msg: string) => { setVoiceStatus(msg); setTimeout(() => setVoiceStatus(''), 2500); };

    // Controles de video — igual que en el Etiquetador: si hay ventana
    // secundaria abierta, el comando se le envía a ella; si no, al video principal.
    const sendToSecondary = (action: string) => {
      const sw = secondaryWindowRef.current;
      if (sw && !sw.closed) { sw.postMessage({ type: 'gol_videocontrol', action }, '*'); return true; }
      return false;
    };
    if (/pausar|pausa|para\b|detener/.test(text)) { if (!sendToSecondary('pause')) videoRef.current?.pause(); show('⏸ Video pausado'); return; }
    if (/reproducir|play|continuar|reanudar/.test(text)) { if (!sendToSecondary('play')) videoRef.current?.play(); show('▶ Video reproduciendo'); return; }
    if (/atrás|atras|regresar|retroceder/.test(text)) { if (!sendToSecondary('back')) { if (videoRef.current) videoRef.current.currentTime -= 5; } show('⏪ -5 segundos'); return; }
    if (/adelante|avanzar|adelantar/.test(text)) { if (!sendToSecondary('forward')) { if (videoRef.current) videoRef.current.currentTime += 5; } show('⏩ +5 segundos'); return; }

    if (/guardar/.test(text)) { guardarAnalisis(); show('💾 Guardando análisis...'); return; }
    if (/registrar|registra\b|agregar momento/.test(text)) { registrarMomento(); show('✅ Momento registrado'); return; }

    if (/ofensiva/.test(text)) { selectTipo('Ofensiva'); show('🎯 Tipo: Ofensiva'); return; }
    if (/defensiva/.test(text)) { selectTipo('Defensiva'); show('🎯 Tipo: Defensiva'); return; }
    if (/transici[oó]n/.test(text)) { selectTipo('Transicion'); show('🎯 Tipo: Transición'); return; }

    if (/inicio/.test(text)) { selectZona('Inicio'); show('🎯 Zona: Inicio'); return; }
    if (/creaci[oó]n/.test(text)) { selectZona('Creacion'); show('🎯 Zona: Creación'); return; }
    if (/finalizaci[oó]n/.test(text)) { selectZona('Finalizacion'); show('🎯 Zona: Finalización'); return; }

    // Los atributos dependen del Tipo seleccionado — se buscan solo entre las
    // opciones vigentes para no confundir, por ejemplo, "media" de presión con otra cosa.
    if (selTipo) {
      const cfg = ATTR_CONFIG[selTipo];
      const foundAttr1 = cfg.opts1.find(([v]) => text.includes(v.toLowerCase()));
      if (foundAttr1) { selectAttr1(foundAttr1[0]); show(`🎯 ${cfg.lbl1}: ${foundAttr1[0]}`); return; }
      const foundAttr2 = cfg.opts2.find(([v]) => text.includes(v.toLowerCase()));
      if (foundAttr2) { selectAttr2(foundAttr2[0]); show(`🎯 ${cfg.lbl2}: ${foundAttr2[0]}`); return; }
    }

    show(`❓ No entendí: "${transcript}"`);
  };

  const startVoice = async () => {
    const DEEPGRAM_API_KEY = (import.meta as any).env.VITE_DEEPGRAM_API_KEY as string;
    if (!DEEPGRAM_API_KEY) { setError('Falta la API key de Deepgram (VITE_DEEPGRAM_API_KEY en Vercel).'); return; }

    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError('Sin acceso al micrófono. Revisa los permisos del navegador.'); return; }

    voiceActiveRef.current = true;
    setVoiceActive(true);
    setVoiceTranscript('');

    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=es&punctuate=false&interim_results=false`;
    const socket = new WebSocket(url, ['token', DEEPGRAM_API_KEY]);

    socket.onopen = () => {
      if (!voiceActiveRef.current) { socket.close(); return; }
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (e) => { if (socket.readyState === WebSocket.OPEN && e.data.size > 0) socket.send(e.data); };
      mediaRecorder.start(250);
      recognitionRef.current = mediaRecorder;
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data?.channel?.alternatives?.[0]?.transcript;
        if (transcript && transcript.trim().length > 0 && data?.is_final) {
          setVoiceTranscript(transcript);
          processVoiceCommandRef.current(transcript);
        }
      } catch { /* ignorar mensajes malformados */ }
    };
    socket.onerror = () => {
      if (!voiceActiveRef.current) return;
      setVoiceStatus('⚠ Error de conexión con Deepgram. Verifica tu conexión a internet.');
      setTimeout(() => setVoiceStatus(''), 5000);
    };
    socket.onclose = () => {
      stream.getTracks().forEach(track => track.stop());
      if (recognitionRef.current) { try { (recognitionRef.current as MediaRecorder).stop(); } catch { /* noop */ } recognitionRef.current = null; }
      if (voiceActiveRef.current) {
        voiceActiveRef.current = false;
        setVoiceActive(false);
        setVoiceStatus('⚠ Conexión cerrada. Vuelve a activar la voz.');
        setTimeout(() => setVoiceStatus(''), 4000);
      }
    };
    (recognitionRef as any).socket = socket;
  };

  function stopVoice() {
    voiceActiveRef.current = false;
    if (recognitionRef.current) { try { (recognitionRef.current as MediaRecorder).stop(); } catch { /* noop */ } recognitionRef.current = null; }
    const socket = (recognitionRef as any).socket as WebSocket | undefined;
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    (recognitionRef as any).socket = null;
    setVoiceActive(false);
    setVoiceTranscript('');
    setVoiceStatus('');
  }

  // ─── Atajos de teclado ────────────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'workspace' || mode !== 'tag' || !isAdmin) return;
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
      if (e.key === 'Enter') { e.preventDefault(); registrarMomento(); return; }
      if (!selTipo) {
        if (e.key === '1') selectTipo('Ofensiva');
        else if (e.key === '2') selectTipo('Defensiva');
        else if (e.key === '3') selectTipo('Transicion');
        return;
      }
      if (!selZona) {
        if (e.key === '1') selectZona('Inicio');
        else if (e.key === '2') selectZona('Creacion');
        else if (e.key === '3') selectZona('Finalizacion');
        return;
      }
      const cfg = ATTR_CONFIG[selTipo];
      if (!selAttr1) {
        const found = cfg.opts1.find(([, k]) => k === e.key);
        if (found) selectAttr1(found[0]);
        return;
      }
      const found2 = cfg.opts2.find(([, k]) => k === e.key);
      if (found2) selectAttr2(found2[0]);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [view, mode, isAdmin, registrarMomento, selTipo, selZona, selAttr1]);

  // ─── Datos para el reporte (calculados en vivo desde los momentos reales) ───
  type AttrStat = { label: string; pct: number };
  const reportFor = (tipo: RivalTipo, zona: RivalZona) => {
    const momentos = allMomentos.filter(m => m.tipo === tipo && m.zona === zona);
    const notaVal = draftNotes[`${tipo}|${zona}`] ?? selected?.notas?.[`${tipo}|${zona}`] ?? '';
    const cfg = ATTR_CONFIG[tipo];
    if (momentos.length === 0) return { momentos: 0, attr1Stats: [] as AttrStat[], attr2Stats: [] as AttrStat[], nota: notaVal, cfg };
    const attr1Counts: Record<string, number> = {};
    const attr2Counts: Record<string, number> = {};
    let attr2Total = 0;
    momentos.forEach(m => {
      attr1Counts[m.attr1] = (attr1Counts[m.attr1] || 0) + 1;
      if (m.attr2) { attr2Counts[m.attr2] = (attr2Counts[m.attr2] || 0) + 1; attr2Total++; }
    });
    const attr1Stats: AttrStat[] = Object.entries(attr1Counts).map(([label, n]) => ({ label, pct: Math.round((100 * n) / momentos.length) }));
    const attr2Stats: AttrStat[] = attr2Total > 0 ? Object.entries(attr2Counts).map(([label, n]) => ({ label, pct: Math.round((100 * n) / attr2Total) })) : [];
    return { momentos: momentos.length, attr1Stats, attr2Stats, nota: notaVal, cfg };
  };

  // Frase de conexión natural para el segundo atributo, según qué represente (Carril vs Número de hombres)
  const ATTR2_PHRASE: Record<string, (label: string) => string> = {
    'Carril': (l) => `por la ${l.toLowerCase()}`,
    'Número de hombres': (l) => `con ${l.toLowerCase()} hombres`,
  };

  // Traduce la Altura de presión (Alta/Media/Baja) a lenguaje táctico de entrenador,
  // en vez de mostrar la etiqueta cruda que no dice nada por sí sola.
  const ALTURA_PRESION_LABEL: Record<string, string> = {
    Alta: 'bloque alto', Media: 'bloque medio', Baja: 'bloque bajo',
  };

  // Redacta en una sola línea legible el resumen de una zona — para la tarjeta ejecutiva
  // que muestra las 3 zonas juntas, sin tener que picarle a cada una.
  const summarizeZone = (tipo: RivalTipo, zona: RivalZona): string => {
    const rep = reportFor(tipo, zona);
    if (rep.momentos === 0) return 'Sin momentos registrados todavía.';
    let text: string;
    if (tipo === 'Defensiva') {
      const parts = rep.attr1Stats.map(s => `${s.pct}% ${ALTURA_PRESION_LABEL[s.label] || s.label.toLowerCase()}`).join(', ');
      text = `Presión en ${parts}`;
      if (rep.attr1Stats.some(s => s.label === 'Baja')) text += ', replegados cerca de su área';
    } else {
      text = rep.attr1Stats.map(s => `${s.pct}% ${s.label.toLowerCase()}`).join(', ');
    }
    if (rep.attr2Stats.length > 0) {
      const top = [...rep.attr2Stats].sort((a, b) => b.pct - a.pct)[0];
      const phrase = ATTR2_PHRASE[rep.cfg.lbl2];
      if (phrase) text += `, mayoritariamente ${phrase(top.label)}`;
    }
    return `${text}.`;
  };

  const handleExportPDF = async () => {
    if (!selected) return;
    try {
      const buildFase = (tipo: RivalTipo, pregunta: string) => ({
        pregunta,
        zonas: ZONAS.map(z => ({ zona: z, resumen: summarizeZone(tipo, z) })),
      });
      await exportRivalAnalysisToPDF(
        {
          rivalName: selected.rival_name,
          ofensiva: buildFase('Ofensiva', REPORT_QUESTION.Ofensiva || ''),
          defensiva: buildFase('Defensiva', REPORT_QUESTION.Defensiva || ''),
        },
        { userName: profile?.username || 'Usuario', teamName: teamName(selected.team_id) }
      );
    } catch (err) {
      console.error(err);
      setError('No se pudo generar el PDF. Intenta de nuevo.');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  // ═══════════════════════════ VISTA: LISTA ═══════════════════════════════
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Análisis del Rival</h1>
            <p className="text-gray-500 text-sm mt-1">Explora el patrón táctico de tus próximos rivales.</p>
          </div>
          {isAdmin && (
            <button onClick={startNewAnalysis} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>Nuevo análisis
            </button>
          )}
        </div>

        {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

        {analyses.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 mx-auto mb-3 opacity-40"><circle cx="11" cy="11" r="7" /><path d="M21 21l-6-6" /></svg>
            <p className="text-sm">Todavía no hay análisis de rival guardados.</p>
            {isAdmin && <button onClick={startNewAnalysis} className="mt-3 text-cyan-400 hover:text-cyan-300 text-sm underline">Crear el primero</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {analyses.map(a => (
              <button key={a.id} onClick={() => openAnalysis(a)} className="text-left bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-cyan-700 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-medium text-sm">{a.rival_name}</p>
                  <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{a.momentos.length} momentos</span>
                </div>
                <p className="text-gray-500 text-xs">{teamName(a.team_id)}</p>
                <p className="text-gray-600 text-xs mt-2">{new Date(a.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════ VISTA: WORKSPACE ═══════════════════════════
  const rivalTitle = selected?.rival_name || newRivalName || 'Nuevo rival';
  const canTag = isAdmin && mode === 'tag';

  return (
    <div className="space-y-4">
      <button onClick={backToList} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-cyan-400 transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>Análisis del Rival
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">{rivalTitle}</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setMode('tag')} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${mode === 'tag' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Etiquetar</button>
            <button onClick={() => setMode('report')} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${mode === 'report' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Ver reporte</button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-lg p-3 text-sm">{error}</div>}

      {canTag ? (
        <>
          {!selected && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Equipo</label>
                <select value={newTeamId} onChange={e => setNewTeamId(e.target.value)} className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none">
                  {teams.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre del rival</label>
                <input type="text" value={newRivalName} onChange={e => setNewRivalName(e.target.value)} placeholder="Ej. Cruz Azul" className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none" />
              </div>
            </div>
          )}

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm cursor-pointer transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>Subir video
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
              </label>
              {videoFileName && <span className="text-xs text-gray-500">{videoFileName}</span>}
              {videoUrl && (
                <button onClick={openSecondaryWindow} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors ml-auto">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>Ventana secundaria
                </button>
              )}
            </div>
            {videoUrl ? (
              <>
                <video ref={videoRef} src={videoUrl} className="w-full rounded-lg max-h-72" controls />
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-xs text-gray-500 mr-1">Navegar:</span>
                  <button onClick={() => stepVideo(-10)} type="button" className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-mono transition-colors">-10s</button>
                  <button onClick={() => stepVideo(-5)} type="button" className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-mono transition-colors">-5s</button>
                  <button onClick={() => stepVideo(5)} type="button" className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-mono transition-colors">+5s</button>
                  <button onClick={() => stepVideo(10)} type="button" className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs font-mono transition-colors">+10s</button>
                </div>
              </>
            ) : (
              <div className="bg-gray-900 rounded-lg h-32 flex items-center justify-center text-gray-600 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 mr-2"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>Sin video cargado
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center gap-3 flex-wrap">
            <button onClick={voiceActive ? stopVoice : startVoice} className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${voiceActive ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} aria-label={voiceActive ? 'Desactivar comando de voz' : 'Activar comando de voz'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg>
            </button>
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm text-gray-400">{voiceActive ? 'Escuchando... di tipo, zona, atributos, "registrar" o "guardar"' : 'Comando de voz apagado'}</p>
              {voiceTranscript && <p className="text-xs text-gray-500 mt-0.5">"{voiceTranscript}"</p>}
              {voiceStatus && <p className="text-xs text-cyan-400 mt-0.5">{voiceStatus}</p>}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">Tipo</p>
              <span className="text-xs text-gray-600 flex items-center gap-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="2" y="6" width="20" height="12" rx="2" /></svg>teclas · Enter registra</span>
            </div>
            <div className="flex gap-2 mb-4">
              {TIPOS.map((t, i) => (
                <button key={t} onClick={() => selectTipo(t)} className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 transition-colors ${selTipo === t ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300' : 'bg-gray-700 border-transparent text-gray-300 hover:bg-gray-600'}`}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-900 text-[10px] mr-1.5 text-gray-400">{i + 1}</span>{t === 'Transicion' ? 'Transición' : t}
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-500 mb-2">Zona</p>
            <div className="flex gap-2 mb-4">
              {ZONAS.map((z, i) => (
                <button key={z} onClick={() => selectZona(z)} className={`flex-1 px-3 py-2 rounded-lg text-sm border-2 transition-colors ${selZona === z ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300' : 'bg-gray-700 border-transparent text-gray-300 hover:bg-gray-600'}`}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-900 text-[10px] mr-1.5 text-gray-400">{i + 1}</span>{ZONA_LABEL[z]}
                </button>
              ))}
            </div>

            {selTipo && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-2">{ATTR_CONFIG[selTipo].lbl1}</p>
                  <div className="flex gap-2 flex-wrap">
                    {ATTR_CONFIG[selTipo].opts1.map(([v, k]) => (
                      <button key={v} onClick={() => selectAttr1(v)} className={`px-2.5 py-1.5 rounded-lg text-xs border-2 transition-colors ${selAttr1 === v ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300' : 'bg-gray-700 border-transparent text-gray-300 hover:bg-gray-600'}`}>
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-gray-900 text-[9px] mr-1 text-gray-400">{k}</span>{v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">{ATTR_CONFIG[selTipo].lbl2}</p>
                  <div className="flex gap-2 flex-wrap">
                    {ATTR_CONFIG[selTipo].opts2.map(([v, k]) => (
                      <button key={v} onClick={() => selectAttr2(v)} className={`px-2.5 py-1.5 rounded-lg text-xs border-2 transition-colors ${selAttr2 === v ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300' : 'bg-gray-700 border-transparent text-gray-300 hover:bg-gray-600'}`}>
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded bg-gray-900 text-[9px] mr-1 text-gray-400">{k}</span>{v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button onClick={registrarMomento} className="w-full bg-white text-gray-900 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-100 transition-colors">
              Registrar momento <span className="opacity-60 text-xs">(Enter)</span>
            </button>
            {tagError && <p className="text-xs text-red-400 mt-2">{tagError}</p>}
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-xs text-gray-500 mb-1">Nota del analista (opcional)</p>
            <p className="text-xs text-gray-600 mb-2">Se guarda para: <span className="text-gray-300">{selTipo && selZona ? `${selTipo === 'Transicion' ? 'Transición' : selTipo} · ${ZONA_LABEL[selZona]}` : 'selecciona tipo y zona arriba'}</span></p>
            <textarea value={notaTexto} onChange={e => handleNotaChange(e.target.value)} disabled={!notaKey} rows={2} placeholder="Ej. Rice y Zubimendi como ejecutores clave del primer pase tras el robo" className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-cyan-500 focus:outline-none resize-y disabled:opacity-50" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {TIPOS.map(t => (
              <div key={t} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">{t === 'Transicion' ? 'Transición' : t}</p>
                <p className="text-2xl font-medium text-white">{countsByTipo[t]}</p>
              </div>
            ))}
          </div>

          {draftMomentos.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Momentos sin guardar — puedes eliminar los que te equivocaste</p>
              <div className="space-y-1.5">
                {draftMomentos.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-300">{m.tipo === 'Transicion' ? 'Transición' : m.tipo} · {ZONA_LABEL[m.zona]} · {m.attr1}{m.attr2 ? ` · ${m.attr2}` : ''}</span>
                    <button onClick={() => eliminarMomento(m.id)} aria-label="Eliminar momento" className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={guardarAnalisis} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
            {saving ? <Spinner /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>}
            Guardar análisis
          </button>
          {saveMsg && <p className={`text-center text-sm ${saveMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{saveMsg.text}</p>}
        </>
      ) : (
        // ═══════════════ REPORTE (auxiliar siempre, admin en modo "Ver reporte") ═══════════════
        <div className="space-y-4">
          <div className="flex gap-2">
            {REPORT_TIPOS.map(t => (
              <button key={t} onClick={() => setRepTipo(t)} className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${repTipo === t ? 'bg-white text-gray-900' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{t}</button>
            ))}
          </div>
          {REPORT_QUESTION[repTipo] && <p className="text-sm text-gray-400 italic">{REPORT_QUESTION[repTipo]}</p>}

          <div className="flex gap-5 flex-wrap items-start">
            <div className="flex-1 min-w-[200px]" style={{ flexBasis: 220 }}>
              <p className="text-xs text-gray-500 mb-2 text-center">Toca una zona de la cancha para ver su detalle</p>
              <svg viewBox="0 0 300 190" className="w-full h-auto block">
                <rect x="2" y="2" width="296" height="186" fill="none" stroke="#4B5563" strokeWidth="1.5" />
                {ZONAS.map((z, i) => (
                  <rect key={z} onClick={() => setRepZona(z)} x={2 + i * 98.7} y="2" width="98.7" height="186"
                    fill={ZONA_COLOR[z]} opacity={repZona === z ? 1 : 0.18}
                    stroke={repZona === z ? '#FFFFFF' : 'none'} strokeWidth={repZona === z ? 3 : 0}
                    style={{ cursor: 'pointer' }} />
                ))}
                {ZONAS.map((z, i) => (
                  <text key={z + '_t'} x={2 + i * 98.7 + 49.35} y="98" textAnchor="middle" fill="#FFFFFF"
                    fontSize={repZona === z ? 15 : 11} fontWeight={repZona === z ? 700 : 400}
                    opacity={repZona === z ? 1 : 0.55} style={{ pointerEvents: 'none' }}>{ZONA_LABEL[z]}</text>
                ))}
                <circle cx="150" cy="95" r="26" fill="none" stroke="#1F2937" strokeWidth="1.5" opacity="0.8" style={{ pointerEvents: 'none' }} />
                <line x1="150" y1="2" x2="150" y2="188" stroke="#1F2937" strokeWidth="1.5" opacity="0.8" style={{ pointerEvents: 'none' }} />
                <rect x="2" y="65" width="18" height="60" fill="none" stroke="#1F2937" strokeWidth="1.5" opacity="0.8" style={{ pointerEvents: 'none' }} />
                <rect x="280" y="65" width="18" height="60" fill="none" stroke="#1F2937" strokeWidth="1.5" opacity="0.8" style={{ pointerEvents: 'none' }} />
              </svg>
            </div>


            <div className="flex-[2] min-w-[240px] bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-xs text-cyan-400 font-medium tracking-wide mb-1">{EYEBROW[repTipo]}</p>
              <p className="text-base font-medium text-white mb-3">{ZONA_LABEL[repZona]}</p>
              {(() => {
                const rep = reportFor(repTipo, repZona);
                if (rep.momentos === 0) {
                  return <p className="text-sm text-gray-500 mb-3">Sin momentos registrados en esta zona todavía.</p>;
                }
                return (
                  <>
                    {rep.attr1Stats.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-1.5">{rep.cfg.lbl1}</p>
                        {rep.attr1Stats.map(s => (
                          <div key={s.label} className="mb-1.5">
                            <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-300">{s.label}</span><span className="text-gray-500">{s.pct}%</span></div>
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${s.pct}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                    {rep.attr2Stats.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-1.5">{rep.cfg.lbl2}</p>
                        {rep.attr2Stats.map(s => (
                          <div key={s.label} className="mb-1.5">
                            <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-300">{s.label}</span><span className="text-gray-500">{s.pct}%</span></div>
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${s.pct}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                    {rep.nota && (
                      <div className="border-t border-gray-700 pt-2 mb-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Nota del analista</p>
                        <p className="text-sm italic text-gray-300">{rep.nota}</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600">{rep.momentos} momentos etiquetados</p>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-xs text-cyan-400 font-medium tracking-wide mb-3">RESUMEN EJECUTIVO — {EYEBROW[repTipo]}</p>
            <div className="space-y-2.5">
              {ZONAS.map(z => (
                <div key={z} className="flex gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm mt-1 flex-shrink-0" style={{ background: ZONA_COLOR[z] }} />
                  <p className="text-sm text-gray-300"><span className="font-medium text-white">{ZONA_LABEL[z]}:</span> {summarizeZone(repTipo, z)}</p>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleExportPDF} className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>Descargar PDF
          </button>
        </div>
      )}
    </div>
  );
};

export default AnalisisRivalPage;




