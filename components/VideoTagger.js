import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import * as XLSX from 'xlsx';
import { ActionType } from '../types.js';

const FileInput = ({ label, accept, multiple = false, onChange, disabled = false, helperText }) => (
    React.createElement("div", { className: "w-full" },
        React.createElement("label", { className: "block mb-2 text-sm font-medium text-gray-300" }, label),
        React.createElement("input", {
            className: "block w-full text-sm text-gray-400 border border-gray-600 rounded-lg cursor-pointer bg-[#1e2a47] focus:outline-none placeholder-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed",
            type: "file",
            accept: accept,
            multiple: multiple,
            onChange: (e) => onChange(e.target.files),
            disabled: disabled
        }),
        helperText && React.createElement("p", { className: "mt-1 text-xs text-gray-400" }, helperText)
    )
);


export const VideoTagger = ({ 
    players, setPlayers, addNewTag, matches, setMatches, tags, updateTag, deleteTag,
    addDetectedPlaysToMatch, confirmDetectedPlay, updateAndConfirmDetectedPlay, deleteDetectedPlay,
    toggleMatchFinalization, handleExportStateToFile, handleGenerateShareLink, handleImportState
}) => {
    const [videoSrc, setVideoSrc] = useState(null);
    const videoRef = useRef(null);
    const importInputRef = useRef(null);
    
    const [selectedPlayer, setSelectedPlayer] = useState('');
    const [selectedAction, setSelectedAction] = useState(ActionType.PASE_CORTO_OFENSIVO_LOGRADO);

    const [currentMatchId, setCurrentMatchId] = useState(null);
    const [showNewMatchInput, setShowNewMatchInput] = useState(false);
    
    const [newMatchData, setNewMatchData] = useState({ tournament: '', jornada: '', rival: '', date: '', category: '' });
    
    const [editingTag, setEditingTag] = useState(null);
    const [isEditingDetectedPlay, setIsEditingDetectedPlay] = useState(false);

    const [aiSuggestedTags, setAiSuggestedTags] = useState([]);
    const [isLoadingAiSuggestions, setIsLoadingAiSuggestions] = useState(false);
    const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const currentMatch = useMemo(() => matches.find(m => m.id === currentMatchId), [currentMatchId, matches]);
    
    const displayedTags = useMemo(() => {
        if (!currentMatchId) return [];
        return tags.filter(tag => tag.matchId === currentMatchId).sort((a, b) => b.timestamp - a.timestamp);
    }, [tags, currentMatchId]);

    useEffect(() => {
        if (players.length > 0 && !selectedPlayer) {
            setSelectedPlayer(players[0].id);
        }
    }, [players, selectedPlayer]);

    const handlePlayerUpload = (files) => {
        if (!files || files.length === 0) {
            alert("Por favor, seleccione un archivo.");
            return;
        }
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) throw new Error("No se pudo leer el archivo.");

                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) throw new Error("El archivo de Excel no contiene hojas.");

                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (!json || json.length === 0) {
                    throw new Error("El archivo de Excel está vacío o no tiene el formato correcto.");
                }

                const newPlayers = json
                    .map((row, index) => {
                        const name = row['Player Name'] || row.name || row.Name || row.nombre || row.Nombre;
                        if (typeof name === 'string' && name.trim() !== '') {
                            return {
                                id: `player-${Date.now()}-${index}`,
                                name: name.trim(),
                                jerseyNumber: row['Jersey Number'],
                                // FIX: Corrected typo from 'Postion' to 'Position'
                                position: row['Position'],
                            };
                        }
                        return null;
                    })
                    .filter((p) => p !== null);

                if (newPlayers.length === 0) {
                    throw new Error("No se encontraron jugadores válidos en el archivo. Asegúrese de que la columna de nombres tenga el encabezado 'Player Name', 'name', o 'nombre'.");
                }

                setPlayers(newPlayers);
                setSelectedPlayer(newPlayers[0].id);
                alert(`¡Éxito! Se cargaron ${newPlayers.length} jugadores.`);

            } catch (error) {
                console.error("Error al procesar el archivo de jugadores:", error);
                alert(`Error al procesar el archivo: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        reader.onerror = () => {
             alert("Error al leer el archivo.");
        };
        reader.readAsBinaryString(file);
    };

    const handleNewMatchDataChange = (e) => {
        const { name, value } = e.target;
        setNewMatchData(prev => ({...prev, [name]: value}));
    };

    const handleCreateNewMatch = () => {
        const { tournament, category, jornada, rival, date } = newMatchData;
        if (!tournament.trim() || !category.trim() || !jornada.trim() || !rival.trim() || !date) {
             alert("Por favor, complete todos los campos para crear el partido.");
            return;
        }
        
        const matchName = `${tournament} (${category}) - ${jornada} vs ${rival}`;

        const newMatch = {
            id: `match-${Date.now()}`,
            name: matchName,
            tournament: tournament.trim(),
            category: category.trim(),
            jornada: jornada.trim(),
            rival: rival.trim(),
            date: date,
            videos: [],
            detectedPlays: [],
            isFinalized: false,
        };
        setMatches(prev => [...prev, newMatch].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setCurrentMatchId(newMatch.id);
        
        setNewMatchData({ tournament: '', jornada: '', rival: '', date: '', category: '' });
        setShowNewMatchInput(false);
    };
    
    const handleVideoUpload = (files) => {
        if (files && files.length > 0 && currentMatchId) {
            const newVideos = Array.from(files).map(file => ({
                name: file.name,
                url: URL.createObjectURL(file),
            }));

            setMatches(prevMatches => prevMatches.map(match =>
                match.id === currentMatchId
                    ? { ...match, videos: [...match.videos, ...newVideos] }
                    : match
            ));
            
            if (!videoSrc) {
                setVideoSrc(newVideos[0].url);
            }
        }
    };
    
    const handleUniformUpload = (type) => (files) => {
        if (files && files[0] && currentMatchId) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const imageUrl = reader.result;
                setMatches(prevMatches => prevMatches.map(match =>
                    match.id === currentMatchId
                        ? { ...match, [type === 'team' ? 'teamUniform' : 'opponentUniform']: imageUrl }
                        : match
                ));
            };
            reader.readAsDataURL(files[0]);
        }
    };

    const getResultFromAction = (action) => {
        const actionStr = action.toString();
        if (actionStr.includes('No Logrado') || actionStr.includes('Perdido') || action === ActionType.GOL_RECIBIDO) {
            return 'No Logrado';
        }
        if (action === ActionType.GOL_A_FAVOR) return 'Gol';
        if (action === ActionType.ATAJADA_REALIZADA) return 'Atajada';
        if (actionStr.includes('Ganado')) return 'Ganado';
        return 'Logrado';
    };

    const handleTagAction = () => {
        if (videoRef.current && selectedPlayer && currentMatchId) {
            const timestamp = videoRef.current.currentTime;
            const newTag = {
                matchId: currentMatchId,
                playerId: selectedPlayer,
                action: selectedAction,
                result: getResultFromAction(selectedAction),
                timestamp: timestamp
            };
            addNewTag(newTag);
        }
    };
    
    const handleSaveProgress = () => {
        setSaveMessage('¡Progreso Guardado!');
        setTimeout(() => setSaveMessage(''), 2000);
    };

    const openVideoInNewWindow = () => {
        if (videoSrc) {
            window.open(videoSrc, '_blank');
        }
    };

    const handleUpdateTag = () => {
      if (!editingTag || !currentMatchId) return;

      if (isEditingDetectedPlay) {
         updateAndConfirmDetectedPlay(currentMatchId, editingTag.id, editingTag);
      } else {
        const updatedResult = getResultFromAction(editingTag.action);
        updateTag(editingTag.id, { 
          playerId: editingTag.playerId,
          action: editingTag.action,
          result: updatedResult,
          timestamp: editingTag.timestamp
        });
      }
      setEditingTag(null);
      setIsEditingDetectedPlay(false);
    };

    const handleDeleteTag = (tagId) => {
      if (window.confirm('¿Estás seguro de que quieres eliminar esta jugada?')) {
        deleteTag(tagId);
      }
    };

    const generateAiSuggestions = async () => {
        if (displayedTags.length < 3) return;
        setIsLoadingAiSuggestions(true);
        setAiSuggestedTags([]);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const tagDescriptions = displayedTags.map(tag => {
                 const playerName = players.find(p => p.id === tag.playerId)?.name || 'Desconocido';
                 return `- Jugador '${playerName}' realizó '${tag.action}' en el segundo ${Math.round(tag.timestamp)}`;
            }).join('\n');
            
            const playerInfo = players.map(p => 
                `- Nombre: ${p.name}, ID: ${p.id}, Jersey: ${p.jerseyNumber || 'N/A'}, Posición: ${p.position || 'N/A'}`
            ).join('\n');

            const prompt = `Eres un asistente de director técnico de fútbol infantil. Tu tarea es analizar una lista de jugadas ya etiquetadas y sugerir 5 nuevas acciones que lógicamente podrían haber ocurrido cerca de esos momentos.

**Reglas Críticas:**
1.  **Enfócate en MI EQUIPO:** La siguiente lista de jugadores es MI EQUIPO. TODAS tus sugerencias DEBEN ser para jugadores de esta lista. No inventes jugadores ni sugieras acciones para el rival.
2.  **Usa el Contexto:** Usa la posición y el número de jersey para hacer sugerencias más inteligentes. Por ejemplo, es más probable que un portero realice una 'Atajada' y un delantero un 'Tiro a Porteria'.
3.  **Evita Duplicados:** No sugieras una jugada que ya existe en la lista de 'Jugadas existentes'.
4.  **Respuesta Precisa:** Responde ÚNICAMENTE con un array JSON válido, sin texto adicional antes o después.

**Jugadores de MI EQUIPO:**
${playerInfo}

**Jugadas existentes:**
${tagDescriptions}

**Acciones Válidas para Sugerir:**
${Object.values(ActionType).join(', ')}

Basado en esto, genera tus sugerencias.`;
            
            const schema = {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  playerId: { type: Type.STRING },
                  action: { type: Type.STRING },
                  timestamp: { type: Type.NUMBER },
                },
                required: ['playerId', 'action', 'timestamp'],
              },
            };

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: {
                 responseMimeType: "application/json",
                 responseSchema: schema,
              }
            });
            
            // FIX: Changed response.text() to response.text.trim(). The .text property should be accessed directly, not called as a function.
            let suggested = JSON.parse(response.text.trim());
            if (Array.isArray(suggested)) {
                suggested = suggested.filter(s => s.playerId && s.action && typeof s.timestamp === 'number' && players.some(p => p.id === s.playerId) && Object.values(ActionType).includes(s.action))
                setAiSuggestedTags(suggested);
            }

        } catch (error) {
            console.error("Error suggesting tags:", error);
            alert("Hubo un error al generar las sugerencias. Por favor, verifica la configuración de la API Key y tu conexión.");
        } finally {
            setIsLoadingAiSuggestions(false);
        }
    };

    const acceptSuggestion = (suggestion, index) => {
        if (!currentMatchId) return;
        const newTag = {
            matchId: currentMatchId,
            playerId: suggestion.playerId,
            action: suggestion.action,
            result: getResultFromAction(suggestion.action),
            timestamp: suggestion.timestamp
        };
        addNewTag(newTag);
        setAiSuggestedTags(prev => prev.filter((_, i) => i !== index));
    };

    const handleAutoAnalyzeVideo = () => {
      if (!currentMatchId || !videoRef.current || !players.length) return;
      setIsAnalyzingVideo(true);
      
      setTimeout(() => {
        const duration = videoRef.current?.duration || 5400;
        const generatedPlays = Array.from({ length: Math.floor(Math.random() * 8) + 5 }).map((_, i) => {
            const randomPlayer = players[Math.floor(Math.random() * players.length)];
            const randomAction = Object.values(ActionType)[Math.floor(Math.random() * Object.values(ActionType).length)];
            return {
                id: `detected-${Date.now()}-${i}`,
                playerId: randomPlayer.id,
                action: randomAction,
                timestamp: Math.random() * duration,
            };
        });
        
        addDetectedPlaysToMatch(currentMatchId, generatedPlays);
        setIsAnalyzingVideo(false);
      }, 2500);
    };

    const handleConfirmDetectedPlay = (play) => {
      if (!currentMatchId) return;
      confirmDetectedPlay(currentMatchId, play);
    };


    return (
        React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6" },
            React.createElement("div", { className: "lg:col-span-2 space-y-4" },
                 React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    videoSrc ? (
                        React.createElement("div", null,
                            React.createElement("video", { ref: videoRef, src: videoSrc, controls: true, className: "w-full rounded-lg h-[400px] bg-black" }),
                            React.createElement("div", { className: "mt-2 text-center text-white font-semibold" },
                                "Reproduciendo: ", currentMatch?.videos.find(v => v.url === videoSrc)?.name || 'Video'
                            )
                        )
                    ) : (
                        React.createElement("div", { className: "w-full h-[400px] bg-gray-800 rounded-lg flex items-center justify-center" },
                            React.createElement("p", { className: "text-gray-400" }, currentMatchId ? 'Seleccione o suba un video para comenzar' : 'Seleccione un partido para empezar')
                        )
                    ),
                     React.createElement("button", { onClick: openVideoInNewWindow, disabled: !videoSrc, className: "mt-4 w-full bg-[#00c6ff] text-black font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-600 disabled:cursor-not-allowed" },
                        "Abrir video en ventana nueva"
                    )
                ),
                currentMatch && currentMatch.videos.length > 0 && (
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                         React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "Lista de Videos del Partido"),
                         React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2" },
                            currentMatch.videos.map(video => (
                                React.createElement("button", { key: video.url, onClick: () => setVideoSrc(video.url), className: `p-2 text-xs text-left rounded transition ${videoSrc === video.url ? 'bg-[#00c6ff] text-black' : 'bg-gray-700 hover:bg-gray-600'}` },
                                    video.name
                                )
                            ))
                         )
                    )
                ),
                React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "Jugadas Etiquetadas"),
                    React.createElement("div", { className: "space-y-2 max-h-60 overflow-y-auto pr-2" },
                        displayedTags.length === 0 ? (
                            React.createElement("p", { className: "text-gray-400 text-sm text-center py-4" }, "Aún no se han etiquetado jugadas para este partido.")
                        ) : (
                            displayedTags.map((tag) => {
                                const player = players.find(p => p.id === tag.playerId);
                                const isSuccess = ['Logrado', 'Gol', 'Ganado', 'Atajada'].includes(tag.result);
                                const time = new Date(tag.timestamp * 1000).toISOString().substring(14, 19);

                                return (
                                    React.createElement("div", {
                                        key: tag.id,
                                        className: `group relative p-2 rounded-md text-sm ${isSuccess ? 'bg-green-900/50 border-l-4 border-green-500' : 'bg-red-900/50 border-l-4 border-red-500'}`
                                    },
                                        React.createElement("div", { className: "flex justify-between items-center" },
                                            React.createElement("span", { className: "font-semibold" }, player ? player.name : 'Desconocido'),
                                            React.createElement("span", { className: "font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded" }, time)
                                        ),
                                        React.createElement("p", { className: "text-gray-300 text-xs mt-1" }, tag.action),
                                        React.createElement("div", { className: "absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" },
                                            React.createElement("button", {
                                                onClick: () => { setEditingTag(tag); setIsEditingDetectedPlay(false); },
                                                title: "Editar",
                                                className: "p-1 bg-blue-600 hover:bg-blue-500 rounded-full h-6 w-6 flex items-center justify-center disabled:bg-gray-500 disabled:cursor-not-allowed",
                                                disabled: currentMatch?.isFinalized
                                            },
                                                React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 text-white", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { d: "M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" }), React.createElement("path", { fillRule: "evenodd", d: "M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z", clipRule: "evenodd" }))
                                            ),
                                            React.createElement("button", {
                                                onClick: () => handleDeleteTag(tag.id),
                                                title: "Eliminar",
                                                className: "p-1 bg-red-600 hover:bg-red-500 rounded-full h-6 w-6 flex items-center justify-center disabled:bg-gray-500 disabled:cursor-not-allowed",
                                                disabled: currentMatch?.isFinalized
                                            },
                                                React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 text-white", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { fillRule: "evenodd", d: "M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z", clipRule: "evenodd" }))
                                            )
                                        )
                                    )
                                );
                            })
                        )
                    )
                ),
                 currentMatch && currentMatch.detectedPlays && currentMatch.detectedPlays.length > 0 && (
                    React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                        React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "Jugadas Detectadas por IA (Borrador)"),
                        React.createElement("div", { className: "space-y-2 max-h-60 overflow-y-auto pr-2" },
                             currentMatch.detectedPlays.map((play) => {
                                const player = players.find(p => p.id === play.playerId);
                                const time = new Date(play.timestamp * 1000).toISOString().substring(14, 19);

                                return (
                                    React.createElement("div", { key: play.id, className: "relative p-2 rounded-md text-sm bg-yellow-900/50 border-l-4 border-yellow-500" },
                                         React.createElement("div", { className: "flex justify-between items-center" },
                                            React.createElement("span", { className: "font-semibold" }, player ? player.name : 'Desconocido'),
                                            React.createElement("span", { className: "font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded" }, time)
                                        ),
                                        React.createElement("p", { className: "text-gray-300 text-xs mt-1" }, play.action),
                                        React.createElement("div", { className: "absolute top-1 right-1 flex gap-1" },
                                             React.createElement("button", { onClick: () => handleConfirmDetectedPlay(play), title: "Confirmar", className: "p-1 bg-green-600 hover:bg-green-500 rounded-full h-6 w-6 flex items-center justify-center" },
                                                React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M5 13l4 4L19 7" }))
                                            ),
                                            React.createElement("button", { onClick: () => { setEditingTag(play); setIsEditingDetectedPlay(true); }, title: "Editar y Confirmar", className: "p-1 bg-blue-600 hover:bg-blue-500 rounded-full h-6 w-6 flex items-center justify-center" },
                                                React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 text-white", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { d: "M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" }), React.createElement("path", { fillRule: "evenodd", d: "M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z", clipRule: "evenodd" }))
                                            ),
                                            React.createElement("button", { onClick: () => currentMatchId && deleteDetectedPlay(currentMatchId, play.id), title: "Eliminar", className: "p-1 bg-red-600 hover:bg-red-500 rounded-full h-6 w-6 flex items-center justify-center" },
                                                React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-4 w-4 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" }, React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12" }))
                                            )
                                        )
                                    )
                                );
                             })
                        )
                    )
                 )
            ),
            React.createElement("div", { className: "space-y-4" },
                 React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "1. Gestión del Partido"),
                    React.createElement("div", { className: "space-y-3" },
                         React.createElement("select", {
                            value: currentMatchId || '',
                            onChange: (e) => {
                                const id = e.target.value;
                                setCurrentMatchId(id);
                                const match = matches.find(m => m.id === id);
                                setVideoSrc(match?.videos[0]?.url || null);
                            },
                            className: "w-full bg-[#0a192f] border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:border-[#00c6ff]"
                        },
                            React.createElement("option", { value: "", disabled: true }, "-- Seleccione un Partido --"),
                            matches.map(match => React.createElement("option", { key: match.id, value: match.id }, match.name))
                        ),
                         React.createElement("button", { onClick: () => setShowNewMatchInput(!showNewMatchInput), className: "w-full text-sm bg-gray-600 hover:bg-gray-500 p-2 rounded-md" },
                            showNewMatchInput ? 'Cancelar' : 'Crear Nuevo Partido'
                        ),
                        showNewMatchInput && (
                            React.createElement("div", { className: "p-3 bg-black/20 rounded-md space-y-2" },
                                React.createElement("input", { name: "tournament", value: newMatchData.tournament, onChange: handleNewMatchDataChange, placeholder: "Nombre del Torneo", className: "w-full bg-[#0a192f] p-2 rounded-md text-sm border border-gray-700" }),
                                React.createElement("input", { name: "category", value: newMatchData.category, onChange: handleNewMatchDataChange, placeholder: "Categoría (ej. 2012)", className: "w-full bg-[#0a192f] p-2 rounded-md text-sm border border-gray-700" }),
                                React.createElement("input", { name: "jornada", value: newMatchData.jornada, onChange: handleNewMatchDataChange, placeholder: "Jornada (ej. Jornada 1)", className: "w-full bg-[#0a192f] p-2 rounded-md text-sm border border-gray-700" }),
                                React.createElement("input", { name: "rival", value: newMatchData.rival, onChange: handleNewMatchDataChange, placeholder: "Nombre del Rival", className: "w-full bg-[#0a192f] p-2 rounded-md text-sm border border-gray-700" }),
                                React.createElement("input", { name: "date", value: newMatchData.date, onChange: handleNewMatchDataChange, type: "date", className: "w-full bg-[#0a192f] p-2 rounded-md text-sm border border-gray-700", style: { colorScheme: 'dark' } }),
                                React.createElement("button", { onClick: handleCreateNewMatch, className: "w-full bg-blue-600 hover:bg-blue-500 p-2 rounded-md" }, "Guardar Partido")
                            )
                        ),
                        currentMatch && (
                             React.createElement("button", {
                                onClick: () => toggleMatchFinalization(currentMatch.id),
                                className: `w-full p-2 rounded-md font-bold ${currentMatch.isFinalized ? 'bg-yellow-500 hover:bg-yellow-400' : 'bg-green-600 hover:bg-green-500'}`
                            },
                                currentMatch.isFinalized ? 'Reabrir Análisis' : 'Finalizar Análisis'
                            )
                        )
                    )
                ),
                React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "2. Cargar Archivos"),
                    React.createElement("div", { className: "space-y-3" },
                       React.createElement(FileInput, {
                           label: "Base de Datos de Jugadores",
                           accept: ".xlsx, .xls",
                           onChange: handlePlayerUpload,
                           disabled: !currentMatchId || !!currentMatch?.isFinalized,
                           // FIX: Corrected typo in helper text from 'Postion' to 'Position'
                           helperText: "Sube tu archivo Excel. Columnas: 'Player Name', 'Jersey Number', 'Position'."
                       }),
                       React.createElement(FileInput, {
                           label: "Videos del Partido (hasta 40)",
                           accept: "video/mp4",
                           multiple: true,
                           onChange: handleVideoUpload,
                           disabled: !currentMatchId || !!currentMatch?.isFinalized
                       }),
                        React.createElement(FileInput, {
                           label: "Mi equipo",
                           accept: "image/*",
                           onChange: handleUniformUpload('team'),
                           disabled: !currentMatchId || !!currentMatch?.isFinalized
                       }),
                        currentMatch?.teamUniform && React.createElement("img", { src: currentMatch.teamUniform, alt: "Uniforme Local", className: "h-16 w-16 object-cover mx-auto rounded-md border-2 border-[#00c6ff]" }),
                        React.createElement(FileInput, {
                           label: "Equipo Rival",
                           accept: "image/*",
                           onChange: handleUniformUpload('opponent'),
                           disabled: !currentMatchId || !!currentMatch?.isFinalized
                       }),
                        currentMatch?.opponentUniform && React.createElement("img", { src: currentMatch.opponentUniform, alt: "Uniforme Visitante", className: "h-16 w-16 object-cover mx-auto rounded-md border-2 border-gray-500" }),
                         React.createElement("button", {
                            onClick: handleAutoAnalyzeVideo,
                            disabled: !currentMatchId || isAnalyzingVideo || !!currentMatch?.isFinalized,
                            className: "w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-500 transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
                        },
                            isAnalyzingVideo ? (
                                React.createElement(React.Fragment, null,
                                React.createElement("svg", { className: "animate-spin -ml-1 mr-3 h-5 w-5 text-white", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24" }, React.createElement("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), React.createElement("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })),
                                "Analizando..."
                                )
                            ) : 'Analizar Video Automáticamente (Beta)'
                        )
                    )
                ),
                React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "3. Etiquetar Jugada"),
                     React.createElement("div", { className: "space-y-3" },
                        React.createElement("div", null,
                            React.createElement("label", { htmlFor: "player-select", className: "text-sm" }, "Jugador"),
                            React.createElement("select", { id: "player-select", value: selectedPlayer, onChange: (e) => setSelectedPlayer(e.target.value), disabled: !currentMatchId || players.length === 0 || !!currentMatch?.isFinalized, className: "w-full bg-[#0a192f] border border-gray-600 rounded-md p-2 mt-1 focus:outline-none focus:border-[#00c6ff]" },
                                players.map(p => React.createElement("option", { key: p.id, value: p.id }, p.name))
                            )
                        ),
                        React.createElement("div", null,
                             React.createElement("label", { htmlFor: "action-select", className: "text-sm" }, "Acción"),
                            React.createElement("select", { id: "action-select", value: selectedAction, onChange: (e) => setSelectedAction(e.target.value), disabled: !currentMatchId || !!currentMatch?.isFinalized, className: "w-full bg-[#0a192f] border border-gray-600 rounded-md p-2 mt-1 focus:outline-none focus:border-[#00c6ff]" },
                                Object.values(ActionType).map(action => React.createElement("option", { key: action, value: action }, action))
                            )
                        ),
                        React.createElement("button", { onClick: handleTagAction, disabled: !currentMatchId || !!currentMatch?.isFinalized, className: "w-full bg-[#00c6ff] text-black font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-600 disabled:cursor-not-allowed" }, "Etiquetar Acción"),
                        React.createElement("button", { onClick: handleSaveProgress, disabled: !currentMatchId, className: "w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition disabled:bg-gray-800" },
                             saveMessage || 'Guardar Progreso'
                        )
                    )
                ),
                React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "Análisis Asistido por IA (Beta)"),
                    React.createElement("p", { className: "text-xs text-gray-400 mb-3" }, "Después de etiquetar algunas jugadas, la IA puede sugerir otras. Puede aceptar o rechazar las sugerencias."),
                    React.createElement("button", { onClick: generateAiSuggestions, disabled: isLoadingAiSuggestions || displayedTags.length < 3 || !!currentMatch?.isFinalized, className: "w-full bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-500 transition disabled:bg-gray-600 disabled:cursor-not-allowed" },
                        isLoadingAiSuggestions ? 'Pensando...' : `Sugerir Acciones (requiere 3+ etiquetas)`
                    ),
                    React.createElement("div", { className: "mt-3 space-y-2 max-h-40 overflow-y-auto" },
                        aiSuggestedTags.map((s, i) => (
                            React.createElement("div", { key: i, className: "bg-purple-900/50 p-2 rounded-md text-xs" },
                                React.createElement("p", null, "Sugerencia: ", React.createElement("strong", null, players.find(p=>p.id === s.playerId)?.name), " - ", s.action, " @ ", Math.round(s.timestamp), "s"),
                                React.createElement("div", { className: "flex justify-end gap-2 mt-1" },
                                    React.createElement("button", { onClick: () => acceptSuggestion(s, i), className: "text-green-400 hover:text-green-300" }, "Aceptar"),
                                    React.createElement("button", { onClick: () => setAiSuggestedTags(prev => prev.filter((_, idx) => idx !== i)), className: "text-red-400 hover:text-red-300" }, "Rechazar")
                                )
                            )
                        ))
                    )
                ),
                React.createElement("div", { className: "bg-[#1e2a47] p-4 rounded-lg shadow-lg" },
                    React.createElement("h3", { className: "font-bold text-lg text-[#00c6ff] mb-3" }, "Gestión y Respaldo de Datos"),
                    React.createElement("div", { className: "space-y-3" },
                         React.createElement("button", { onClick: handleGenerateShareLink, className: "w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center space-x-2" },
                             React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { d: "M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" })),
                             React.createElement("span", null, "Generar Link para Auxiliares")
                        ),
                         React.createElement("button", { onClick: handleExportStateToFile, className: "w-full bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center space-x-2" },
                            React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { fillRule: "evenodd", d: "M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z", clipRule: "evenodd" })),
                            React.createElement("span", null, "Descargar Archivo de Respaldo")
                        ),
                         React.createElement("div", null,
                            React.createElement("label", { className: "block text-sm font-medium text-gray-300 mb-2" }, "Importar Archivo de Respaldo"),
                            React.createElement("input", {
                                ref: importInputRef,
                                type: "file",
                                accept: ".json",
                                onChange: handleImportState,
                                className: "block w-full text-sm text-gray-400 border border-gray-600 rounded-lg cursor-pointer bg-[#1e2a47] focus:outline-none"
                            })
                        )
                    )
                )
            ),
            editingTag && (
                React.createElement("div", { className: "fixed inset-0 bg-black/70 flex items-center justify-center z-50", onClick: () => setEditingTag(null) },
                    React.createElement("div", { className: "bg-[#1e2a47] rounded-lg p-6 w-full max-w-md mx-4 shadow-xl border border-[#00c6ff]", onClick: (e) => e.stopPropagation() },
                         React.createElement("h3", { className: "text-xl font-bold mb-4 text-white" }, "Editar Jugada"),
                         React.createElement("div", { className: "space-y-4" },
                            React.createElement("div", null,
                                React.createElement("label", { htmlFor: "edit-player-select", className: "text-sm" }, "Jugador"),
                                React.createElement("select", {
                                    id: "edit-player-select",
                                    value: editingTag.playerId,
                                    onChange: (e) => setEditingTag(prev => prev ? {...prev, playerId: e.target.value} : null),
                                    className: "w-full bg-[#0a192f] border border-gray-600 rounded-md p-2 mt-1 focus:outline-none focus:border-[#00c6ff]"
                                },
                                    players.map(p => React.createElement("option", { key: p.id, value: p.id }, p.name))
                                )
                            ),
                            React.createElement("div", null,
                                React.createElement("label", { htmlFor: "edit-action-select", className: "text-sm" }, "Acción"),
                                React.createElement("select", {
                                    id: "edit-action-select",
                                    value: editingTag.action,
                                    onChange: (e) => setEditingTag(prev => prev ? {...prev, action: e.target.value} : null),
                                    className: "w-full bg-[#0a192f] border border-gray-600 rounded-md p-2 mt-1 focus:outline-none focus:border-[#00c6ff]"
                                },
                                    Object.values(ActionType).map(action => React.createElement("option", { key: action, value: action }, action))
                                )
                            ),
                             React.createElement("div", null,
                                React.createElement("label", { htmlFor: "edit-timestamp", className: "text-sm" }, "Timestamp (segundos)"),
                                React.createElement("input", {
                                  id: "edit-timestamp",
                                  type: "number",
                                  value: editingTag.timestamp,
                                  onChange: (e) => setEditingTag(prev => prev ? {...prev, timestamp: parseFloat(e.target.value)} : null),
                                  className: "w-full bg-[#0a192f] border border-gray-600 rounded-md p-2 mt-1 focus:outline-none focus:border-[#00c6ff]"
                                })
                             )
                         ),
                         React.createElement("div", { className: "mt-6 flex justify-end gap-3" },
                            React.createElement("button", { onClick: () => setEditingTag(null), className: "px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500" }, "Cancelar"),
                            React.createElement("button", { onClick: handleUpdateTag, className: "px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500" }, isEditingDetectedPlay ? 'Guardar y Confirmar' : 'Guardar Cambios')
                         )
                    )
                )
            )
        )
    );
};
