import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLES } from '../../constants';
import { DashboardIcon, Logo, TaggerIcon } from '../ui/Icons';

// Forzar a Tailwind a incluir las clases necesarias (para evitar purge)
const _forceTailwindClasses = ["translate-x-0", "-translate-x-64"];

const Sidebar: React.FC<{ sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void }> = ({ sidebarOpen, setSidebarOpen }) => {
  const { profile } = useAuth();
  const trigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);

  // Cierra el menú si se hace clic fuera (solo móvil)
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (!sidebarOpen || sidebar.current.contains(target as Node) || trigger.current.contains(target as Node)) return;
      setSidebarOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    return () => document.removeEventListener('mousedown', clickHandler);
  }, [sidebarOpen, setSidebarOpen]);

  // Evita el scroll cuando el menú está abierto (móvil)
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [sidebarOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-gray-900 bg-opacity-40 z-40 lg:hidden transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <div
        ref={sidebar}
        className={`
          fixed z-50 left-0 top-0 h-screen w-64 bg-gray-800 p-4 flex flex-col transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-64'}
          lg:static lg:translate-x-0 lg:z-auto
        `}
      >
        {/* Botón cerrar solo en móvil */}
        <button
          ref={trigger}
          className="lg:hidden text-gray-500 hover:text-gray-400 absolute top-0 right-0 mt-4 mr-4"
          onClick={() => setSidebarOpen(false)}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center mb-8">
          <Logo className="h-10 w-10 text-cyan-400" />
          <span className="ml-3 text-2xl font-bold text-white">GolAnalytics</span>
        </div>

        <nav className="space-y-2">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <DashboardIcon />
            <span className="ml-3">Tablero</span>
          </NavLink>

          {profile?.rol === ROLES.ADMIN && (
            <NavLink
              to="/tagger"
              className={({ isActive }) =>
                `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <TaggerIcon />
              <span className="ml-3">Etiquetador</span>
            </NavLink>
          )}
        </nav>

        <div className="mt-auto text-center text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} GolAnalytics</p>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
