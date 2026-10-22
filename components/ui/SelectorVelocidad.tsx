import React, { useCallback, useState } from 'react';

// Velocidad de reproducción compartida por los videos de análisis (Análisis Táctico y
// Análisis del Rival). La última velocidad elegida se recuerda en este navegador, así
// no hay que volver a elegirla cada vez que se abre un video.
export const VELOCIDADES_VIDEO = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const CLAVE = 'golanalytics_velocidad_video';

const leerVelocidad = (): number => {
  try {
    const v = parseFloat(localStorage.getItem(CLAVE) || '');
    return VELOCIDADES_VIDEO.includes(v) ? v : 1;
  } catch { return 1; }
};

// Pone la velocidad en un video. defaultPlaybackRate hace que se conserve cuando el
// navegador recarga el video (por ejemplo al cambiar de archivo).
export const aplicarVelocidad = (video: HTMLVideoElement | null | undefined, velocidad: number) => {
  if (!video) return;
  video.defaultPlaybackRate = velocidad;
  if (video.playbackRate !== velocidad) video.playbackRate = velocidad;
};

export function useVelocidadVideo(): [number, (v: number) => void] {
  const [velocidad, setVelocidad] = useState<number>(leerVelocidad);
  const cambiar = useCallback((v: number) => {
    setVelocidad(v);
    try { localStorage.setItem(CLAVE, String(v)); } catch { /* sin almacenamiento: solo dura esta sesión */ }
  }, []);
  return [velocidad, cambiar];
}

export const SelectorVelocidad: React.FC<{ value: number; onChange: (v: number) => void; className?: string; etiqueta?: boolean }> = ({ value, onChange, className, etiqueta = true }) => (
  <label className="flex items-center gap-1.5 text-xs text-gray-400" title="Velocidad de reproducción">
    {etiqueta && <span>Velocidad</span>}
    <select value={value} onChange={e => onChange(parseFloat(e.target.value))}
      className={className ?? 'bg-gray-700 hover:bg-gray-600 text-white rounded px-1.5 py-1 text-xs border border-gray-600'}>
      {VELOCIDADES_VIDEO.map(v => <option key={v} value={v}>{v}x</option>)}
    </select>
  </label>
);
