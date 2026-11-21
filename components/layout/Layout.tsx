import React, { useState, ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

interface LayoutProps {
    children: ReactNode;
    // compacto: menú lateral solo con íconos y menos margen (Etiquetador: más espacio para el video)
    compacto?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, compacto = false }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuExpandido, setMenuExpandido] = useState(false);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar: siempre montado, maneja visibilidad con sidebarOpen */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        compacto={compacto && !menuExpandido}
        onCambiarCompacto={compacto ? () => setMenuExpandido(!menuExpandido) : undefined}
      />
      {/* Contenido principal */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header setSidebarOpen={setSidebarOpen} />
        <main className={compacto ? "flex-1 p-2 lg:p-3 overflow-y-auto" : "flex-1 p-4 lg:p-6 overflow-y-auto"}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
