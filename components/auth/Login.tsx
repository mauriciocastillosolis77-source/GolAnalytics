import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../ui/Spinner';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const { error: authError } = await login(email, password);
            if (authError) {
                console.error('Supabase Login Error:', authError);
                // DIAGNOSTIC CHANGE: Display the actual Supabase error message
                // This will give us the exact reason for the failure in production.
                setError(`Error de diagnóstico: ${authError.message}`);
            }
        } catch (err: any) {
            console.error('Unexpected Login Error:', err);
            setError(`Error inesperado en la aplicación: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {/* The error message style from the screenshot is just red text */}
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">
                    Correo Electrónico
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    // Styling closer to the screenshot
                    className="appearance-none block w-full px-3 py-2 border border-slate-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm bg-slate-900/70 text-white"
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1">
                    Contraseña
                </label>
                 <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    // Styling closer to the screenshot
                    className="appearance-none block w-full px-3 py-2 border border-slate-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm bg-slate-900/70 text-white"
                />
            </div>

            <div className="pt-2">
                <button
                    type="submit"
                    disabled={loading}
                    // Styling closer to the screenshot (bright cyan button)
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-[#00BFFF] hover:bg-[#00A8F3] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-800 disabled:bg-gray-500 disabled:opacity-50"
                >
                    {loading ? <Spinner /> : 'Iniciar Sesión'}
                </button>
            </div>
            
            <div className="text-center text-sm pt-2">
                <span className="text-gray-400">¿No tienes una cuenta? </span>
                <a href="#" onClick={(e) => e.preventDefault()} className="font-medium text-cyan-400 hover:text-cyan-300">
                    Regístrate
                </a>
            </div>
        </form>
    );
};

export default Login;