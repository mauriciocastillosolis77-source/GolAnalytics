// ─────────────────────────────────────────────────────────────────────────────
// Balón parado y penales (mejoras 4 y 5).
//
// Acciones nuevas del Etiquetador. SOLO SE CUENTAN: no suben ni bajan la
// efectividad ni cambian "Acciones Totales". Mauricio sigue etiquetando igual
// que antes (Tiro a portería, Goles a favor, Goles recibidos, Atajadas); estas
// etiquetas se agregan aparte para guardar el detalle en `tags.detalle` (jsonb):
//   Córner / Tiro libre: { envio: 'primer_palo', resultado: 'remate', marcaje: 'zona' }
//   Penal:               { porteria: 'bajo-izquierda', resultado: 'gol' }
// Todos los campos son opcionales.
// ─────────────────────────────────────────────────────────────────────────────
import { codigoPorteria, etiquetaPorteria, type AlturaPorteria, type LadoPorteria } from './goles';

export const CORNER_FAVOR = 'Córner a favor';
export const CORNER_CONTRA = 'Córner en contra';
export const TL_FAVOR = 'Tiro libre a favor';
export const TL_CONTRA = 'Tiro libre en contra';
export const PENAL_FAVOR = 'Penal a favor';
export const PENAL_CONTRA = 'Penal en contra';

export const ACCIONES_ABP: string[] = [CORNER_FAVOR, CORNER_CONTRA, TL_FAVOR, TL_CONTRA, PENAL_FAVOR, PENAL_CONTRA];
export const ACCIONES_ABP_SET = new Set<string>(ACCIONES_ABP);
export const ACCIONES_COBRO = new Set<string>([CORNER_FAVOR, CORNER_CONTRA, TL_FAVOR, TL_CONTRA]);
export const ACCIONES_PENAL = new Set<string>([PENAL_FAVOR, PENAL_CONTRA]);
export const ACCIONES_EN_CONTRA = new Set<string>([CORNER_CONTRA, TL_CONTRA, PENAL_CONTRA]);

export const esAccionBalonParado = (accion: string | null | undefined): boolean => ACCIONES_ABP_SET.has(accion || '');

export type Envio = 'primer_palo' | 'segundo_palo' | 'area_chica' | 'punto_penal' | 'frontal' | 'corto';
export type ResultadoCobro = 'gol' | 'remate' | 'nada';
export type Marcaje = 'zona' | 'hombre' | 'mixto';
export type ResultadoPenal = 'gol' | 'atajado' | 'fuera' | 'palo';

export const ENVIOS: Envio[] = ['primer_palo', 'segundo_palo', 'area_chica', 'punto_penal', 'frontal', 'corto'];
export const ENVIO_LABEL: Record<Envio, string> = {
    primer_palo: '1er palo', segundo_palo: '2º palo', area_chica: 'Área chica',
    punto_penal: 'Punto penal', frontal: 'Frontal', corto: 'En corto',
};
export const RESULTADOS_COBRO: ResultadoCobro[] = ['gol', 'remate', 'nada'];
export const RESULTADO_COBRO_LABEL: Record<ResultadoCobro, string> = { gol: 'Gol', remate: 'Remate', nada: 'Nada' };
export const MARCAJES: Marcaje[] = ['zona', 'hombre', 'mixto'];
export const MARCAJE_LABEL: Record<Marcaje, string> = { zona: 'En zona', hombre: 'Al hombre', mixto: 'Mixto' };
export const RESULTADOS_PENAL: ResultadoPenal[] = ['gol', 'atajado', 'fuera', 'palo'];
export const RESULTADO_PENAL_LABEL: Record<ResultadoPenal, string> = { gol: 'Gol', atajado: 'Atajado', fuera: 'Fuera', palo: 'Palo' };

export interface DetalleAbp {
    envio?: Envio;
    resultado?: ResultadoCobro | ResultadoPenal;
    marcaje?: Marcaje;
    porteria?: string;
}

// Lee el detalle guardado según la acción (tolera null o datos de otro tipo).
export const detalleAbpDe = (tag: { accion: string; detalle?: Record<string, any> | null }): DetalleAbp => {
    const d = tag.detalle || {};
    const out: DetalleAbp = {};
    if (ACCIONES_PENAL.has(tag.accion)) {
        if (etiquetaPorteria(d.porteria)) out.porteria = d.porteria;
        if (RESULTADOS_PENAL.includes(d.resultado)) out.resultado = d.resultado;
    } else if (ACCIONES_COBRO.has(tag.accion)) {
        if (ENVIOS.includes(d.envio)) out.envio = d.envio;
        if (RESULTADOS_COBRO.includes(d.resultado)) out.resultado = d.resultado;
        if (ACCIONES_EN_CONTRA.has(tag.accion) && MARCAJES.includes(d.marcaje)) out.marcaje = d.marcaje;
    }
    return out;
};

// Resumen corto para la lista de jugadas: "1er palo · remate · en zona"
export const resumenAbp = (accion: string, d: DetalleAbp): string | null => {
    const partes: string[] = [];
    if (ACCIONES_PENAL.has(accion)) {
        if (d.porteria) partes.push((etiquetaPorteria(d.porteria) || '').toLowerCase());
        if (d.resultado) partes.push(RESULTADO_PENAL_LABEL[d.resultado as ResultadoPenal].toLowerCase());
    } else {
        if (d.envio) partes.push(ENVIO_LABEL[d.envio]);
        if (d.resultado) partes.push(RESULTADO_COBRO_LABEL[d.resultado as ResultadoCobro].toLowerCase());
        if (d.marcaje) partes.push(MARCAJE_LABEL[d.marcaje].toLowerCase());
    }
    return partes.length ? partes.join(' · ') : null;
};

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ¿La frase nombra una acción de balón parado? ("córner a favor", "tiro de esquina en contra",
// "tiro libre a favor", "penal en contra", "penalti a favor"). Devuelve el nombre exacto o null.
export const accionAbpDesdeVoz = (texto: string): string | null => {
    const t = sinAcentos(texto);
    const favor = /\ba favor\b/.test(t);
    const contra = /\ben contra\b/.test(t);
    if (!favor && !contra) return null;
    if (/\bcorner\b|\bcorners\b|\btiro de esquina\b|\bsaque de esquina\b/.test(t)) return favor ? CORNER_FAVOR : CORNER_CONTRA;
    if (/\btiro libre\b|\bfalta directa\b/.test(t)) return favor ? TL_FAVOR : TL_CONTRA;
    if (/\bpenal\b|\bpenalti\b|\bpenalty\b|\bpenale?s\b/.test(t)) return favor ? PENAL_FAVOR : PENAL_CONTRA;
    return null;
};

// Lee por voz lo que se pueda del detalle según la acción, por ejemplo
// "primer palo remate en zona" o "abajo izquierda gol". Devuelve solo lo que entendió.
export const detalleAbpDesdeVoz = (accion: string, texto: string): DetalleAbp => {
    const t = sinAcentos(texto);
    const d: DetalleAbp = {};
    if (ACCIONES_PENAL.has(accion)) {
        let altura: AlturaPorteria | null = null;
        if (/\b(alto|arriba)\b/.test(t)) altura = 'alto';
        else if (/\b(bajo|abajo|rasante)\b/.test(t)) altura = 'bajo';
        else if (/\b(medio|media altura)\b/.test(t)) altura = 'medio';
        let lado: LadoPorteria | null = null;
        if (/\bizquierd[ao]\b/.test(t)) lado = 'izquierda';
        else if (/\bderech[ao]\b/.test(t)) lado = 'derecha';
        else if (/\b(centro|central)\b/.test(t)) lado = 'centro';
        if (altura && lado) d.porteria = codigoPorteria(altura, lado);
        if (/\bgol\b|\banoto\b|\bentro\b/.test(t)) d.resultado = 'gol';
        else if (/\batajad[oa]\b|\bataja\b|\bparad[oa]\b/.test(t)) d.resultado = 'atajado';
        else if (/\bposte\b|\bpalo\b|\btravesano\b/.test(t)) d.resultado = 'palo';
        else if (/\bfuera\b|\bafuera\b|\bdesviado\b/.test(t)) d.resultado = 'fuera';
        return d;
    }
    if (/\bprimer palo\b|\b1er palo\b|\bprimero\b/.test(t)) d.envio = 'primer_palo';
    else if (/\bsegundo palo\b|\b2do palo\b|\bsegundo\b/.test(t)) d.envio = 'segundo_palo';
    else if (/\barea chica\b/.test(t)) d.envio = 'area_chica';
    else if (/\bpunto penal\b|\bpunto de penal\b|\bpenal\b/.test(t)) d.envio = 'punto_penal';
    else if (/\bfrontal\b|\bfrontal del area\b|\bborde del area\b/.test(t)) d.envio = 'frontal';
    else if (/\ben corto\b|\bcorto\b|\bcorta\b/.test(t)) d.envio = 'corto';

    if (/\bgol\b/.test(t)) d.resultado = 'gol';
    else if (/\bremate\b|\bremato\b|\btiro\b/.test(t)) d.resultado = 'remate';
    else if (/\bnada\b|\bdespeje\b|\bdespejad[oa]\b|\bsin remate\b/.test(t)) d.resultado = 'nada';

    if (ACCIONES_EN_CONTRA.has(accion)) {
        if (/\ben zona\b|\bzonal\b/.test(t)) d.marcaje = 'zona';
        else if (/\bal hombre\b|\bhombre a hombre\b|\bindividual\b/.test(t)) d.marcaje = 'hombre';
        else if (/\bmixto\b|\bmixta\b/.test(t)) d.marcaje = 'mixto';
    }
    return d;
};

// ── Conteos para Tablero, Rendimiento y reporte ─────────────────────────────
export interface ConteoCobro { cobros: number; remates: number; goles: number; conResultado: number; }
// Remates incluye los que terminaron en gol (un gol también fue remate).
export const contarCobros = (tags: { accion: string; detalle?: Record<string, any> | null }[], accion: string): ConteoCobro => {
    const c: ConteoCobro = { cobros: 0, remates: 0, goles: 0, conResultado: 0 };
    tags.forEach(t => {
        if (t.accion !== accion) return;
        c.cobros++;
        const r = detalleAbpDe(t).resultado;
        if (r) c.conResultado++;
        if (r === 'gol') { c.goles++; c.remates++; }
        else if (r === 'remate') c.remates++;
    });
    return c;
};

export interface ConteoPenales { tirados: number; goles: number; atajados: number; conResultado: number; }
export const contarPenales = (tags: { accion: string; detalle?: Record<string, any> | null }[], accion: string): ConteoPenales => {
    const c: ConteoPenales = { tirados: 0, goles: 0, atajados: 0, conResultado: 0 };
    tags.forEach(t => {
        if (t.accion !== accion) return;
        c.tirados++;
        const r = detalleAbpDe(t).resultado;
        if (r) c.conResultado++;
        if (r === 'gol') c.goles++;
        else if (r === 'atajado') c.atajados++;
    });
    return c;
};

// Zona de envío más usada en una lista de cobros (null si ninguno la tiene).
export const envioMasUsado = (tags: { accion: string; detalle?: Record<string, any> | null }[]): { envio: Envio; n: number } | null => {
    const c: Partial<Record<Envio, number>> = {};
    tags.forEach(t => { const e = detalleAbpDe(t).envio; if (e) c[e] = (c[e] || 0) + 1; });
    let best: { envio: Envio; n: number } | null = null;
    ENVIOS.forEach(e => { const n = c[e] || 0; if (n > 0 && (!best || n > best.n)) best = { envio: e, n }; });
    return best;
};
