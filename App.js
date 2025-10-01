import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard.js';
import { VideoTagger } from './components/VideoTagger.js';
import { Header } from './components/Header.js';
import { ActionType } from './types.js';
import { ACTION_CATEGORIES } from './constants.js';
import saveAs from 'file-saver';
import * as XLSX from 'xlsx';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { firebaseApp } from './firebaseConfig.js';
import { AuthComponent } from './components/Auth.js';

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

const WelcomeModal = ({ onClose }) => (
    React.createElement("div", { className: "fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" },
        React.createElement("div", { className: "bg-[#1e2a47] rounded-lg p-6 w-full max-w-lg mx-auto shadow-xl border border-[#00c6ff] animate-fade-in" },
             React.createElement("h2", { className: "text-2xl font-bold mb-4 text-white text-center" }, "¡Bienvenido a GolAnalytics!"),
             React.createElement("p", { className: "text-gray-300 mb-6 text-center" }, "Tu cuenta ha sido creada. Sigue estos 4 pasos para empezar:"),
             React.createElement("ol", { className: "space-y-4 text-gray-200" },
                React.createElement("li", { className: "flex items-start" },
                    React.createElement("span", { className: "flex-shrink-0 bg-[#00c6ff] text-black rounded-full h-8 w-8 flex items-center justify-center font-bold mr-4" }, "1"),
                    React.createElement("div", null,
                        React.createElement("h3", { className: "font-semibold" }, "Crea un Partido"),
                        React.createElement("p", { className: "text-sm text-gray-400" }, "Ve a \"Etiquetador de Video\" y crea un nuevo partido con los detalles del encuentro.")
                    )
                ),
                React.createElement("li", { className: "flex items-start" },
                    React.createElement("span", { className: "flex-shrink-0 bg-[#00c6ff] text-black rounded-full h-8 w-8 flex items-center justify-center font-bold mr-4" }, "2"),
                    React.createElement("div", null,
                        React.createElement("h3", { className: "font-semibold" }, "Carga tus Archivos"),
                        React.createElement("p", { className: "text-sm text-gray-400" }, "Sube tu lista de jugadores (Excel) y el video del partido.")
                    )
                ),
                React.createElement("li", { className: "flex items-start" },
                    React.createElement("span", { className: "flex-shrink-0 bg-[#00c6ff] text-black rounded-full h-8 w-8 flex items-center justify-center font-bold mr-4" }, "3"),
                    React.createElement("div", null,
                        React.createElement("h3", { className: "font-semibold" }, "Etiqueta las Jugadas"),
                        React.createElement("p", { className: "text-sm text-gray-400" }, "Mientras ves el video, selecciona un jugador, una acción y haz clic en \"Etiquetar Acción\" en los momentos clave.")
                    )
                ),
                 React.createElement("li", { className: "flex items-start" },
                    React.createElement("span", { className: "flex-shrink-0 bg-[#00c6ff] text-black rounded-full h-8 w-8 flex items-center justify-center font-bold mr-4" }, "4"),
                    React.createElement("div", null,
                        React.createElement("h3", { className: "font-semibold" }, "Analiza y Comparte"),
                        React.createElement("p", { className: "text-sm text-gray-400" }, "Explora las gráficas en el \"Tablero\" y genera un link para compartir los resultados con tus auxiliares.")
                    )
                )
             ),
             React.createElement("div", { className: "mt-8 flex justify-center" },
                React.createElement("button", { onClick: onClose, className: "px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors" }, "¡Entendido, a empezar!")
             )
        )
    )
);

const App = () => {
  const [view, setView] = useState('dashboard');
  const [mode, setMode] = useState('coach');
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [appState, setAppState] = useState({ players: [], tags: [], matches: [] });

  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const coachIdForViewer = urlParams.get('coachId');

    if (urlParams.get('mode') === 'viewer' && coachIdForViewer) {
      setMode('viewer');
      setView('dashboard');
      setIsLoading(true);

      const docRef = doc(db, 'users', coachIdForViewer);
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
           setAppState({
              players: data.players || [],
              tags: data.tags || [],
              matches: (data.matches || []).map(m => ({
                  ...{ videos: [], detectedPlays: [], isFinalized: false, category: 'N/A' },
                  ...m,
              })),
          });
        } else {
          alert("El link para compartir es inválido o el entrenador ha borrado sus datos.");
        }
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching shared data:", error);
        alert("No se pudieron cargar los datos compartidos.");
        setIsLoading(false);
      });
      
      return () => unsubscribe();

    } else {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setUser(user);
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [auth, db]);

  useEffect(() => {
    if (mode === 'coach' && user) {
      const docRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(docRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setAppState({
              players: data.players || [],
              tags: data.tags || [],
              matches: (data.matches || []).map(m => ({
                  ...{ videos: [], detectedPlays: [], isFinalized: false, category: 'N/A' },
                  ...m,
              })),
          });
        } else {
          console.log("First time login for user, creating new document.");
          const defaultState = { players: [], matches: [], tags: [] };
          await setDoc(docRef, defaultState);
          setAppState(defaultState);
          setShowWelcomeModal(true);
        }
      });
      return () => unsubscribe();
    } else if (mode === 'coach' && !user) {
      setAppState({ players: [], tags: [], matches: [] });
    }
  }, [user, mode, db]);

  const updateFirestoreState = useCallback(async (newState) => {
    if (user && mode === 'coach') {
      const docRef = doc(db, 'users', user.uid);
      const currentState = {
          players: appState.players,
          matches: appState.matches,
          tags: appState.tags,
      };
      const finalState = { ...currentState, ...newState };
      const stateToSave = {
          ...finalState,
          matches: finalState.matches.map(({ videos, ...match }) => match)
      };
      await setDoc(docRef, stateToSave, { merge: true });
    }
  }, [user, mode, db, appState]);
  
  const handleCloseWelcomeModal = () => {
    setShowWelcomeModal(false);
  };

  const { players, tags, matches } = appState;

  const [selectedTournament, setSelectedTournament] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedJornada, setSelectedJornada] = useState('all');
  const [selectedPlayer, setSelectedPlayer] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');

  const filteredTags = useMemo(() => {
    return tags.filter(tag => {
      const match = matches.find(m => m.id === tag.matchId);
      if (!match) return false;
      
      const tournamentMatch = selectedTournament === 'all' || match.tournament === selectedTournament;
      const categoryMatch = selectedCategory === 'all' || match.category === selectedCategory;
      const jornadaMatch = selectedJornada === 'all' || match.jornada === selectedJornada;
      const playerMatch = selectedPlayer === 'all' || tag.playerId === selectedPlayer;
      const actionMatch = selectedAction === 'all' || 
                          (ACTION_CATEGORIES[selectedAction] && ACTION_CATEGORIES[selectedAction].includes(tag.action));
      return tournamentMatch && categoryMatch && jornadaMatch && playerMatch && actionMatch;
    });
  }, [tags, matches, selectedTournament, selectedCategory, selectedJornada, selectedPlayer, selectedAction]);

  const tournaments = useMemo(() => [...new Set(matches.map(m => m.tournament))].sort(), [matches]);
  const categories = useMemo(() => [...new Set(matches.map(m => m.category))].sort(), [matches]);
  const jornadas = useMemo(() => [...new Set(matches.map(m => m.jornada))].sort(), [matches]);

  const handleExport = () => {
    const dataToExport = filteredTags.map(tag => {
        const player = players.find(p => p.id === tag.playerId);
        const match = matches.find(m => m.id === tag.matchId);
        return {
            Torneo: match ? match.tournament : 'N/A',
            Categoría: match ? match.category : 'N/A',
            Jornada: match ? match.jornada : 'N/A',
            Rival: match ? match.rival : 'N/A',
            Fecha: match ? match.date : 'N/A',
            Jugador: player ? player.name : 'N/A',
            Accion: tag.action.replace(/_/g, ' '),
            Resultado: tag.result,
            Timestamp: `${Math.floor(tag.timestamp / 60)}:${('0' + Math.floor(tag.timestamp % 60)).slice(-2)}`,
        };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Estadisticas');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    saveAs(blob, 'estadisticas_futbol.xlsx');
  };

  const handleExportStateToFile = () => {
    try {
      const stateToExport = {
        players: appState.players,
        tags: appState.tags,
        matches: appState.matches.map(({ videos, ...match }) => match),
      };
      const stateJson = JSON.stringify(stateToExport, null, 2);
      const blob = new Blob([stateJson], { type: 'application/json;charset=utf-8' });
      saveAs(blob, 'respaldo_analisis_futbol.json');
    } catch (error) {
      console.error("Error exporting state to file:", error);
      alert("Hubo un error al exportar el respaldo.");
    }
  };

  const handleGenerateShareLink = useCallback(async () => {
    if (!user) {
        alert("Debes iniciar sesión para poder compartir.");
        return;
    }
    try {
        const baseUrl = window.location.origin;
        const url = `${baseUrl}?mode=viewer&coachId=${user.uid}`;
        await navigator.clipboard.writeText(url);
        alert('¡Link para compartir copiado al portapapeles!\n\nEnvía este link a tu auxiliar. Verá los datos actualizados en tiempo real.');
    } catch (error) {
        console.error("Error generating share link:", error);
        alert("Hubo un error al generar el link. Como alternativa, puedes descargar el archivo de respaldo.");
    }
  }, [user]);

  const handleImportState = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("File could not be read.");
        const importedState = JSON.parse(text);
        if (importedState && 'players' in importedState && 'tags' in importedState && 'matches' in importedState) {
          updateFirestoreState(importedState);
          alert("¡Respaldo importado y sincronizado con la nube con éxito!");
        } else {
          throw new Error("El archivo de respaldo no tiene el formato correcto.");
        }
      } catch (error) {
        console.error("Error importing state:", error);
        alert(`Error al importar el respaldo: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
      }
    };
    reader.readAsText(file);
  };

  const setPlayers = (updater) => {
    const newPlayers = typeof updater === 'function' ? updater(appState.players) : updater;
    updateFirestoreState({ players: newPlayers });
  };
  
  const setMatches = (updater) => {
    const newMatches = typeof updater === 'function' ? updater(appState.matches) : updater;
    updateFirestoreState({ matches: newMatches });
  };

  const toggleMatchFinalization = (matchId) => {
    const newMatches = appState.matches.map(match =>
      match.id === matchId ? { ...match, isFinalized: !match.isFinalized } : match
    );
    updateFirestoreState({ matches: newMatches });
  };

  const addNewTag = (newTag) => {
    const tagWithId = { ...newTag, id: `tag-${Date.now()}-${Math.random()}` };
    const newTags = [...appState.tags, tagWithId];
    updateFirestoreState({ tags: newTags });
  };

  const updateTag = (tagId, updatedData) => {
    const newTags = appState.tags.map(tag => 
      tag.id === tagId ? { ...tag, ...updatedData } : tag
    );
    updateFirestoreState({ tags: newTags });
  };

  const deleteTag = (tagId) => {
    const newTags = appState.tags.filter(tag => tag.id !== tagId);
    updateFirestoreState({ tags: newTags });
  };
  
  const addDetectedPlaysToMatch = (matchId, plays) => {
    const newMatches = appState.matches.map(match =>
      match.id === matchId ? { ...match, detectedPlays: [...(match.detectedPlays || []), ...plays] } : match
    );
    updateFirestoreState({ matches: newMatches });
  };

  const confirmDetectedPlay = (matchId, play) => {
    const newTag = {
      matchId: matchId,
      playerId: play.playerId,
      action: play.action,
      result: getResultFromAction(play.action),
      timestamp: play.timestamp,
    };
    addNewTag(newTag);
    deleteDetectedPlay(matchId, play.id);
  };

  const updateAndConfirmDetectedPlay = (matchId, playId, updatedData) => {
    const match = appState.matches.find(m => m.id === matchId);
    const playToConfirm = match?.detectedPlays?.find(p => p.id === playId);
    if (playToConfirm) {
      const confirmedPlayData = { ...playToConfirm, ...updatedData };
      const { id, ...playData } = confirmedPlayData;
      const newTag = {
          ...playData,
          matchId,
          result: getResultFromAction(confirmedPlayData.action),
      };
      addNewTag(newTag);
      deleteDetectedPlay(matchId, playId);
    }
  };

  const deleteDetectedPlay = (matchId, playId) => {
    const newMatches = appState.matches.map(match =>
      match.id === matchId
        ? { ...match, detectedPlays: (match.detectedPlays || []).filter(p => p.id !== playId) }
        : match
    );
    updateFirestoreState({ matches: newMatches });
  };

  if (isLoading) {
    return React.createElement("div", { className: "min-h-screen bg-[#0a192f] flex items-center justify-center" },
      React.createElement("div", { className: "spinner" })
    );
  }
  
  if (mode === 'coach' && !user) {
    return React.createElement(AuthComponent, null);
  }

  return (
    React.createElement("div", { className: "min-h-screen bg-[#0a192f] text-gray-200 p-4 sm:p-6 lg:p-8" },
      showWelcomeModal && React.createElement(WelcomeModal, { onClose: handleCloseWelcomeModal }),
      React.createElement(Header, {
        view: view,
        setView: (newView) => {
          if (mode === 'coach') {
            setView(newView);
          }
        },
        mode: mode,
        user: user,
        tournaments: tournaments,
        categories: categories,
        jornadas: jornadas,
        players: players,
        selectedTournament: selectedTournament,
        setSelectedTournament: setSelectedTournament,
        selectedCategory: selectedCategory,
        setSelectedCategory: setSelectedCategory,
        selectedJornada: selectedJornada,
        setSelectedJornada: setSelectedJornada,
        selectedPlayer: selectedPlayer,
        setSelectedPlayer: setSelectedPlayer,
        selectedAction: selectedAction,
        setSelectedAction: setSelectedAction,
        handleExport: handleExport
      }),
      React.createElement("main", { className: "mt-6" },
        view === 'dashboard' ? (
          React.createElement(Dashboard, { 
            tags: filteredTags, 
            players: players,
            matches: matches, 
            mode: mode,
            handleImportState: handleImportState
          })
        ) : (
          React.createElement(VideoTagger, { 
            players: players, 
            setPlayers: setPlayers,
            matches: matches,
            setMatches: setMatches,
            tags: tags,
            addNewTag: addNewTag,
            updateTag: updateTag,
            deleteTag: deleteTag,
            addDetectedPlaysToMatch: addDetectedPlaysToMatch,
            confirmDetectedPlay: confirmDetectedPlay,
            updateAndConfirmDetectedPlay: updateAndConfirmDetectedPlay,
            deleteDetectedPlay: deleteDetectedPlay,
            toggleMatchFinalization: toggleMatchFinalization,
            handleExportStateToFile: handleExportStateToFile,
            handleGenerateShareLink: handleGenerateShareLink,
            handleImportState: handleImportState
          })
        )
      )
    )
  );
};

export default App;
