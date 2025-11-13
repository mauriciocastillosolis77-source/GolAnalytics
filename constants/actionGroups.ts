export const ACTION_GROUPS = {
  PASES_CORTOS: ['Pase corto ofensivo', 'Pase corto defensivo'],
  PASES_LARGOS: ['Pase largo ofensivo', 'Pase largo defensivo'],
  DUELOS_1V1: ['1 vs 1 ofensivo', '1 vs 1 defensivo'],
  DUELOS_AEREOS: ['Aéreo ofensivo', 'Aéreo defensivo'],
  TIROS_GOL: ['Tiros a portería'],
  GOLES: ['Goles a favor'],
  ATAJADAS: ['Atajadas'],
  GOLES_RECIBIDOS: ['Goles recibidos'],
  RECUPERACIONES: ['Recuperación de balón'],
} as const;

export type ActionGroupKey = keyof typeof ACTION_GROUPS;
