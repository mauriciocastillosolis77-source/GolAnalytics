from http.server import BaseHTTPRequestHandler
import json
import numpy as np
import base64
import cv2

class handler(BaseHTTPRequestHandler):
    """
    Vercel Serverless Function para predicciones de IA
    """
    
    def do_POST(self):
        try:
            # Leer body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # Por ahora, retornar predicciones mock
            # TODO: Cargar modelo real cuando subamos los archivos
            mock_predictions = [
                {"action": "1 vs 1 ofensivo", "probability": 0.65},
                {"action": "Pase corto ofensivo", "probability": 0.20},
                {"action": "Pérdida de balón", "probability": 0.08}
            ]
            
            # Respuesta
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                "success": True,
                "predictions": mock_predictions,
                "message": "Modelo funcionando (mock data por ahora)"
            }
            
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            error_response = {
                "success": False,
                "error": str(e)
            }
            
            self.wfile.write(json.dumps(error_response).encode())
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
