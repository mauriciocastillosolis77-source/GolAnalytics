import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Player, Match, Tag, AISuggestion } from '../types';
import { METRICS } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { EditIcon, TrashIcon, SparklesIcon, CloudUploadIcon, CloudCheckIcon } from '../components/ui/Icons';
import { analyzeVideoFrames } from '../services/geminiService';
import { analyzeVideoSegment, extractFramesFromSegment, type SegmentAnalysisProgress } from '../services/geminiSegmentService';
import { blobToBase64 } from '../utils/blob';
import AISuggestionsModal from '../components/ai/AISuggestionsModal';
import { fetchVideosForMatch, createVideoForMatch, Video as VideoMeta } from '../services/videosService';
import { fetchTeams, getOrCreateTeam, type Team } from '../services/teamsService';

declare var XLSX: any;

const VideoTaggerPage: React.FC = () => {
    // Section 1: Match Management
    const [matches, setMatches] = useState<Match[]>([]);
    const [selectedMatchId, setSelectedMatchId] = useState<string>('');
    const [isCreatingMatch, setIsCreatingMatch] = useState(false);
    const [newMatchData, setNewMatchData] = useState({
        torneo: '',
        nombre_equipo: '',
        categoria: '',
        fecha: new Date().toISOString().split('T')[0],
        rival: '',
        jornada: 1
    });
    const [isSavingMatch, setIsSavingMatch] = useState(false);
    const [matchCreationError, setMatchCreationError] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);

    // Section 2: File Management
    const [playerUploadStatus, setPlayerUploadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [playerUploadMessage, setPlayerUploadMessage] = useState<string>('');
    const [videoFiles, setVideoFiles] = useState<File[]>([]);
    const [teamUniformFile, setTeamUniformFile] = useState<File | null>(null);
    const [opponentUniformFile, setOpponentUniformFile] = useState<File | null>(null);
    const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
    const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);

    // Video metadata from DB
    const [videos, setVideos] = useState<VideoMeta[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string>('');
    const [selectedVideo, setSelectedVideo] = useState<VideoMeta | null>(null);
    const [showNewVideoModal, setShowNewVideoModal] = useState(false);
    const [newVideoFileName, setNewVideoFileName] = useState('');
    const [newVideoOffset, setNewVideoOffset] = useState('00:00');
    const [isCreatingVideo, setIsCreatingVideo] = useState(false);

    // Section 3: Tagging
    const [players, setPlayers] = useState<Player[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
    const [selectedAction, setSelectedAction] = useState<string>(METRICS[0]);

    // Section 4: AI Analysis
    const [isGeminiAnalyzing, setIsGeminiAnalyzing] = useState(false);
    const [isCustomAnalyzing, setIsCustomAnalyzing] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
    const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
    
    // Batch Analysis State
    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [batchSuggestions, setBatchSuggestions] = useState<any[]>([]);
    const [showBatchResultsModal, setShowBatchResultsModal] = useState(false);
    
    // Segment Analysis State (Gemini Video)
    const [showSegmentModal, setShowSegmentModal] = useState(false);
    const [segmentStartTime, setSegmentStartTime] = useState('00:00');
    const [segmentEndTime, setSegmentEndTime] = useState('05:00');
    const [isSegmentAnalyzing, setIsSegmentAnalyzing] = useState(false);
    const [segmentProgress, setSegmentProgress] = useState<SegmentAnalysisProgress | null>(null);

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [currentTime, setCurrentTime] = useState(0);

    // Fetch matches and teams when component mounts
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const { data: matchesData } = await supabase.from('matches').select('*').order('fecha', { ascending: false });
                setMatches(matchesData || []);
                if (matchesData && matchesData.length > 0 && !selectedMatchId) {
                    setSelectedMatchId(matchesData[0].id);
                }
                
                const teamsData = await fetchTeams();
                setTeams(teamsData);
            } catch (err) {
                console.error('Error fetching matches', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    // When selectedMatchId changes, fetch tags, players and videos
    useEffect(() => {
        if (!selectedMatchId) return;
        const fetchTagsPlayersVideos = async () => {
            setIsLoading(true);
            try {
                const { data: tagsData } = await supabase.from('tags').select('*').eq('match_id', selectedMatchId).order('timestamp', { ascending: true });
                setTags(tagsData || []);
                const { data: playersData } = await supabase.from('players').select('*');
                setPlayers(playersData || []);
                if (playersData && playersData.length > 0 && !selectedPlayerId) {
                    setSelectedPlayerId(playersData[0].id);
                }

                // Fetch videos metadata for the match
                try {
                    const videosData = await fetchVideosForMatch(selectedMatchId);
                    setVideos(videosData || []);
                    if (videosData && videosData.length > 0 && !selectedVideoId) {
                        setSelectedVideoId(videosData[0].id);
                        setSelectedVideo(videosData[0]);
                    } else if (!videosData || videosData.length === 0) {
                        setSelectedVideoId('');
                        setSelectedVideo(null);
                    }
                } catch (err) {
                    console.warn('Could not fetch videos for match', err);
                    setVideos([]);
                    setSelectedVideo(null);
                }
            } catch (err) {
                console.error('Error fetching tags/players/videos', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTagsPlayersVideos();
    }, [selectedMatchId]);

    // Update selectedVideo object when selectedVideoId or videos change
    useEffect(() => {
        if (!selectedVideoId) {
            setSelectedVideo(null);
            return;
        }
        const v = videos.find(x => x.id === selectedVideoId) || null;
        setSelectedVideo(v);
    }, [selectedVideoId, videos]);

    // Handlers for creating a match
    const handleCreateMatch = async () => {
        setIsSavingMatch(true);
        setMatchCreationError(null);
        try {
            const normalizedTeamName = newMatchData.nombre_equipo.trim().toUpperCase();
            const teamId = await getOrCreateTeam(normalizedTeamName);
            
            const matchToInsert = {
                ...newMatchData,
                nombre_equipo: normalizedTeamName,
                team_id: teamId
            };
            
            const { data, error } = await supabase.from('matches').insert([matchToInsert]).select();
            if (error) throw error;
            setMatches(prev => [data[0], ...prev]);
            setSelectedMatchId(data[0].id);
            setIsCreatingMatch(false);
            setNewMatchData({
                torneo: '',
                nombre_equipo: '',
                categoria: '',
                fecha: new Date().toISOString().split('T')[0],
                rival: '',
                jornada: 1
            });
            
            const teamsData = await fetchTeams();
            setTeams(teamsData);
        } catch (err: any) {
            setMatchCreationError(err.message);
        } finally {
            setIsSavingMatch(false);
        }
    };

    // Handler for uploading players via Excel file (sin match_id)
    const handlePlayerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPlayerUploadStatus('loading');
        setPlayerUploadMessage('');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = ev.target?.result;
                if (!data) throw new Error("No se pudo leer el archivo.");

                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (rawData.length < 2) throw new Error("El archivo está vacío.");

                const headers = rawData[0].map(h => String(h).trim().toLowerCase());
                const required = ['nombre', 'numero', 'posicion'];
                if (!required.every(h => headers.includes(h))) {
                    throw new Error(`El archivo debe contener las columnas: ${required.join(', ')}.`);
                }

                const parsedPlayers = rawData.slice(1).map(row => ({
                    nombre: String(row[headers.indexOf('nombre')] || '').trim(),
                    numero: Number(row[headers.indexOf('numero')]),
                    posicion: String(row[headers.indexOf('posicion')] || '').trim()
                }));

                // Obtener team_id del partido seleccionado
                const selectedMatch = matches.find(m => m.id === selectedMatchId);
                if (!selectedMatch?.team_id) {
                    throw new Error("Primero selecciona un partido para asociar los jugadores al equipo.");
                }
                const teamId = selectedMatch.team_id;

                const newPlayers = parsedPlayers.filter(p => p.nombre && !players.some(existing => existing.nombre === p.nombre && existing.numero === p.numero && existing.team_id === teamId));
                
                // Agregar team_id a cada jugador
                const playersWithTeam = newPlayers.map(p => ({ ...p, team_id: teamId }));
                
                if (playersWithTeam.length > 0) {
                    const { data: inserted, error } = await supabase.from('players').insert(playersWithTeam).select();
                    if (error) throw error;
                    setPlayerUploadStatus('success');
                    setPlayerUploadMessage(`✅ ${inserted?.length || 0} nuevos jugadores cargados. ${parsedPlayers.length - newPlayers.length} ya existían.`);
                } else {
                    setPlayerUploadStatus('success');
                    setPlayerUploadMessage(`No se encontraron jugadores nuevos para cargar.`);
                }

                const { data: allPlayers } = await supabase.from('players').select('*');
                setPlayers(allPlayers || []);
                if (allPlayers && allPlayers.length > 0 && !selectedPlayerId) {
                    setSelectedPlayerId(allPlayers[0].id);
                }
            } catch (err: any) {
                setPlayerUploadStatus('error');
                setPlayerUploadMessage(`❌ Error: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Handler for selecting a video file (local)
    const handleVideoSelect = (file: File) => {
        // Solo revoca la URL anterior si hay un video diferente
        if (activeVideoUrl && currentVideoFile && file !== currentVideoFile) {
            URL.revokeObjectURL(activeVideoUrl);
        }
        setActiveVideoUrl(URL.createObjectURL(file));
        setCurrentVideoFile(file);

        // Deselect any registered DB video because user selected a local file
        setSelectedVideoId('');
        setSelectedVideo(null);
    };

    const formatTime = (time: number) => new Date(time * 1000).toISOString().slice(14, 19);

    // Handler for adding a tag (jugada)
    const addTag = () => {
        if (!selectedPlayerId || !videoRef.current) return;

        const actionParts = selectedAction.split(' ');

        // Lógica extendida para transición ofensiva y recuperación de balón
        let resultado = '';
        if (actionParts.includes('logrado')) resultado = 'logrado';
        else if (actionParts.includes('fallado')) resultado = 'fallado';
        else if (selectedAction === "Transición ofensiva lograda") resultado = 'logrado';
        else if (selectedAction === "Transición ofensiva no lograda") resultado = 'no logrado';

        let accion = selectedAction;
        if (
            selectedAction === "Transición ofensiva lograda" ||
            selectedAction === "Transición ofensiva no lograda" ||
            selectedAction === "Recuperación de balón" ||
            selectedAction === "Pérdida de balón"
        ) {
            // Mantener exactamente el texto de la acción para estos casos concretos
            accion = selectedAction;
        } else {
            accion = actionParts.filter(p => p !== 'logrado' && p !== 'fallado').join(' ');
        }

        const relativeTime = Math.floor(videoRef.current.currentTime);
        // Determine video_file and timestamp_absolute
        const videoFileName = selectedVideo?.video_file ?? currentVideoFile?.name ?? null;
        const videoStartOffset = Number(selectedVideo?.start_offset_seconds || 0);
        const timestamp_absolute = (videoFileName ? (videoStartOffset + relativeTime) : undefined);

        const newTag: Tag = {
            id: `temp-${Date.now()}`,
            match_id: selectedMatchId,
            player_id: selectedPlayerId,
            accion: accion,
            resultado: resultado,
            timestamp: relativeTime,
            video_file: videoFileName ?? undefined,
            timestamp_absolute: timestamp_absolute as any
        };
        setTags(prev => [...prev, newTag].sort((a, b) => a.timestamp - b.timestamp));
    };

    // Handler for deleting a tag
    const deleteTag = async (tagToDelete: Tag) => {
        const isSaved = !String(tagToDelete.id).startsWith('temp-');
        if (isSaved) {
            setSaveStatus(null);
            setIsSaving(true);
            const { error } = await supabase.from('tags').delete().eq('id', tagToDelete.id);
            if (error) {
                setSaveStatus({ message: "Error al eliminar la jugada.", type: 'error' });
            } else {
                setTags(prev => prev.filter(t => t.id !== tagToDelete.id));
                setSaveStatus({ message: "Jugada eliminada correctamente.", type: 'success' });
            }
            setIsSaving(false);
        } else {
            setTags(prev => prev.filter(t => t.id !== tagToDelete.id));
        }
    };

    // Handler for saving all tags (jugadas) to DB
    const saveTags = async () => {
        if (tags.length === 0) return;
        setIsSaving(true);
        setSaveStatus(null);
        try {
            const tempTags = tags.filter(t => String(t.id).startsWith('temp-'));
            if (tempTags.length === 0) {
                setIsSaving(false);
                return;
            }

            // Ensure payload includes video_file and timestamp_absolute if present
            const payload = tempTags.map(({ id, ...tag }) => {
                // normalize undefined timestamp_absolute to null if needed
                return {
                    ...tag,
                    timestamp_absolute: (typeof tag.timestamp_absolute === 'number') ? tag.timestamp_absolute : null
                };
            });

            const { error } = await supabase.from('tags').insert(payload);
            if (error) throw error;
            // Re-fetch tags after saving to get their real IDs
            const { data: savedTags } = await supabase.from('tags').select('*').eq('match_id', selectedMatchId).order('timestamp', { ascending: true });
            setTags(savedTags || []);
            setSaveStatus({ message: "Jugadas guardadas correctamente.", type: 'success' });
        } catch (err) {
            console.error('Error saving tags', err);
            setSaveStatus({ message: "Error al guardar jugadas.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Handler to create a new video metadata record
    const handleCreateVideo = async () => {
        if (!newVideoFileName || !selectedMatchId) {
            alert('Ingrese nombre del archivo y seleccione un partido.');
            return;
        }
        
        const selectedMatch = matches.find(m => m.id === selectedMatchId);
        if (!selectedMatch?.team_id) {
            alert('El partido seleccionado no tiene un equipo asociado. Por favor, verifica los datos del partido.');
            return;
        }
        
        setIsCreatingVideo(true);
        try {
            const created = await createVideoForMatch(selectedMatchId, selectedMatch.team_id, newVideoFileName, newVideoOffset, null);
            setVideos(prev => [...prev, created]);
            setSelectedVideoId(created.id);
            setSelectedVideo(created);
            setShowNewVideoModal(false);
            setNewVideoFileName('');
            setNewVideoOffset('00:00');
        } catch (err: any) {
            console.error('Error creating video metadata', err);
            alert('Error creando video: ' + (err?.message || String(err)));
        } finally {
            setIsCreatingVideo(false);
        }
    };

    // Handler for AI-assisted analysis
    const handleAIAssistedAnalysis = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsGeminiAnalyzing(true);
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) return;

            const frames: { data: string; mimeType: string }[] = [];
            const frameCount = 8, interval = 2, startTime = Math.max(0, video.currentTime - (frameCount * interval));
            video.pause();

            for (let i = 0; i < frameCount; i++) {
                video.currentTime = startTime + i * interval;
                await new Promise(r => setTimeout(r, 200));
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
                if (blob) {
                    const base64 = await blobToBase64(blob);
                    if (base64) frames.push({ data: base64, mimeType: 'image/jpeg' });
                }
            }

            if (frames.length > 0) {
                const suggestions = await analyzeVideoFrames(frames, tags);
                setAiSuggestions(suggestions);
                if (suggestions.length > 0) setIsSuggestionsModalOpen(true);
                else alert("La IA no encontró nuevas jugadas para sugerir.");
            }
        } catch (error) {
            console.error("Error during AI analysis:", error);
            alert("Ocurrió un error durante el análisis de IA.");
        } finally {
            setIsGeminiAnalyzing(false);
            videoRef.current?.play();
        }
    };
// Handler for AI analysis using our trained model
    const handleCustomModelAnalysis = async () => {
        if (!videoRef.current) return;
        
        setIsCustomAnalyzing(true);
        
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas?.getContext('2d');
            
            if (!context) {
                setIsCustomAnalyzing(false);
                return;
            }
            
            // Capture current frame
            video.pause();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert to base64
            const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
            if (!blob) {
                alert("No se pudo capturar el frame");
                setIsCustomAnalyzing(false);
                return;
            }
            
            const base64 = await blobToBase64(blob);
            if (!base64) {
                alert("Error al procesar la imagen");
                setIsCustomAnalyzing(false);
                return;
            }
            
            // Call our API
           const response = await fetch('https://peaceful-art-production.up.railway.app/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: base64,
                    timestamp: formatTime(video.currentTime)
                })
            });
            
            const result = await response.json();
            
            if (!response.ok || !result.success) {
                console.error('Railway API error - Status:', response.status, 'Response:', result);
                const errorMsg = result.error && result.error !== "0" 
                    ? result.error 
                    : result.message 
                    || `Error en el modelo de Railway (Status: ${response.status}). El modelo v1.0 tiene baja precisión (56%) y puede fallar. Se espera v2.0 con mejor entrenamiento.`;
                throw new Error(errorMsg);
            }
            
            if (result.predictions && result.predictions.length > 0) {
                // Convert predictions to suggestions format
                const suggestions: AISuggestion[] = result.predictions.map((pred: any) => ({
                    timestamp: formatTime(video.currentTime),
                    action: pred.action,
                    confidence: Math.round(pred.probability * 100)
                }));
                
                setAiSuggestions(suggestions);
                setIsSuggestionsModalOpen(true);
            } else {
                alert("El modelo no detectó acciones con suficiente confianza en este frame. Prueba con otro momento del video o usa el botón Gemini.");
            }
            
        } catch (error) {
            console.error("Error during custom model analysis:", error);
            alert("Ocurrió un error durante el análisis con el modelo personalizado.");
        } finally {
            setIsCustomAnalyzing(false);
        }
    };
    // Handler for Batch Analysis (analyze entire video)
    const handleBatchAnalysis = async () => {
        if (!videoRef.current || !canvasRef.current) {
            alert("No hay video cargado");
            return;
        }
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        const videoDuration = video.duration;
        if (!videoDuration || videoDuration === 0) {
            alert("No se pudo obtener la duración del video");
            return;
        }
        
        setIsBatchAnalyzing(true);
        setBatchSuggestions([]);
        
        try {
            // Extract frames every 2 seconds
            const frameInterval = 2;
            const totalFrames = Math.floor(videoDuration / frameInterval);
            setBatchProgress({ current: 0, total: totalFrames });
            
            const frames: any[] = [];
            video.pause();
            
            // Extract all frames
            for (let i = 0; i < totalFrames; i++) {
                const timestamp = i * frameInterval;
                video.currentTime = timestamp;
                await new Promise(r => setTimeout(r, 300));
                
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
                if (blob) {
                    const base64 = await blobToBase64(blob);
                    if (base64) {
                        frames.push({
                            image: base64,
                            timestamp: timestamp
                        });
                    }
                }
                
                setBatchProgress({ current: i + 1, total: totalFrames });
            }
            
            // Process frames in batches of 10
            const batchSize = 10;
            const allResults: any[] = [];
            
            for (let i = 0; i < frames.length; i += batchSize) {
                const batch = frames.slice(i, i + batchSize);
                
                try {
                    const response = await fetch('https://peaceful-art-production.up.railway.app/analyze-batch', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            frames: batch
                        })
                    });
                    
                    if (!response.ok) {
                        console.error('Error en batch', i / batchSize + 1);
                        continue;
                    }
                    
                    const result = await response.json();
                    
                    if (result.success && result.results) {
                        allResults.push(...result.results);
                    }
                } catch (error) {
                    console.error(`Error processing batch ${i / batchSize + 1}:`, error);
                }
                
                setBatchProgress({ current: i + batch.length, total: totalFrames });
            }
            
            // Filter for high-confidence predictions
            const suggestions = allResults
                .filter(r => r.predictions && r.predictions.length > 0 && r.predictions[0].probability > 0.20)
                .map(r => ({
                    timestamp: r.timestamp,
                    action: r.predictions[0].action,
                    confidence: Math.round(r.predictions[0].probability * 100),
                    predictions: r.predictions,
                    accepted: false
                }));
            
            setBatchSuggestions(suggestions);
            setShowBatchResultsModal(true);
            
            if (suggestions.length === 0) {
                alert("No se encontraron jugadas con suficiente confianza");
            }
            
        } catch (error) {
            console.error("Error during batch analysis:", error);
            alert("Ocurrió un error durante el análisis en batch");
        } finally {
            setIsBatchAnalyzing(false);
            setBatchProgress({ current: 0, total: 0 });
        }
    };

    // Handler for Segment Analysis (Gemini Video)
    const handleSegmentAnalysis = async () => {
        if (!videoRef.current || !canvasRef.current) {
            alert("No hay video cargado");
            return;
        }

        const parseTime = (timeStr: string): number => {
            const parts = timeStr.split(':').map(Number);
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            return 0;
        };

        const startSeconds = parseTime(segmentStartTime);
        const endSeconds = parseTime(segmentEndTime);
        
        if (endSeconds <= startSeconds) {
            alert("El tiempo final debe ser mayor que el tiempo inicial");
            return;
        }
        
        const duration = endSeconds - startSeconds;
        if (duration > 600) {
            alert("El segmento no puede ser mayor a 10 minutos. Por favor, selecciona un rango más pequeño.");
            return;
        }

        setIsSegmentAnalyzing(true);
        setSegmentProgress({ phase: 'extracting', framesExtracted: 0, totalFrames: duration, message: 'Iniciando...' });
        
        try {
            const frames = await extractFramesFromSegment(
                videoRef.current,
                canvasRef.current,
                startSeconds,
                endSeconds,
                1,
                setSegmentProgress
            );
            
            if (frames.length === 0) {
                alert("No se pudieron extraer frames del segmento");
                return;
            }
            
            const suggestions = await analyzeVideoSegment(
                frames,
                startSeconds,
                endSeconds,
                tags,
                setSegmentProgress
            );
            
            if (suggestions.length > 0) {
                setAiSuggestions(suggestions);
                setIsSuggestionsModalOpen(true);
                setShowSegmentModal(false);
            } else {
                alert("Gemini no encontró jugadas significativas en este segmento. Intenta con otro rango de tiempo.");
            }
        } catch (error) {
            console.error("Error durante análisis de segmento:", error);
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsSegmentAnalyzing(false);
            setSegmentProgress(null);
        }
    };
    
    const handleAcceptSuggestion = (suggestion: AISuggestion) => {
        // Convertir formato: "1_vs_1_ofensivo" → "1 vs 1 ofensivo"
        let accionBase = suggestion.action.replace(/_/g, ' ');
        
        // Buscar si la acción base existe con "logrado" o "fallado"
        const opcionLogrado = `${accionBase} logrado`;
        const opcionFallado = `${accionBase} fallado`;
        
        let accionFinal = '';
        
        // Verificar qué opciones existen
        if (METRICS.includes(accionBase)) {
            // La acción existe tal cual (ej: "Recuperación de balón")
            accionFinal = accionBase;
        } else if (METRICS.includes(opcionLogrado) || METRICS.includes(opcionFallado)) {
            // La acción necesita logrado/fallado - usar la primera que exista
            if (METRICS.includes(opcionLogrado)) {
                accionFinal = opcionLogrado;
            } else {
                accionFinal = opcionFallado;
            }
        } else {
            // Acción no encontrada en ningún formato
            alert(`Acción "${accionBase}" no encontrada. Las opciones más cercanas son:\n- ${opcionLogrado}\n- ${opcionFallado}\n\nPor favor, selecciona manualmente.`);
            handleRejectSuggestion(suggestion);
            return;
        }
        
        // Pre-llenar el formulario con la acción sugerida
        setSelectedAction(accionFinal);
        
        // Mover el video al timestamp de la sugerencia
        if (videoRef.current) {
            const timeParts = suggestion.timestamp.split(':').map(Number);
            const timestamp = timeParts.length === 2 ? timeParts[0] * 60 + timeParts[1] : 0;
            videoRef.current.currentTime = timestamp;
        }
        
        // Cerrar modal y remover sugerencia
        setIsSuggestionsModalOpen(false);
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
        
        // Mensaje informativo
        alert(`Acción "${accionFinal}" seleccionada. Verifica si es correcta y ajusta "logrado/fallado" si es necesario antes de etiquetar.`);
    };

    const handleRejectSuggestion = (suggestion: AISuggestion) => {
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
    };

    if (isLoading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

    return (
        <div className="flex h-full gap-4 p-4">
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
            {isSuggestionsModalOpen && (
                <AISuggestionsModal
                    suggestions={aiSuggestions}
                    onAccept={handleAcceptSuggestion}
                    onReject={handleRejectSuggestion}
                    onClose={() => setIsSuggestionsModalOpen(false)}
                />
            )}

            {/* Left Column: Video and Tagged Plays */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="bg-gray-800 rounded-lg p-4 flex flex-col">
                    {/* VIDEO, altura fija */}
                    <div className="min-h-[300px] max-h-[350px] flex items-center justify-center bg-black rounded-md">
                        {activeVideoUrl ? (
                            <video
                                ref={videoRef}
                                src={activeVideoUrl}
                                controls
                                className="max-h-full w-full"
                                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                            ></video>
                        ) : selectedVideo ? (
                            // Note: registered video metadata does not contain the actual file blob.
                            // We still allow tagging based on metadata (video_file + start_offset_seconds).
                            <div className="text-center text-gray-300">
                                <div className="mb-2">Video seleccionado: <strong className="text-white">{selectedVideo.video_file}</strong></div>
                                <div className="text-sm">Offset inicio: {selectedVideo.start_offset_seconds}s</div>
                                <p className="mt-4">Para reproducir el archivo completo, carga el archivo localmente en "Videos del Partido".</p>
                            </div>
                        ) : (
                            <p className="text-gray-400">Seleccione un partido y cargue videos para empezar</p>
                        )}
                    </div>
                    {/* BOTÓN seguro */}
                    <button
                        onClick={() => {
                            if (!activeVideoUrl) return;
                            window.open(activeVideoUrl, '_blank');
                        }}
                        disabled={!activeVideoUrl}
                        className="mt-4 w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded"
                    >
                        Abrir video en ventana nueva
                    </button>
                    {/* LISTA DE JUGADAS debajo, scroll propio */}
                    <div className="h-[200px] overflow-y-auto mt-4 bg-gray-900 rounded p-2">
                        <h3 className="text-lg font-semibold mb-2 text-white">Jugadas Etiquetadas</h3>
                        {tags.length > 0 ? tags.map(tag => {
                            const isSuccess = tag.resultado === 'logrado';
                            const isFailure = tag.resultado === 'fallado';
                            const isSaved = !String(tag.id).startsWith('temp-');
                            const borderColor = isSuccess ? 'border-green-500' : isFailure ? 'border-red-500' : 'border-gray-500';
                            return (
                                <div
                                    key={tag.id}
                                    className={`flex items-center justify-between mb-2 p-2 border-l-4 ${borderColor} bg-gray-700 rounded`}
                                >
                                    <div className="flex-1">
                                        <span className="font-semibold">{players.find(p => p.id === tag.player_id)?.nombre || "Jugador"}</span>
                                        <span className="text-xs text-gray-300 ml-2">{formatTime(tag.timestamp)}</span>
                                        <div className="text-xs text-gray-300">{tag.accion} {tag.resultado && <span className={isSuccess ? 'text-green-300' : 'text-red-300'}>{tag.resultado}</span>}</div>
                                        {tag.video_file && <div className="text-xs text-gray-400 mt-1">Video: {tag.video_file} — ts_abs: {tag.timestamp_absolute ?? 'N/A'}</div>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => deleteTag(tag)}
                                            disabled={isSaving}
                                            className="p-1 text-red-300 hover:text-red-500"
                                            title="Eliminar"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            );
                        }) : (
                            <p className="text-gray-400 text-center mt-4">Aún no se han etiquetado jugadas para este partido.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Management Panels */}
            <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
                {/* 1. Gestión del Partido */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">1. Gestión del Partido</h3>
                    <select value={selectedMatchId} onChange={e => setSelectedMatchId(e.target.value)} className="w-full bg-gray-700 p-2 rounded mb-2">
                        {matches.length === 0 && <option>Cree un partido para empezar</option>}
                        {matches.map(m => (
                            <option key={m.id} value={m.id}>{m.torneo} - {m.nombre_equipo} vs {m.rival} ({m.fecha})</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setIsCreatingMatch(v => !v)}
                        className="w-full mt-2 bg-blue-600 hover:bg-blue-500 p-2 rounded font-semibold flex items-center justify-center gap-2"
                    >
                        <CloudUploadIcon />
                        {isCreatingMatch ? "Cancelar" : "Crear Nuevo Partido"}
                    </button>
                    {isCreatingMatch && (
                        <div className="mt-2 space-y-2">
                            <input type="text" placeholder="Torneo" value={newMatchData.torneo} onChange={e => setNewMatchData({ ...newMatchData, torneo: e.target.value })} className="w-full bg-gray-700 p-2 rounded" />
                            <div>
                                <input 
                                    type="text" 
                                    placeholder="Mi Equipo" 
                                    value={newMatchData.nombre_equipo} 
                                    onChange={e => setNewMatchData({ ...newMatchData, nombre_equipo: e.target.value })} 
                                    className="w-full bg-gray-700 p-2 rounded" 
                                    list="teams-list"
                                />
                                <datalist id="teams-list">
                                    {teams.map(team => (
                                        <option key={team.id} value={team.nombre} />
                                    ))}
                                </datalist>
                                <p className="text-xs text-gray-400 mt-1">Selecciona un equipo existente o escribe uno nuevo</p>
                            </div>
                            <input type="text" placeholder="Categoría" value={newMatchData.categoria} onChange={e => setNewMatchData({ ...newMatchData, categoria: e.target.value })} className="w-full bg-gray-700 p-2 rounded" />
                            <input type="date" value={newMatchData.fecha} onChange={e => setNewMatchData({ ...newMatchData, fecha: e.target.value })} className="w-full bg-gray-700 p-2 rounded" />
                            <input type="text" placeholder="Rival" value={newMatchData.rival} onChange={e => setNewMatchData({ ...newMatchData, rival: e.target.value })} className="w-full bg-gray-700 p-2 rounded" />
                            <input type="number" placeholder="Jornada" value={newMatchData.jornada} onChange={e => setNewMatchData({ ...newMatchData, jornada: parseInt(e.target.value) || 1 })} className="w-full bg-gray-700 p-2 rounded" />
                            <button onClick={handleCreateMatch} className="w-full bg-green-600 hover:bg-green-500 p-2 rounded font-semibold text-white flex items-center justify-center gap-2" disabled={isSavingMatch}>
                                <CloudCheckIcon />
                                Guardar Partido
                                {isSavingMatch && <Spinner size="h-4 w-4" />}
                            </button>
                            {matchCreationError && <div className="text-red-400 text-xs">{matchCreationError}</div>}
                        </div>
                    )}
                </div>

                {/* 2. Carga de Archivos */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">2. Carga de Archivos</h3>
                    <label className="block text-sm text-gray-400 mb-1">Jugadores (Excel)</label>
                    <div className="flex items-center gap-2">
                        <input type="file" accept=".xlsx,.xls" onChange={handlePlayerFileChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500 disabled:opacity-50" disabled={playerUploadStatus === 'loading'} />
                        {playerUploadStatus === 'loading' && <Spinner size="h-4 w-4" />}
                    </div>
                    {playerUploadMessage && <p className={`text-xs pt-1 ${playerUploadStatus === 'success' ? 'text-green-400' : playerUploadStatus === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{playerUploadMessage}</p>}
                    <label className="block text-sm text-gray-400 mt-4 mb-1">Videos del Partido (local)</label>
                    <input type="file" multiple accept="video/*" onChange={e => setVideoFiles(Array.from(e.target.files || []))} className="w-full text-sm file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
                    <div className="mt-2 max-h-24 overflow-y-auto">
                        {videoFiles.map(f => (
                            <button key={f.name} onClick={() => handleVideoSelect(f)} className="text-left text-xs text-cyan-400 hover:underline w-full truncate p-1 rounded hover:bg-gray-700">{f.name}</button>
                        ))}
                    </div>

                    <label className="block text-sm text-gray-400 mt-4 mb-1">Videos registrados (metadatos)</label>
                    <div className="flex gap-2 items-center">
                        <select value={selectedVideoId} onChange={e => setSelectedVideoId(e.target.value)} className="flex-1 bg-gray-700 p-2 rounded">
                            <option value="">-- Seleccione video registrado --</option>
                            {videos.map(v => (
                                <option key={v.id} value={v.id}>{v.video_file} (offset: {v.start_offset_seconds}s)</option>
                            ))}
                        </select>
                        <button onClick={() => setShowNewVideoModal(true)} className="ml-2 bg-indigo-600 hover:bg-indigo-500 p-2 rounded text-white text-sm">Registrar nuevo</button>
                    </div>

                    <label className="block text-sm text-gray-400 mt-4 mb-1">Mi equipo (uniforme)</label>
                    <input type="file" accept="image/*" onChange={e => setTeamUniformFile(e.target.files?.[0] || null)} className="w-full text-sm file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
                    <label className="block text-sm text-gray-400 mt-4 mb-1">Equipo Rival (uniforme)</label>
                    <input type="file" accept="image/*" onChange={e => setOpponentUniformFile(e.target.files?.[0] || null)} className="w-full text-sm file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
                </div>

                {/* 3. Etiquetar Jugada */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">3. Etiquetar Jugada</h3>
                    <label className="block text-sm text-gray-400 mb-1">Jugador</label>
                    <select value={selectedPlayerId} onChange={e => setSelectedPlayerId(e.target.value)} className="w-full bg-gray-700 p-2 rounded mb-2" disabled={players.length === 0}>
                        {players.length > 0 ? players.map(p => (
                            <option key={p.id} value={p.id}>{p.numero} - {p.nombre}</option>
                        )) : <option>Cargue archivo de jugadores</option>}
                    </select>
                    <label className="block text-sm text-gray-400 mb-1">Acción</label>
                    <select value={selectedAction} onChange={e => setSelectedAction(e.target.value)} className="w-full bg-gray-700 p-2 rounded mb-4">
                        {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button onClick={addTag} disabled={!selectedPlayerId || !selectedAction || (!activeVideoUrl && !selectedVideo)} className="w-full bg-green-600 hover:bg-green-500 p-2 rounded font-semibold text-white flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        Etiquetar Jugada
                    </button>
                    <button onClick={saveTags} disabled={isSaving || tags.filter(t => String(t.id).startsWith('temp-')).length === 0} className="mt-2 w-full bg-blue-600 hover:bg-blue-500 p-2 rounded font-semibold text-white flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        Guardar Jugadas
                        {isSaving && <Spinner size="h-4 w-4" />}
                    </button>
                    {saveStatus && (
                        <div className={`mt-3 p-2 rounded text-center text-sm ${saveStatus.type === 'success' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                            {saveStatus.message}
                        </div>
                    )}
                </div>

                {/* 4. Analisis Asistido por IA */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">Análisis Asistido por IA (Beta)</h3>
                    <p className="text-xs text-gray-400 mb-4">La IA puede sugerir jugadas. Puedes aceptar o rechazar las sugerencias.</p>
                    
                    {/* Segment Analysis Button (Gemini) - RECOMMENDED */}
                    <button 
                        onClick={() => setShowSegmentModal(true)} 
                        disabled={(!activeVideoUrl && !selectedVideo) || isSegmentAnalyzing || !selectedMatchId} 
                        className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 p-3 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed mb-3"
                    >
                        <SparklesIcon />Analizar Segmento (Gemini) ⚡
                    </button>
                    <p className="text-xs text-emerald-400 mb-4 text-center">Recomendado: Selecciona un rango de 5-10 min para análisis preciso</p>
                    
                    {/* Batch Analysis Button */}
                    <button 
                        onClick={handleBatchAnalysis} 
                        disabled={!activeVideoUrl || isBatchAnalyzing || !selectedMatchId} 
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 p-3 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed mb-3"
                    >
                        {isBatchAnalyzing ? <><Spinner /> Analizando partido...</> : <><SparklesIcon />Analizar Partido Completo 🚀</>}
                    </button>
                    
                    {/* Progress Bar */}
                    {isBatchAnalyzing && batchProgress.total > 0 && (
                        <div className="mb-3">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Progreso: {batchProgress.current} / {batchProgress.total} frames</span>
                                <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                                <div 
                                    className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                    
                    <button onClick={handleAIAssistedAnalysis} disabled={!activeVideoUrl && !selectedVideo || isGeminiAnalyzing || !selectedMatchId} className="w-full bg-purple-600 hover:bg-purple-500 p-2 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        {isGeminiAnalyzing ? <><Spinner /> Analizando...</> : <><SparklesIcon />Sugerir Acciones</>}
                    </button>
<button 
                        onClick={handleCustomModelAnalysis} 
                        disabled={!activeVideoUrl && !selectedVideo || isCustomAnalyzing || !selectedMatchId} 
                        className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 p-2 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isCustomAnalyzing ? <><Spinner /> Analizando...</> : <><SparklesIcon />Modelo Personalizado (74% Top-3)</>}
                    </button>
                </div>
            </div>

            {/* Batch Results Modal */}
            {showBatchResultsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-white">
                                ✨ Sugerencias del Análisis Completo ({batchSuggestions.length} jugadas)
                            </h3>
                            <button onClick={() => setShowBatchResultsModal(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                        </div>
                        
                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-700 sticky top-0">
                                    <tr>
                                        <th className="p-2 text-left">Tiempo</th>
                                        <th className="p-2 text-left">Acción</th>
                                        <th className="p-2 text-left">Confianza</th>
                                        <th className="p-2 text-left">Alt 2</th>
                                        <th className="p-2 text-left">Alt 3</th>
                                        <th className="p-2 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchSuggestions.map((sugg, idx) => (
                                        <tr key={idx} className={`border-b border-gray-700 ${sugg.accepted ? 'bg-green-900 bg-opacity-20' : ''}`}>
                                            <td className="p-2">{Math.floor(sugg.timestamp / 60)}:{String(sugg.timestamp % 60).padStart(2, '0')}</td>
                                            <td className="p-2 font-semibold">{sugg.action.replace(/_/g, ' ')}</td>
                                            <td className="p-2">
                                                <span className={`px-2 py-1 rounded text-xs ${sugg.confidence >= 70 ? 'bg-green-600' : sugg.confidence >= 50 ? 'bg-yellow-600' : 'bg-orange-600'}`}>
                                                    {sugg.confidence}%
                                                </span>
                                            </td>
                                            <td className="p-2 text-xs text-gray-400">
                                                {sugg.predictions[1] && `${sugg.predictions[1].action.replace(/_/g, ' ')} (${Math.round(sugg.predictions[1].probability * 100)}%)`}
                                            </td>
                                            <td className="p-2 text-xs text-gray-400">
                                                {sugg.predictions[2] && `${sugg.predictions[2].action.replace(/_/g, ' ')} (${Math.round(sugg.predictions[2].probability * 100)}%)`}
                                            </td>
                                            <td className="p-2 text-center">
                                                <button 
                                                    onClick={() => {
                                                        // Set video to this timestamp and pre-fill action
                                                        if (videoRef.current) {
                                                            videoRef.current.currentTime = sugg.timestamp;
                                                        }
                                                        const actionName = sugg.action.replace(/_/g, ' ');
                                                        const matchingMetric = METRICS.find(m => m.toLowerCase().includes(actionName.toLowerCase()));
                                                        if (matchingMetric) {
                                                            setSelectedAction(matchingMetric);
                                                        }
                                                        setBatchSuggestions(prev => prev.map((s, i) => i === idx ? {...s, accepted: true} : s));
                                                    }}
                                                    disabled={sugg.accepted}
                                                    className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs disabled:bg-gray-600 disabled:cursor-not-allowed mr-2"
                                                >
                                                    {sugg.accepted ? '✓' : 'Aceptar'}
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        setBatchSuggestions(prev => prev.filter((_, i) => i !== idx));
                                                    }}
                                                    className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                                                >
                                                    ✗
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {batchSuggestions.length === 0 && (
                                <p className="text-center text-gray-400 py-8">No hay sugerencias para mostrar</p>
                            )}
                        </div>
                        
                        <div className="mt-4 flex gap-2 justify-end">
                            <button onClick={() => setShowBatchResultsModal(false)} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Segment Analysis Modal */}
            {showSegmentModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-[450px]">
                        <h3 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                            <SparklesIcon /> Analizar Segmento con Gemini
                        </h3>
                        
                        <p className="text-sm text-gray-400 mb-4">
                            Selecciona el rango de tiempo del video que quieres analizar. 
                            Gemini extraerá 1 frame por segundo y detectará las jugadas.
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Tiempo Inicio (MM:SS)</label>
                                <input 
                                    type="text" 
                                    value={segmentStartTime} 
                                    onChange={e => setSegmentStartTime(e.target.value)}
                                    placeholder="00:00"
                                    className="w-full bg-gray-700 p-2 rounded text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Tiempo Fin (MM:SS)</label>
                                <input 
                                    type="text" 
                                    value={segmentEndTime} 
                                    onChange={e => setSegmentEndTime(e.target.value)}
                                    placeholder="05:00"
                                    className="w-full bg-gray-700 p-2 rounded text-white"
                                />
                            </div>
                        </div>
                        
                        <div className="bg-gray-700 p-3 rounded mb-4">
                            <p className="text-xs text-gray-300">
                                <strong>Recomendaciones:</strong>
                            </p>
                            <ul className="text-xs text-gray-400 mt-1 list-disc list-inside">
                                <li>Segmentos de 5 minutos: ~300 frames, alta precisión</li>
                                <li>Segmentos de 10 minutos: ~600 frames, muy buena precisión</li>
                                <li>Máximo permitido: 10 minutos por análisis</li>
                            </ul>
                        </div>
                        
                        {isSegmentAnalyzing && segmentProgress && (
                            <div className="mb-4">
                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                    <span>{segmentProgress.message}</span>
                                    <span>{segmentProgress.framesExtracted}/{segmentProgress.totalFrames}</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2">
                                    <div 
                                        className="bg-gradient-to-r from-emerald-600 to-cyan-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${(segmentProgress.framesExtracted / segmentProgress.totalFrames) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex gap-2 justify-end">
                            <button 
                                onClick={() => setShowSegmentModal(false)} 
                                disabled={isSegmentAnalyzing}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSegmentAnalysis}
                                disabled={isSegmentAnalyzing}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 rounded text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                            >
                                {isSegmentAnalyzing ? <><Spinner size="h-4 w-4" /> Analizando...</> : 'Iniciar Análisis'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* New Video modal */}
            {showNewVideoModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded p-6 w-[420px]">
                        <h3 className="text-lg font-semibold mb-3">Registrar nuevo video</h3>
                        <input placeholder="Nombre del archivo (ej. VID_20251021_1.mp4)" className="w-full bg-gray-700 p-2 rounded mb-2" value={newVideoFileName} onChange={e => setNewVideoFileName(e.target.value)} />
                        <input placeholder="Inicio del video (MM:SS)" className="w-full bg-gray-700 p-2 rounded mb-4" value={newVideoOffset} onChange={e => setNewVideoOffset(e.target.value)} />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowNewVideoModal(false)} className="px-3 py-2 bg-gray-600 rounded">Cancelar</button>
                            <button onClick={handleCreateVideo} disabled={isCreatingVideo || !newVideoFileName} className="px-3 py-2 bg-green-600 rounded text-white">{isCreatingVideo ? <Spinner /> : 'Crear'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoTaggerPage;

