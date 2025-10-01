
import React from 'react';
import type { Player } from '../types';
import { ACTION_CATEGORIES } from '../constants';
import { getAuth } from 'firebase/auth';
import type { User } from 'firebase/auth';

interface HeaderProps {
    view: 'dashboard' | 'tagger';
    setView: (view: 'dashboard' | 'tagger') => void;
    mode: 'coach' | 'viewer';
    user: User | null;
    tournaments: string[];
    categories: string[];
    jornadas: string[];
    players: Player[];
    selectedTournament: string;
    setSelectedTournament: (tournament: string) => void;
    selectedCategory: string;
    setSelectedCategory: (category: string) => void;
    selectedJornada: string;
    setSelectedJornada: (jornada: string) => void;
    selectedPlayer: string;
    setSelectedPlayer: (playerId: string) => void;
    selectedAction: string;
    setSelectedAction: (action: string) => void;
    handleExport: () => void;
}

const FilterSelect: React.FC<{
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => (
    <div className="flex flex-col">
        <label htmlFor={label} className="text-sm font-medium text-gray-400 mb-1">{label}</label>
        <select
            id={label}
            value={value}
            onChange={onChange}
            className="bg-[#1e2a47] border border-[#00c6ff] text-white text-sm rounded-lg focus:ring-[#00c6ff] focus:border-[#00c6ff] block w-full p-2.5 transition duration-300 ease-in-out"
        >
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

export const Header: React.FC<HeaderProps> = ({
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
        <header className="bg-[#0a192f] p-4 rounded-lg shadow-lg border border-gray-700">
            <div className={`flex flex-col md:flex-row ${mode === 'coach' ? 'justify-between' : 'justify-center'} items-center mb-4`}>
                <div className="flex items-center space-x-4 mb-4 md:mb-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[#00c6ff]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
                    </svg>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-wider">GolAnalytics</h1>
                </div>
                {mode === 'coach' && user && (
                     <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-400 hidden sm:block">{user.email}</span>
                        <nav className="flex space-x-2 bg-[#1e2a47] p-1 rounded-lg">
                            <button onClick={() => setView('dashboard')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'dashboard' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}`}>Tablero</button>
                            <button onClick={() => setView('tagger')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-300 ${view === 'tagger' ? 'bg-[#00c6ff] text-black' : 'text-gray-300 hover:bg-[#2a3a5b]'}`}>Etiquetador</button>
                        </nav>
                         <button onClick={handleLogout} title="Cerrar Sesión" className="p-2 text-sm font-semibold rounded-md transition-colors duration-300 text-gray-300 hover:bg-red-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
            {view === 'dashboard' && mode === 'coach' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                    <FilterSelect label="Torneo" value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)}
                        options={[{ value: 'all', label: 'Todos' }, ...tournaments.map(t => ({ value: t, label: t }))]}
                    />
                    <FilterSelect label="Categoría" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
                        options={[{ value: 'all', label: 'Todas' }, ...categories.map(c => ({ value: c, label: c }))]}
                    />
                    <FilterSelect label="Jornada" value={selectedJornada} onChange={e => setSelectedJornada(e.target.value)}
                        options={[{ value: 'all', label: 'Todas' }, ...jornadas.map(j => ({ value: j, label: j }))]}
                    />
                    <FilterSelect label="Jugador" value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}
                        options={[{ value: 'all', label: 'Todos' }, ...players.map(p => ({ value: p.id, label: p.name }))]}
                    />
                    <FilterSelect label="Acción" value={selectedAction} onChange={e => setSelectedAction(e.target.value)}
                        options={[{ value: 'all', label: 'Todas' }, ...Object.keys(ACTION_CATEGORIES).map(ac => ({ value: ac, label: ac }))]}
                    />
                    <button onClick={handleExport} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2 transition duration-300 ease-in-out self-end h-[46px]">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        <span>Exportar a Excel</span>
                    </button>
                </div>
            )}
        </header>
    );
};
