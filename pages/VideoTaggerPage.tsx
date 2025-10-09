import React, { useState, useRef, useEffect, useMemo } from 'react';
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

    const hasUnsavedChanges = useMemo(() => tags.some(tag => String(tag.id).startsWith('temp-')), [tags]);

    // Initial data fetching for matches and players (runs only once)
    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            
            const { data: matchesData } = await supabase.from('matches').select('*').order('fecha', { ascending: false });
            setMatches(matchesData || []);
            if (matchesData && matchesData.length > 0) {
                setSelectedMatchId(matchesData[0].id);
            }

            const { data: playersData } = await supabase.from('players').select('*');
            setPlayers(playersData || []);
            if(playersData && playersData.length > 0) {
                setSelectedPlayerId(playersData[0].id);
            }
            
            setIsLoading(false);
        };
        fetchInitialData();
    }, []);

    // Fetch tags ONLY when a match is selected
    useEffect(() => {
        if (!selectedMatchId) {
            setTags([]);
            return;
        };

        const fetchTagsForMatch = async () => {
            const { data: tagsData } = await supabase.from('tags').select('*').eq('match_id', selectedMatchId).order('timestamp', { ascending: true });
            setTags(tagsData || []);
        };
        fetchTagsForMatch();
    }, [selectedMatchId]);
    
    const handleCreateMatch = async () => {
        setMatchCreationError(null);
        if (!newMatchData.torneo || !newMatchData.nombre_equipo || !newMatchData.rival) {
            setMatchCreationError('Por favor, completa al menos los campos Torneo, Mi equipo y Rival.');
            return;
        }
        
        setIsSavingMatch(true);
        const matchToInsert = { ...newMatchData };

        try {
            const { data, error } = await supabase.from('matches').insert([matchToInsert]).select();
            
            if (error) throw error;
            
            if (data) {
                setMatches(prev => [data[0], ...prev]);
                setSelectedMatchId(data[0].id);
                setIsCreatingMatch(false);
                setNewMatchData({
                    torneo: '', nombre_equipo: '', categoria: '', fecha: new Date().toISOString().split('T')[0], rival: '', jornada: 1
                });
            }
        } catch (error: any) {
             console.error("Error creating match:", error);
             setMatchCreationError(`Error: ${error.message}.`);
        } finally {
            setIsSavingMatch(false);
        }
    };

    const handlePlayerFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ''; 
        if (!file) {
            setPlayerUploadStatus('idle');
            return;
        }

        setPlayerUploadStatus('loading');
        setPlayerUploadMessage('Procesando archivo...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = e.target?.result;
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
                    posicion: String(row[headers.indexOf('posicion')] || '').trim(),
                })).filter(p => p.nombre && !isNaN(p.numero));

                if (parsedPlayers.length === 0) throw new Error("No se encontraron jugadores válidos.");
                
                const { data: existingPlayers, error: fetchError } = await supabase.from('players').select('nombre');
                if (fetchError) throw fetchError;
                
                const existingNames = new Set(existingPlayers?.map(p => p.nombre) || []);
                const newPlayers = parsedPlayers.filter(p => !existingNames.has(p.nombre));

                if (newPlayers.length === 0) {
                    setPlayerUploadStatus('success');
                    setPlayerUploadMessage(`✅ Todos los ${parsedPlayers.length} jugadores ya existen.`);
                } else {
                    const { data: inserted, error } = await supabase.from('players').insert(newPlayers).select();
                    if (error) throw error;
                    setPlayerUploadStatus('success');
                    setPlayerUploadMessage(`✅ ${inserted?.length || 0} nuevos jugadores cargados. ${parsedPlayers.length - newPlayers.length} ya existían.`);
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

    const handleVideoSelect = (file: File) => {
        if (activeVideoUrl) URL.revokeObjectURL(activeVideoUrl);
        setActiveVideoUrl(URL.createObjectURL(file));
    }
    
    const formatTime = (time: number) => new Date(time * 1000).toISOString().slice(14, 19);
    
    const addTag = () => {
        if (!selectedPlayerId || !videoRef.current) return;

        const actionParts = selectedAction.split(' ');
        const resultado = actionParts.includes('logrado') ? 'logrado' : (actionParts.includes('fallado') ? 'fallado' : '');
        const accion = actionParts.filter(p => p !== 'logrado' && p !== 'fallado').join(' ');

        const newTag: Tag = {
            id: `temp-${Date.now()}`,
            match_id: selectedMatchId,
            player_id: selectedPlayerId,
            accion: accion,
            resultado: resultado,
            timestamp: videoRef.current.currentTime
        };
        setTags(prev => [...prev, newTag].sort((a,b) => a.timestamp - b.timestamp));
    }
    
    const deleteTag = async (tagToDelete: Tag) => {
        const isSaved = !String(tagToDelete.id).startsWith('temp-');
        // If it's a saved tag, delete from DB immediately
        if (isSaved) {
            setSaveStatus(null);
            setIsSaving(true);
            const { error } = await supabase.from('tags').delete().eq('id', tagToDelete.id);
            setIsSaving(false);
            if(error) {
                setSaveStatus({ message: `Error al borrar: ${error.message}`, type: 'error' });
                return;
            }
        }
        // Always remove from local state
        setTags(currentTags => currentTags.filter(t => t.id !== tagToDelete.id));
    }
    
    const handleSaveProgress = async (isFinal = false) => {
        if (!selectedMatchId) return;
        setIsSaving(true);
        setSaveStatus(null);
    
        try {
            const newTags = tags.filter(t => String(t.id).startsWith('temp-')).map(({ id, ...rest }) => rest);
            const savedTags = tags.filter(t => !String(t.id).startsWith('temp-'));
            
            if (newTags.length > 0) {
                const { data: insertedTags, error } = await supabase.from('tags').insert(newTags).select();
                if (error) throw error;
                setTags([...savedTags, ...insertedTags].sort((a, b) => a.timestamp - b.timestamp));
            }
    
            setSaveStatus({ message: `✅ ${isFinal ? 'Análisis finalizado y guardado' : 'Avances guardados'} en la base de datos.`, type: 'success' });
            if (isFinal) {
                // Potentially navigate away or lock the match
            }
        } catch (error: any) {
            console.error("Error saving progress:", error);
            setSaveStatus({ message: `❌ Error al guardar: ${error.message}`, type: 'error' });
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus(null), 5000); // Clear status after 5 seconds
        }
    };
    
    const handleAIAssistedAnalysis = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setIsAnalyzingAI(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        const frames: { data: string; mimeType: string }[] = [];
        const frameCount = 8, interval = 2, startTime = Math.max(0, video.currentTime - (frameCount * interval));
        video.pause();

        try {
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
            video.play();
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
        const resultado = actionParts.includes('logrado') ? 'logrado' : (actionParts.includes('fallado') ? 'fallado' : '');
        const accion = actionParts.filter(p => p !== 'logrado' && p !== 'fallado').join(' ');

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


    if (isLoading) return <div className="flex items-center justify-center h-full"><Spinner /></div>

    return (
        <div className="flex h-full gap-4 p-4">
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
             {isSuggestionsModalOpen && (
                <AISuggestionsModal suggestions={aiSuggestions} onAccept={handleAcceptSuggestion} onReject={handleRejectSuggestion} onClose={() => setIsSuggestionsModalOpen(false)} />
            )}

            {/* Left Column: Video and Tagged Plays */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="bg-gray-800 rounded-lg p-4 flex-1 flex flex-col">
                    <div className="flex-1 flex items-center justify-center bg-black rounded-md">
                        {activeVideoUrl ? (
                            <video ref={videoRef} src={activeVideoUrl} controls className="max-h-full w-full" onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}></video>
                        ) : (
                             <p className="text-gray-400">Seleccione un partido y cargue videos para empezar</p>
                        )}
                    </div>
                     <button onClick={() => activeVideoUrl && window.open(activeVideoUrl)} disabled={!activeVideoUrl} className="mt-4 w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded">
                        Abrir video en ventana nueva
                    </button>
                </div>
                <div className="bg-gray-800 rounded-lg p-4 h-1/3 flex flex-col">
                     <h3 className="text-lg font-semibold mb-2 text-white">Jugadas Etiquetadas</h3>
                     <div className="overflow-y-auto pr-2">
                        {tags.length > 0 ? tags.map(tag => {
                            const isSuccess = tag.resultado === 'logrado';
                            const isFailure = tag.resultado === 'fallado';
                            const isSaved = !String(tag.id).startsWith('temp-');
                            const borderColor = isSuccess ? 'border-green-500' : isFailure ? 'border-red-500' : 'border-gray-500';

                            return (
                                <div key={tag.id} className={`flex items-center justify-between p-2 rounded mb-1 border-l-4 ${borderColor} bg-gray-700`}>
                                    <div className="flex items-center gap-2">
                                        {isSaved ? <CloudCheckIcon className="text-green-400" title="Guardado en la base de datos" /> : <CloudUploadIcon className="text-yellow-400" title="Cambio sin guardar"/>}
                                        <div>
                                            <span className="font-bold text-cyan-400">{formatTime(tag.timestamp)}</span>
                                            <span className="text-sm text-gray-300 ml-2">{players.find(p => p.id === tag.player_id)?.nombre} - {tag.accion} {tag.resultado}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="text-gray-400 hover:text-white disabled:opacity-50" disabled={!isSaved}><EditIcon /></button>
                                        <button onClick={() => deleteTag(tag)} className="text-red-400 hover:text-red-600"><TrashIcon /></button>
                                    </div>
                                </div>
                            )
                        }) : <p className="text-gray-400 text-center mt-4">Aún no se han etiquetado jugadas para este partido.</p>}
                     </div>
                </div>
            </div>

            {/* Right Column: Management Panels */}
            <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
                
                {/* 1. Gestion del Partido */}
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2 text-white">1. Gestión del Partido</h3>
                    <select value={selectedMatchId} onChange={e => setSelectedMatchId(e.target.value)} className="w-full bg-gray-700 p-2 rounded mb-2">
                        {matches.length === 0 && <option>Cree un partido para empezar</option>}
                        {matches.map(m => <option key={m.id} value={m.id}>{`J${m.jornada}: ${m.nombre_equipo} vs ${m.rival}`}</option>)}
                    </select>
                    <button onClick={() => setIsCreatingMatch(o => !o)} className="w-full bg-cyan-700 hover:bg-cyan-600 p-2 rounded">{isCreatingMatch ? 'Cancelar' : 'Crear Nuevo Partido'}</button>
                    {isCreatingMatch && (
                        <div className="mt-4 space-y-3">
                             <input type="text" placeholder="Torneo" value={newMatchData.torneo} onChange={e => setNewMatchData({...newMatchData, torneo: e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
                             <input type="text" placeholder="Mi equipo" value={newMatchData.nombre_equipo} onChange={e => setNewMatchData({...newMatchData, nombre_equipo: e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
                             <input type="text" placeholder="Categoría" value={newMatchData.categoria} onChange={e => setNewMatchData({...newMatchData, categoria: e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
                             <input type="date" value={newMatchData.fecha} onChange={e => setNewMatchData({...newMatchData, fecha: e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
                             <input type="text" placeholder="Rival" value={newMatchData.rival} onChange={e => setNewMatchData({...newMatchData, rival: e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
                             <input type="number" placeholder="Jornada" value={newMatchData.jornada} onChange={e => setNewMatchData({...newMatchData, jornada: parseInt(e.target.value) || 1})} className="w-full bg-gray-700 p-2 rounded" />
                             <button onClick={handleCreateMatch} disabled={isSavingMatch} className="w-full bg-green-600 hover:bg-green-500 p-2 rounded flex items-center justify-center disabled:bg-gray-500">{isSavingMatch ? <Spinner /> : 'Guardar Partido'}</button>
                             {matchCreationError && <p className="text-red-400 text-sm mt-2">{matchCreationError}</p>}
                        </div>
                    )}
                </div>

                {/* 2. Cargar Archivos */}
                 <div className="bg-gray-800 rounded-lg p-4">
                     <h3 className="text-lg font-semibold mb-2 text-white">2. Cargar Archivos</h3>
                     <label className="block text-sm text-gray-400 mb-1">Base de Datos de Jugadores (.xlsx)</label>
                     <div className="flex items-center gap-2">
                         <input type="file" accept=".xlsx,.xls" onChange={handlePlayerFileChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500 disabled:opacity-50" disabled={playerUploadStatus === 'loading'} />
                         {playerUploadStatus === 'loading' && <Spinner size="h-4 w-4" />}
                     </div>
                     {playerUploadMessage && <p className={`text-xs pt-1 ${playerUploadStatus === 'success' ? 'text-green-400' : playerUploadStatus === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{playerUploadMessage}</p>}
                     <label className="block text-sm text-gray-400 mt-4 mb-1">Videos del Partido</label>
                     <input type="file" multiple accept="video/*" onChange={e => setVideoFiles(Array.from(e.target.files || []))} className="w-full text-sm file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
                     <div className="mt-2 max-h-24 overflow-y-auto">{videoFiles.map(f => <button key={f.name} onClick={() => handleVideoSelect(f)} className="text-left text-xs text-cyan-400 hover:underline w-full truncate p-1 rounded hover:bg-gray-700">{f.name}</button>)}</div>
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
                        {players.length > 0 ? players.map(p => <option key={p.id} value={p.id}>{p.numero} - {p.nombre}</option>) : <option>Cargue archivo de jugadores</option>}
                     </select>
                     <label className="block text-sm text-gray-400 mb-1">Acción</label>
                     <select value={selectedAction} onChange={e => setSelectedAction(e.target.value)} className="w-full bg-gray-700 p-2 rounded mb-4">
                         {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
                     </select>
                     <button onClick={addTag} disabled={!activeVideoUrl || players.length === 0 || !selectedMatchId} className="w-full bg-cyan-600 hover:bg-cyan-500 p-2 rounded font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">Etiquetar Acción ({formatTime(currentTime)})</button>
                     <button onClick={() => handleSaveProgress(false)} disabled={isSaving || !hasUnsavedChanges} className="w-full mt-2 bg-blue-600 hover:bg-blue-500 p-2 rounded font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">{isSaving ? <Spinner /> : 'Guardar Avances'}</button>
                     <button onClick={() => handleSaveProgress(true)} disabled={isSaving || !hasUnsavedChanges} className="w-full mt-2 bg-green-600 hover:bg-green-500 p-2 rounded font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed">{isSaving ? <Spinner /> : 'Finalizar Análisis'}</button>
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
                        {isAnalyzingAI ? <><Spinner/> Analizando...</> : <><SparklesIcon />Sugerir Acciones</> }
                     </button>
                 </div>
            </div>
        </div>
    );
};

export default VideoTaggerPage;