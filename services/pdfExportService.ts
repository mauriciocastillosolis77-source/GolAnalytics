import jsPDF from 'jspdf';
import { LOGO_BASE64 } from '../constants/logoBase64';
import { PITCH_BASE64 } from '../constants/pitchBase64';

interface TeamAnalysisData {
  tendencia: string;
  tendenciaDescripcion: string;
  analisisPorLinea: {
    defensa: { efectividad: number; observacion: string };
    medio: { efectividad: number; observacion: string };
    ataque: { efectividad: number; observacion: string };
  };
  fortalezasColectivas: string[];
  areasDeMejoraColectivas: string[];
  jugadoresDestacados: { nombre: string; razon: string }[];
  resumenEjecutivo: string;
  recomendacionesEntrenamiento: string[];
}

interface PlayerAnalysisData {
  tendencia: string;
  tendenciaDescripcion: string;
  fortalezas: string[];
  areasDeMejora: string[];
  comparativoProfesional: {
    posicion: string;
    metricasReferencia: string[];
    analisis: string;
  };
  resumenGeneral: string;
}

interface RivalZonaSummary {
  zona: 'Inicio' | 'Creacion' | 'Finalizacion';
  resumen: string;
  nota?: string;
}

interface RivalFaseData {
  pregunta: string;
  zonas: RivalZonaSummary[];
}

interface RivalBalonParadoData {
  pregunta: string;
  corner?: string;        // lectura automática de córners a favor del rival
  tiroLibre?: string;     // lectura automática de tiros libres a favor del rival
  penal?: string;         // lectura automática de penales a favor del rival
  notaCobra?: string;
  defiende: string;       // lectura automática cuando el rival defiende
  notaDefiende?: string;
}

interface RivalJugadorClave {
  numero: string;
  posicion: string;
  motivo: string;
}

interface RivalPlanPartido {
  estrategia: string;
  adaptaciones: string[];
  abpOfensivo: string;
  abpDefensivo: string;
}

interface RivalReportData {
  rivalName: string;
  ofensiva: RivalFaseData;
  defensiva: RivalFaseData;
  balonParado?: RivalBalonParadoData; // tipo 4 (solo si hay momentos de balón parado)
  jugadoresClave?: RivalJugadorClave[];
  dafo?: { fortalezas: string[]; debilidades: string[]; oportunidades: string[]; amenazas: string[] };
  planPartido?: RivalPlanPartido;
  temas?: string[];
}

const ZONA_COLOR_RGB: Record<string, [number, number, number]> = {
  Inicio: [216, 90, 48],
  Creacion: [239, 159, 39],
  Finalizacion: [55, 138, 221],
};
const ZONA_LABEL_PDF: Record<string, string> = { Inicio: 'Inicio', Creacion: 'Creación', Finalizacion: 'Finalización' };

interface ExportOptions {
  userName: string;
  teamName: string;
  playerName?: string;
  playerNumber?: number;
  playerPosition?: string;
  // KPIs del jugador (opcional) — replica las tarjetas de la página de Rendimiento en el PDF
  kpis?: {
    totalAcciones: number;
    efectividadGlobal: number;
    mejorJornada: { jornada: number; efectividad: number } | null;
    peorJornada: { jornada: number; efectividad: number } | null;
  };
}

const COLORS = {
  primary: [22, 78, 99] as [number, number, number],
  secondary: [8, 145, 178] as [number, number, number],
  dark: [30, 41, 59] as [number, number, number],
  text: [51, 65, 85] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  warning: [234, 179, 8] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
};

function getTendenciaColor(tendencia: string): [number, number, number] {
  switch (tendencia.toLowerCase()) {
    case 'mejorando': return COLORS.success;
    case 'estable': return COLORS.warning;
    case 'bajando': return COLORS.danger;
    default: return COLORS.text;
  }
}

function loadLogo(): string | undefined {
  try {
    return LOGO_BASE64;
  } catch (e) {
    console.warn('Could not load logo');
    return undefined;
  }
}

function addHeader(doc: jsPDF, options: ExportOptions, title: string, logoBase64?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 15, 8, 17, 17);
    } catch (e) {
      console.warn('Could not add logo to PDF');
    }
  }

  const textX = logoBase64 ? 36 : 15;
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('GOLANALYTICS', textX, 15);

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.secondary);
  doc.setFont('helvetica', 'normal');
  doc.text('Midiendo el Progreso', textX, 21);

  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(15, 29, pageWidth - 15, 29);

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 15, 38);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  doc.text(`Equipo: ${options.teamName}  ·  Generado por: ${options.userName}`, 15, 45);
  doc.text(`${dateStr} - ${timeStr}`, pageWidth - 15, 45, { align: 'right' });

  if (options.playerName) {
    let line2 = `Jugador: ${options.playerName} (#${options.playerNumber || '-'})`;
    if (options.playerPosition) line2 += `  ·  Posicion: ${options.playerPosition}`;
    doc.text(line2, 15, 51);
    return 57;
  }

  return 50;
}

function addSection(doc: jsPDF, title: string, yPos: number, pageWidth: number): number {
  if (yPos > 260) {
    doc.addPage();
    yPos = 20;
  }
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(15, yPos, pageWidth - 30, 7, 2, 2, 'F');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 20, yPos + 5.2);
  return yPos + 11;
}

function addBulletList(doc: jsPDF, items: string[], startY: number, maxWidth: number): number {
  let y = startY;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  
  items.forEach((item) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...COLORS.secondary);
    doc.circle(20, y - 1.5, 1.5, 'F');
    const lines = doc.splitTextToSize(item, maxWidth - 15);
    doc.text(lines, 25, y);
    y += lines.length * 5 + 3;
  });
  
  return y;
}

function addNumberedList(doc: jsPDF, items: string[], startY: number, maxWidth: number): number {
  let y = startY;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  
  items.forEach((item, index) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...COLORS.secondary);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.roundedRect(17, y - 4, 8, 6, 1, 1, 'F');
    doc.setFontSize(8);
    doc.text(`${index + 1}`, 21, y, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(item, maxWidth - 20);
    doc.text(lines, 28, y);
    y += lines.length * 5 + 4;
  });
  
  return y;
}

function addParagraph(doc: jsPDF, text: string, startY: number, maxWidth: number): number {
  if (startY > 270) {
    doc.addPage();
    startY = 20;
  }
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, 15, startY);
  return startY + lines.length * 5 + 5;
}

// Dibuja las 4 tarjetas KPI del jugador (Total Acciones, Efectividad Global, Mejor y Peor Jornada),
// replicando las tarjetas que se ven en la página de Rendimiento, con sus mismos colores.
function addKpiCards(doc: jsPDF, kpis: NonNullable<ExportOptions['kpis']>, startY: number, pageWidth: number): number {
  const cardColors: [number, number, number][] = [
    [13, 148, 136],  // teal — Total Acciones
    [37, 99, 235],   // azul — Efectividad Global
    [22, 163, 74],   // verde — Mejor Jornada
    [234, 88, 12],   // naranja — Peor Jornada
  ];
  const cards = [
    { label: 'Total Acciones', value: `${kpis.totalAcciones}` },
    { label: 'Efectividad Global', value: `${kpis.efectividadGlobal}%` },
    { label: 'Mejor Jornada', value: kpis.mejorJornada ? `J${kpis.mejorJornada.jornada} (${kpis.mejorJornada.efectividad}%)` : '—' },
    { label: 'Peor Jornada', value: kpis.peorJornada ? `J${kpis.peorJornada.jornada} (${kpis.peorJornada.efectividad}%)` : '—' },
  ];

  const gap = 4;
  const cardWidth = (pageWidth - 30 - gap * 3) / 4;
  const cardHeight = 20;

  cards.forEach((card, i) => {
    const x = 15 + i * (cardWidth + gap);
    doc.setFillColor(...cardColors[i]);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + 4, startY + 7);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, x + 4, startY + 16);
  });

  return startY + cardHeight + 8;
}

function addTendenciaBox(doc: jsPDF, tendencia: string, descripcion: string, startY: number, pageWidth: number): number {
  const boxWidth = pageWidth - 30;
  const tendenciaColor = getTendenciaColor(tendencia);
  
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(15, startY, boxWidth, 25, 3, 3, 'F');
  
  doc.setFillColor(...tendenciaColor);
  doc.roundedRect(20, startY + 5, 60, 15, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(tendencia.toUpperCase(), 50, startY + 14, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(descripcion, boxWidth - 80);
  doc.text(descLines, 85, startY + 10);
  
  return startY + 32;
}

// Cancha real (la misma imagen que usa el PowerPoint) con las 3 zonas
// etiquetadas encima — para que el reporte impreso se vea igual que el
// PowerPoint y la app, no una cancha esquemática aparte.
function drawMiniPitch(doc: jsPDF, x: number, y: number, width: number, height: number) {
  const zonas: Array<'Inicio' | 'Creacion' | 'Finalizacion'> = ['Inicio', 'Creacion', 'Finalizacion'];
  try {
    doc.addImage(PITCH_BASE64, 'PNG', x, y, width, height);
  } catch (e) {
    console.warn('Could not add pitch image to PDF');
  }
  const zoneWidth = width / 3;
  const pillW = Math.min(zoneWidth - 1, 18), pillH = 4;
  zonas.forEach((z, i) => {
    const cx = x + i * zoneWidth + zoneWidth / 2;
    doc.setFillColor(10, 11, 20);
    doc.roundedRect(cx - pillW / 2, y + 1.5, pillW, pillH, 1, 1, 'F');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(ZONA_LABEL_PDF[z], cx, y + 1.5 + pillH / 2 + 1, { align: 'center' });
  });
}

// Dibuja una fase completa (Ofensiva o Defensiva): barra de título + pregunta guía,
// la mini-cancha a la izquierda, y el resumen de cada zona a la derecha.
function addFaseSection(doc: jsPDF, title: string, fase: RivalFaseData, startY: number, pageWidth: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 90) { doc.addPage(); y = 20; }
  y = addSection(doc, title, y, pageWidth);

  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.secondary);
  doc.setFont('helvetica', 'italic');
  const preguntaLines = doc.splitTextToSize(fase.pregunta, pageWidth - 30);
  doc.text(preguntaLines, 15, y);
  y += preguntaLines.length * 4.5 + 3;

  const pitchWidth = 48;
  const pitchHeight = 28;
  drawMiniPitch(doc, 15, y, pitchWidth, pitchHeight);

  const textX = 15 + pitchWidth + 8;
  const textWidth = pageWidth - textX - 15;
  let textY = y + 5;
  // Si una zona se salta a una página nueva, la cancha y el `y` original ya
  // no aplican (quedaron en la página anterior) — el valor que se devuelve al
  // final debe basarse SOLO en `textY` de la página actual, no compararse
  // contra la posición vieja de la cancha (eso fue lo que mandaba a la
  // siguiente sección un número inflado y la hacía saltar de página sin
  // necesidad, dejando una hoja casi en blanco).
  let saltoDePagina = false;
  const zonas: Array<'Inicio' | 'Creacion' | 'Finalizacion'> = ['Inicio', 'Creacion', 'Finalizacion'];
  zonas.forEach(z => {
    const zonaData = fase.zonas.find(f => f.zona === z);
    const lines = doc.splitTextToSize(zonaData?.resumen || 'Sin momentos registrados todavía.', textWidth);
    const notaLines = zonaData?.nota && zonaData.nota.trim() ? doc.splitTextToSize(`Nota del analista: ${zonaData.nota.trim()}`, textWidth) : [];
    const alturaBloque = 4.2 + lines.length * 4.2 + (notaLines.length ? notaLines.length * 4.2 + 1 : 0) + 4;
    // Si este bloque (título + resumen + nota) no cabe completo, se salta de
    // página ANTES de empezar a dibujarlo — así nunca lo corta a la mitad.
    if (textY + alturaBloque > pageHeight - 30) { doc.addPage(); textY = 20; saltoDePagina = true; }

    doc.setFillColor(...ZONA_COLOR_RGB[z]);
    doc.rect(textX, textY - 3, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text(ZONA_LABEL_PDF[z], textX + 6, textY);
    textY += 4.2;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    doc.text(lines, textX + 6, textY);
    textY += lines.length * 4.2 + 0.5;
    if (zonaData?.nota && zonaData.nota.trim()) {
      doc.setFont('helvetica', 'italic');
      const notaLines = doc.splitTextToSize(`Nota del analista: ${zonaData.nota.trim()}`, textWidth);
      doc.text(notaLines, textX + 6, textY);
      textY += notaLines.length * 4.2 + 0.5;
    }
    textY += 2;
  });

  return (saltoDePagina ? textY : Math.max(y + pitchHeight, textY)) + 4;
}

// Balón parado del rival (tipo 4): dos bloques de texto, cuando cobra y cuando defiende.
function addBalonParadoSection(doc: jsPDF, bp: RivalBalonParadoData, startY: number, pageWidth: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 80) { doc.addPage(); y = 20; }
  y = addSection(doc, 'BALÓN PARADO', y, pageWidth);

  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.secondary);
  doc.setFont('helvetica', 'italic');
  const preguntaLines = doc.splitTextToSize(bp.pregunta, pageWidth - 30);
  doc.text(preguntaLines, 15, y);
  y += preguntaLines.length * 4.2 + 2;

  const bloque = (titulo: string, texto: string, nota?: string) => {
    const lines = doc.splitTextToSize(texto, pageWidth - 36);
    const notaLines = nota && nota.trim() ? doc.splitTextToSize(`Nota del analista: ${nota.trim()}`, pageWidth - 36) : [];
    const altura = 4.2 + lines.length * 4.2 + (notaLines.length ? notaLines.length * 4.2 + 1 : 0) + 3;
    if (y + altura > pageHeight - 30) { doc.addPage(); y = 20; }

    doc.setFillColor(...COLORS.secondary);
    doc.rect(15, y - 3, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text(titulo, 21, y);
    y += 4.2;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    doc.text(lines, 21, y);
    y += lines.length * 4.2 + 0.5;
    if (nota && nota.trim()) {
      doc.setFont('helvetica', 'italic');
      doc.text(notaLines, 21, y);
      y += notaLines.length * 4.2 + 0.5;
    }
    y += 2.5;
  };
  if (bp.corner) bloque('Córners — cuando cobra', bp.corner);
  if (bp.tiroLibre) bloque('Tiros libres — cuando cobra', bp.tiroLibre);
  if (bp.penal) bloque('Penales — cuando cobra', bp.penal);
  if ((bp.corner || bp.tiroLibre || bp.penal) && bp.notaCobra && bp.notaCobra.trim()) {
    bloque('Nota del analista — cuando cobra', bp.notaCobra, undefined);
  }
  if (!bp.corner && !bp.tiroLibre && !bp.penal) bloque('Cuando cobra', 'Sin cobros registrados todavía.');
  bloque('Cuando defiende', bp.defiende, bp.notaDefiende);
  return y + 2;
}

// Jugadores clave del rival: tarjetas chicas en fila (número, posición,
// motivo) — compacto a propósito para que quepa junto a lo demás en vez de
// forzar una página aparte. Si no caben todas en la fila/página actual,
// se reparte en más filas o salta de página, nunca corta una tarjeta a la mitad.
function addJugadoresClaveSection(doc: jsPDF, jugadores: RivalJugadorClave[], startY: number, pageWidth: number): number {
  if (!jugadores || jugadores.length === 0) return startY;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 50) { doc.addPage(); y = 20; }
  y = addSection(doc, 'JUGADORES CLAVE DEL RIVAL', y, pageWidth);

  const cols = 3, gutter = 4;
  const cardW = (pageWidth - 30 - gutter * (cols - 1)) / cols;
  const padX = 3;

  const medir = (j: RivalJugadorClave) => {
    doc.setFontSize(7.5);
    const lines = doc.splitTextToSize(j.motivo || 'Sin motivo capturado.', cardW - padX * 2);
    return 11 + lines.length * 3.4 + 3;
  };
  const dibujar = (x: number, yTop: number, h: number, j: RivalJugadorClave) => {
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(x, yTop, cardW, h, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    const encabezado = `${j.numero ? '#' + j.numero : ''}${j.numero && j.posicion ? '  ·  ' : ''}${j.posicion || ''}`.trim() || 'Jugador clave';
    doc.text(encabezado, x + padX, yTop + 6);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const lines = doc.splitTextToSize(j.motivo || 'Sin motivo capturado.', cardW - padX * 2);
    doc.text(lines, x + padX, yTop + 10.5);
  };

  for (let i = 0; i < jugadores.length; i += cols) {
    const fila = jugadores.slice(i, i + cols);
    const h = Math.max(...fila.map(medir));
    if (y + h > pageHeight - 20) { doc.addPage(); y = 20; }
    fila.forEach((j, k) => dibujar(15 + k * (cardW + gutter), y, h, j));
    y += h + gutter;
  }
  return y + 2;
}

// Plan de Partido: estrategia + adaptaciones tácticas + ABP. Título y
// subtítulos dinámicos según el rival y el equipo propio — para que no diga
// "Pumas Chalco" o "ML7" cuando en realidad es otro rival o equipo.
function addPlanPartidoSection(doc: jsPDF, equipo: string, rival: string, plan: RivalPlanPartido, startY: number, pageWidth: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 60) { doc.addPage(); y = 20; }
  y = addSection(doc, `PLAN DE PARTIDO PARA ENFRENTAR A ${rival.toUpperCase()}`, y, pageWidth) + 2;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  let lines = doc.splitTextToSize(plan.estrategia, pageWidth - 30);
  doc.text(lines, 15, y);
  y += lines.length * 4.2 + 5;

  const bloque = (titulo: string, contenido: string[] | string) => {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    const tl = doc.splitTextToSize(titulo, pageWidth - 30);
    doc.text(tl, 15, y);
    y += tl.length * 4.2 + 1;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    if (Array.isArray(contenido)) {
      contenido.forEach(it => {
        const l = doc.splitTextToSize(`• ${it}`, pageWidth - 36);
        if (y + l.length * 4.2 > pageHeight - 25) { doc.addPage(); y = 20; }
        doc.text(l, 21, y);
        y += l.length * 4.2 + 0.8;
      });
    } else {
      const l = doc.splitTextToSize(contenido, pageWidth - 30);
      if (y + l.length * 4.2 > pageHeight - 25) { doc.addPage(); y = 20; }
      doc.text(l, 15, y);
      y += l.length * 4.2;
    }
    y += 4;
  };
  bloque(`Adaptaciones tácticas (recomendaciones que se dan a ${equipo})`, plan.adaptaciones);
  bloque('ABP ofensivo (cómo aprovechar nuestras acciones a balón parado)', plan.abpOfensivo);
  bloque('ABP defensivo (cómo defendernos en las ABP en contra)', plan.abpDefensivo);
  return y + 2;
}

// Recomendaciones de trabajo de la semana: objetivos cortos derivados del
// rival — a propósito NO son ejercicios armados (el sistema no sabe espacio,
// cuántos entrenan, ni el microciclo), por eso la leyenda de abajo se queda.
function addTemasEntrenamientoSection(doc: jsPDF, temas: string[], startY: number, pageWidth: number): number {
  if (!temas || temas.length === 0) return startY;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 45) { doc.addPage(); y = 20; }
  y = addSection(doc, 'RECOMENDACIONES DE TRABAJO DE LA SEMANA', y, pageWidth) + 2;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  temas.forEach(t => {
    const l = doc.splitTextToSize(`• ${t}`, pageWidth - 30);
    doc.text(l, 15, y);
    y += l.length * 4.2 + 1;
  });
  y += 2;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.secondary);
  const nota = doc.splitTextToSize('Esto no es un ejercicio armado — son objetivos derivados de los datos del rival; tú decides el ejercicio.', pageWidth - 30);
  doc.text(nota, 15, y);
  return y + nota.length * 4 + 4;
}

// DAFO del rival: cuadrante 2x2 (mismo texto completo, mismos colores, pero
// en 4 cajas lado a lado como en el PowerPoint, no 4 listas apiladas a lo
// largo de toda la hoja — así cabe en mucho menos espacio.
function addDafoSection(doc: jsPDF, dafo: NonNullable<RivalReportData['dafo']>, startY: number, pageWidth: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageHeight - 60) { doc.addPage(); y = 20; }
  y = addSection(doc, 'DAFO DEL RIVAL', y, pageWidth) + 3;

  const gutter = 5;
  const colW = (pageWidth - 30 - gutter) / 2;
  const padX = 3, padTop = 13.5;

  // Mide cuánto alto necesita una caja (título + viñetas envueltas) sin dibujar nada.
  const medir = (items: string[]) => {
    doc.setFontSize(7.5);
    let h = padTop;
    (items || []).forEach(it => {
      const lines = doc.splitTextToSize(`• ${it}`, colW - padX * 2);
      h += lines.length * 3.6 + 0.8;
    });
    return h + 2;
  };

  // Dibuja una caja (fondo de color suave + título + viñetas) de una altura ya decidida.
  const dibujar = (x: number, yTop: number, h: number, titulo: string, items: string[], color: [number, number, number]) => {
    const tint: [number, number, number] = [
      Math.round(255 - (255 - color[0]) * 0.12),
      Math.round(255 - (255 - color[1]) * 0.12),
      Math.round(255 - (255 - color[2]) * 0.12),
    ];
    doc.setFillColor(...tint);
    doc.roundedRect(x, yTop, colW, h, 2, 2, 'F');
    doc.setFillColor(...color);
    doc.rect(x + padX, yTop + 4.5, 3, 3, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text(titulo, x + padX + 5, yTop + 7);
    let ty = yTop + padTop;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    (items || []).forEach(it => {
      const lines = doc.splitTextToSize(`• ${it}`, colW - padX * 2);
      doc.text(lines, x + padX, ty);
      ty += lines.length * 3.6 + 0.8;
    });
  };

  const fila = (izq: { t: string; items: string[]; c: [number, number, number] }, der: { t: string; items: string[]; c: [number, number, number] }) => {
    const h = Math.max(medir(izq.items), medir(der.items));
    if (y + h > pageHeight - 20) { doc.addPage(); y = 20; }
    dibujar(15, y, h, izq.t, izq.items, izq.c);
    dibujar(15 + colW + gutter, y, h, der.t, der.items, der.c);
    y += h + gutter;
  };

  fila(
    { t: 'Fortalezas del rival', items: dafo.fortalezas, c: COLORS.success },
    { t: 'Debilidades del rival', items: dafo.debilidades, c: COLORS.danger }
  );
  fila(
    { t: 'Oportunidades para nosotros', items: dafo.oportunidades, c: COLORS.secondary },
    { t: 'Amenazas para nosotros', items: dafo.amenazas, c: COLORS.warning }
  );
  return y + 2;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.3);
    doc.line(15, pageHeight - 25, pageWidth - 15, pageHeight - 25);
    
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Este documento fue generado desde GolAnalytics con fines informativos y formativos.',
      pageWidth / 2,
      pageHeight - 18,
      { align: 'center' }
    );
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('www.golanalytics.com', pageWidth / 2, pageHeight - 12, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    doc.text(`Pagina ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 12, { align: 'right' });
  }
}

export async function exportTeamAnalysisToPDF(
  analysis: TeamAnalysisData,
  options: ExportOptions
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 30;
  
  const logoBase64 = loadLogo();
  
  let y = addHeader(doc, options, 'ANALISIS EJECUTIVO DEL EQUIPO', logoBase64);
  
  y = addTendenciaBox(doc, analysis.tendencia, analysis.tendenciaDescripcion, y, pageWidth);
  
  y = addSection(doc, 'RENDIMIENTO POR LINEA', y, pageWidth);
  
  const lineaWidth = (pageWidth - 40) / 3;
  const lineas = ['defensa', 'medio', 'ataque'] as const;
  const lineaLabels = { defensa: 'DEFENSA', medio: 'MEDIOCAMPO', ataque: 'ATAQUE' };
  
  lineas.forEach((linea, index) => {
    const lineaData = analysis.analisisPorLinea[linea];
    const x = 15 + index * (lineaWidth + 5);
    
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(x, y, lineaWidth, 30, 2, 2, 'F');
    
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'bold');
    doc.text(lineaLabels[linea], x + lineaWidth / 2, y + 8, { align: 'center' });
    
    const efectColor = lineaData.efectividad >= 70 ? COLORS.success : 
                       lineaData.efectividad >= 50 ? COLORS.warning : COLORS.danger;
    doc.setTextColor(...efectColor);
    doc.setFontSize(16);
    doc.text(`${lineaData.efectividad}%`, x + lineaWidth / 2, y + 20, { align: 'center' });
  });
  
  y += 38;
  
  y = addSection(doc, 'FORTALEZAS COLECTIVAS', y, pageWidth);
  y = addBulletList(doc, analysis.fortalezasColectivas, y, maxWidth);
  
  y += 5;
  y = addSection(doc, 'OPORTUNIDADES DE MEJORA', y, pageWidth);
  y = addBulletList(doc, analysis.areasDeMejoraColectivas, y, maxWidth);
  
  if (analysis.jugadoresDestacados && analysis.jugadoresDestacados.length > 0) {
    y += 5;
    y = addSection(doc, 'JUGADORES DESTACADOS', y, pageWidth);
    
    analysis.jugadoresDestacados.forEach((jugador) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.dark);
      doc.setFont('helvetica', 'bold');
      doc.text(`• ${jugador.nombre}`, 18, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.text);
      const lines = doc.splitTextToSize(jugador.razon, maxWidth - 15);
      doc.text(lines, 25, y + 5);
      y += 5 + lines.length * 5 + 3;
    });
  }
  
  y += 5;
  y = addSection(doc, 'RESUMEN EJECUTIVO', y, pageWidth);
  
  doc.setFillColor(...COLORS.lightGray);
  const resumenLines = doc.splitTextToSize(analysis.resumenEjecutivo, maxWidth - 10);
  const resumenHeight = Math.max(25, resumenLines.length * 5 + 10);
  
  if (y + resumenHeight > 260) {
    doc.addPage();
    y = 20;
  }
  
  doc.roundedRect(15, y, maxWidth, resumenHeight, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  doc.text(resumenLines, 20, y + 7);
  y += resumenHeight + 8;
  
  if (analysis.recomendacionesEntrenamiento && analysis.recomendacionesEntrenamiento.length > 0) {
    y = addSection(doc, 'RECOMENDACIONES DE ENTRENAMIENTO', y, pageWidth);
    y = addNumberedList(doc, analysis.recomendacionesEntrenamiento, y, maxWidth);
  }
  
  addFooter(doc);
  
  const fileName = `GolAnalytics_Equipo_${options.teamName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export async function exportPlayerAnalysisToPDF(
  analysis: PlayerAnalysisData,
  options: ExportOptions
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 30;
  
  const logoBase64 = loadLogo();
  
  let y = addHeader(doc, options, 'ANALISIS DE RENDIMIENTO INDIVIDUAL', logoBase64);
  
  if (options.kpis) {
    y = addKpiCards(doc, options.kpis, y, pageWidth);
  }
  
  y = addTendenciaBox(doc, analysis.tendencia, analysis.tendenciaDescripcion, y, pageWidth);
  
  y = addSection(doc, 'FORTALEZAS DEL JUGADOR', y, pageWidth);
  y = addBulletList(doc, analysis.fortalezas, y, maxWidth);
  
  y += 5;
  y = addSection(doc, 'OPORTUNIDADES DE DESARROLLO', y, pageWidth);
  y = addBulletList(doc, analysis.areasDeMejora, y, maxWidth);
  
  if (analysis.comparativoProfesional) {
    y += 5;
    // Si no queda espacio suficiente para el encabezado de la sección + las etiquetas + al menos
    // un elemento de la lista, se pasa todo el bloque a la página siguiente — evita que el título
    // "Metricas de referencia:" quede huérfano al final de una página con su contenido en la otra.
    if (y > 225) {
      doc.addPage();
      y = 20;
    }
    y = addSection(doc, 'COMPARATIVO PROFESIONAL', y, pageWidth);
    
    // Subtítulo aclaratorio: explica qué representa esta sección
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'italic');
    doc.text('Cualidades de referencia de un jugador profesional en esta posicion, como guia de desarrollo.', 15, y);
    y += 7;
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(`Posicion: ${analysis.comparativoProfesional.posicion}`, 15, y);
    y += 8;
    
    if (analysis.comparativoProfesional.metricasReferencia?.length > 0) {
      // Mantiene la etiqueta junto con al menos el primer elemento de su lista
      if (y > 255) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.text('Metricas de referencia:', 15, y);
      y += 6;
      y = addBulletList(doc, analysis.comparativoProfesional.metricasReferencia, y, maxWidth);
    }
    
    y += 3;
    y = addParagraph(doc, analysis.comparativoProfesional.analisis, y, maxWidth);
  }
  
  y += 5;
  y = addSection(doc, 'RECOMENDACIONES PARA EL ENTRENADOR', y, pageWidth);
  
  doc.setFillColor(...COLORS.lightGray);
  const resumenLines = doc.splitTextToSize(analysis.resumenGeneral, maxWidth - 10);
  const resumenHeight = Math.max(25, resumenLines.length * 5 + 10);
  
  if (y + resumenHeight > 260) {
    doc.addPage();
    y = 20;
  }
  
  doc.roundedRect(15, y, maxWidth, resumenHeight, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  doc.text(resumenLines, 20, y + 7);
  
  addFooter(doc);
  
  const playerSlug = options.playerName?.replace(/\s+/g, '_') || 'Jugador';
  const fileName = `GolAnalytics_${playerSlug}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

export async function exportRivalAnalysisToPDF(
  data: RivalReportData,
  options: ExportOptions
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const logoBase64 = loadLogo();

  let y = addHeader(doc, options, `ANALISIS DE RIVAL — ${data.rivalName.toUpperCase()}`, logoBase64);

  y = addFaseSection(doc, 'FASE OFENSIVA', data.ofensiva, y, pageWidth);
  y = addFaseSection(doc, 'FASE DEFENSIVA', data.defensiva, y, pageWidth);
  if (data.balonParado) y = addBalonParadoSection(doc, data.balonParado, y, pageWidth);
  if (data.jugadoresClave && data.jugadoresClave.length > 0) y = addJugadoresClaveSection(doc, data.jugadoresClave, y, pageWidth);
  if (data.dafo) y = addDafoSection(doc, data.dafo, y, pageWidth);
  if (data.planPartido) y = addPlanPartidoSection(doc, options.teamName, data.rivalName, data.planPartido, y, pageWidth);
  if (data.temas && data.temas.length > 0) y = addTemasEntrenamientoSection(doc, data.temas, y, pageWidth);

  addFooter(doc);

  const rivalSlug = data.rivalName.replace(/\s+/g, '_');
  const fileName = `GolAnalytics_Rival_${rivalSlug}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
