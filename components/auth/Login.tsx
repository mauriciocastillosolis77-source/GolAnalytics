import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../ui/Spinner';

interface LoginProps {
  onSwitchToRegister: () => void;
}

const Login: React.FC<LoginProps> = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await signIn(email, password);
    
    setLoading(false);
    if (authError) {
      if (authError.message === 'Invalid login credentials') {
          setError('Correo o contraseña incorrectos. Por favor, inténtelo de nuevo.');
      } else {
           setError(`Error de diagnóstico: ${authError.message}`);
      }
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300">
          Correo Electrónico
        </label>
        <div className="mt-1">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm bg-gray-700 text-white"
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300">
          Contraseña
        </label>
        <div className="mt-1">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm bg-gray-700 text-white"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      <div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed"
        >
          {loading ? <Spinner /> : 'Iniciar Sesión'}
        </button>
      </div>

            <div className="text-center">
        <p className="text-sm text-gray-400">
          ¿No tienes una cuenta?{' '}
          {import.meta.env.VITE_ALLOW_SIGNUP === 'true' ? (
            <button type="button" onClick={onSwitchToRegister} className="font-medium text-cyan-400 hover:text-cyan-300">
              Regístrate
            </button>
          ) : (
            <span className="font-medium text-gray-500">Registro deshabilitado</span>
          )}
        </p>
      </div> 
    </form>
  );
};

export default Login;
