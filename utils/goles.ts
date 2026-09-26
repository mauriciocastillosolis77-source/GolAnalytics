// ─────────────────────────────────────────────────────────────────────────────
// Tipos de gol (mejora 6). Se guardan dentro de `tags.detalle` (jsonb) de las
// etiquetas "Goles a favor" y "Goles recibidos":
//   { tipo_gol: 'contraataque', area: 'dentro', porteria: 'bajo-izquierda', golpeo: 'cabeza' }
// Todos los campos son opcionales: si no se marcaron, simplemente no están.
// La portería se ve DE FRENTE, como la ve el que tira.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoGol = 'combinativo' | 'directo' | 'contraataque' | 'robo' | 'balon_parado';
export type AreaGol = 'dentro' | 'fuera';
export type AlturaPorteria = 'alto' | 'medio' | 'bajo';
export type LadoPorteria = 'izquierda' | 'centro' | 'derecha';
export type Golpeo = 'pie_derecho' | 'pie_izquierdo' | 'cabeza';

export interface DetalleGol {
    tipo_gol?: TipoGol;
    area?: AreaGol;
    porteria?: string; // `${AlturaPorteria}-${LadoPorteria}`, ej. "bajo-izquierda"
    golpeo?: Golpeo;
}

export const ACCIONES_GOL = new Set<string>(['Goles a favor', 'Goles recibidos']);

export const TIPOS_GOL: TipoGol[] = ['combinativo', 'directo', 'contraataque', 'robo', 'balon_parado'];
export const TIPO_GOL_LABEL: Record<TipoGol, string> = {
    combinativo: 'Combinativo',
    directo: 'Directo',
    contraataque: 'Contraataque',
    robo: 'Robo en campo rival',
    balon_parado: 'Balón parado',
};

export const AREA_LABEL: Record<AreaGol, string> = { dentro: 'Dentro del área', fuera: 'Fuera del área' };

export const ALTURAS: AlturaPorteria[] = ['alto', 'medio', 'bajo'];
export const LADOS: LadoPorteria[] = ['izquierda', 'centro', 'derecha'];
export const ALTURA_LABEL: Record<AlturaPorteria, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };
export const LADO_LABEL: Record<LadoPorteria, string> = { izquierda: 'Izquierda', centro: 'Centro', derecha: 'Derecha' };

export const GOLPEOS: Golpeo[] = ['pie_derecho', 'pie_izquierdo', 'cabeza'];
export const GOLPEO_LABEL: Record<Golpeo, string> = { pie_derecho: 'Pie derecho', pie_izquierdo: 'Pie izquierdo', cabeza: 'Cabeza' };

export const codigoPorteria = (a: AlturaPorteria, l: LadoPorteria) => `${a}-${l}`;

export const etiquetaPorteria = (codigo?: string | null): string | null => {
    if (!codigo) return null;
    const [a, l] = codigo.split('-') as [AlturaPorteria, LadoPorteria];
    if (!ALTURAS.includes(a) || !LADOS.includes(l)) return null;
    return `${ALTURA_LABEL[a]} ${LADO_LABEL[l].toLowerCase()}`;
};

// Lee el detalle de gol guardado en una etiqueta (tolera null o datos de otro tipo).
export const detalleGolDe = (tag: { detalle?: Record<string, any> | null }): DetalleGol => {
    const d = tag.detalle || {};
    const out: DetalleGol = {};
    if (TIPOS_GOL.includes(d.tipo_gol)) out.tipo_gol = d.tipo_gol;
    if (d.area === 'dentro' || d.area === 'fuera') out.area = d.area;
    if (etiquetaPorteria(d.porteria)) out.porteria = d.porteria;
    if (GOLPEOS.includes(d.golpeo)) out.golpeo = d.golpeo;
    return out;
};

// Resumen corto para la lista de jugadas: "Contraataque · dentro · bajo izquierda"
export const resumenGol = (d: DetalleGol): string | null => {
    const partes: string[] = [];
    if (d.tipo_gol) partes.push(TIPO_GOL_LABEL[d.tipo_gol]);
    if (d.area) partes.push(d.area === 'dentro' ? 'dentro del área' : 'fuera del área');
    if (d.porteria) partes.push((etiquetaPorteria(d.porteria) || '').toLowerCase());
    if (d.golpeo) partes.push(GOLPEO_LABEL[d.golpeo].toLowerCase());
    return partes.length ? partes.join(' · ') : null;
};

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lee por voz lo que se pueda de una frase, por ejemplo
// "contraataque dentro del área abajo izquierda cabeza". Devuelve solo lo que entendió.
export const detalleGolDesdeVoz = (texto: string): DetalleGol => {
    const t = sinAcentos(texto);
    const d: DetalleGol = {};
    if (/\bcombinativ[oa]\b|\bcombinacion\b/.test(t)) d.tipo_gol = 'combinativo';
    else if (/\bcontra ?ataque\b|\bcontragolpe\b/.test(t)) d.tipo_gol = 'contraataque';
    else if (/\brobo\b/.test(t)) d.tipo_gol = 'robo';
    else if (/\bbalon parado\b|\bpelota parada\b|\babp\b/.test(t)) d.tipo_gol = 'balon_parado';
    else if (/\bdirecto\b|\bjuego directo\b/.test(t)) d.tipo_gol = 'directo';

    if (/\bdentro( del area)?\b/.test(t)) d.area = 'dentro';
    else if (/\bfuera( del area)?\b|\bde afuera\b/.test(t)) d.area = 'fuera';

    let altura: AlturaPorteria | null = null;
    if (/\b(alto|arriba)\b/.test(t)) altura = 'alto';
    else if (/\b(bajo|abajo|rasante)\b/.test(t)) altura = 'bajo';
    else if (/\b(medio|media altura)\b/.test(t)) altura = 'medio';
    let lado: LadoPorteria | null = null;
    // "pie derecho / pie izquierdo" es golpeo, no lado de portería: se quita antes de buscar el lado.
    const sinPie = t.replace(/\bpie (derecho|izquierdo)\b/g, ' ');
    if (/\bizquierd[ao]\b/.test(sinPie)) lado = 'izquierda';
    else if (/\bderech[ao]\b/.test(sinPie)) lado = 'derecha';
    else if (/\b(centro|central)\b/.test(sinPie)) lado = 'centro';
    if (altura && lado) d.porteria = codigoPorteria(altura, lado);

    if (/\bpie derecho\b/.test(t)) d.golpeo = 'pie_derecho';
    else if (/\bpie izquierdo\b/.test(t)) d.golpeo = 'pie_izquierdo';
    else if (/\bcabeza\b|\bcabezazo\b/.test(t)) d.golpeo = 'cabeza';
    return d;
};
