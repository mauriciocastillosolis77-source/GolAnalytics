import React, { useMemo } from 'react';
import type { Tag } from '../../types';
import {
    CORNER_FAVOR, CORNER_CONTRA, TL_FAVOR, TL_CONTRA, PENAL_FAVOR, PENAL_CONTRA,
    ACCIONES_COBRO, ACCIONES_ABP_SET, ENVIO_LABEL, contarCobros, contarPenales, envioMasUsado,
} from '../../utils/balonParado';

// ─────────────────────────────────────────────────────────────────────────────
// Tablero · Balón parado (mejoras 4 y 5). Cobros → remates → goles por tipo de
// cobro, a favor (cian) y en contra (naranja), más la línea de penales.
// Solo cuenta: no toca la efectividad. Respeta los filtros del Tablero porque
// recibe las etiquetas ya filtradas.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    tags: Tag[]; // etiquetas ya filtradas y sin el jugador ficticio
}

const FAVOR = '#22D3EE';
const CONTRA = '#FB923C';

const BalonParadoCard: React.FC<Props> = ({ tags }) => {
    const abp = useMemo(() => tags.filter(t => ACCIONES_ABP_SET.has(t.accion)), [tags]);
    const filas = useMemo(() => ([
        { label: 'Córners a favor', color: FAVOR, c: contarCobros(abp, CORNER_FAVOR) },
        { label: 'Tiros libres a favor', color: FAVOR, c: contarCobros(abp, TL_FAVOR) },
        { label: 'Córners en contra', color: CONTRA, c: contarCobros(abp, CORNER_CONTRA) },
        { label: 'Tiros libres en contra', color: CONTRA, c: contarCobros(abp, TL_CONTRA) },
    ]), [abp]);
    const penFav = useMemo(() => contarPenales(abp, PENAL_FAVOR), [abp]);
    const penCon = useMemo(() => contarPenales(abp, PENAL_CONTRA), [abp]);

    const lectura = useMemo(() => {
        const cobrosFav = abp.filter(t => t.accion === CORNER_FAVOR || t.accion === TL_FAVOR);
        const cobrosCon = abp.filter(t => t.accion === CORNER_CONTRA || t.accion === TL_CONTRA);
        const partes: string[] = [];
        const golesFav = filas[0].c.goles + filas[1].c.goles;
        const golesCon = filas[2].c.goles + filas[3].c.goles;
        if (cobrosFav.length > 0) partes.push(golesFav > 0 ? `a favor, 1 gol cada ${Math.round(cobrosFav.length / golesFav)} cobros` : `a favor, ${cobrosFav.length} cobros sin gol`);
        if (cobrosCon.length > 0) partes.push(golesCon > 0 ? `en contra, 1 gol cada ${Math.round(cobrosCon.length / golesCon)} cobros` : `en contra, ${cobrosCon.length} cobros sin gol`);
        const top = envioMasUsado(abp.filter(t => ACCIONES_COBRO.has(t.accion) && (t.accion === CORNER_FAVOR || t.accion === TL_FAVOR)));
        let texto = partes.length ? partes.join('; ') : '';
        if (top) texto += `${texto ? '. ' : ''}Nuestra zona de envío más usada: ${ENVIO_LABEL[top.envio].toLowerCase()} (${top.n})`;
        return texto ? `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.` : '';
    }, [abp, filas]);

    const sinResultado = filas.reduce((n, f) => n + (f.c.cobros - f.c.conResultado), 0)
        + (penFav.tirados - penFav.conResultado) + (penCon.tirados - penCon.conResultado);

    return (
        <div className="bg-gray-800 p-6 rounded-lg flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-white">Balón parado</h3>
            {abp.length === 0 ? (
                <p className="text-sm text-gray-400">Todavía no hay córners, tiros libres ni penales etiquetados.</p>
            ) : (
                <>
                    <div className="flex gap-4 text-xs text-gray-300">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: FAVOR }} />A favor</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CONTRA }} />En contra</span>
                    </div>
                    <div className="grid gap-1.5 text-sm" style={{ gridTemplateColumns: 'minmax(0,1fr) repeat(3, 64px)' }}>
                        <span />
                        <span className="text-xs text-gray-400 text-center">Cobros</span>
                        <span className="text-xs text-gray-400 text-center">Remates</span>
                        <span className="text-xs text-gray-400 text-center">Goles</span>
                    </div>
                    {filas.map(f => (
                        <div key={f.label} className="grid gap-1.5 items-center bg-gray-900 rounded-md px-3 py-2 text-sm border-l-4" style={{ gridTemplateColumns: 'minmax(0,1fr) repeat(3, 64px)', borderLeftColor: f.color }}>
                            <span className="text-gray-200">{f.label}</span>
                            <span className="text-center font-bold text-white">{f.c.cobros}</span>
                            <span className="text-center font-bold text-white">{f.c.remates}</span>
                            <span className="text-center font-bold text-white">{f.c.goles}</span>
                        </div>
                    ))}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="border border-gray-700 rounded-md px-3 py-2 text-gray-200">
                            Penales a favor<br />
                            <span className="font-bold" style={{ color: FAVOR }}>{penFav.tirados === 0 ? '—' : `${penFav.goles} anotados de ${penFav.tirados}`}</span>
                        </div>
                        <div className="border border-gray-700 rounded-md px-3 py-2 text-gray-200">
                            Penales en contra<br />
                            <span className="font-bold" style={{ color: CONTRA }}>{penCon.tirados === 0 ? '—' : `${penCon.goles} anotados de ${penCon.tirados}`}</span>
                        </div>
                    </div>
                    {lectura && <p className="text-sm text-gray-200"><span className="font-semibold">Lectura:</span> {lectura}</p>}
                    <p className="text-xs text-gray-500">
                        Remates incluye los que terminaron en gol. Solo se cuenta: no cambia la efectividad.
                        {sinResultado > 0 && ` ${sinResultado} jugada${sinResultado === 1 ? '' : 's'} sin resultado marcado.`}
                    </p>
                </>
            )}
        </div>
    );
};

export default BalonParadoCard;
