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
let currentCard = null;
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

function startGame() {
  deck = shuffleDeck();
  isPlaying = true;
  console.log('Game started.');

  gameTimer = setInterval(() => {
    if (deck.length > 0) {
      const cardId = deck.pop();
      currentCard = { id: cardId, timestamp: Date.now() };

      const payload = JSON.stringify({
        type: 'CARD_DRAWN',
        roomId: 'sala_general',
        card: { id: cardId }
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
      console.log('Card drawn: ' + cardId);
    } else {
      console.log('Game finished.');
      clearInterval(gameTimer);
      isPlaying = false;
    }
  }, 1900);
}

wss.on('connection', (ws) => {
  console.log('Player connected.');

  if (currentCard) {
    ws.send(JSON.stringify({
      type: 'CARD_DRAWN',
      roomId: 'sala_general',
      card: { id: currentCard.id }
    }));
  }

  if (!isPlaying) {
    startGame();
  }

  ws.on('close', () => {
    console.log('Player disconnected.');
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


