import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseApp } from '../firebaseConfig.js';

const auth = getAuth(firebaseApp);

export const AuthComponent = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuthAction = async (e) => {
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
            switch (err.code) {
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
                    console.error(err);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        React.createElement("div", { className: "fixed inset-0 bg-[#0a192f] flex items-center justify-center p-4" },
            React.createElement("div", { className: "w-full max-w-sm mx-auto bg-[#1e2a47] rounded-lg p-8 shadow-2xl border border-[#00c6ff]" },
                React.createElement("div", { className: "text-center mb-8" },
                    React.createElement("h1", { className: "text-3xl font-bold text-white tracking-wider" }, "GolAnalytics"),
                    React.createElement("p", { className: "text-gray-400 mt-2" }, isLogin ? 'Inicia sesión para continuar' : 'Crea una cuenta para empezar')
                ),
                React.createElement("form", { onSubmit: handleAuthAction, className: "space-y-6" },
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "email", className: "block text-sm font-medium text-gray-400" }, "Correo Electrónico"),
                        React.createElement("input", {
                            id: "email",
                            type: "email",
                            value: email,
                            onChange: (e) => setEmail(e.target.value),
                            required: true,
                            className: "mt-1 block w-full bg-[#0a192f] border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:border-[#00c6ff] transition",
                            placeholder: "tu@email.com"
                        })
                    ),
                    React.createElement("div", null,
                        React.createElement("label", { htmlFor: "password", className: "block text-sm font-medium text-gray-400" }, "Contraseña"),
                        React.createElement("input", {
                            id: "password",
                            type: "password",
                            value: password,
                            onChange: (e) => setPassword(e.target.value),
                            required: true,
                            className: "mt-1 block w-full bg-[#0a192f] border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:border-[#00c6ff] transition",
                            placeholder: "••••••••"
                        })
                    ),
                    error && React.createElement("p", { className: "text-sm text-red-400 text-center" }, error),
                    React.createElement("button", {
                        type: "submit",
                        disabled: loading,
                        className: "w-full bg-[#00c6ff] text-black font-bold py-3 px-4 rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
                    },
                        loading ? React.createElement("div", { className: "spinner h-5 w-5 border-2 border-t-black" }) : (isLogin ? 'Iniciar Sesión' : 'Registrarse')
                    )
                ),
                React.createElement("div", { className: "mt-6 text-center" },
                    React.createElement("button", { onClick: () => { setIsLogin(!isLogin); setError(''); }, className: "text-sm text-gray-400 hover:text-[#00c6ff]" },
                        isLogin ? '¿No tienes una cuenta? Regístrate' : '¿Ya tienes una cuenta? Inicia sesión'
                    )
                )
            )
        )
    );
};
