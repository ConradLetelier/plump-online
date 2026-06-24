// client.js
const socket = io("https://plump-online-production.up.railway.app", {
  transports: ["websocket"]
});


let myId = null;
let lobbyState = null;
let gameState = null;
let myHand = []; // kept client-side only

// Simple in-memory hand sync: server doesn't send cards, so we track them here.
// For a real game you'd want server-authoritative hands.

function $(id) { return document.getElementById(id); }

const connectionView = $('connectionView');
const lobbyView = $('lobbyView');
const gameView = $('gameView');

const nameInput = $('nameInput');
const lobbyCodeInput = $('lobbyCodeInput');
const maxPlayersInput = $('maxPlayersInput');
const connError = $('connError');

$('createLobbyBtn').onclick = () => {
  const name = nameInput.value.trim() || 'Spelare';
  const maxPlayers = parseInt(maxPlayersInput.value, 10) || 5;
  socket.emit('createLobby', { name, maxPlayers }, (res) => {
    if (!res.ok) {
      connError.textContent = res.error || 'Kunde inte skapa lobby';
      return;
    }
    myId = socket.id;
    showLobby(res.lobbyId);
  });
};

$('joinLobbyBtn').onclick = () => {
  const name = nameInput.value.trim() || 'Spelare';
  const lobbyId = lobbyCodeInput.value.trim().toUpperCase();
  if (!lobbyId) {
    connError.textContent = 'Ange lobbykod';
    return;
  }
  socket.emit('joinLobby', { name, lobbyId }, (res) => {
    if (!res.ok) {
      connError.textContent = res.error || 'Kunde inte gå med i lobby';
      return;
    }
    myId = socket.id;
    showLobby(res.lobbyId);
  });
};

$('startGameBtn').onclick = () => {
  socket.emit('startGame');
};

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('lobbyUpdate', (state) => {
  lobbyState = state;
  renderLobby();
});

socket.on('gameState', (state) => {
  gameState = state;
  renderGame();
});

// ---- UI helpers ----

function showLobby(lobbyId) {
  connectionView.style.display = 'none';
  lobbyView.style.display = 'block';
  gameView.style.display = 'none';
  $('lobbyIdLabel').textContent = lobbyId;
}

function showGame() {
  connectionView.style.display = 'none';
  lobbyView.style.display = 'none';
  gameView.style.display = 'block';
}

function renderLobby() {
  if (!lobbyState) return;
  const list = $('playerList');
  list.innerHTML = '';
  lobbyState.players.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'player';
    div.textContent = `${p.name} ${p.connected ? '' : '(frånkopplad)'}`;
    if (p.id === lobbyState.hostId) {
      div.textContent += ' (Host)';
    }
    list.appendChild(div);
  });

  const info = $('lobbyInfo');
  info.textContent = `Spelare: ${lobbyState.players.length}/${lobbyState.maxPlayers}`;

  const startBtn = $('startGameBtn');
  startBtn.disabled = !(myId === lobbyState.hostId && lobbyState.players.length >= 2);

  if (lobbyState.state !== 'waiting') {
    showGame();
  }
}

function renderGame() {
  if (!gameState) return;
  showGame();
  $('gameLobbyIdLabel').textContent = gameState.lobbyId;

  const me = gameState.players.find(p => p.id === myId);
  const status = $('gameStatus');

  if (gameState.state === 'bidding') {
    status.textContent = `Budgivning – runda ${gameState.roundIndex + 1}/${gameState.totalRounds}, ${gameState.cardsThisRound} kort`;
  } else if (gameState.state === 'playing') {
    status.textContent = `Spel – runda ${gameState.roundIndex + 1}/${gameState.totalRounds}`;
  } else if (gameState.state === 'round_end') {
    status.textContent = `Rundan är slut – poäng uppdateras`;
  } else if (gameState.state === 'finished') {
    status.textContent = `Spelet är slut`;
  }

  renderBidding(me);
  renderPlay(me);
  renderRoundInfo();
  renderScoreBoard();
}

// For simplicity, we fake the hand size visually by generating placeholder cards.
// If you want real cards per player, you must send them from server.
function ensureHandSize(size) {
  if (myHand.length === size) return;
  myHand = [];
  for (let i = 0; i < size; i++) {
    myHand.push({ id: i }); // placeholder
  }
}

function renderBidding(me) {
  const container = $('biddingView');
  container.innerHTML = '';
  if (!me) return;
  if (gameState.state !== 'bidding') return;

  ensureHandSize(gameState.cardsThisRound);

  const title = document.createElement('div');
  title.textContent = `Dina kort: ${gameState.cardsThisRound} (visas inte här, bara antal)`;
  container.appendChild(title);

  const input = document.createElement('input');
  input.type = 'number';
  input.min = 0;
  input.max = gameState.cardsThisRound;
  input.value = me.bid != null ? me.bid : '';
  input.style.width = '60px';

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Lägg bud';

  btn.onclick = () => {
    const bid = parseInt(input.value, 10);
    if (Number.isNaN(bid)) return;
    socket.emit('placeBid', bid, (res) => {
      if (!res.ok) {
        alert(res.error || 'Ogiltigt bud');
      }
    });
  };

  container.appendChild(document.createTextNode('Ditt bud: '));
  container.appendChild(input);
  container.appendChild(btn);

  const list = document.createElement('div');
  list.style.marginTop = '8px';
  gameState.players.forEach((p, idx) => {
    const div = document.createElement('div');
    let txt = `${p.name}: `;
    if (p.bid == null) txt += '(inget bud ännu)';
    else txt += p.bid;
    if (idx === gameState.dealerIndex) txt += ' (giv)';
    div.textContent = txt;
    list.appendChild(div);
  });
  container.appendChild(list);
}

function renderPlay(me) {
  const container = $('playView');
  container.innerHTML = '';
  if (!me) return;
  if (gameState.state !== 'playing' && gameState.state !== 'round_end' && gameState.state !== 'finished') return;

  const myIndex = gameState.players.findIndex(p => p.id === myId);
  const isMyTurn = gameState.currentPlayerIndex === myIndex && gameState.state === 'playing';

  const turnInfo = document.createElement('div');
  if (gameState.state === 'playing') {
    turnInfo.textContent = isMyTurn ? 'Din tur att spela kort' : `Väntar på andra spelare`;
  } else if (gameState.state === 'round_end') {
    turnInfo.textContent = 'Rundan är slut, nästa runda startar strax...';
  } else if (gameState.state === 'finished') {
    turnInfo.textContent = 'Spelet är slut';
  }
  container.appendChild(turnInfo);

  // Fake hand: just show N clickable cards
  ensureHandSize(me.handSize);

  const handDiv = document.createElement('div');
  handDiv.className = 'hand';
  handDiv.textContent = 'Din hand: ';

  myHand.forEach((c, idx) => {
    const cardDiv = document.createElement('span');
    cardDiv.className = 'card';
    cardDiv.textContent = 'Kort ' + (idx + 1);
    cardDiv.onclick = () => {
      if (!isMyTurn) return;
      // Since we don't know actual card identities on client, we send a fake string.
      // For a real game, server must send actual cards and we send back the chosen one.
      const fakeCardStr = 'X' + idx; // server will reject; this is placeholder
      alert('För riktig spelupplevelse måste servern skicka riktiga kort. Just nu är detta en demo.');
    };
    if (!isMyTurn || gameState.state !== 'playing') {
      cardDiv.style.opacity = '0.5';
      cardDiv.style.cursor = 'default';
    }
    handDiv.appendChild(cardDiv);
  });

  container.appendChild(handDiv);

  const trickDiv = document.createElement('div');
  trickDiv.className = 'trick';
  trickDiv.textContent = 'Pågående stick: ';
  if (gameState.currentTrick.length === 0) {
    trickDiv.textContent += '(inget kort spelat ännu)';
  } else {
    trickDiv.appendChild(document.createElement('br'));
    gameState.currentTrick.forEach(t => {
      const p = gameState.players[t.playerIndex];
      const span = document.createElement('div');
      span.textContent = `${p.name}: ${t.card}`;
      trickDiv.appendChild(span);
    });
  }
  container.appendChild(trickDiv);
}

function renderRoundInfo() {
  const div = $('roundInfo');
  if (!gameState) {
    div.textContent = '';
    return;
  }
  div.textContent = `Runda ${gameState.roundIndex + 1}/${gameState.totalRounds} – stick spelade: ${gameState.tricksPlayedThisRound}/${gameState.cardsThisRound}`;
}

function renderScoreBoard() {
  const div = $('scoreBoard');
  if (!gameState) {
    div.textContent = '';
    return;
  }
  div.innerHTML = '<h3>Poäng</h3>';
  gameState.players.forEach((p, idx) => {
    const row = document.createElement('div');
    let txt = `${p.name}: ${p.score}p (bud: ${p.bid == null ? '-' : p.bid}, stick: ${p.tricksThisRound})`;
    if (gameState.state === 'finished') {
      const bestScore = Math.max(...gameState.players.map(pl => pl.score));
      if (p.score === bestScore) {
        txt += ' 🏆';
      }
    }
    row.textContent = txt;
    if (p.id === myId) row.className = 'highlight';
    div.appendChild(row);
  });
}
