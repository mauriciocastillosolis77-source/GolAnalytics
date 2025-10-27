import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Player, Match, Tag, AISuggestion } from '../types';
import { METRICS } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { EditIcon, TrashIcon, SparklesIcon, CloudUploadIcon, CloudCheckIcon } from '../components/ui/Icons';
import { analyzeVideoFrames } from '../services/geminiService';
import { analyzeWithLearning } from '../services/aiLearningService';
import { useAuth } from '../contexts/AuthContext';
import { blobToBase64 } from '../utils/blob';
import AISuggestionsModal from '../components/ai/AISuggestionsModal';
import { fetchVideosForMatch, createVideoForMatch, Video as VideoMeta } from '../services/videosService';

declare var XLSX: any;

const VideoTaggerPage: React.FC = () => {
const { user } = useAuth();
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
    const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
    const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);

    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [currentTime, setCurrentTime] = useState(0);

    // Fetch matches when component mounts
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const { data: matchesData } = await supabase.from('matches').select('*').order('fecha', { ascending: false });
                setMatches(matchesData || []);
                if (matchesData && matchesData.length > 0 && !selectedMatchId) {
                    setSelectedMatchId(matchesData[0].id);
                }
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
            const { data, error } = await supabase.from('matches').insert([newMatchData]).select();
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

                const newPlayers = parsedPlayers.filter(p => p.nombre && !players.some(existing => existing.nombre === p.nombre && existing.numero === p.numero));
                if (newPlayers.length > 0) {
                    const { data: inserted, error } = await supabase.from('players').insert(newPlayers).select();
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
        setIsCreatingVideo(true);
        try {
            const created = await createVideoForMatch(selectedMatchId, newVideoFileName, newVideoOffset, null);
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

   // Handler for AI-assisted analysis (CON APRENDIZAJE)
    const handleAIAssistedAnalysis = async () => {
        if (!videoRef.current || !user) {
            alert('Debes estar autenticado para usar la IA');
            return;
        }
        
        setIsAnalyzingAI(true);
        try {
            const videoUrl = activeVideoUrl;
            if (!videoUrl) {
                alert('Carga un video primero');
                return;
            }

            const currentTime = Math.floor(videoRef.current.currentTime);
            
            console.log('🧠 Analizando con IA + aprendizaje...');
            
            // Usar el nuevo servicio con aprendizaje contextual
            const suggestions = await analyzeWithLearning(
                videoUrl,
                currentTime,
                selectedMatchId,
                user.id
            );

            if (suggestions.length > 0) {
                // Convertir formato de sugerencias al formato que espera tu modal
                const formattedSuggestions = suggestions.map(s => ({
                    id: s.id,
                    action: s.metric_name,
                    timestamp: formatTime(s.timestamp),
                    confidence: Math.round(s.confidence * 100),
                    reasoning: s.reasoning
                }));
                
                setAiSuggestions(formattedSuggestions as any);
                setIsSuggestionsModalOpen(true);
                
                console.log(`✅ ${suggestions.length} sugerencias recibidas`);
            } else {
                alert("La IA no encontró jugadas en este momento. Prueba en otro momento del video.");
            }
            
        } catch (error: any) {
            console.error("Error durante análisis de IA:", error);
            alert(error?.message || "Error al analizar con IA. Verifica tu API Key.");
        } finally {
            setIsAnalyzingAI(false);
        }
    };
    };

   const handleAcceptSuggestion = async (suggestion: AISuggestion) => {
        if (!user) return;
        
        const timeParts = suggestion.timestamp.split(':').map(Number);
        const timestamp = timeParts.length === 2 ? timeParts[0] * 60 + timeParts[1] : 0;

        const fullAction = suggestion.action;
        if (!METRICS.includes(fullAction)) {
            handleRejectSuggestion(suggestion);
            return;
        }
        
        const actionParts = fullAction.split(' ');

        // Lógica extendida para transición ofensiva y recuperación de balón
        let resultado = '';
        if (actionParts.includes('logrado')) resultado = 'logrado';
        else if (actionParts.includes('fallado')) resultado = 'fallado';
        else if (fullAction === "Transición ofensiva lograda") resultado = 'logrado';
        else if (fullAction === "Transición ofensiva no lograda") resultado = 'no logrado';

        let accion = fullAction;
        if (
            fullAction === "Transición ofensiva lograda" ||
            fullAction === "Transición ofensiva no lograda" ||
            fullAction === "Recuperación de balón" ||
            fullAction === "Pérdida de balón"
        ) {
            accion = fullAction;
        } else {
            accion = actionParts.filter(p => p !== 'logrado' && p !== 'fallado').join(' ');
        }

        const relativeTime = timestamp;
        const videoFileName = selectedVideo?.video_file ?? currentVideoFile?.name ?? null;
        const videoStartOffset = Number(selectedVideo?.start_offset_seconds || 0);
        const timestamp_absolute = (videoFileName ? (videoStartOffset + relativeTime) : undefined);

        const newTag: Tag = {
            id: `temp-ai-${Date.now()}`,
            match_id: selectedMatchId,
            player_id: selectedPlayerId,
            accion: accion,
            resultado: resultado,
            timestamp: relativeTime,
            video_file: videoFileName ?? undefined,
            timestamp_absolute: timestamp_absolute as any
        };
        
        setTags(prev => [...prev, newTag].sort((a, b) => a.timestamp - b.timestamp));
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
        
        // 🧠 GUARDAR FEEDBACK: Aceptada
        try {
            const { saveFeedback } = await import('../services/aiLearningService');
            await saveFeedback(
                {
                    suggestion_id: (suggestion as any).id || `temp-${Date.now()}`,
                    accepted: true
                },
                user.id
            );
            console.log('✅ Feedback guardado: Aceptada');
        } catch (err) {
            console.error('Error guardando feedback:', err);
        }
    };

    const handleRejectSuggestion = async (suggestion: AISuggestion) => {
        if (!user) return;
        
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
        
        // 🧠 GUARDAR FEEDBACK: Rechazada
        try {
            const { saveFeedback } = await import('../services/aiLearningService');
            await saveFeedback(
                {
                    suggestion_id: (suggestion as any).id || `temp-${Date.now()}`,
                    accepted: false,
                    user_notes: 'Sugerencia rechazada por el usuario'
                },
                user.id
            );
            console.log('❌ Feedback guardado: Rechazada');
        } catch (err) {
            console.error('Error guardando feedback:', err);
        }
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
                            <input type="text" placeholder="Mi Equipo" value={newMatchData.nombre_equipo} onChange={e => setNewMatchData({ ...newMatchData, nombre_equipo: e.target.value })} className="w-full bg-gray-700 p-2 rounded" />
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
                    <button onClick={handleAIAssistedAnalysis} disabled={!activeVideoUrl && !selectedVideo || isAnalyzingAI || !selectedMatchId} className="w-full bg-purple-600 hover:bg-purple-500 p-2 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        {isAnalyzingAI ? <><Spinner /> Analizando...</> : <><SparklesIcon />Sugerir Acciones</>}
                    </button>
                </div>
            </div>

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
