
import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-6xl font-bold text-cyan-400 mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-8">Página No Encontrada</h2>
      <p className="text-gray-400 mb-8">Lo sentimos, la página que buscas no existe.</p>
      <Link to="/" className="px-6 py-3 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700 transition-colors">
        Volver al Inicio
      </Link>
    </div>
  );
};

export default NotFoundPage;
