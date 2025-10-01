export const ACTION_CATEGORIES = {
    'Pase Corto': [
        "Pase Corto Defensivo Logrado",
        "Pase Corto Defensivo No Logrado",
        "Pase Corto Ofensivo Logrado",
        "Pase Corto Ofensivo No Logrado"
    ],
    'Pase Largo': [
        "Pase Largo Defensivo Logrado",
        "Pase Largo Defensivo No Logrado",
        "Pase Largo Ofensivo Logrado",
        "Pase Largo Ofensivo No Logrado"
    ],
    '1 a 1': [
        "1 a 1 Defensivo Logrado",
        "1 a 1 Defensivo No Logrado",
        "1 a 1 Ofensivo Logrado",
        "1 a 1 Ofensivo No Logrado"
    ],
    'Aereo': [
        "Aereo Ofensivo Ganado",
        "Aereo Ofensivo Perdido",
        "Aereo Defensivo Ganado",
        "Aereo Defensivo Perdido"
    ],
    'Tiro a Porteria': [
        "Tiro a Porteria Realizado",
        "Gol a Favor"
    ],
    'Atajadas': [
        "Atajada Realizada",
        "Tiro a Porteria Recibido",
        "Gol Recibido"
    ],
    'Tiro de esquina': ["Tiro de esquina"]
};


export const ACTION_TYPE_TO_CATEGORY = {
    "Pase Corto Defensivo Logrado": "Pase Corto",
    "Pase Corto Defensivo No Logrado": "Pase Corto",
    "Pase Corto Ofensivo Logrado": "Pase Corto",
    "Pase Corto Ofensivo No Logrado": "Pase Corto",
    "Pase Largo Defensivo Logrado": "Pase Largo",
    "Pase Largo Defensivo No Logrado": "Pase Largo",
    "Pase Largo Ofensivo Logrado": "Pase Largo",
    "Pase Largo Ofensivo No Logrado": "Pase Largo",
    "1 a 1 Defensivo Logrado": "1 a 1",
    "1 a 1 Defensivo No Logrado": "1 a 1",
    "1 a 1 Ofensivo Logrado": "1 a 1",
    "1 a 1 Ofensivo No Logrado": "1 a 1",
    "Aereo Ofensivo Ganado": "Aereo",
    "Aereo Ofensivo Perdido": "Aereo",
    "Aereo Defensivo Ganado": "Aereo",
    "Aereo Defensivo Perdido": "Aereo",
    "Tiro a Porteria Realizado": "Tiro a Porteria",
    "Gol a Favor": "Tiro a Porteria",
    "Tiro a Porteria Recibido": "Atajadas",
    "Atajada Realizada": "Atajadas",
    "Gol Recibido": "Atajadas",
    "Tiro de esquina": "Tiro de esquina",
};

export const COLORS = {
    NAVY: '#001f3f',
    AQUA: '#00c6ff',
    GREEN: '#2ECC40',
    RED: '#FF4136',
    ORANGE: '#FF851B',
    YELLOW: '#FFDC00',
    LIGHT_BLUE: '#7FDBFF',
    DARK_BLUE: '#0074D9',
    GRAY: '#AAAAAA',
};

export const RESULT_COLORS = {
    'Logrado': COLORS.GREEN,
    'Gol': COLORS.AQUA,
    'No Logrado': COLORS.RED,
    'Ganado': COLORS.GREEN,
    'Perdido': COLORS.RED,
    'Atajada': COLORS.YELLOW,
};

export const CHART_COLORS = [COLORS.AQUA, COLORS.GREEN, COLORS.NAVY, COLORS.LIGHT_BLUE, COLORS.ORANGE, COLORS.DARK_BLUE, '#39CCCC', '#B10DC9'];
