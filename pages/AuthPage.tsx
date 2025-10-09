import React from 'react';
import Login from '../components/auth/Login';

const AuthPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        {/* Card with border and inner background from screenshot */}
        <div className="w-full max-w-md p-8 space-y-6 bg-[#1E293B] rounded-xl shadow-2xl border border-cyan-500/30">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-white mb-2">GolAnalytics</h1>
                <p className="text-gray-400">
                    Inicia sesión para continuar
                </p>
            </div>
            <Login />
        </div>
    </div>
  );
};

export default AuthPage;
