// FIX: Implement the Register component.
import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Spinner } from '../ui/Spinner';

const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('¡Registro exitoso! Por favor, revisa tu email para confirmar tu cuenta.');
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleRegister} className="space-y-6">
      <div>
        <label htmlFor="email-register" className="block text-sm font-medium text-gray-300">
          Email
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
          Contraseña
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

      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-400">{message}</p>}

      <div>
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
        >
          {loading ? <Spinner /> : 'Registrarse'}
        </button>
      </div>
    </form>
  );
};

export default Register;
