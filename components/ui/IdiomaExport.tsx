import React, { useCallback, useRef, useState } from 'react';
import type { Idioma } from '../../utils/scoutingI18n';
import { conModeloDeRespaldo, esErrorDeGemini, mensajeErrorGemini } from '../../services/geminiConfig';
import { AVISO_TRADUCCION_SIN_GUARDAR } from '../../services/traduccionService';

// ─────────────────────────────────────────────────────────────────────────────
// Piezas que comparten los botones de exportar para ofrecer el archivo en
// español o en inglés.
//
// Regla del inglés: si la traducción no se puede hacer (Gemini saturado o sin
// cuota), NO se descarga nada — un archivo en dos idiomas no sirve. Se avisa y
// se ofrece el modelo de respaldo. Nunca se reintenta solo.
// ─────────────────────────────────────────────────────────────────────────────

/** Selector Español | English que va junto al botón de descargar. */
export const SelectorIdioma: React.FC<{ value: Idioma; onChange: (i: Idioma) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="inline-flex rounded-md overflow-hidden border border-gray-600" role="group" aria-label="Idioma del archivo" data-selector-idioma>
    {([['es', 'Español'], ['en', 'English']] as Array<[Idioma, string]>).map(([id, texto]) => (
      <button
        key={id}
        type="button"
        disabled={disabled}
        aria-pressed={value === id}
        onClick={() => onChange(id)}
        className={`px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${value === id ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
      >
        {texto}
      </button>
    ))}
  </div>
);

type Trabajo = (idioma: Idioma) => Promise<{ guardada?: boolean } | void>;

/**
 * Estado y reglas de una exportación con idioma.
 * `exportar(trabajo)` corre el trabajo (traducir si hace falta + generar el archivo).
 * Si falla por Gemini al exportar en inglés, deja el mensaje en `error` y permite
 * `conRespaldo()` — que repite el mismo trabajo con el modelo de respaldo.
 */
export function useExportConIdioma(mensajeFalloGeneral = 'Error al generar el PDF. Intenta de nuevo.') {
  const [idioma, setIdiomaEstado] = useState<Idioma>('es');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimo = useRef<Trabajo | null>(null);

  const setIdioma = useCallback((i: Idioma) => { setIdiomaEstado(i); setError(null); setAviso(null); }, []);
  const limpiar = useCallback(() => { setError(null); setAviso(null); }, []);

  const correr = async (trabajo: Trabajo, respaldo: boolean) => {
    ultimo.current = trabajo;
    setOcupado(true); setError(null); setAviso(null);
    try {
      const r = respaldo ? await conModeloDeRespaldo(() => trabajo(idioma)) : await trabajo(idioma);
      if (idioma === 'en' && r && r.guardada === false) setAviso(AVISO_TRADUCCION_SIN_GUARDAR);
    } catch (err) {
      console.error('No se pudo exportar:', err);
      if (idioma === 'en' && esErrorDeGemini(err)) {
        setError(`No se pudo traducir al inglés. ${mensajeErrorGemini(err)} No se descargó ningún archivo. Puedes intentar más tarde o usar el modelo de respaldo; el archivo en español sí está disponible.`);
      } else {
        alert(mensajeFalloGeneral);
      }
    } finally {
      setOcupado(false);
    }
  };

  return {
    idioma, setIdioma, ocupado, error, aviso, limpiar,
    exportar: (trabajo: Trabajo) => correr(trabajo, false),
    conRespaldo: () => (ultimo.current ? correr(ultimo.current, true) : Promise.resolve()),
  };
}

/** Mensajes debajo del botón: el error de traducción (con el botón de respaldo) o el aviso de "no se guardó". */
export const AvisoExportIngles: React.FC<{ error: string | null; aviso: string | null; ocupado: boolean; onRespaldo: () => void }> = ({ error, aviso, ocupado, onRespaldo }) => {
  if (!error && !aviso) return null;
  return (
    <div className="mt-3 max-w-2xl mx-auto rounded-lg border border-amber-700 bg-amber-900/30 p-3 text-sm text-amber-100" role="alert" data-aviso-export>
      <p>{error || aviso}</p>
      {error && (
        <button
          type="button"
          onClick={onRespaldo}
          disabled={ocupado}
          className="mt-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold py-1.5 px-3 rounded-md"
        >
          {ocupado ? 'Traduciendo…' : 'Intentar con el modelo de respaldo'}
        </button>
      )}
    </div>
  );
};
