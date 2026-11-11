const WebSocket = require('ws');
const http = require('http');

// Puerto dinámico para Render o el puerto 10000 por defecto de forma local
const PORT = process.env.PORT || 10000;

// Crear un servidor HTTP para cumplir con los requerimientos de salud (Health Check) de Render
const server = http.createServer((req, res) => {
if (req.url === '/healthz') {
res.writeHead(200, { 'Content-Type': 'text/plain' });
res.end('OK');
} else {
res.writeHead(404);
res.end();
}
});

// Inicializar el servidor de WebSockets amarrado al servidor HTTP
const wss = new WebSocket.Server({ server });

// Configuración del juego (54 cartas tradicionales)
const TOTAL_CARTAS = 54;
let tómbola = [];
let cartaActual = null;
let enPartida = false;
let temporizador = null;

// Algoritmo Fisher-Yates para barajar las cartas de forma aleatoria sin repetir
function barajar() {
let cartas = Array.from({ length: TOTAL_CARTAS }, (_, i) => i + 1);
for (let i = cartas.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[cartas[i], cartas[j]] = [cartas[j], cartas[i]];
}
return cartas;
}

// Iniciar los ciclos de la tómbola automática cada 1.9 segundos (1900 ms)
function iniciarPartida() {
tómbola = barajar();
enPartida = true;
console.log("Partida Iniciada. Cartas barajadas.");

temporizador = setInterval(() => {
if (tómbola.length > 0) {
const idCarta = tómbola.pop();
cartaActual = { id: idCarta, timestamp: Date.now() };

const payload = JSON.stringify({
type: 'CARD_DRAWN',
roomId: 'sala_general',
card: { id: idCarta }
});

// Enviar la carta en tiempo real a todos los jugadores conectados en la sala
wss.clients.forEach(client => {
if (client.readyState === WebSocket.OPEN) {
client.send(payload);
}
});
console.log(Carta Cantada: ID ${idCarta}`);
} else {
console.log("Se terminaron las cartas de la tómbola.");
clearInterval(temporizador);
enPartida = false;
}
}, 1900);
}

// Manejar conexiones de nuevos jugadores
wss.on('connection', (ws) => {
console.log('Nuevo jugador conectado a la sala.');

// Si ya hay una partida corriendo, enviarle de inmediato la última carta para sincronizarlo
if (cartaActual) {
ws.send(JSON.stringify({
type: 'CARD_DRAWN',
roomId: 'sala_general',
card: { id: cartaActual.id }
}));
}

// Si es el primer jugador y la tómbola está apagada, arrancar el juego automáticamente
if (!enPartida) {
iniciarPartida();
}

ws.on('close', () => {
console.log('Jugador desconectado.');
});
});

// Sistema Anti-Desconexión (Ping/Pong) exigido por el proxy de Render
setInterval(() => {
wss.clients.forEach(ws => {
if (ws.readyState === WebSocket.OPEN) {
ws.ping();
}
});
}, 30000);

server.listen(PORT, () => {
console.log(Servidor de Loto Chapín corriendo en el puerto${PORT}`);
});

