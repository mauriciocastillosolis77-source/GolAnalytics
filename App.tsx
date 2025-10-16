import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import VideoTaggerPage from './pages/VideoTaggerPage';
import NotFoundPage from './pages/NotFoundPage';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/layout/Layout';
import Spinner from './components/ui/Spinner';
import { ROLES } from './constants';

const App: React.FC = () => {
    const { user, profile, loading, authError } = useAuth();

    if (loading && !authError) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <Spinner />
            </div>
        );
    }

    if (authError) {
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
            <Route path="/dashboard" element={user ? <Layout><DashboardPage /></Layout> : <Navigate to="/" />} />
            <Route
                path="/tagger"
                element={
                    user && profile?.rol === ROLES.ADMIN
                        ? <Layout><VideoTaggerPage /></Layout>
                        : <Navigate to="/dashboard" />
                }
            />
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default App;
