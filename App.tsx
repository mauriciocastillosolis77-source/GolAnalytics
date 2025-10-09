
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ROLES } from './constants';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import VideoTaggerPage from './pages/VideoTaggerPage';
import NotFoundPage from './pages/NotFoundPage';
import Layout from './components/layout/Layout';
import { Spinner } from './components/ui/Spinner';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Corregido: 'profile.role' a 'profile.rol'
  if (allowedRoles && profile && !allowedRoles.includes(profile.rol)) {
     return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-gray-900"><Spinner /></div>;
    }

    return (
        <Routes>
            <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <AuthPage />} />
            
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route 
                path="tagger" 
                element={
                  // The role check is temporarily removed to allow access for review
                  <ProtectedRoute>
                    <VideoTaggerPage />
                  </ProtectedRoute>
                } 
              />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  );
};

export default App;