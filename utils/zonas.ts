// ─────────────────────────────────────────────────────────────────────────────
// Zonas de la cancha para las etiquetas (mejora 1).
//
// La cancha se divide en 9 zonas: 3 tercios en el sentido del ataque de NUESTRO
// equipo (Inicio → Creación → Finalización) por 3 carriles (Izquierda, Centro,
// Derecha), vistos también hacia donde ataca nuestro equipo.
// Son los mismos nombres de tercio que usa Análisis del Rival.
//
// En la base de datos se guarda un código corto en la columna `tags.zona`,
// por ejemplo "creacion-centro". Una etiqueta sin zona tiene `zona = null`.
// ─────────────────────────────────────────────────────────────────────────────

export type Tercio = 'inicio' | 'creacion' | 'finalizacion';
export type Carril = 'izquierda' | 'centro' | 'derecha';

export const TERCIOS: Tercio[] = ['inicio', 'creacion', 'finalizacion'];
export const CARRILES: Carril[] = ['izquierda', 'centro', 'derecha'];

export const TERCIO_LABEL: Record<Tercio, string> = {
    inicio: 'Inicio',
    creacion: 'Creación',
    finalizacion: 'Finalización',
};

export const CARRIL_LABEL: Record<Carril, string> = {
    izquierda: 'Izquierda',
    centro: 'Centro',
    derecha: 'Derecha',
};

// Acciones que piden zona al etiquetarse.
export const ACCIONES_CON_ZONA = new Set<string>([
    'Recuperación de balón',
    'Pérdida de balón',
]);

export const codigoZona = (tercio: Tercio, carril: Carril): string => `${tercio}-${carril}`;

// "creacion-centro" → "Creación · centro". Devuelve null si el código no es válido.
export const etiquetaZona = (codigo: string | null | undefined): string | null => {
    if (!codigo) return null;
    const [t, c] = codigo.split('-') as [Tercio, Carril];
    if (!TERCIOS.includes(t) || !CARRILES.includes(c)) return null;
    return `${TERCIO_LABEL[t]} · ${CARRIL_LABEL[c].toLowerCase()}`;
};

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lee una zona dicha por voz, por ejemplo "creación centro", "zona inicio izquierda",
// "finalización derecho". Necesita el tercio Y el carril; si falta uno, devuelve null.
export const zonaDesdeVoz = (texto: string): string | null => {
    const t = sinAcentos(texto);
    let tercio: Tercio | null = null;
    if (/\binicio\b/.test(t)) tercio = 'inicio';
    else if (/\bcreacion\b/.test(t)) tercio = 'creacion';
    else if (/\bfinalizacion\b/.test(t)) tercio = 'finalizacion';
    let carril: Carril | null = null;
    if (/\bizquierd[ao]\b/.test(t)) carril = 'izquierda';
    else if (/\bderech[ao]\b/.test(t)) carril = 'derecha';
    else if (/\b(centro|central|medio)\b/.test(t)) carril = 'centro';
    if (!tercio || !carril) return null;
    return codigoZona(tercio, carril);
};
