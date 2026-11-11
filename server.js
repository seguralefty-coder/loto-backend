const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
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


