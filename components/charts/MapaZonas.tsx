import React, { useMemo, useState } from 'react';
import type { Tag, Match } from '../../types';
import { TERCIOS, CARRILES, TERCIO_LABEL, CARRIL_LABEL, codigoZona } from '../../utils/zonas';
import { PITCH_BASE64 } from '../../constants/pitchBase64';

// ─────────────────────────────────────────────────────────────────────────────
// Mapa de 9 zonas (mejora 1). Cuenta en qué zona de la cancha ocurrieron las
// etiquetas que recibe (ya filtradas por acción, jugador, etc.).
// Filas: carril izquierda / centro / derecha. Columnas: Inicio → Creación →
// Finalización (nuestro equipo ataca hacia la derecha).
// Las etiquetas sin zona no se dibujan, pero se informan abajo para que el
// número del mapa no se confunda con el total.
// ─────────────────────────────────────────────────────────────────────────────

interface MapaZonasProps {
    titulo: string;
    tags: Tag[];
    color: 'verde' | 'rojo';
    // Si se pasan los partidos, aparece el selector de jornada (Todas, J1, J2…).
    matches?: Match[];
    // Texto para la lectura, en plural: "recuperaciones", "pérdidas".
    nombreAccion: string;
}

// Sobre la cancha verde, las recuperaciones se pintan en cian (en verde no se distinguirían) y las pérdidas en rojo.
const RGB = { verde: '34,211,238', rojo: '239,68,68' };

const MapaZonas: React.FC<MapaZonasProps> = ({ titulo, tags, color, matches, nombreAccion }) => {
    const [jornadaSel, setJornadaSel] = useState<number | 'todas'>('todas');

    const jornadaDeTag = useMemo(() => {
        const m = new Map<string, number>();
        (matches || []).forEach(mt => m.set(mt.id, Number(mt.jornada)));
        return m;
    }, [matches]);

    const jornadasDisponibles = useMemo(() => {
        if (!matches) return [];
        const set = new Set<number>();
        tags.forEach(t => {
            const j = jornadaDeTag.get(t.match_id);
            if (j !== undefined && !isNaN(j)) set.add(j);
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [tags, matches, jornadaDeTag]);

    // Si la jornada elegida ya no existe (por cambiar filtros), vuelve a "Todas".
    const jornadaActiva = jornadaSel !== 'todas' && !jornadasDisponibles.includes(jornadaSel) ? 'todas' : jornadaSel;

    const tagsVisibles = useMemo(() => (
        jornadaActiva === 'todas' ? tags : tags.filter(t => jornadaDeTag.get(t.match_id) === jornadaActiva)
    ), [tags, jornadaActiva, jornadaDeTag]);

    const { conteo, conZona, sinZona, max, mejor } = useMemo(() => {
        const c: Record<string, number> = {};
        let con = 0;
        tagsVisibles.forEach(t => {
            if (t.zona) { c[t.zona] = (c[t.zona] || 0) + 1; con++; }
        });
        let mx = 0; let best: string | null = null;
        CARRILES.forEach(car => TERCIOS.forEach(ter => {
            const k = codigoZona(ter, car);
            if ((c[k] || 0) > mx) { mx = c[k]; best = k; }
        }));
        return { conteo: c, conZona: con, sinZona: tagsVisibles.length - con, max: mx, mejor: best as string | null };
    }, [tagsVisibles]);

    const etiquetaMejor = (() => {
        if (!mejor) return null;
        const [t, c] = mejor.split('-') as [typeof TERCIOS[number], typeof CARRILES[number]];
        return `${TERCIO_LABEL[t]}, ${CARRIL_LABEL[c].toLowerCase()} (${conteo[mejor]})`;
    })();

    return (
        <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-white">{titulo}</h3>

            {matches && jornadasDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {(['todas', ...jornadasDisponibles] as (number | 'todas')[]).map(j => (
                        <button
                            key={String(j)}
                            onClick={() => setJornadaSel(j)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${jornadaActiva === j ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        >
                            {j === 'todas' ? 'Todas' : `J${j}`}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid gap-1 text-xs text-gray-400" style={{ gridTemplateColumns: '64px repeat(3, minmax(0, 1fr))' }}>
                <span></span>
                {TERCIOS.map(t => <span key={t} className="text-center">{TERCIO_LABEL[t]}</span>)}
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: '64px minmax(0, 1fr)' }}>
                <div className="grid text-xs text-gray-400" style={{ gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}>
                    {CARRILES.map(c => <span key={c} className="flex items-center">{CARRIL_LABEL[c]}</span>)}
                </div>
                {/* Cancha (la misma imagen del reporte) con las 9 zonas encima */}
                <div
                    className="relative w-full rounded overflow-hidden"
                    style={{ aspectRatio: '326 / 207', backgroundImage: `url(${PITCH_BASE64})`, backgroundSize: '100% 100%' }}
                >
                    <div className="absolute inset-0 grid grid-cols-3" style={{ gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}>
                        {CARRILES.map((c, r) => TERCIOS.map((t, i) => {
                            const k = codigoZona(t, c);
                            const v = conteo[k] || 0;
                            const alpha = max > 0 && v > 0 ? 0.25 + 0.6 * (v / max) : 0;
                            return (
                                <div
                                    key={k}
                                    className="flex items-center justify-center"
                                    style={{
                                        backgroundColor: `rgba(${RGB[color]}, ${alpha.toFixed(2)})`,
                                        borderRight: i < 2 ? '1px dashed rgba(255,255,255,0.55)' : undefined,
                                        borderBottom: r < 2 ? '1px dashed rgba(255,255,255,0.55)' : undefined,
                                    }}
                                    title={`${TERCIO_LABEL[t]} · ${CARRIL_LABEL[c].toLowerCase()}: ${v}`}
                                >
                                    {v > 0 && (
                                        <span className="min-w-[32px] h-8 px-2 rounded-full bg-gray-900/80 text-white text-base font-bold flex items-center justify-center">
                                            {v}
                                        </span>
                                    )}
                                </div>
                            );
                        }))}
                    </div>
                </div>
            </div>
            <p className="text-xs text-gray-400">Tu equipo ataca hacia la derecha →</p>

            {conZona === 0 ? (
                <p className="text-sm text-gray-400">Todavía no hay {nombreAccion} con zona marcada{jornadaActiva !== 'todas' ? ` en J${jornadaActiva}` : ''}.</p>
            ) : (
                <p className="text-sm text-gray-200">
                    <span className="font-semibold">Lectura:</span> más {nombreAccion} en {etiquetaMejor}.
                </p>
            )}
            {sinZona > 0 && (
                <p className="text-xs text-gray-500">{conZona} de {tagsVisibles.length} {nombreAccion} tienen zona marcada.</p>
            )}
        </div>
    );
};

export default MapaZonas;
