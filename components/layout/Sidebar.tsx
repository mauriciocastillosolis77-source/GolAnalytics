import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROLES } from '../../constants';
import { DashboardIcon, Logo, TaggerIcon, UsersIcon, RendimientoIcon, TacticalIcon, ScoutIcon, ReportIcon, ModeloIcon } from '../ui/Icons';

// Ícono de "Scouting" (persona con lupa). Va aquí y no en Icons.tsx para no tocar ese archivo.
const ScoutingIcon: React.FC = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 016-6h1.5M17.5 19a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM21 21l-1.7-1.7"></path>
  </svg>
);

const _forceTailwindClasses = ["translate-x-0", "-translate-x-64"];

// compacto: en pantallas grandes el menú se muestra solo con íconos (lo usa el Etiquetador para dejar
// más espacio al video). onCambiarCompacto muestra el botón » / « para abrirlo o cerrarlo.
const Sidebar: React.FC<{ sidebarOpen: boolean; setSidebarOpen: (open: boolean) => void; compacto?: boolean; onCambiarCompacto?: () => void }> = ({ sidebarOpen, setSidebarOpen, compacto = false, onCambiarCompacto }) => {
  const { profile } = useAuth();
  const trigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (!sidebarOpen || sidebar.current.contains(target as Node) || trigger.current.contains(target as Node)) return;
      setSidebarOpen(false);
    };
    document.addEventListener('mousedown', clickHandler);
    return () => document.removeEventListener('mousedown', clickHandler);
  }, [sidebarOpen, setSidebarOpen]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [sidebarOpen]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-gray-900 bg-opacity-40 z-40 lg:hidden transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <div
        ref={sidebar}
        className={`
          fixed z-50 left-0 top-0 h-screen w-64 bg-gray-800 p-4 flex flex-col transition-transform duration-200 ease-in-out
          ${compacto ? 'lg:w-16 lg:p-2 lg:[&_span]:hidden lg:[&_.mt-auto]:hidden' : ''}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-64'}
          lg:static lg:translate-x-0 lg:z-auto
        `}
      >
        <button
          ref={trigger}
          className="lg:hidden text-gray-500 hover:text-gray-400 absolute top-0 right-0 mt-4 mr-4"
          onClick={() => setSidebarOpen(false)}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className={`flex items-center ${onCambiarCompacto ? 'mb-3' : 'mb-8'}`}>
          <Logo className="h-10 w-10 text-cyan-400" />
          <span className="ml-3 text-2xl font-bold text-white">GolAnalytics</span>
        </div>
        {onCambiarCompacto && (
          <button
            type="button"
            onClick={onCambiarCompacto}
            className="hidden lg:flex items-center justify-center mb-4 h-8 w-full rounded-lg border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm"
            title={compacto ? 'Mostrar el menú completo' : 'Dejar solo los íconos'}
            aria-label={compacto ? 'Mostrar el menú completo' : 'Dejar solo los íconos'}
          >
            {compacto ? '»' : '«'}
          </button>
        )}

        <nav className="space-y-2">
          <NavLink title="Tablero"
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <DashboardIcon />
            <span className="ml-3">Tablero</span>
          </NavLink>

          <NavLink title="Rendimiento"
            to="/rendimiento"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <RendimientoIcon />
            <span className="ml-3">Rendimiento</span>
          </NavLink>

          <NavLink title="Análisis Táctico"
            to="/analisis-tactico"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <TacticalIcon />
            <span className="ml-3">Análisis Táctico</span>
          </NavLink>

          <NavLink title="Análisis del Rival"
            to="/analisis-rival"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <ScoutIcon />
            <span className="ml-3">Análisis del Rival</span>
          </NavLink>

          <NavLink title="Modelo de juego"
            to="/modelo-juego"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <ModeloIcon />
            <span className="ml-3">Modelo de juego</span>
          </NavLink>

          <NavLink title="Análisis Post Partido DT"
            to="/analisis-post-partido-dt"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <ReportIcon />
            <span className="ml-3">Análisis Post Partido DT</span>
          </NavLink>

          <NavLink title="Scouting DT"
            to="/scouting-dt"
            className={({ isActive }) =>
              `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <ScoutingIcon />
            <span className="ml-3">Scouting DT</span>
          </NavLink>

          {profile?.rol === ROLES.ADMIN && (
            <>
              <NavLink title="Etiquetador"
                to="/tagger"
                className={({ isActive }) =>
                  `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <TaggerIcon />
                <span className="ml-3">Etiquetador</span>
              </NavLink>
              <NavLink title="Usuarios"
                to="/admin/users"
                className={({ isActive }) =>
                  `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <UsersIcon />
                <span className="ml-3">Usuarios</span>
              </NavLink>
              <NavLink title="Análisis Ejecutivo Post Partido"
                to="/generar-reportes"
                className={({ isActive }) =>
                  `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <ReportIcon />
                <span className="ml-3">Análisis Ejecutivo Post Partido</span>
              </NavLink>
              <NavLink title="Scouting"
                to="/scouting"
                className={({ isActive }) =>
                  `flex items-center p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white ${isActive ? 'bg-cyan-600 text-white' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <ScoutingIcon />
                <span className="ml-3">Scouting</span>
              </NavLink>
            </>
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
