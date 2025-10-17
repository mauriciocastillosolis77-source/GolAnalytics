// Archivo de constantes centralizadas para GolAnalytics

// Lista de métricas (acciones/jugadas) disponibles en el sistema.
// Esta lista es utilizada por el etiquetador de video, dashboard, y sugerencias de IA.
export const METRICS = [
  "Pase corto ofensivo",
  "Pase corto defensivo",
  "Pase largo ofensivo",
  "Pase largo defensivo",
  "1 vs 1 ofensivo",
  "1 vs 1 defensivo",
  "Aéreo ofensivo",
  "Aéreo defensivo",
  "Tiros a portería",
  "Goles a favor",
  "Atajadas",
  "Goles recibidos",
  // Nuevas acciones para transición ofensiva y recuperación
  "Recuperación de balón",
  "Transición ofensiva lograda",
  "Transición ofensiva no lograda"
];

export const ROLES = {
  ADMIN: 'admin',
  AUXILIAR: 'auxiliar',
};
