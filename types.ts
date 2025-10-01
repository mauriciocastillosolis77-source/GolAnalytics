export enum ActionType {
    PASE_CORTO_DEFENSIVO_LOGRADO = "Pase Corto Defensivo Logrado",
    PASE_CORTO_DEFENSIVO_NO_LOGRADO = "Pase Corto Defensivo No Logrado",
    PASE_LARGO_DEFENSIVO_LOGRADO = "Pase Largo Defensivo Logrado",
    PASE_LARGO_DEFENSIVO_NO_LOGRADO = "Pase Largo Defensivo No Logrado",
    PASE_CORTO_OFENSIVO_LOGRADO = "Pase Corto Ofensivo Logrado",
    PASE_CORTO_OFENSIVO_NO_LOGRADO = "Pase Corto Ofensivo No Logrado",
    PASE_LARGO_OFENSIVO_LOGRADO = "Pase Largo Ofensivo Logrado",
    PASE_LARGO_OFENSIVO_NO_LOGRADO = "Pase Largo Ofensivo No Logrado",
    UNO_A_UNO_DEFENSIVO_LOGRADO = "1 a 1 Defensivo Logrado",
    UNO_A_UNO_DEFENSIVO_NO_LOGRADO = "1 a 1 Defensivo No Logrado",
    UNO_A_UNO_OFENSIVO_LOGRADO = "1 a 1 Ofensivo Logrado",
    UNO_A_UNO_OFENSIVO_NO_LOGRADO = "1 a 1 Ofensivo No Logrado",
    AEREO_OFENSIVO_GANADO = "Aereo Ofensivo Ganado",
    AEREO_OFENSIVO_PERDIDO = "Aereo Ofensivo Perdido",
    AEREO_DEFENSIVO_GANADO = "Aereo Defensivo Ganado",
    AEREO_DEFENSIVO_PERDIDO = "Aereo Defensivo Perdido",
    TIRO_A_PORTERIA_REALIZADO = "Tiro a Porteria Realizado",
    GOL_A_FAVOR = "Gol a Favor",
    TIRO_A_PORTERIA_RECIBIDO = "Tiro a Porteria Recibido",
    ATAJADA_REALIZADA = "Atajada Realizada",
    GOL_RECIBIDO = "Gol Recibido",
    TIRO_DE_ESQUINA = "Tiro de esquina",
}

export type ActionResult = 'Logrado' | 'No Logrado' | 'Gol' | 'Atajada' | 'Ganado' | 'Perdido';

export interface Player {
    id: string;
    name: string;
    jerseyNumber?: string | number;
    position?: string;
}

export interface Tag {
    id: string;
    matchId: string;
    playerId: string;
    action: ActionType;
    result: ActionResult;
    timestamp: number; // in seconds
}

// Represents a play suggested by the CV analysis, before user confirmation
export interface DetectedPlay {
    id: string;
    playerId: string;
    action: ActionType;
    timestamp: number;
}

export interface Match {
    id: string;
    name: string;
    tournament: string;
    category: string; // New property for team category
    jornada: string;
    rival: string;
    date: string; // YYYY-MM-DD
    videos: { name: string; url: string }[];
    teamUniform?: string;
    opponentUniform?: string;
    detectedPlays?: DetectedPlay[]; // Store AI-detected plays for validation
    isFinalized?: boolean; // New property to lock a match from further edits
}