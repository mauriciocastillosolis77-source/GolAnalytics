import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ROLES } from './constants';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import VideoTaggerPage from './pages/VideoTaggerPage';
import NotFoundPage from './pages/NotFoundPage';
import Layout from './components/layout/Layout';
import { Spinner } from './components/ui/Spinner';

// Definición local de ProtectedRoute (no importado externamente)
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, profile } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }
  
  if (allowedRoles && profile && !allowedRoles.includes(profile.rol)) {
     return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
    const { user, profile, loading, authError } = useAuth();

    // Solo loading inicial
    if (loading && !user) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <Spinner />
            </div>
        );
    }

    // Solo mostrar error global si no hay usuario
    if (authError && !user) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900">
                <div className="bg-red-900 text-red-200 p-6 rounded shadow-lg text-center max-w-xl">
                    <h2 className="text-2xl font-bold mb-2">Problema de autenticación</h2>
                    <p className="mb-4">{authError}</p>
                    <button
                        className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded"
                        onClick={() => window.location.reload()}
                    >
                        Recargar página
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/" element={!user ? <AuthPage /> : <Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
            <Route
                path="/tagger"
                element={
                    <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                        <Layout><VideoTaggerPage /></Layout>
                    </ProtectedRoute>
                }
            />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default App;
