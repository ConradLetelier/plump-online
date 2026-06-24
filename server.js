const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

// -------------------- SERVER SETUP --------------------

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://plump-online-production.up.railway.app",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Serve client files
app.use(express.static(path.join(__dirname, "public")));


// -------------------- GAME LOGIC --------------------

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ suit: s, rank: r });
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function cardValue(card) {
  return RANKS.indexOf(card.rank);
}

function cardToString(card) {
  return card.rank + card.suit;
}

function winnerOfTrick(trickCards, leadSuit) {
  let winnerIndex = 0;
  let bestValue = -1;
  for (let i = 0; i < trickCards.length; i++) {
    const c = trickCards[i];
    if (c.suit === leadSuit) {
      const v = cardValue(c);
      if (v > bestValue) {
        bestValue = v;
        winnerIndex = i;
      }
    }
  }
  return winnerIndex;
}

const lobbies = new Map();

function createLobby(hostSocketId, hostName, maxPlayers) {
  const lobbyId = Math.random().toString(36).substring(2, 7).toUpperCase();
  const lobby = {
    id: lobbyId,
    hostId: hostSocketId,
    maxPlayers,
    players: [],
    state: "waiting",
    roundIndex: 0,
    roundCardCounts: [],
    dealerIndex: 0,
    currentPlayerIndex: 0,
    currentTrick: [],
    leadSuit: null,
    tricksPlayedThisRound: 0,
    deck: []
  };

  lobbies.set(lobbyId, lobby);
  return lobby;
}

function getLobbyByPlayer(socketId) {
  for (const lobby of lobbies.values()) {
    if (lobby.players.some(p => p.id === socketId)) return lobby;
  }
  return null;
}

function buildRoundCardCounts(maxCards = 10) {
  const down = [];
  for (let i = maxCards; i >= 1; i--) down.push(i);
  const up = [];
  for (let i = 2; i <= maxCards; i++) up.push(i);
  return down.concat(up);
}

function dealRound(lobby) {
  const cardsThisRound = lobby.roundCardCounts[lobby.roundIndex];
  const deck = createDeck();
  shuffle(deck);
  lobby.deck = deck;

  for (const p of lobby.players) {
    p.hand = [];
    p.tricksThisRound = 0;
    p.bid = null;
  }

  for (let c = 0; c < cardsThisRound; c++) {
    for (const p of lobby.players) {
      p.hand.push(deck.pop());
    }
  }

  lobby.tricksPlayedThisRound = 0;
  lobby.currentTrick = [];
  lobby.leadSuit = null;
}

function allBidsPlaced(lobby) {
  return lobby.players.every(p => typeof p.bid === "number");
}

function totalBids(lobby) {
  return lobby.players.reduce((sum, p) => sum + (p.bid || 0), 0);
}

function cardsThisRound(lobby) {
  return lobby.roundCardCounts[lobby.roundIndex];
}

function nextPlayerIndex(lobby, idx) {
  return (idx + 1) % lobby.players.length;
}

function computeScoresForRound(lobby) {
  for (const p of lobby.players) {
    if (p.bid === p.tricksThisRound) {
      if (p.bid === 0) p.score += 5;
      else p.score += 10 + p.tricksThisRound;
    }
  }
}

function publicLobbyState(lobby) {
  return {
    id: lobby.id,
    hostId: lobby.hostId,
    maxPlayers: lobby.maxPlayers,
    state: lobby.state,
    players: lobby.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected
    }))
  };
}

function publicGameState(lobby) {
  return {
    lobbyId: lobby.id,
    state: lobby.state,
    roundIndex: lobby.roundIndex,
    totalRounds: lobby.roundCardCounts.length,
    cardsThisRound: cardsThisRound(lobby),
    dealerIndex: lobby.dealerIndex,
    currentPlayerIndex: lobby.currentPlayerIndex,
    tricksPlayedThisRound: lobby.tricksPlayedThisRound,
    players: lobby.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      bid: p.bid,
      tricksThisRound: p.tricksThisRound,
      handSize: p.hand.length
    })),
    currentTrick: lobby.currentTrick.map(t => ({
      playerIndex: t.playerIndex,
      card: cardToString(t.card)
    }))
  };
}

function startRound(lobby) {
  lobby.state = "bidding";
  dealRound(lobby);
  io.to(lobby.id).emit("gameState", publicGameState(lobby));
}


// -------------------- SOCKET.IO EVENTS --------------------

io.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("createLobby", ({ name, maxPlayers }, cb) => {
    const lobby = createLobby(socket.id, name, maxPlayers);
    lobby.players.push({
      id: socket.id,
      name,
      score: 0,
      tricksThisRound: 0,
      bid: null,
      hand: [],
      connected: true
    });

    socket.join(lobby.id);
    cb({ ok: true, lobbyId: lobby.id });
    io.to(lobby.id).emit("lobbyUpdate", publicLobbyState(lobby));
  });

  socket.on("joinLobby", ({ name, lobbyId }, cb) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return cb({ ok: false, error: "Lobby finns inte" });
    if (lobby.players.length >= lobby.maxPlayers)
      return cb({ ok: false, error: "Lobby är full" });

    lobby.players.push({
      id: socket.id,
      name,
      score: 0,
      tricksThisRound: 0,
      bid: null,
      hand: [],
      connected: true
    });

    socket.join(lobby.id);
    cb({ ok: true, lobbyId: lobby.id });
    io.to(lobby.id).emit("lobbyUpdate", publicLobbyState(lobby));
  });

  socket.on("startGame", () => {
    const lobby = getLobbyByPlayer(socket.id);
    if (!lobby) return;
    if (socket.id !== lobby.hostId) return;

    lobby.roundCardCounts = buildRoundCardCounts(10);
    lobby.roundIndex = 0;

    for (const p of lobby.players) p.score = 0;

    startRound(lobby);
  });

  socket.on("placeBid", (bid, cb) => {
    const lobby = getLobbyByPlayer(socket.id);
    if (!lobby || lobby.state !== "bidding") return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;

    const cards = cardsThisRound(lobby);
    bid = Number(bid);

    if (isNaN(bid) || bid < 0 || bid > cards)
      return cb({ ok: false, error: "Ogiltigt bud" });

    player.bid = bid;

    if (allBidsPlaced(lobby)) {
      const total = totalBids(lobby);
      const tricks = cardsThisRound(lobby);

      if (total === tricks) {
        const dealer = lobby.players[lobby.dealerIndex];
        if (dealer.bid < tricks) dealer.bid++;
        else dealer.bid--;
      }

      lobby.state = "playing";
    }

    io.to(lobby.id).emit("gameState", publicGameState(lobby));
    cb({ ok: true });
  });

  socket.on("playCard", (cardStr, cb) => {
    const lobby = getLobbyByPlayer(socket.id);
    if (!lobby || lobby.state !== "playing") return;

    cb({ ok: false, error: "Clienten skickar inga riktiga kort ännu" });
  });

  socket.on("disconnect", () => {
    const lobby = getLobbyByPlayer(socket.id);
    if (!lobby) return;

    const player = lobby.players.find(p => p.id === socket.id);
    if (player) player.connected = false;

    io.to(lobby.id).emit("lobbyUpdate", publicLobbyState(lobby));
  });
});


// -------------------- START SERVER --------------------

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
