// ─────────────────────────────────────────────────────────────────────────────
// Textos de las exportaciones de Scouting, en español y en inglés.
//
// La plataforma se queda en español: esto solo cambia lo que sale en los
// archivos exportados (PDF y PowerPoint).
// El inglés es el del fútbol internacional ("football", "pitch", "match"), no el
// de Estados Unidos ("soccer", "field", "game"), y está escrito como se habla de
// fútbol — no es una traducción palabra por palabra.
// Lo que escribe el usuario (nombres, equipo, competición, nacionalidad, valor
// de mercado) no se traduce.
// ─────────────────────────────────────────────────────────────────────────────

export type Idioma = 'es' | 'en';

const EN_SECCIONES: Record<string, string> = {
  fisicas: 'Physical qualities',
  tecnicas: 'Technical qualities',
  tacticas: 'Tactical qualities',
  cognitivas: 'Mental qualities',
  modelo: 'Fit with our game model',
};
const EN_SECCIONES_CORTO: Record<string, string> = {
  fisicas: 'Physical', tecnicas: 'Technical', tacticas: 'Tactical', cognitivas: 'Mental', modelo: 'Game model',
};

// Las 46 líneas, por su clave (ver utils/scouting.ts).
const EN_LINEAS: Record<string, string> = {
  // Físicas
  velocidad_de_desplazamiento: 'Pace', aceleracion: 'Acceleration', fuerza: 'Strength', resistencia: 'Stamina', agilidad: 'Agility',
  coordinacion: 'Coordination', velocidad_de_reaccion: 'Reactions', potencia: 'Power', recuperacion_de_fatiga: 'Recovery', tendencia_a_lesiones: 'Injury proneness',
  // Técnicas
  pierna_menos_dominante: 'Weak foot', entrada: 'Tackling', despeje: 'Clearances', superficies_de_contacto: 'Use of contact surfaces', conduccion: 'Ball carrying',
  regate: 'Dribbling', tiro: 'Shooting', control_de_balon: 'First touch', pase_largo: 'Long passing', pase_corto: 'Short passing',
  // Tácticas
  temporizaciones: 'Delaying', desmarques: 'Movement off the ball', apoyos_ofensivos: 'Support in attack', vigilancias: 'Rest defence', dominio_de_espacios: 'Use of space',
  marcajes: 'Marking', ayudas_defensivas: 'Defensive support', repliegue: 'Tracking back', cobertura: 'Covering', posicionamiento: 'Positioning',
  // Cognitivas
  personalidad: 'Personality', comunicacion: 'Communication', inteligencia: 'Game intelligence', polivalencia: 'Versatility', agresividad: 'Aggression',
  mentalidad: 'Mentality', companerismo: 'Team spirit', competitividad: 'Competitiveness', caracter: 'Character', liderazgo: 'Leadership',
  // Modelo de juego
  evitar_transiciones: 'Stopping transitions', intensidad: 'Intensity', busqueda_de_espacios: 'Finding space', segundas_jugadas: 'Second balls',
  descarga_a_banda: 'Laying it off wide', presion_tras_perdida: 'Counter-pressing',
};

const EN_PUESTOS: Record<string, string> = {
  POR: 'Goalkeeper', LD: 'Right-back', DCD: 'Right centre-back', DCI: 'Left centre-back', LI: 'Left-back',
  MD: 'Right midfielder', MCD: 'Right central midfielder', MCI: 'Left central midfielder', MI: 'Left midfielder',
  DD: 'Right striker', DI: 'Left striker',
};
const EN_TIPOS: Record<string, string> = { 'Estrella': 'Star', 'Presente': 'Ready now', 'Futuro': 'Prospect', 'Fin contrato': 'Contract expiring' };
const EN_PIERNAS: Record<string, string> = { 'Diestro': 'Right-footed', 'Zurdo': 'Left-footed', 'Ambidiestro': 'Two-footed' };
const EN_VALORACION: Record<string, string> = { incorporar: 'Sign', seguimiento: 'Keep monitoring', descartar: 'Rule out' };

const TEXTOS = {
  es: {
    informeJugador: 'Informe de jugador',
    scoutingJugadores: 'Scouting de jugadores',
    scout: 'Scout',
    ficha: 'Ficha del jugador',
    datos: 'Datos',
    dorsal: 'Dorsal', altura: 'Altura', peso: 'Peso', pierna: 'Pierna', edad: 'Edad', anios: 'años', nacionalidad: 'Nacionalidad',
    tipoJugador: 'Tipo de jugador', valorMercado: 'Valor de mercado', equipo: 'Equipo', competicion: 'Competición', puesto: 'Puesto',
    posicion: 'Posición en la cancha',
    numeros: 'Números por competición',
    sinNumeros: 'Todavía no hay partidos registrados.',
    colCompeticion: 'Competición', pj: 'PJ', tit: 'TIT', sup: 'SUP', min: 'MIN', gol: 'GOL', asis: 'ASIS', ta: 'TA', tr: 'TR', total: 'Total',
    media: 'Media', promedioGeneral: 'Promedio general', sinCalificar: 'Sin calificar', deSecciones: 'secciones calificadas',
    escala: 'Calificación del 1 al 10',
    comparacion: 'Comparación', comparacionSub: 'Contra nuestro mejor jugador en su puesto', comparacionCon: 'Comparación con', diferencia: 'Diferencia',
    video: 'Videoinforme', verVideo: 'Abrir el video',
    valoracionFinal: 'Valoración final', descripcion: 'Descripción', modeloJuego: 'Modelo de juego', puntosFuertes: 'Puntos fuertes', puntosDebiles: 'Puntos débiles',
    sinTexto: 'Sin información.',
    tipoCompeticion: 'Tipo competición', tipoJugadorPanel: 'Tipo jugador', equipoPanel: 'Equipo',
    todas: 'Todas', todos: 'Todos', miEquipo: 'Mi equipo', otrosEquipos: 'Otros equipos',
    notaReporte: 'En cada puesto, los 3 mejor calificados por promedio general.',
    pagina: 'Página',
  },
  en: {
    informeJugador: 'Player report',
    scoutingJugadores: 'Player scouting',
    scout: 'Scout',
    ficha: 'Player profile',
    datos: 'Details',
    dorsal: 'Shirt number', altura: 'Height', peso: 'Weight', pierna: 'Preferred foot', edad: 'Age', anios: 'years old', nacionalidad: 'Nationality',
    tipoJugador: 'Player type', valorMercado: 'Market value', equipo: 'Club', competicion: 'Competition', puesto: 'Position',
    posicion: 'Position on the pitch',
    numeros: 'Numbers by competition',
    sinNumeros: 'No matches on record yet.',
    colCompeticion: 'Competition', pj: 'Apps', tit: 'Starts', sup: 'Sub', min: 'Mins', gol: 'Goals', asis: 'Assists', ta: 'YC', tr: 'RC', total: 'Total',
    media: 'Average', promedioGeneral: 'Overall rating', sinCalificar: 'Not rated', deSecciones: 'sections rated',
    escala: 'Rated from 1 to 10',
    comparacion: 'Comparison', comparacionSub: 'Against our best player in his position', comparacionCon: 'Compared with', diferencia: 'Difference',
    video: 'Video report', verVideo: 'Watch the video',
    valoracionFinal: 'Final verdict', descripcion: 'Profile', modeloJuego: 'Fit with our game model', puntosFuertes: 'Strengths', puntosDebiles: 'Weaknesses',
    sinTexto: 'No information.',
    tipoCompeticion: 'Competition', tipoJugadorPanel: 'Player type', equipoPanel: 'Team',
    todas: 'All', todos: 'All', miEquipo: 'Our team', otrosEquipos: 'Other teams',
    notaReporte: 'The three highest-rated players in each position, by overall rating.',
    pagina: 'Page',
  },
};
export type TextosScouting = typeof TEXTOS.es;

/** Todo lo que necesita una exportación para escribir en un idioma. */
export function textosScouting(idioma: Idioma) {
  const en = idioma === 'en';
  return {
    idioma,
    t: TEXTOS[idioma] as TextosScouting,
    seccion: (clave: string, es: string) => (en ? EN_SECCIONES[clave] || es : es),
    seccionCorta: (clave: string, es: string) => (en ? EN_SECCIONES_CORTO[clave] || es : es),
    linea: (clave: string, es: string) => (en ? EN_LINEAS[clave] || es : es),
    puesto: (clave: string | null | undefined, es: string) => (en && clave ? EN_PUESTOS[clave] || es : es),
    tipoJugador: (es: string | null | undefined) => (es ? (en ? EN_TIPOS[es] || es : es) : ''),
    pierna: (es: string | null | undefined) => (es ? (en ? EN_PIERNAS[es] || es : es) : ''),
    valoracion: (clave: string | null | undefined, es: string) => (en && clave ? EN_VALORACION[clave] || es : es),
    fecha: (d: Date) => d.toLocaleDateString(en ? 'en-GB' : 'es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}
export type TraductorScouting = ReturnType<typeof textosScouting>;
