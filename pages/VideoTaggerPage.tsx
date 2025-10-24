import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Player, Match, Tag, AISuggestion } from '../types';
import { METRICS } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { EditIcon, TrashIcon, SparklesIcon, CloudUploadIcon, CloudCheckIcon } from '../components/ui/Icons';
import { analyzeVideoFrames } from '../services/geminiService';
import { blobToBase64 } from '../utils/blob';
import AISuggestionsModal from '../components/ai/AISuggestionsModal';
import { fetchVideosForMatch, createVideoForMatch, Video as VideoMeta } from '../services/videosService';
import { buildLearningContext, saveFeedback, getLearningStats, type LearningContext } from '../services/aiLearningService';

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

    // Section 4: AI Analysis with Learning
    const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
    const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
    const [learningContext, setLearningContext] = useState<LearningContext | null>(null);
    const [isLoadingContext, setIsLoadingContext] = useState(false);
    const [learningStats, setLearningStats] = useState<{
        totalFeedback: number;
        acceptanceRate: number;
        mostAcceptedActions: Array<{action: string; count: number}>;
        improvementTrend: number;
    } | null>(null);

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

    // When selectedMatchId changes, fetch tags, players, videos and learning context
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

                // Load learning context
                setIsLoadingContext(true);
                try {
                    const context = await buildLearningContext(selectedMatchId);
                    setLearningContext(context);
                    console.log('🧠 Learning context loaded:', {
                        historicalPlays: context.historicalTags.length,
                        teamPatterns: context.teamPatterns.length,
                        successRate: `${(context.successRate * 100).toFixed(1)}%`
                    });
                } catch (err) {
                    console.warn('Could not load learning context:', err);
                    setLearningContext(null);
                } finally {
                    setIsLoadingContext(false);
                }

                // Load learning stats
                try {
                    const stats = await getLearningStats();
                    setLearningStats(stats);
                } catch (err) {
                    console.warn('Could not load learning stats:', err);
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
            console.error('Error creating match:', err);
            setMatchCreationError(err.message || 'Error al crear el partido');
        } finally {
            setIsSavingMatch(false);
        }
    };

    // Handlers for creating a video metadata entry
    const handleCreateVideo = async () => {
        if (!newVideoFileName || !selectedMatchId) return;
        setIsCreatingVideo(true);
        try {
            const offsetParts = newVideoOffset.split(':').map(Number);
            const offsetSeconds = offsetParts.length === 2 ? offsetParts[0] * 60 + offsetParts[1] : 0;
            const newVideo = await createVideoForMatch(selectedMatchId, newVideoFileName, offsetSeconds);
            setVideos(prev => [...prev, newVideo]);
            setSelectedVideoId(newVideo.id);
            setSelectedVideo(newVideo);
            setShowNewVideoModal(false);
            setNewVideoFileName('');
            setNewVideoOffset('00:00');
        } catch (err) {
            console.error('Error creating video:', err);
            alert('Error al registrar el video.');
        } finally {
            setIsCreatingVideo(false);
        }
    };

    const handlePlayerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPlayerUploadStatus('loading');
        setPlayerUploadMessage('Leyendo archivo...');
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
            if (rows.length === 0) {
                setPlayerUploadStatus('error');
                setPlayerUploadMessage('No hay datos en el archivo.');
                return;
            }
            const playersToInsert = rows.map(r => ({
                nombre: r.Nombre || r.nombre || 'Sin nombre',
                numero: Number(r.Numero || r.numero) || 0,
                posicion: r.Posicion || r.posicion || ''
            }));
            const { error } = await supabase.from('players').insert(playersToInsert);
            if (error) throw error;
            const { data: newPlayers } = await supabase.from('players').select('*');
            setPlayers(newPlayers || []);
            setPlayerUploadStatus('success');
            setPlayerUploadMessage(`${playersToInsert.length} jugador(es) cargados exitosamente.`);
        } catch (error: any) {
            console.error('Error uploading players:', error);
            setPlayerUploadStatus('error');
            setPlayerUploadMessage(error.message || 'Error al cargar el archivo.');
        }
    };

    const handleVideoSelect = (file: File) => {
        const url = URL.createObjectURL(file);
        setActiveVideoUrl(url);
        setCurrentVideoFile(file);
    };

    const addTag = () => {
        if (!selectedPlayerId || !selectedAction) return;
        const time = videoRef.current?.currentTime || 0;
        const tempId = `temp-${Date.now()}`;
        const actionParts = selectedAction.split(' ');
        let resultado = '';
        if (actionParts.includes('logrado')) resultado = 'logrado';
        else if (actionParts.includes('fallado')) resultado = 'fallado';
        let accion = actionParts.filter(p => p !== 'logrado' && p !== 'fallado').join(' ');
        if (!accion) accion = selectedAction;
        const newTag: Tag = {
            id: tempId,
            match_id: selectedMatchId,
            player_id: selectedPlayerId,
            accion,
            resultado,
            timestamp: time,
            video_file: selectedVideo?.video_file,
            timestamp_absolute: selectedVideo ? selectedVideo.start_offset_seconds + time : time
        };
        setTags(prev => [...prev, newTag]);
    };

    const deleteTag = (tagId: string | number) => {
        setTags(prev => prev.filter(t => t.id !== tagId));
    };

    const saveTags = async () => {
        const unsaved = tags.filter(t => String(t.id).startsWith('temp-'));
        if (unsaved.length === 0) return;
        setIsSaving(true);
        setSaveStatus(null);
        try {
            const toInsert = unsaved.map(t => ({
                match_id: t.match_id,
                player_id: t.player_id,
                accion: t.accion,
                resultado: t.resultado,
                timestamp: t.timestamp,
                video_file: t.video_file,
                timestamp_absolute: t.timestamp_absolute
            }));
            const { data, error } = await supabase.from('tags').insert(toInsert).select();
            if (error) throw error;
            const savedIds = new Set(unsaved.map(t => t.id));
            setTags(prev => [...prev.filter(t => !savedIds.has(t.id)), ...(data || [])]);
            setSaveStatus({ message: `${data?.length || 0} jugadas guardadas correctamente.`, type: 'success' });
        } catch (err: any) {
            console.error('Error saving tags:', err);
            setSaveStatus({ message: err.message || 'Error al guardar las jugadas.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const exportToExcel = () => {
        const dataToExport = tags.map(t => ({
            Jugador: players.find(p => p.id === t.player_id)?.nombre || t.player_id,
            Accion: t.accion,
            Resultado: t.resultado || '',
            Timestamp: t.timestamp.toFixed(2),
            Video: t.video_file || '',
            TimestampAbsoluto: t.timestamp_absolute !== undefined ? t.timestamp_absolute.toFixed(2) : ''
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Tags');
        XLSX.writeFile(wb, 'tags_export.xlsx');
    };

    // ==========================================
    // AI ANALYSIS WITH LEARNING CONTEXT
    // ==========================================
    const handleAIAssistedAnalysis = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsAnalyzingAI(true);
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) return;

            console.log('🎬 Starting AI analysis with learning context...');

            const frames: { data: string; mimeType: string }[] = [];
            const frameCount = 8, interval = 2, startTime = Math.max(0, video.currentTime - (frameCount * interval));
            video.pause();

            // Capture frames
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
                // Use enhanced AI analysis with learning context
                const suggestions = await analyzeVideoFrames(
                    frames, 
                    tags, 
                    learningContext || undefined,
                    players,
                    video.currentTime
                );
                
                setAiSuggestions(suggestions);
                if (suggestions.length > 0) {
                    console.log(`✅ AI suggested ${suggestions.length} plays`);
                    setIsSuggestionsModalOpen(true);
                } else {
                    alert("La IA no encontró nuevas jugadas para sugerir.");
                }
            }
        } catch (error) {
            console.error("Error during AI analysis:", error);
            alert("Ocurrió un error durante el análisis de IA.");
        } finally {
            setIsAnalyzingAI(false);
            videoRef.current?.play();
        }
    };

    const handleAcceptSuggestion = async (suggestion: AISuggestion) => {
        const timeParts = suggestion.timestamp.split(':').map(Number);
        const timestamp = timeParts.length === 2 ? timeParts[0] * 60 + timeParts[1] : 0;

        const fullAction = suggestion.action;
        if (!METRICS.includes(fullAction)) {
            console.warn('Action not in METRICS, rejecting:', fullAction);
            await handleRejectSuggestion(suggestion);
            return;
        }

        const actionParts = fullAction.split(' ');
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

        if (!accion) accion = fullAction;

        const tempId = `temp-${Date.now()}`;
        const newTag: Tag = {
            id: tempId,
            match_id: selectedMatchId,
            player_id: selectedPlayerId || players[0]?.id || '',
            accion,
            resultado,
            timestamp: timestamp,
            video_file: selectedVideo?.video_file,
            timestamp_absolute: selectedVideo ? selectedVideo.start_offset_seconds + timestamp : timestamp
        };

        setTags(prev => [...prev, newTag]);
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));

        // Save feedback: suggestion was accepted
        try {
            await saveFeedback({
                match_id: selectedMatchId,
                suggestion_timestamp: timestamp,
                suggested_action: fullAction,
                suggested_player_id: selectedPlayerId || players[0]?.id,
                was_accepted: true,
                actual_action: accion,
                actual_player_id: selectedPlayerId || players[0]?.id
            });
            console.log('✅ Positive feedback saved for AI learning');
            
            // Refresh learning stats
            const stats = await getLearningStats();
            setLearningStats(stats);
        } catch (err) {
            console.error('Error saving feedback:', err);
        }
    };

    const handleRejectSuggestion = async (suggestion: AISuggestion) => {
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));

        // Save feedback: suggestion was rejected
        try {
            const timeParts = suggestion.timestamp.split(':').map(Number);
            const timestamp = timeParts.length === 2 ? timeParts[0] * 60 + timeParts[1] : 0;

            await saveFeedback({
                match_id: selectedMatchId,
                suggestion_timestamp: timestamp,
                suggested_action: suggestion.action,
                suggested_player_id: selectedPlayerId || players[0]?.id,
                was_accepted: false
            });
            console.log('❌ Negative feedback saved for AI learning');
            
            // Refresh learning stats
            const stats = await getLearningStats();
            setLearningStats(stats);
        } catch (err) {
            console.error('Error saving feedback:', err);
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center h-screen"><Spinner /></div>;
    }

    return (
        <div className="flex flex-col lg:flex-row h-screen overflow-hidden">
            {/* Suggestions Modal */}
            {isSuggestionsModalOpen && (
                <AISuggestionsModal
                    suggestions={aiSuggestions}
                    onAccept={handleAcceptSuggestion}
                    onReject={handleRejectSuggestion}
                    onClose={() => setIsSuggestionsModalOpen(false)}
                />
            )}

            {/* Video Section */}
            <div className="flex-1 bg-black flex items-center justify-center relative">
                {activeVideoUrl || selectedVideo ? (
                    <>
                        <video
                            ref={videoRef}
                            src={activeVideoUrl || ''}
                            controls
                            className="max-w-full max-h-full"
                            onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                        />
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                    </>
                ) : (
                    <div className="text-gray-400 text-center p-4">
                        <p className="text-lg">No hay video seleccionado</p>
                        <p className="text-sm mt-2">Carga un archivo de video desde el panel lateral</p>
                    </div>
                )}

                {/* Time Display */}
                {(activeVideoUrl || selectedVideo) && (
                    <div className="absolute bottom-16 left-4 bg-black bg-opacity-70 px-3 py-1 rounded text-white text-sm">
                        Tiempo: {currentTime.toFixed(1)}s
                    </div>
                )}
            </div>

            {/* Control Panel */}
            <div className="w-full lg:w-96 bg-gray-900 p-4 overflow-y-auto space-y-4">
                <h2 className="text-2xl font-bold text-white mb-4">Control de Etiquetado</h2>

                {/* 1. Selección de Partido */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">1. Seleccionar Partido</h3>
                    <select value={selectedMatchId} onChange={e => setSelectedMatchId(e.target.value)} className="w-full bg-gray-700 p-2 rounded mb-2">
                        {matches.map(m => (
                            <option key={m.id} value={m.id}>{m.torneo} - {m.nombre_equipo} vs {m.rival} (J{m.jornada})</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setIsCreatingMatch(!isCreatingMatch)}
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

                {/* 4. Análisis Asistido por IA con Aprendizaje */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">🧠 Análisis Asistido por IA (con Aprendizaje)</h3>
                    
                    {/* Learning Stats Display */}
                    {learningStats && learningStats.totalFeedback > 0 && (
                        <div className="mb-4 p-3 bg-gray-700 rounded text-xs space-y-1">
                            <div className="flex justify-between">
                                <span className="text-gray-300">Precisión de IA:</span>
                                <span className={`font-bold ${learningStats.acceptanceRate > 0.7 ? 'text-green-400' : learningStats.acceptanceRate > 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {(learningStats.acceptanceRate * 100).toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-300">Sugerencias totales:</span>
                                <span className="text-blue-400">{learningStats.totalFeedback}</span>
                            </div>
                            {learningStats.improvementTrend !== 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-300">Tendencia:</span>
                                    <span className={learningStats.improvementTrend > 0 ? 'text-green-400' : 'text-red-400'}>
                                        {learningStats.improvementTrend > 0 ? '↗' : '↘'} {Math.abs(learningStats.improvementTrend * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Context Loading Indicator */}
                    {isLoadingContext && (
                        <div className="mb-3 p-2 bg-blue-900 bg-opacity-30 rounded text-xs text-blue-300 flex items-center gap-2">
                            <Spinner size="h-3 w-3" />
                            <span>Cargando contexto de aprendizaje...</span>
                        </div>
                    )}

                    {/* Learning Context Summary */}
                    {learningContext && (
                        <div className="mb-3 p-2 bg-purple-900 bg-opacity-30 rounded text-xs text-purple-300">
                            <div className="flex items-center gap-1 mb-1">
                                <span>🎓</span>
                                <span className="font-semibold">Entrenado con:</span>
                            </div>
                            <div className="ml-5 space-y-0.5 text-gray-400">
                                <div>• {learningContext.historicalTags.length} jugadas históricas</div>
                                <div>• {learningContext.teamPatterns.length} patrones de equipo</div>
                                <div>• {Object.keys(learningContext.playerPreferences).length} perfiles de jugadores</div>
                            </div>
                        </div>
                    )}

                    <p className="text-xs text-gray-400 mb-4">
                        La IA aprende de tus correcciones y mejora sus sugerencias con cada partido.
                    </p>
                    
                    <button 
                        onClick={handleAIAssistedAnalysis} 
                        disabled={!activeVideoUrl && !selectedVideo || isAnalyzingAI || !selectedMatchId || isLoadingContext} 
                        className="w-full bg-purple-600 hover:bg-purple-500 p-2 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isAnalyzingAI ? (
                            <>
                                <Spinner /> 
                                Analizando con IA...
                            </>
                        ) : (
                            <>
                                <SparklesIcon />
                                {learningContext ? 'Sugerir Acciones (IA Entrenada)' : 'Sugerir Acciones'}
                            </>
                        )}
                    </button>
                </div>

                {/* 5. Tags List */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-white">Jugadas Etiquetadas ({tags.length})</h3>
                        <button onClick={exportToExcel} className="text-xs bg-green-700 hover:bg-green-600 px-2 py-1 rounded">Exportar Excel</button>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                        {tags.length === 0 && <p className="text-gray-500 text-sm">No hay jugadas etiquetadas.</p>}
                        {tags.map(tag => {
                            const player = players.find(p => p.id === tag.player_id);
                            const isTemp = String(tag.id).startsWith('temp-');
                            return (
                                <div key={tag.id} className={`flex items-center justify-between p-2 rounded ${isTemp ? 'bg-yellow-900 bg-opacity-30' : 'bg-gray-700'}`}>
                                    <div className="flex-1 text-xs">
                                        <div className="font-semibold text-white">{player ? `${player.numero} - ${player.nombre}` : 'Desconocido'}</div>
                                        <div className="text-gray-400">{tag.accion} {tag.resultado && `(${tag.resultado})`}</div>
                                        <div className="text-gray-500">{tag.timestamp.toFixed(2)}s</div>
                                    </div>
                                    <button onClick={() => deleteTag(tag.id)} className="text-red-400 hover:text-red-300">
                                        <TrashIcon />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
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
