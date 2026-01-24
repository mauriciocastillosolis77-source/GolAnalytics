import jsPDF from 'jspdf';

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

interface ExportOptions {
  userName: string;
  teamName: string;
  playerName?: string;
  playerNumber?: number;
  playerPosition?: string;
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

async function loadLogo(): Promise<string | undefined> {
  try {
    const response = await fetch('/images/golanalytics-logo.png');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Could not load logo');
    return undefined;
  }
}

function addHeader(doc: jsPDF, options: ExportOptions, title: string, logoBase64?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 15, 10, 30, 30);
    } catch (e) {
      console.warn('Could not add logo to PDF');
    }
  }
  
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('GOLANALYTICS', logoBase64 ? 50 : 15, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.secondary);
  doc.setFont('helvetica', 'normal');
  doc.text('Midiendo el Progreso', logoBase64 ? 50 : 15, 30);
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(15, 45, pageWidth - 15, 45);
  
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 15, 58);
  
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'normal');
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('es-MX', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  doc.text(`Equipo: ${options.teamName}`, 15, 68);
  doc.text(`Generado por: ${options.userName}`, 15, 75);
  doc.text(`Fecha: ${dateStr} - ${timeStr}`, pageWidth - 15, 68, { align: 'right' });
  
  if (options.playerName) {
    doc.text(`Jugador: ${options.playerName} (#${options.playerNumber || '-'})`, 15, 82);
    if (options.playerPosition) {
      doc.text(`Posicion: ${options.playerPosition}`, pageWidth - 15, 75, { align: 'right' });
    }
    return 92;
  }
  
  return 85;
}

function addSection(doc: jsPDF, title: string, yPos: number, pageWidth: number): number {
  if (yPos > 260) {
    doc.addPage();
    yPos = 20;
  }
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(15, yPos, pageWidth - 30, 8, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 20, yPos + 6);
  return yPos + 14;
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
  
  const logoBase64 = await loadLogo();
  
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
  
  const logoBase64 = await loadLogo();
  
  let y = addHeader(doc, options, 'ANALISIS DE RENDIMIENTO INDIVIDUAL', logoBase64);
  
  y = addTendenciaBox(doc, analysis.tendencia, analysis.tendenciaDescripcion, y, pageWidth);
  
  y = addSection(doc, 'FORTALEZAS DEL JUGADOR', y, pageWidth);
  y = addBulletList(doc, analysis.fortalezas, y, maxWidth);
  
  y += 5;
  y = addSection(doc, 'OPORTUNIDADES DE DESARROLLO', y, pageWidth);
  y = addBulletList(doc, analysis.areasDeMejora, y, maxWidth);
  
  if (analysis.comparativoProfesional) {
    y += 5;
    y = addSection(doc, 'COMPARATIVO PROFESIONAL', y, pageWidth);
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(`Posicion: ${analysis.comparativoProfesional.posicion}`, 15, y);
    y += 8;
    
    if (analysis.comparativoProfesional.metricasReferencia?.length > 0) {
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
