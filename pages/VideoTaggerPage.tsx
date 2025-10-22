import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Player, Match, Tag, AISuggestion } from '../types';
import { METRICS } from '../constants';
import { Spinner } from '../components/ui/Spinner';
import { EditIcon, TrashIcon, SparklesIcon, CloudUploadIcon, CloudCheckIcon } from '../components/ui/Icons';
import { analyzeVideoFrames } from '../services/geminiService';
import { blobToBase64 } from '../utils/blob';
import AISuggestionsModal from '../components/ai/AISuggestionsModal';

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

    // Fetch matches and players when component mounts
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            const { data: matchesData } = await supabase.from('matches').select('*').order('fecha', { ascending: false });
            setMatches(matchesData || []);
            if (matchesData && matchesData.length > 0 && !selectedMatchId) {
                setSelectedMatchId(matchesData[0].id);
            }
            setIsLoading(false);
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (!selectedMatchId) return;
        const fetchTagsAndPlayers = async () => {
            setIsLoading(true);
            const { data: tagsData } = await supabase.from('tags').select('*').eq('match_id', selectedMatchId).order('timestamp', { ascending: true });
            setTags(tagsData || []);
            const { data: playersData } = await supabase.from('players').select('*');
            setPlayers(playersData || []);
            if (playersData && playersData.length > 0 && !selectedPlayerId) {
                setSelectedPlayerId(playersData[0].id);
            }
            setIsLoading(false);
        };
        fetchTagsAndPlayers();
    }, [selectedMatchId]);

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

                // CORREGIDO: Quitamos match_id
                const parsedPlayers = rawData.slice(1).map(row => ({
                    nombre: String(row[headers.indexOf('nombre')] || '').trim(),
                    numero: Number(row[headers.indexOf('numero')]),
                    posicion: String(row[headers.indexOf('posicion')] || '').trim()
                }));

                // Validación básica para evitar nombres vacíos
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

    // Handler for selecting a video file
    const handleVideoSelect = (file: File) => {
        // Solo revoca la URL anterior si hay un video diferente
        if (activeVideoUrl && currentVideoFile && file !== currentVideoFile) {
            URL.revokeObjectURL(activeVideoUrl);
        }
        setActiveVideoUrl(URL.createObjectURL(file));
        setCurrentVideoFile(file);
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

        const newTag: Tag = {
            id: `temp-${Date.now()}`,
            match_id: selectedMatchId,
            player_id: selectedPlayerId,
            accion: accion,
            resultado: resultado,
            timestamp: videoRef.current.currentTime
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
            if (tempTags.length === 0) return;
            const { error } = await supabase.from('tags').insert(tempTags.map(({ id, ...tag }) => tag));
            if (error) throw error;
            // Re-fetch tags after saving to get their real IDs
            const { data: savedTags } = await supabase.from('tags').select('*').eq('match_id', selectedMatchId).order('timestamp', { ascending: true });
            setTags(savedTags || []);
            setSaveStatus({ message: "Jugadas guardadas correctamente.", type: 'success' });
        } catch (err) {
            setSaveStatus({ message: "Error al guardar jugadas.", type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Handler for AI-assisted analysis
    const handleAIAssistedAnalysis = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsAnalyzingAI(true);
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
            setIsAnalyzingAI(false);
            videoRef.current?.play();
        }
    };

    const handleAcceptSuggestion = (suggestion: AISuggestion) => {
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

        const newTag: Tag = {
            id: `temp-ai-${Date.now()}`,
            match_id: selectedMatchId,
            player_id: selectedPlayerId,
            accion: accion,
            resultado: resultado,
            timestamp: timestamp,
        };
        setTags(prev => [...prev, newTag].sort((a, b) => a.timestamp - b.timestamp));
        setAiSuggestions(prev => prev.filter(s => s !== suggestion));
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
                        ) : (
                            <p className="text-gray-400">Seleccione un partido y cargue videos para empezar</p>
                        )}
                    </div>
                    {/* BOTÓN seguro */}
                    <button
                        onClick={() => {
                            if (!activeVideoUrl) return;
                            window.open(activeVideoUrl, '_blank');
                            // NO revocamos la URL ni cambiamos el estado aquí
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
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Opcional: Agregar edición */}
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
                    <label className="block text-sm text-gray-400 mt-4 mb-1">Videos del Partido</label>
                    <input type="file" multiple accept="video/*" onChange={e => setVideoFiles(Array.from(e.target.files || []))} className="w-full text-sm file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
                    <div className="mt-2 max-h-24 overflow-y-auto">
                        {videoFiles.map(f => (
                            <button key={f.name} onClick={() => handleVideoSelect(f)} className="text-left text-xs text-cyan-400 hover:underline w-full truncate p-1 rounded hover:bg-gray-700">{f.name}</button>
                        ))}
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
                    <button onClick={addTag} disabled={!selectedPlayerId || !selectedAction || !activeVideoUrl} className="w-full bg-green-600 hover:bg-green-500 p-2 rounded font-semibold text-white flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
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
                    <button onClick={handleAIAssistedAnalysis} disabled={!activeVideoUrl || isAnalyzingAI || !selectedMatchId} className="w-full bg-purple-600 hover:bg-purple-500 p-2 rounded font-semibold flex items-center justify-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed">
                        {isAnalyzingAI ? <><Spinner /> Analizando...</> : <><SparklesIcon />Sugerir Acciones</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VideoTaggerPage;
