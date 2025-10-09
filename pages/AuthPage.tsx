// FIX: Implement the authentication page component.
import React, { useState } from 'react';
import Login from '../components/auth/Login';
import Register from '../components/auth/Register';
import { Logo } from '../components/ui/Icons';

const AuthPage: React.FC = () => {
  const [isLoginView, setIsLoginView] = useState(true);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
         <div className="flex justify-center items-center">
            <Logo className="h-12 w-auto text-cyan-400" />
            <h2 className="ml-3 text-center text-3xl font-extrabold text-white">GolAnalytics</h2>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {isLoginView ? <Login /> : <Register />}

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">O</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setIsLoginView(!isLoginView)}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-sm font-medium text-white hover:bg-gray-600"
              >
                {isLoginView ? 'Crear una nueva cuenta' : '¿Ya tienes una cuenta? Inicia sesión'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
