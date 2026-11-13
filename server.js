  const WebSocket = require('ws');
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 10000;

const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;
const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
const TILOPAY_API_PASSWORD = process.env.TILOPAY_API_PASSWORD;

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Ruta oficial para iniciar sesión de pago con tarjeta en Tilo Pay
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

      const postData = JSON.stringify({
        apiuser: TILOPAY_API_USER.trim(),
        password: TILOPAY_API_PASSWORD.trim(),
        key: TILOPAY_API_KEY.trim()
      });

      const tpResult = await new Promise((resolve, reject) => {
        const tpReq = https.request({
          hostname: 'app.tilopay.com',
          path: '/api/v1/login',
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

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
});

const wss = new WebSocket.Server({ server });

const TOTAL_CARDS = 54;
let deck = [];
let isPlaying = false;
let gameTimer = null;

function shuffleDeck() {
  let cards = Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function startGame() {
  if (isPlaying) return;
  deck = shuffleDeck();
  isPlaying = true;
  console.log('Game started.');
  broadcast({ type: 'GAME_STARTED' });

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

      if (data.type === 'START_MATCH') {
        startGame();
      }

      if (data.type === 'CLAIM_WIN') {
        stopGame('WINNER_DECLARED');
      }
    } catch (e) {
      console.error('Invalid message format');
    }
  });

  ws.on('close', () => {
    console.log('Player disconnected. Remaining: ' + wss.clients.size);
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
