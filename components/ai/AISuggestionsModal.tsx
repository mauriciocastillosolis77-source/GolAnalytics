import React, { useRef, useState, useCallback } from 'react';
import type { AISuggestion } from '../../types';
import { CheckIcon, CloseIcon, SparklesIcon, EyeIcon } from '../ui/Icons';

interface AISuggestionsModalProps {
  suggestions: AISuggestion[];
  onAccept: (suggestion: AISuggestion) => void;
  onReject: (suggestion: AISuggestion) => void;
  onPreview: (suggestion: AISuggestion) => void;
  onClose: () => void;
}

const AISuggestionsModal: React.FC<AISuggestionsModalProps> = ({ suggestions, onAccept, onReject, onPreview, onClose }) => {
  // Posición inicial: centrado en pantalla
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Inicializar posición centrada la primera vez que se monta
  const initPos = useCallback((node: HTMLDivElement | null) => {
    (modalRef as any).current = node;
    if (node && pos === null) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const rect = node.getBoundingClientRect();
      setPos({
        x: Math.round((w - rect.width) / 2),
        y: Math.round((h - rect.height) / 2),
      });
    }
  }, [pos]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Solo arrastrar desde el header, no desde botones
    if ((e.target as HTMLElement).closest('button')) return;
    dragging.current = true;
    dragOffset.current = {
      x: e.clientX - (pos?.x ?? 0),
      y: e.clientY - (pos?.y ?? 0),
    };
    e.preventDefault();

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: ev.clientX - dragOffset.current.x,
        y: ev.clientY - dragOffset.current.y,
      });
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Estilo de posición: fijo en pantalla, arrastrable
  const modalStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 50, margin: 0 }
    : { position: 'fixed', zIndex: 50, margin: 0 };

  return (
    // Overlay transparente — no bloquea el video detrás
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        ref={initPos}
        style={modalStyle}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto"
      >
        {/* Header — zona de arrastre */}
        <div
          className="flex justify-between items-center p-4 border-b border-gray-700 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <SparklesIcon className="text-purple-400" />
            Detección Automática de Acciones
            <span className="text-xs text-gray-500 font-normal ml-2">— arrastra para mover</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {suggestions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">Todas las sugerencias han sido procesadas.</p>
              <button
                onClick={onClose}
                className="mt-4 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            suggestions.map((suggestion, index) => (
              <div key={index} className="bg-gray-700 p-4 rounded-lg flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-cyan-400 bg-gray-900 px-2 py-1 rounded text-sm">{suggestion.timestamp}</span>
                    <span className="font-semibold text-white">{suggestion.action}</span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{suggestion.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPreview(suggestion)}
                    className="p-2 bg-blue-600 hover:bg-blue-500 rounded-full text-white transition-colors"
                    aria-label="Ver en video"
                    title="Ver en video"
                  >
                    <EyeIcon />
                  </button>
                  <button
                    onClick={() => onAccept(suggestion)}
                    className="p-2 bg-green-600 hover:bg-green-500 rounded-full text-white transition-colors"
                    aria-label="Aceptar sugerencia"
                    title="Aceptar"
                  >
                    <CheckIcon />
                  </button>
                  <button
                    onClick={() => onReject(suggestion)}
                    className="p-2 bg-red-600 hover:bg-red-500 rounded-full text-white transition-colors"
                    aria-label="Rechazar sugerencia"
                    title="Rechazar"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AISuggestionsModal;

