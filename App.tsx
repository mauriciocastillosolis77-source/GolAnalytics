import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ROLES } from './constants';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import VideoTaggerPage from './pages/VideoTaggerPage';
import AdminUsersPage from './pages/AdminUsersPage';
import RendimientoPage from './pages/RendimientoPage';
import NotFoundPage from './pages/NotFoundPage';
import Layout from './components/layout/Layout';
import { Spinner } from './components/ui/Spinner';

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
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <Spinner />
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/" element={!user ? <AuthPage /> : <Navigate to="/dashboard" />} />
            
            <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
            <Route path="/rendimiento" element={<ProtectedRoute><Layout><RendimientoPage /></Layout></ProtectedRoute>} />
            <Route 
              path="/tagger" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <Layout><VideoTaggerPage /></Layout>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/users" 
              element={
                <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                  <Layout><AdminUsersPage /></Layout>
                </ProtectedRoute>
              } 
            />
            
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default App;
