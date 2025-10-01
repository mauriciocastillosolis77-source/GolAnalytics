
import React from 'react';
import { ACTION_CATEGORIES } from '../constants.js';
import { getAuth } from 'firebase/auth';

const FilterSelect = ({ label, value, onChange, options }) => (
    React.createElement("div", { className: "flex flex-col" },
        React.createElement("label", { htmlFor: label, className: "text-sm font-medium text-gray-400 mb-1" }, label),
        React.createElement("select", {
            id: label,
            value: value,
            onChange: onChange,
            className: "bg-[#1e2a47] border border-[#00c6ff] text-white text-sm rounded-lg focus:ring-[#00c6ff] focus:border-[#00c6ff] block w-full p-2.5 transition duration-300 ease-in-out"
        },
            options.map(opt => React.createElement("option", { key: opt.value, value: opt.value }, opt.label))
        )
    )
);

export const Header = ({
    view,
    setView,
    mode,
    user,
    tournaments,
    categories,
    jornadas,
    players,
    selectedTournament,
    setSelectedTournament,
    selectedCategory,
    setSelectedCategory,
    selectedJornada,
    setSelectedJornada,
    selectedPlayer,
    setSelectedPlayer,
    selectedAction,
    setSelectedAction,
    handleExport,
}) => {
    const handleLogout = () => {
        getAuth().signOut();
    };

    return (
        React.createElement("header", { className: "bg-[#0a192f] p-4 rounded-lg shadow-lg border border-gray-700" },
            React.createElement("div", { className: `flex flex-col md:flex-row ${mode === 'coach' ? 'justify-between' : 'justify-center'} items-center mb-4` },
                React.createElement("div", { className: "flex items-center space-x-4 mb-4 md:mb-0" },
                    React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-10 w-10 text-[#00c6ff]", viewBox: "0 0 24 24", fill: "currentColor" },
                        React.createElement("path", { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" })
                    ),
                    React.createElement("h1", { className: "text-2xl md:text-3xl font-bold text-white tracking-wider" }, "GolAnalytics")
                ),
                mode === 'coach' && user && (
                     React.createElement("div", { className: "flex items-center space-x-4" },
                        React.createElement("span", { className: "text-sm text-gray-400 hidden sm:block" }, user.email),
                        React.createElement("nav", { className: "flex space-x-2 bg-[#1e2a47] p-1 rounded-lg" },
                            React.createElement("button", { onClick: () => setView('dashboard'), className: `px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'dashboard' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}` }, "Tablero"),
                            React.createElement("button", { onClick: () => setView('tagger'), className: `px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'tagger' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}` }, "Etiquetador")
                        ),
                         React.createElement("button", { onClick: handleLogout, title: "Cerrar Sesión", className: "p-2 text-sm font-semibold rounded-md transition-colors duration-300 text-gray-300 hover:bg-red-600" },
                             React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor" },
                                React.createElement("path", { fillRule: "evenodd", d: "M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z", clipRule: "evenodd" })
                            )
                        )
                    )
                )
            ),
            view === 'dashboard' && mode === 'coach' && (
                React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end" },
                    React.createElement(FilterSelect, { label: "Torneo", value: selectedTournament, onChange: e => setSelectedTournament(e.target.value),
                        options: [{ value: 'all', label: 'Todos' }, ...tournaments.map(t => ({ value: t, label: t }))]
                    }),
                    React.createElement(FilterSelect, { label: "Categoría", value: selectedCategory, onChange: e => setSelectedCategory(e.target.value),
                        options: [{ value: 'all', label: 'Todas' }, ...categories.map(c => ({ value: c, label: c }))]
                    }),
                    React.createElement(FilterSelect, { label: "Jornada", value: selectedJornada, onChange: e => setSelectedJornada(e.target.value),
                        options: [{ value: 'all', label: 'Todas' }, ...jornadas.map(j => ({ value: j, label: j }))]
                    }),
                    React.createElement(FilterSelect, { label: "Jugador", value: selectedPlayer, onChange: e => setSelectedPlayer(e.target.value),
                        options: [{ value: 'all', label: 'Todos' }, ...players.map(p => ({ value: p.id, label: p.name }))]
                    }),
                    React.createElement(FilterSelect, { label: "Acción", value: selectedAction, onChange: e => setSelectedAction(e.target.value),
                        options: [{ value: 'all', label: 'Todas' }, ...Object.keys(ACTION_CATEGORIES).map(ac => ({ value: ac, label: ac }))]
                    }),
                    React.createElement("button", { onClick: handleExport, className: "w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2 transition duration-300 ease-in-out self-end h-[46px]" },
                         React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", viewBox: "0 0 20 20", fill: "currentColor" }, React.createElement("path", { fillRule: "evenodd", d: "M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z", clipRule: "evenodd" })),
                        React.createElement("span", null, "Exportar a Excel")
                    )
                )
            )
        )
    );
};
