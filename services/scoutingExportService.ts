import pptxgen from 'pptxgenjs';
import jsPDF from 'jspdf';
import { LOGO_BASE64 } from '../constants/logoBase64';
import { geminiApiUrl } from './geminiConfig';
import {
  SECCIONES, CAJAS_442, SCOUT_NOMBRE,
  puestoLabel, valoracionDe, mediaSeccion, mediaGeneral, edadDe, mejoresPorPuesto, agruparNumeros, sumarNumeros,
  type ScoutingPlayer, type Cualidades, type PartidoJugador,
} from '../utils/scouting';
import { textosScouting, type Idioma, type TraductorScouting } from '../utils/scoutingI18n';

// ─────────────────────────────────────────────────────────────────────────────
// Exportaciones de Scouting: informe individual del jugador y reporte ejecutivo,
// en PDF o PowerPoint, en español o inglés.
//
// Cada página se dibuja UNA sola vez sobre un "lienzo" (rectángulos, textos,
// imágenes, en pulgadas sobre una hoja de 13.33 × 7.5). El lienzo tiene dos
// salidas: PowerPoint (pptxgenjs) y PDF (jsPDF). Así los dos formatos salen
// iguales y no hay dos diseños que mantener.
// ─────────────────────────────────────────────────────────────────────────────

const W = 13.333, H = 7.5;
const C = {
  navy: '0A0B14', indigo: '5B4FE6', indigoDark: '372A82', indigoLight: 'EEECFC', lavender: '9AA0D9', gold: 'FFCE54',
  ink: '1B1B1B', gray: '5C6670', grayLight: 'E5E7EB', panel: 'D1D5DB', white: 'FFFFFF', black: '000000',
  green: '16A34A', amber: 'D97706', red: 'DC2626', rojoFiltro: 'DC2626',
  cancha1: '3F8F3F', cancha2: '378537', cajaVacia: 'B7D3B7',
  serieA: '0891B2', serieB: 'F59E0B',
};
const colorMedia = (m: number | null) => (m === null ? '9CA3AF' : m >= 7 ? C.green : m >= 5 ? C.amber : C.red);
const num1 = (v: number | null) => (v === null ? '-' : v.toFixed(1));

interface OpTexto { size: number; bold?: boolean; italic?: boolean; color?: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; titulo?: boolean; link?: string; /** No partir en renglones: si no cabe, se recorta con "...". */ unaLinea?: boolean }
interface OpForma { fill?: string; line?: string; lineW?: number; radio?: number }

interface Lienzo {
  pagina(fondo?: string): void;
  rect(x: number, y: number, w: number, h: number, o: OpForma): void;
  elipse(x: number, y: number, w: number, h: number, o: OpForma): void;
  linea(x1: number, y1: number, x2: number, y2: number, color: string, grosor: number): void;
  texto(t: string, x: number, y: number, w: number, h: number, o: OpTexto): void;
  imagen(data: string, x: number, y: number, w: number, h: number): void;
  guardar(nombre: string): Promise<void>;
}

/** Ancho aproximado de un texto, para decidir tamaños de letra igual en los dos formatos. */
const factorAncho = (t: string, bold?: boolean) => (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t) ? (bold ? 0.68 : 0.64) : (bold ? 0.56 : 0.5));
const anchoTexto = (t: string, size: number, bold?: boolean) => t.length * (size / 72) * factorAncho(t, bold);

/** Baja el tamaño de letra hasta que el texto quepa en la caja (mismo resultado en PDF y PowerPoint). */
function ajustarTamano(t: string, w: number, h: number, size: number, bold?: boolean, minimo = 7): number {
  let s = size;
  while (s > minimo) {
    const lineas = t.split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(anchoTexto(p, s, bold) / w)), 0);
    if (lineas * (s / 72) * 1.25 <= h) break;
    s -= 0.5;
  }
  return s;
}
/** Recorta un texto de una sola línea para que quepa en el ancho. */
function recortar(t: string, w: number, size: number, bold?: boolean): string {
  if (anchoTexto(t, size, bold) <= w) return t;
  const max = Math.max(3, Math.floor(w / ((size / 72) * factorAncho(t, bold))) - 2);
  return t.slice(0, max).trimEnd() + '...';
}

// ── Salida 1: PowerPoint ─────────────────────────────────────────────────────
class LienzoPptx implements Lienzo {
  private pres = new pptxgen();
  private slide!: pptxgen.Slide;
  constructor() { this.pres.layout = 'LAYOUT_WIDE'; }
  pagina(fondo = C.white) { this.slide = this.pres.addSlide(); this.slide.background = { color: fondo }; }
  private forma(tipo: any, x: number, y: number, w: number, h: number, o: OpForma) {
    this.slide.addShape(tipo, {
      x, y, w, h,
      fill: o.fill ? { color: o.fill } : { type: 'none' },
      line: o.line ? { color: o.line, width: o.lineW ?? 1 } : { type: 'none' },
      ...(o.radio ? { rectRadius: o.radio } : {}),
    } as any);
  }
  rect(x: number, y: number, w: number, h: number, o: OpForma) { this.forma(o.radio ? this.pres.ShapeType.roundRect : this.pres.ShapeType.rect, x, y, w, h, o); }
  elipse(x: number, y: number, w: number, h: number, o: OpForma) { this.forma(this.pres.ShapeType.ellipse, x, y, w, h, o); }
  linea(x1: number, y1: number, x2: number, y2: number, color: string, grosor: number) {
    this.slide.addShape(this.pres.ShapeType.line, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width: grosor } } as any);
  }
  texto(t: string, x: number, y: number, w: number, h: number, o: OpTexto) {
    this.slide.addText(o.unaLinea ? recortar(t, w, o.size, o.bold) : t, {
      ...(o.unaLinea ? { wrap: false } : {}),
      x, y, w, h, fontFace: o.titulo ? 'Cambria' : 'Calibri', fontSize: o.size, bold: !!o.bold, italic: !!o.italic, color: o.color || C.ink,
      align: o.align || 'left', valign: o.valign || 'top', isTextBox: true, margin: 0,
      ...(o.link ? { hyperlink: { url: o.link } } : {}),
    } as any);
  }
  imagen(data: string, x: number, y: number, w: number, h: number) { this.slide.addImage({ data, x, y, w, h }); }
  async guardar(nombre: string) { await this.pres.writeFile({ fileName: `${nombre}.pptx` }); }
}

// ── Salida 2: PDF ────────────────────────────────────────────────────────────
class LienzoPdf implements Lienzo {
  private doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [H, W] });
  private primera = true;
  private rgb(hex: string): [number, number, number] { return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; }
  pagina(fondo = C.white) {
    if (!this.primera) this.doc.addPage([H, W], 'landscape');
    this.primera = false;
    this.doc.setFillColor(...this.rgb(fondo));
    this.doc.rect(0, 0, W, H, 'F');
  }
  private estilo(o: OpForma): string | null {
    if (o.fill) this.doc.setFillColor(...this.rgb(o.fill));
    if (o.line) { this.doc.setDrawColor(...this.rgb(o.line)); this.doc.setLineWidth((o.lineW ?? 1) / 72); }
    return o.fill && o.line ? 'FD' : o.fill ? 'F' : o.line ? 'S' : null;
  }
  rect(x: number, y: number, w: number, h: number, o: OpForma) {
    const e = this.estilo(o); if (!e) return;
    if (o.radio) this.doc.roundedRect(x, y, w, h, o.radio, o.radio, e); else this.doc.rect(x, y, w, h, e);
  }
  elipse(x: number, y: number, w: number, h: number, o: OpForma) {
    const e = this.estilo(o); if (!e) return;
    this.doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, e);
  }
  linea(x1: number, y1: number, x2: number, y2: number, color: string, grosor: number) {
    this.doc.setDrawColor(...this.rgb(color)); this.doc.setLineWidth(grosor / 72); this.doc.line(x1, y1, x2, y2);
  }
  texto(t: string, x: number, y: number, w: number, h: number, o: OpTexto) {
    this.doc.setFont('helvetica', o.bold && o.italic ? 'bolditalic' : o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    this.doc.setFontSize(o.size);
    this.doc.setTextColor(...this.rgb(o.color || C.ink));
    const altoLinea = (o.size / 72) * 1.2;
    let lineas: string[];
    if (o.unaLinea) {
      let una = t;
      if (this.doc.getTextWidth(una) > w) {
        while (una.length > 1 && this.doc.getTextWidth(una + '...') > w) una = una.slice(0, -1);
        una = una.trimEnd() + '...';
      }
      lineas = [una];
    } else {
      lineas = this.doc.splitTextToSize(t, w) as string[];
    }
    const caben = Math.max(1, Math.floor((h + 0.02) / altoLinea));
    if (lineas.length > caben) { lineas = lineas.slice(0, caben); lineas[caben - 1] = lineas[caben - 1].replace(/.{0,3}$/, '...'); }
    const alto = lineas.length * altoLinea;
    const y0 = (o.valign === 'middle' ? y + (h - alto) / 2 : o.valign === 'bottom' ? y + h - alto : y) + (o.size / 72) * 0.86;
    const xr = o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : x;
    lineas.forEach((ln, i) => this.doc.text(ln, xr, y0 + i * altoLinea, { align: o.align || 'left' }));
    if (o.link) this.doc.link(x, y, w, h, { url: o.link });
  }
  imagen(data: string, x: number, y: number, w: number, h: number) {
    this.doc.addImage(data, /image\/png/i.test(data.slice(0, 30)) ? 'PNG' : 'JPEG', x, y, w, h);
  }
  async guardar(nombre: string) { this.doc.save(`${nombre}.pdf`); }
}

// ── Piezas comunes ───────────────────────────────────────────────────────────
function pie(l: Lienzo, tr: TraductorScouting, pagina: number, oscuro = false) {
  const color = oscuro ? C.lavender : C.gray;
  if (!oscuro) l.linea(0.5, 6.95, W - 0.5, 6.95, C.grayLight, 0.75);
  l.texto(`${tr.t.scout}: ${SCOUT_NOMBRE} | GolAnalytics`, 0.5, 7.05, 6, 0.3, { size: 9, color, valign: 'middle' });
  l.texto(String(pagina), W / 2 - 0.5, 7.05, 1, 0.3, { size: 9, color, align: 'center', valign: 'middle' });
  l.imagen(LOGO_BASE64, W - 0.95, 6.98, 0.4, 0.46);
}
function encabezado(l: Lienzo, sobre: string, titulo: string) {
  l.texto(sobre.toUpperCase(), 0.6, 0.38, 10, 0.3, { size: 11, bold: true, color: C.indigo });
  l.texto(titulo, 0.6, 0.68, 10.2, 0.6, { size: 26, bold: true, titulo: true, color: C.ink, valign: 'middle' });
}
/** Cancha vertical (el equipo ataca hacia arriba). vx: 0-100, vy: 0-90, igual que en la pantalla. */
function cancha(l: Lienzo, x: number, y: number, w: number, h: number, grosor: number) {
  for (let i = 0; i < 9; i++) l.rect(x, y + (h / 9) * i, w, h / 9 + 0.005, { fill: i % 2 === 0 ? C.cancha1 : C.cancha2 });
  const px = (vx: number) => x + (vx / 100) * w, py = (vy: number) => y + (vy / 90) * h;
  const caja = (vx: number, vy: number, vw: number, vh: number) => l.rect(px(vx), py(vy), (vw / 100) * w, (vh / 90) * h, { line: 'EAF5EA', lineW: grosor });
  caja(3, 3, 94, 84);
  l.linea(px(3), py(45), px(97), py(45), 'EAF5EA', grosor);
  l.elipse(px(41), py(36.9), (18 / 100) * w, (16.2 / 90) * h, { line: 'EAF5EA', lineW: grosor });
  caja(27, 3, 46, 14); caja(39, 3, 22, 5.5);
  caja(27, 73, 46, 14); caja(39, 81.5, 22, 5.5);
}

// ── Página: Reporte ejecutivo de scouting ────────────────────────────────────
export interface FiltrosReporte { competicion: string; tipo: string; equipo: '' | 'mio' | 'otros' }
type JugadorReporte = Pick<ScoutingPlayer, 'id' | 'player_id' | 'nombre' | 'puesto' | 'nacionalidad' | 'competicion' | 'tipo_jugador' | 'cualidades'>;

/** El mismo filtro que usa la pantalla del reporte ejecutivo. */
export function filtrarParaReporte<T extends JugadorReporte>(jugadores: T[], f: FiltrosReporte): T[] {
  return jugadores.filter((j) => {
    if (f.competicion && (j.competicion || '').trim().toLowerCase() !== f.competicion.trim().toLowerCase()) return false;
    if (f.tipo && j.tipo_jugador !== f.tipo) return false;
    if (f.equipo === 'mio' && !j.player_id) return false;
    if (f.equipo === 'otros' && j.player_id) return false;
    return true;
  });
}

function paginaReporte(l: Lienzo, tr: TraductorScouting, jugadores: JugadorReporte[], filtros: FiltrosReporte, pagina: number) {
  l.pagina(C.white);
  // Título
  l.rect(0.5, 0.35, W - 1, 0.72, { fill: C.panel });
  l.linea(0.5, 0.35, W - 0.5, 0.35, C.black, 2.5); l.linea(0.5, 1.07, W - 0.5, 1.07, C.black, 2.5);
  l.texto(tr.t.scoutingJugadores.toUpperCase(), 0.5, 0.35, W - 1, 0.72, { size: 24, bold: true, italic: true, align: 'center', valign: 'middle', color: C.black });

  // Panel izquierdo: logo y los filtros con los que se sacó el reporte
  l.imagen(LOGO_BASE64, 1.05, 1.3, 1.3, 1.5);
  const bloque = (y: number, titulo: string, valor: string, filtrado: boolean) => {
    l.rect(0.5, y, 2.4, 0.3, { fill: C.panel });
    l.linea(0.5, y, 2.9, y, C.black, 1.25); l.linea(0.5, y + 0.3, 2.9, y + 0.3, C.black, 1.25);
    l.texto(titulo.toUpperCase(), 0.5, y, 2.4, 0.3, { size: 10, bold: true, italic: true, align: 'center', valign: 'middle', color: C.black });
    l.rect(0.6, y + 0.4, 2.2, 0.36, { fill: filtrado ? C.rojoFiltro : C.white, line: C.black, lineW: 1.5 });
    l.texto(valor, 0.68, y + 0.4, 2.04, 0.36, { size: 10.5, bold: true, align: 'center', valign: 'middle', color: filtrado ? C.white : C.black, unaLinea: true });
  };
  bloque(3.05, tr.t.tipoCompeticion, filtros.competicion || tr.t.todas, !!filtros.competicion);
  bloque(4.05, tr.t.tipoJugadorPanel, filtros.tipo ? tr.tipoJugador(filtros.tipo) : tr.t.todos, !!filtros.tipo);
  bloque(5.05, tr.t.equipoPanel, filtros.equipo === 'mio' ? tr.t.miEquipo : filtros.equipo === 'otros' ? tr.t.otrosEquipos : tr.t.todos, !!filtros.equipo);
  l.texto(tr.t.notaReporte, 0.5, 6.05, 2.4, 0.75, { size: 8.5, italic: true, color: C.gray });

  // Cancha con las 11 cajas
  const cx = 3.2, cy = 1.25, cw = W - 0.5 - 3.2, ch = 5.55;
  cancha(l, cx, cy, cw, ch, 1.25);
  const mejores = mejoresPorPuesto(filtrarParaReporte(jugadores, filtros), 3);
  const bw = cw * 0.22, fila = 0.27, hueco = 0.03;
  CAJAS_442.forEach((caja) => {
    const x = cx + (caja.x / 100) * cw - bw / 2;
    // En la hoja exportada la cancha es más baja que en pantalla: la caja del portero se sube un poco para que no se salga.
    let y = cy + (Math.min(caja.y, 79.5) / 100) * ch;
    l.texto(tr.puesto(caja.puesto, puestoLabel(caja.puesto)).toUpperCase(), x - 0.2, y, bw + 0.4, 0.17, { size: 7.5, bold: true, color: C.white, align: 'center', valign: 'middle' });
    y += 0.19;
    const lista = mejores[caja.puesto] || [];
    [0, 1, 2].forEach((i) => {
      const j = lista[i];
      l.rect(x, y, bw, fila, { fill: j ? C.white : C.cajaVacia, line: C.black, lineW: 1.25 });
      if (j) {
        const nombre = `${j.nombre}${j.nacionalidad ? ` (${j.nacionalidad})` : ''}`.toUpperCase();
        l.texto(nombre, x + 0.07, y, bw - 0.52, fila, { size: 8, bold: true, valign: 'middle', color: C.black, unaLinea: true });
        l.texto(j.promedio.toFixed(1), x + bw - 0.45, y, 0.38, fila, { size: 8.5, bold: true, align: 'right', valign: 'middle', color: C.black });
      }
      y += fila + hueco;
    });
  });
  pie(l, tr, pagina);
}

// ── Páginas: informe individual ──────────────────────────────────────────────
export interface DatosJugadorExport {
  ficha: ScoutingPlayer;
  numeros: PartidoJugador[];
  /** Contra quién se compara (o null si no hay nadie más calificado en su puesto). */
  comparado: { nombre: string; cualidades: Cualidades } | null;
  /** Tamaño real de la foto, para no deformarla. */
  fotoDim?: { w: number; h: number } | null;
}
interface TextosLibres { descripcion: string; modelo_juego: string; puntos_fuertes: string; puntos_debiles: string }

function fotoEnCaja(l: Lienzo, d: DatosJugadorExport, x: number, y: number, w: number, h: number): boolean {
  if (!d.ficha.foto) return false;
  const dim = d.fotoDim && d.fotoDim.w > 0 && d.fotoDim.h > 0 ? d.fotoDim : { w: 1, h: 1 };
  const escala = Math.min(w / dim.w, h / dim.h);
  const fw = dim.w * escala, fh = dim.h * escala;
  try { l.imagen(d.ficha.foto, x + (w - fw) / 2, y + (h - fh) / 2, fw, fh); return true; } catch { return false; }
}

function paginasJugador(l: Lienzo, tr: TraductorScouting, d: DatosJugadorExport, libres: TextosLibres, contador: { n: number }) {
  const f = d.ficha, t = tr.t;
  const nombre = f.nombre.trim() || '-';
  const puesto = tr.puesto(f.puesto, puestoLabel(f.puesto));
  const general = mediaGeneral(f.cualidades);
  const siguiente = () => ++contador.n;

  // 1. Portada
  l.pagina(C.navy);
  l.imagen(LOGO_BASE64, 0.9, 0.5, 0.95, 1.1);
  l.texto(t.informeJugador.toUpperCase(), 0.9, 1.9, 7, 0.4, { size: 14, bold: true, color: C.gold });
  const sizeNombre = ajustarTamano(nombre, 7.6, 1.5, 44, true, 24);
  l.texto(nombre, 0.9, 2.35, 7.6, 1.5, { size: sizeNombre, bold: true, titulo: true, color: C.white, valign: 'middle' });
  l.texto([puesto, f.equipo, f.competicion].filter(Boolean).join('  ·  '), 0.9, 3.95, 7.6, 0.45, { size: 16, color: C.lavender, valign: 'middle' });
  if (general.media !== null) {
    l.rect(0.9, 4.65, 1.5, 0.95, { fill: colorMedia(general.media), radio: 0.08 });
    l.texto(num1(general.media), 0.9, 4.68, 1.5, 0.6, { size: 26, bold: true, color: C.white, align: 'center', valign: 'middle' });
    l.texto(t.promedioGeneral, 0.9, 5.25, 1.5, 0.28, { size: 8.5, color: C.white, align: 'center', valign: 'middle' });
  }
  l.rect(9.0, 1.2, 3.4, 4.4, { fill: '14162A', radio: 0.1 });
  if (!fotoEnCaja(l, d, 9.15, 1.35, 3.1, 4.1)) {
    l.texto((nombre[0] || '?').toUpperCase(), 9.0, 1.2, 3.4, 4.4, { size: 120, bold: true, titulo: true, color: '2B2F55', align: 'center', valign: 'middle' });
  }
  l.texto(`${t.scout}: ${SCOUT_NOMBRE}  ·  ${tr.fecha(new Date())}`, 0.9, 6.3, 8, 0.35, { size: 12, italic: true, color: C.lavender, valign: 'middle' });
  pie(l, tr, siguiente(), true);

  // 2. Ficha: datos, posición en la cancha, números por competición y medias
  l.pagina(C.white);
  encabezado(l, nombre, t.ficha);
  l.rect(0.6, 1.5, 2.3, 2.3, { fill: C.indigoLight, radio: 0.08 });
  if (!fotoEnCaja(l, d, 0.68, 1.58, 2.14, 2.14)) {
    l.texto((nombre[0] || '?').toUpperCase(), 0.6, 1.5, 2.3, 2.3, { size: 70, bold: true, titulo: true, color: C.lavender, align: 'center', valign: 'middle' });
  }
  const edad = edadDe(f.fecha_nacimiento);
  const datos: Array<[string, string]> = ([
    [t.puesto, puesto], [t.equipo, f.equipo || ''], [t.competicion, f.competicion || ''],
    [t.dorsal, f.dorsal != null ? String(f.dorsal) : ''], [t.altura, f.altura_cm ? `${f.altura_cm} cm` : ''], [t.peso, f.peso_kg ? `${f.peso_kg} kg` : ''],
    [t.pierna, tr.pierna(f.pierna)], [t.edad, edad !== null ? `${edad} ${t.anios}` : ''], [t.nacionalidad, f.nacionalidad || ''],
    [t.tipoJugador, tr.tipoJugador(f.tipo_jugador)], [t.valorMercado, f.valor_mercado || ''],
  ] as Array<[string, string]>).filter(([, v]) => v);
  let yd = 4.0;
  datos.slice(0, 11).forEach(([k, v]) => {
    l.texto(k, 0.6, yd, 1.25, 0.25, { size: 9.5, color: C.gray, valign: 'middle' });
    l.texto(v, 1.85, yd, 1.6, 0.25, { size: 10, bold: true, valign: 'middle', unaLinea: true });
    yd += 0.26;
  });
  // Posición en la cancha
  l.texto(t.posicion.toUpperCase(), 3.75, 1.5, 2.8, 0.25, { size: 10, bold: true, color: C.indigo });
  cancha(l, 3.75, 1.85, 2.8, 4.0, 0.75);
  const cj = CAJAS_442.find((c) => c.puesto === f.puesto);
  if (cj) {
    const px = 3.75 + (cj.x / 100) * 2.8, py = 1.85 + ((cj.y + 6) / 100) * 4.0;
    l.elipse(px - 0.17, py - 0.17, 0.34, 0.34, { fill: C.gold, line: C.navy, lineW: 1.5 });
    l.texto(puesto, 3.75, 5.95, 2.8, 0.28, { size: 11, bold: true, align: 'center', valign: 'middle' });
  }
  // Números por competición
  const x0 = 6.95, anchoComp = 1.85, anchoNum = 0.5;
  l.texto(t.numeros.toUpperCase(), x0, 1.5, 5.85, 0.25, { size: 10, bold: true, color: C.indigo });
  const cols = [t.pj, t.tit, t.sup, t.min, t.gol, t.asis, t.ta, t.tr];
  const claves: Array<'pj' | 'titular' | 'suplente' | 'minutos' | 'goles' | 'asistencias' | 'amarillas' | 'rojas'> = ['pj', 'titular', 'suplente', 'minutos', 'goles', 'asistencias', 'amarillas', 'rojas'];
  let yt = 1.85;
  l.rect(x0, yt, 5.85, 0.34, { fill: C.indigoDark });
  l.texto(t.colCompeticion, x0 + 0.1, yt, anchoComp - 0.1, 0.34, { size: 9.5, bold: true, color: C.white, valign: 'middle' });
  cols.forEach((c, i) => l.texto(c, x0 + anchoComp + i * anchoNum, yt, anchoNum, 0.34, { size: 8.5, bold: true, color: C.white, align: 'center', valign: 'middle' }));
  yt += 0.34;
  const grupos = agruparNumeros(d.numeros, 'torneo');
  if (grupos.length === 0) {
    l.texto(t.sinNumeros, x0, yt + 0.1, 5.85, 0.3, { size: 10.5, italic: true, color: C.gray });
    yt += 0.5;
  } else {
    const filas = [...grupos.slice(0, 6), { ...sumarNumeros(t.total, d.numeros) }];
    filas.forEach((g, i) => {
      const esTotal = i === filas.length - 1;
      if (esTotal) l.rect(x0, yt, 5.85, 0.32, { fill: C.indigoLight }); else if (i % 2 === 1) l.rect(x0, yt, 5.85, 0.32, { fill: 'F4F4F8' });
      l.texto(g.etiqueta, x0 + 0.1, yt, anchoComp - 0.2, 0.32, { size: 10, bold: esTotal, valign: 'middle', unaLinea: true });
      claves.forEach((k, j) => l.texto(String(g[k]), x0 + anchoComp + j * anchoNum, yt, anchoNum, 0.32, { size: 10, bold: esTotal || k === 'minutos', align: 'center', valign: 'middle' }));
      yt += 0.32;
    });
  }
  // Medias de las cinco secciones y promedio general
  const ym = Math.max(yt + 0.35, 4.75);
  l.texto(t.promedioGeneral.toUpperCase(), x0, ym, 5.85, 0.25, { size: 10, bold: true, color: C.indigo });
  const chips = [...SECCIONES.map((s) => ({ label: tr.seccionCorta(s.clave, s.corto), v: mediaSeccion(f.cualidades, s.clave), fuerte: false })), { label: t.promedioGeneral, v: general.media, fuerte: true }];
  const cwid = 5.85 / chips.length;
  chips.forEach((ch, i) => {
    const x = x0 + i * cwid;
    l.rect(x + 0.04, ym + 0.33, cwid - 0.08, 0.62, { fill: colorMedia(ch.v), radio: 0.06 });
    l.texto(num1(ch.v), x + 0.04, ym + 0.33, cwid - 0.08, 0.62, { size: ch.fuerte ? 20 : 17, bold: true, color: C.white, align: 'center', valign: 'middle' });
    l.texto(ch.label, x, ym + 1.0, cwid, 0.4, { size: 8.5, bold: ch.fuerte, color: C.gray, align: 'center' });
  });
  pie(l, tr, siguiente());

  // 3-7. Una página por sección de cualidades
  SECCIONES.forEach((s) => {
    const media = mediaSeccion(f.cualidades, s.clave);
    l.pagina(C.white);
    encabezado(l, nombre, tr.seccion(s.clave, s.titulo));
    l.rect(11.05, 0.4, 1.7, 0.92, { fill: colorMedia(media), radio: 0.08 });
    l.texto(num1(media), 11.05, 0.42, 1.7, 0.6, { size: 26, bold: true, color: C.white, align: 'center', valign: 'middle' });
    l.texto(t.media, 11.05, 0.98, 1.7, 0.28, { size: 9, color: C.white, align: 'center', valign: 'middle' });
    const alto = Math.min(0.5, 4.9 / s.lineas.length);
    s.lineas.forEach((ln, i) => {
      const y = 1.7 + i * alto;
      const v = f.cualidades?.[s.clave]?.[ln.clave];
      l.texto(tr.linea(ln.clave, ln.label), 0.6, y, 3.5, alto, { size: 12, valign: 'middle' });
      l.rect(4.2, y + alto / 2 - 0.12, 7.4, 0.24, { fill: C.grayLight });
      if (typeof v === 'number') {
        l.rect(4.2, y + alto / 2 - 0.12, 7.4 * Math.min(10, v) / 10, 0.24, { fill: C.indigo });
        l.texto(String(v), 11.75, y, 0.9, alto, { size: 14, bold: true, valign: 'middle' });
      } else {
        l.texto(t.sinCalificar, 11.75, y, 1.1, alto, { size: 8.5, italic: true, color: C.gray, valign: 'middle' });
      }
    });
    l.texto(t.escala, 4.2, 1.7 + s.lineas.length * alto + 0.05, 7.4, 0.25, { size: 9, italic: true, color: C.gray });
    pie(l, tr, siguiente());
  });

  // 8. Comparación (solo si hay contra quién)
  if (d.comparado) {
    const otro = d.comparado;
    l.pagina(C.white);
    encabezado(l, nombre, t.comparacion);
    l.texto(`${t.comparacionCon} ${otro.nombre}`, 0.6, 1.3, 11, 0.3, { size: 12, italic: true, color: C.gray, valign: 'middle' });
    l.rect(0.6, 1.8, 0.18, 0.18, { fill: C.serieA }); l.texto(nombre, 0.85, 1.74, 5, 0.3, { size: 11, bold: true, valign: 'middle' });
    l.rect(6.3, 1.8, 0.18, 0.18, { fill: C.serieB }); l.texto(otro.nombre, 6.55, 1.74, 5, 0.3, { size: 11, bold: true, valign: 'middle' });
    const filas = [
      ...SECCIONES.map((s) => ({ label: tr.seccion(s.clave, s.titulo), a: mediaSeccion(f.cualidades, s.clave), b: mediaSeccion(otro.cualidades, s.clave), fuerte: false })),
      { label: t.promedioGeneral, a: general.media, b: mediaGeneral(otro.cualidades).media, fuerte: true },
    ];
    l.texto(t.diferencia, 11.5, 2.02, 1.3, 0.25, { size: 9, color: C.gray, align: 'right' });
    filas.forEach((r, i) => {
      const y = 2.3 + i * 0.75;
      if (r.fuerte) l.rect(0.5, y - 0.04, W - 1, 0.72, { fill: 'F4F4F8' });
      l.texto(r.label, 0.6, y, 3.7, 0.64, { size: 12, bold: r.fuerte, valign: 'middle' });
      ([[r.a, C.serieA, 0.06], [r.b, C.serieB, 0.36]] as Array<[number | null, string, number]>).forEach(([v, color, dy]) => {
        l.rect(4.4, y + dy, 6.3, 0.22, { fill: C.grayLight });
        if (v !== null) l.rect(4.4, y + dy, 6.3 * Math.min(10, v) / 10, 0.22, { fill: color });
        l.texto(num1(v), 10.8, y + dy - 0.03, 0.6, 0.28, { size: 11, bold: true, valign: 'middle' });
      });
      const dif = r.a !== null && r.b !== null ? Math.round((r.a - r.b) * 10) / 10 : null;
      l.texto(dif === null ? '-' : `${dif > 0 ? '+' : ''}${dif.toFixed(1)}`, 11.5, y, 1.3, 0.64, { size: 14, bold: true, align: 'right', valign: 'middle', color: dif === null ? C.gray : dif > 0 ? C.green : dif < 0 ? C.red : C.gray });
    });
    pie(l, tr, siguiente());
  }

  // 9. Video (solo si hay enlace)
  if (f.video_url && /^https?:\/\//i.test(f.video_url)) {
    l.pagina(C.white);
    encabezado(l, nombre, t.video);
    l.rect(2.2, 2.4, W - 4.4, 2.2, { fill: C.indigoLight, radio: 0.12 });
    l.texto(t.verVideo, 2.2, 2.7, W - 4.4, 0.7, { size: 24, bold: true, color: C.indigoDark, align: 'center', valign: 'middle', link: f.video_url });
    l.texto(f.video_url, 2.5, 3.55, W - 5, 0.5, { size: 12, color: C.indigo, align: 'center', valign: 'middle', link: f.video_url, unaLinea: true });
    pie(l, tr, siguiente());
  }

  // 10. Valoración final
  l.pagina(C.white);
  encabezado(l, nombre, t.valoracionFinal);
  const val = valoracionDe(f.valoracion);
  if (val) {
    l.rect(0.6, 1.45, 4.2, 0.7, { fill: val.color.replace('#', '').toUpperCase(), radio: 0.08 });
    l.texto(tr.valoracion(val.clave, val.label), 0.6, 1.45, 4.2, 0.7, { size: 20, bold: true, color: C.white, align: 'center', valign: 'middle' });
  }
  const bloques: Array<[string, string]> = [[t.descripcion, libres.descripcion], [t.modeloJuego, libres.modelo_juego], [t.puntosFuertes, libres.puntos_fuertes], [t.puntosDebiles, libres.puntos_debiles]];
  bloques.forEach(([titulo, cuerpo], i) => {
    const x = i % 2 === 0 ? 0.6 : 6.95, y = i < 2 ? 2.45 : 4.7, w = 5.78, h = 2.05;
    l.rect(x, y, w, h, { fill: 'F7F7FB', radio: 0.06 });
    l.texto(titulo.toUpperCase(), x + 0.2, y + 0.14, w - 0.4, 0.26, { size: 10.5, bold: true, color: C.indigo });
    const txt = (cuerpo || '').trim();
    const size = ajustarTamano(txt || t.sinTexto, w - 0.4, h - 0.62, 12, false, 7.5);
    l.texto(txt || t.sinTexto, x + 0.2, y + 0.48, w - 0.4, h - 0.6, { size, italic: !txt, color: txt ? C.ink : C.gray });
  });
  pie(l, tr, siguiente());
}

// ── Traducción de lo que escribió el usuario (solo para la versión en inglés) ─
const CAMPOS_LIBRES: Array<keyof TextosLibres> = ['descripcion', 'modelo_juego', 'puntos_fuertes', 'puntos_debiles'];

async function textosLibresDe(ficha: ScoutingPlayer, idioma: Idioma): Promise<{ textos: TextosLibres; fallo: boolean }> {
  const original: TextosLibres = { descripcion: ficha.descripcion || '', modelo_juego: ficha.modelo_juego || '', puntos_fuertes: ficha.puntos_fuertes || '', puntos_debiles: ficha.puntos_debiles || '' };
  const conTexto = CAMPOS_LIBRES.filter((k) => original[k].trim());
  if (idioma === 'es' || conTexto.length === 0) return { textos: original, fallo: false };

  // Se guarda la traducción en este navegador: si el texto no cambió, no se vuelve a consultar a Gemini.
  const llave = `golanalytics_scouting_en_${ficha.id}`;
  const firma = JSON.stringify(original);
  try {
    const guardado = JSON.parse(localStorage.getItem(llave) || 'null');
    if (guardado && guardado.firma === firma && guardado.en) return { textos: guardado.en as TextosLibres, fallo: false };
  } catch { /* sin almacenamiento: se traduce de nuevo */ }

  try {
    const env = (import.meta as any).env || {};
    const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('Falta la API key de Gemini.');
    const entrada: Record<string, string> = {};
    conTexto.forEach((k) => { entrada[k] = original[k]; });
    const prompt = `You are a football scout writing a player report for an international audience.
Translate the scouting notes below from Spanish into natural football English, the way scouts and analysts actually write.
Use international (British) football vocabulary: football, pitch, match, centre-back, full-back, winger, striker, set piece, the box, off the ball.
Keep the same meaning and the same level of detail. Do not add, remove or soften anything. Keep player, club and competition names exactly as written.
Return ONLY a JSON object with exactly the same keys as the input, each holding its translation.

${JSON.stringify(entrada)}`;
    const res = await fetch(`${geminiApiUrl()}?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    const json = JSON.parse(String(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}').trim());
    const en: TextosLibres = { ...original };
    conTexto.forEach((k) => { if (typeof json[k] === 'string' && json[k].trim()) en[k] = json[k].trim(); });
    try { localStorage.setItem(llave, JSON.stringify({ firma, en })); } catch { /* no pasa nada */ }
    return { textos: en, fallo: false };
  } catch (err) {
    console.warn('No se pudieron traducir los textos de la ficha; salen en español:', err);
    return { textos: original, fallo: true };
  }
}

// ── Punto de entrada ─────────────────────────────────────────────────────────
export interface OpcionesExportScouting {
  formato: 'pdf' | 'pptx';
  idioma: Idioma;
  /** Si viene, el archivo empieza con el reporte ejecutivo. */
  reporte?: { jugadores: JugadorReporte[]; filtros: FiltrosReporte };
  jugadores: DatosJugadorExport[];
  /** true = un archivo por cada jugador. false = todo en un solo archivo. */
  archivoPorJugador: boolean;
}

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'jugador';
const nuevoLienzo = (formato: 'pdf' | 'pptx'): Lienzo => (formato === 'pdf' ? new LienzoPdf() : new LienzoPptx());

export async function exportarScouting(op: OpcionesExportScouting): Promise<{ archivos: number; avisos: string[] }> {
  const tr = textosScouting(op.idioma);
  const sufijo = op.idioma === 'en' ? '_EN' : '';
  // Fecha local (no UTC): por la tarde en México, la fecha en UTC ya es la del día siguiente.
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const avisos: string[] = [];
  const sinTraducir: string[] = [];
  let archivos = 0;

  const libresDe = async (d: DatosJugadorExport) => {
    const r = await textosLibresDe(d.ficha, op.idioma);
    if (r.fallo) sinTraducir.push(d.ficha.nombre);
    return r.textos;
  };

  if (op.archivoPorJugador) {
    for (const d of op.jugadores) {
      const l = nuevoLienzo(op.formato);
      paginasJugador(l, tr, d, await libresDe(d), { n: 0 });
      await l.guardar(`Scouting_${slug(d.ficha.nombre)}${sufijo}_${fecha}`);
      archivos++;
      // Pausa corta entre descargas: sin ella el navegador puede quedarse solo con la última.
      if (op.jugadores.length > 1) await new Promise((r) => setTimeout(r, 400));
    }
  } else {
    const l = nuevoLienzo(op.formato);
    const contador = { n: 0 };
    if (op.reporte) paginaReporte(l, tr, op.reporte.jugadores, op.reporte.filtros, ++contador.n);
    for (const d of op.jugadores) paginasJugador(l, tr, d, await libresDe(d), contador);
    const nombre = op.reporte
      ? (op.jugadores.length ? `Scouting_Reporte_ejecutivo_y_${op.jugadores.length}_jugadores` : 'Scouting_Reporte_ejecutivo')
      : `Scouting_${op.jugadores.length}_jugadores`;
    await l.guardar(`${nombre}${sufijo}_${fecha}`);
    archivos = 1;
  }

  if (sinTraducir.length > 0) {
    avisos.push(`Gemini no respondió, así que los textos escritos a mano de ${sinTraducir.join(', ')} salieron en español. Lo demás sí salió en inglés. Puedes volver a exportar más tarde.`);
  }
  return { archivos, avisos };
}

/** Mide una foto (para no deformarla al ponerla en el informe). En un entorno sin imágenes regresa null. */
export function medirFoto(dataUrl: string | null | undefined): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
