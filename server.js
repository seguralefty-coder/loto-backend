const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Credenciales de Tilo Pay guardadas de forma segura en Render
const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;
const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
const TILOPAY_API_PASSWORD = process.env.TILOPAY_API_PASSWORD;

// Función auxiliar para leer el cuerpo JSON de las peticiones
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Permisos CORS para que tu app APK y web puedan conectarse sin dar "Failed to fetch"
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Responder rápido a las verificaciones previas del navegador
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Verificación de estado de Render
  if (req.url === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Ruta oficial para iniciar sesión de pago con tarjeta en Tilo Pay SDK
  if (req.url === '/api/tilopay/create-session' && req.method === 'POST') {
    try {
      if (!TILOPAY_API_KEY || !TILOPAY_API_USER || !TILOPAY_API_PASSWORD) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Faltan credenciales de Tilo Pay en Render' }));
        return;
      }

      const data = await parseBody(req);
      const amount = Number(data.amount) || 25.00;
      const currency = data.currency || 'GTQ';
      const orderNumber = 'LOTO-' + Date.now();

      // Petición HTTPS nativa hacia Tilo Pay (compatible con todas las versiones de Node)
      const https = require('https');
      const postData = JSON.stringify({
        apiuser: TILOPAY_API_USER.trim(),
        password: TILOPAY_API_PASSWORD.trim(),
        key: TILOPAY_API_KEY.trim()
      });

      const tpResult = await new Promise((resolve, reject) => {
        const tpReq = https.request({
          hostname: 'app.tilopay.com',
          path: '/api/v1/loginSdk',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (tpRes) => {
          let rawData = '';
          tpRes.on('data', chunk => rawData += chunk);
          tpRes.on('end', () => resolve({ status: tpRes.statusCode, body: rawData }));
        });
        tpReq.on('error', reject);
        tpReq.write(postData);
        tpReq.end();
      });

      let tpData = {};
      try {
        tpData = JSON.parse(tpResult.body);
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Respuesta inesperada de Tilo Pay (' + tpResult.status + '): ' + tpResult.body.slice(0, 120) }));
        return;
      }

      if (tpResult.status !== 200 || !tpData.access_token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tilo Pay rechazó el acceso: ' + (tpData.message || JSON.stringify(tpData)) }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        token: tpData.access_token,
        key: TILOPAY_API_KEY.trim(),
        orderNumber: orderNumber,
        amount: amount,
        currency: currency
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Fallo de red en servidor: ' + error.message }));
    }
    return;
  }

  // Velocidad ajustada a 3.5 segundos (3500 ms) para dar tiempo a cantar y marcar
  gameTimer = setInterval(() => {
    if (deck.length > 0 && isPlaying) {
      const cardId = deck.pop();
      broadcast({
        type: 'CARD_DRAWN',
        roomId: 'sala_general',
        card: { id: cardId }
      });
      console.log('Card drawn: ' + cardId);
    } else {
      stopGame('DECK_EMPTY');
    }
  }, 3500);
}

function stopGame(reason) {
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
  }
  isPlaying = false;
  console.log('Game stopped: ' + reason);
  broadcast({ type: 'GAME_OVER', reason: reason });
}

wss.on('connection', (ws) => {
  console.log('Player connected. Total: ' + wss.clients.size);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // El juego arranca solo cuando el cliente avisa que la sala inició
      if (data.type === 'START_MATCH') {
        startGame();
      }

      // Se detiene inmediatamente cuando un jugador canta victoria
      if (data.type === 'CLAIM_WIN') {
        stopGame('WINNER_DECLARED');
      }
    } catch (e) {
      console.error('Invalid message format');
    }
  });

  ws.on('close', () => {
    console.log('Player disconnected. Remaining: ' + wss.clients.size);
    // Si todos salen de la sala, se apaga la tómbola
    if (wss.clients.size === 0) {
      stopGame('ROOM_EMPTY');
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
