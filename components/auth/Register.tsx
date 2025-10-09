import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../ui/Spinner';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { signUp } = useAuth();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    
    if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    setLoading(true);

    const { error: signUpError } = await signUp(email, password);

    setLoading(false);
    if (signUpError) {
      setError(`Error de diagnóstico: ${signUpError.message}`);
    } else {
      setMessage('¡Registro exitoso! Por favor, revisa tu email para confirmar tu cuenta.');
    }
  };

  return (
    <form onSubmit={handleRegister} className="space-y-6">
       <div>
        <label htmlFor="email-register" className="block text-sm font-medium text-gray-300">
          Correo Electrónico
        </label>
        <div className="mt-1">
          <input
            id="email-register"
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
        <label htmlFor="password-register" className="block text-sm font-medium text-gray-300">
          Contraseña (mínimo 6 caracteres)
        </label>
        <div className="mt-1">
          <input
            id="password-register"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm bg-gray-700 text-white"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      {message && <p className="text-sm text-green-400 text-center">{message}</p>}

      <div>
        <button
          type="submit"
          disabled={loading || !!message} // Disable after successful message
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed"
        >
          {loading ? <Spinner /> : 'Registrarse'}
        </button>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-400">
          ¿Ya tienes una cuenta?{' '}
          <button type="button" onClick={onSwitchToLogin} className="font-medium text-cyan-400 hover:text-cyan-300">
            Inicia sesión
          </button>
        </p>
      </div>
    </form>
  );
};

export default Register;
