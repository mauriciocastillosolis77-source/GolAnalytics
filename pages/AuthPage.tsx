import React, { useState } from 'react';
import Login from '../components/auth/Login';
import Register from '../components/auth/Register';

const AuthPage: React.FC = () => {
  const [isLoginView, setIsLoginView] = useState(true);

  const toggleView = () => setIsLoginView(!isLoginView);

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white">GolAnalytics</h1>
            <p className="text-gray-400 mt-2">
                {isLoginView ? 'Inicia sesión para continuar' : 'Crea una cuenta para empezar'}
            </p>
        </div>
        
        <div className="bg-[#1F2937] p-8 rounded-lg shadow-lg border border-[#00A9FF]">
          {isLoginView ? (
            <Login onSwitchToRegister={toggleView} />
          ) : (
            <Register onSwitchToLogin={toggleView} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;