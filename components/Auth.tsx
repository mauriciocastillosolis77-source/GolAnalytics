import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, AuthError } from "firebase/auth";
import { firebaseApp } from '../firebaseConfig';

const auth = getAuth(firebaseApp);

export const AuthComponent: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            const authError = err as AuthError;
            switch (authError.code) {
                case 'auth/user-not-found':
                    setError('No se encontró ningún usuario con este correo electrónico.');
                    break;
                case 'auth/wrong-password':
                    setError('La contraseña es incorrecta.');
                    break;
                case 'auth/email-already-in-use':
                    setError('Este correo electrónico ya está en uso. Por favor, inicie sesión.');
                    break;
                case 'auth/weak-password':
                     setError('La contraseña debe tener al menos 6 caracteres.');
                     break;
                default:
                    setError('Ocurrió un error. Por favor, inténtelo de nuevo.');
                    console.error(authError);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0a192f] flex items-center justify-center p-4">
            <div className="w-full max-w-sm mx-auto bg-[#1e2a47] rounded-lg p-8 shadow-2xl border border-[#00c6ff]">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white tracking-wider">GolAnalytics</h1>
                    <p className="text-gray-400 mt-2">{isLogin ? 'Inicia sesión para continuar' : 'Crea una cuenta para empezar'}</p>
                </div>

                <form onSubmit={handleAuthAction} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-400">Correo Electrónico</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full bg-[#0a192f] border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:border-[#00c6ff] transition"
                            placeholder="tu@email.com"
                        />
                    </div>
                    <div>
                        <label htmlFor="password"className="block text-sm font-medium text-gray-400">Contraseña</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full bg-[#0a192f] border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:border-[#00c6ff] transition"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#00c6ff] text-black font-bold py-3 px-4 rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {loading ? <div className="spinner h-5 w-5 border-2 border-t-black"></div> : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-sm text-gray-400 hover:text-[#00c6ff]">
                        {isLogin ? '¿No tienes una cuenta? Regístrate' : '¿Ya tienes una cuenta? Inicia sesión'}
                    </button>
                </div>
            </div>
        </div>
    );
};
