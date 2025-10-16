import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogoutIcon, MenuIcon } from '../ui/Icons';

const Header: React.FC<{ setSidebarOpen: (open: boolean) => void }> = ({ setSidebarOpen }) => {
    const { user, logout, profile } = useAuth();

    return (
        <header className="sticky top-0 bg-gray-800 shadow-md z-20">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16 -mb-px">
                    {/* Hamburger button (solo se ve en móvil) */}
                    <button
                        className="text-gray-400 hover:text-gray-200 lg:hidden"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <span className="sr-only">Open sidebar</span>
                        <MenuIcon />
                    </button>

                    <div className="flex items-center ml-auto">
                        <div className="text-sm text-gray-400 mr-4 flex items-center">
                            <span>{user?.email}</span>
                            {profile && (
                                <span className="ml-2 capitalize bg-cyan-900 text-cyan-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    {profile.rol}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={logout}
                            className="flex items-center text-gray-400 hover:text-cyan-400 transition-colors duration-150"
                        >
                            <LogoutIcon />
                            <span className="ml-2">Salir</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
