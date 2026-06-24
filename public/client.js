// ------------------------------------------------------
// SOCKET.IO CONNECTION
// ------------------------------------------------------
const socket = io("https://plump-online-production.up.railway.app", {
  transports: ["websocket"]
});

// ------------------------------------------------------
// DOM ELEMENTS
// ------------------------------------------------------
const connectionView = document.getElementById("connectionView");
const lobbyView = document.getElementById("lobbyView");
const gameView = document.getElementById("gameView");

const nameInput = document.getElementById("nameInput");
const lobbyCodeInput = document.getElementById("lobbyCodeInput");
const maxPlayersInput = document.getElementById("maxPlayersInput");

const createLobbyBtn = document.getElementById("createLobbyBtn");
const joinLobbyBtn = document.getElementById("joinLobbyBtn");
const startGameBtn = document.getElementById("startGameBtn");

const connError = document.getElementById("connError");
const playerList = document.getElementById("playerList");
const lobbyIdLabel = document.getElementById("lobbyIdLabel");
const gameLobbyIdLabel = document.getElementById("gameLobbyIdLabel");

const gameStatus = document.getElementById("gameStatus");
const biddingView = document.getElementById("biddingView");
const playView = document.getElementById("playView");
const roundInfo = document.getElementById("roundInfo");
const scoreBoard = document.getElementById("scoreBoard");

const handDiv = document.createElement("div");
handDiv.id = "hand";
handDiv.className = "hand";
document.getElementById("gameView").prepend(handDiv);

// ------------------------------------------------------
// BUTTON HANDLERS
// ------------------------------------------------------
createLobbyBtn.onclick = () => {
  const name = nameInput.value.trim();
  const maxPlayers = Number(maxPlayersInput.value);

  if (!name) return connError.textContent = "Du måste skriva ett namn.";

  socket.emit("createLobby", { name, maxPlayers }, (res) => {
    if (!res.ok) return connError.textContent = res.error;
    enterLobby(res.lobbyId);
  });
};

joinLobbyBtn.onclick = () => {
  const name = nameInput.value.trim();
  const lobbyId = lobbyCodeInput.value.trim().toUpperCase();

  if (!name) return connError.textContent = "Du måste skriva ett namn.";
  if (!lobbyId) return connError.textContent = "Du måste skriva en lobbykod.";

  socket.emit("joinLobby", { name, lobbyId }, (res) => {
    if (!res.ok) return connError.textContent = res.error;
    enterLobby(res.lobbyId);
  });
};

startGameBtn.onclick = () => {
  socket.emit("startGame");
};

// ------------------------------------------------------
// VIEW SWITCHING
// ------------------------------------------------------
function enterLobby(lobbyId) {
  connectionView.style.display = "none";
  lobbyView.style.display = "block";
  lobbyIdLabel.textContent = lobbyId;
}

// ------------------------------------------------------
// SOCKET EVENTS
// ------------------------------------------------------

// LOBBY UPDATE
socket.on("lobbyUpdate", (state) => {
  playerList.innerHTML = "";
  state.players.forEach(p => {
    const div = document.createElement("div");
    div.className = "player";
    div.textContent = p.name + (p.connected ? "" : " (frånkopplad)");
    playerList.appendChild(div);
  });
});

// GAME STATE UPDATE
socket.on("gameState", (state) => {
  lobbyView.style.display = "none";
  gameView.style.display = "block";

  gameLobbyIdLabel.textContent = state.lobbyId;

  gameStatus.textContent = `Runda ${state.roundIndex + 1} / ${state.totalRounds}`;

  roundInfo.textContent = `Antal kort denna runda: ${state.cardsThisRound}`;

  // Visa budgivning
  if (state.state === "bidding") {
    biddingView.innerHTML = `
      <h3>Budgivning</h3>
      <p>Hur många stick tror du att du tar?</p>
      <input id="bidInput" type="number" min="0" max="${state.cardsThisRound}" style="width:60px;">
      <button class="btn" id="placeBidBtn">Lägg bud</button>
    `;

    document.getElementById("placeBidBtn").onclick = () => {
      const bid = Number(document.getElementById("bidInput").value);
      socket.emit("placeBid", bid, (res) => {
        if (!res.ok) alert(res.error);
      });
    };
  } else {
    biddingView.innerHTML = "";
  }

  // Scoreboard
  scoreBoard.innerHTML = "<h3>Poäng</h3>";
  state.players.forEach(p => {
    const div = document.createElement("div");
    div.textContent = `${p.name}: ${p.score}p`;
    scoreBoard.appendChild(div);
  });
});

// RECEIVE PRIVATE HAND
socket.on("yourHand", ({ hand }) => {
  handDiv.innerHTML = "";

  hand.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";

    if (card.includes("♥") || card.includes("♦")) {
      div.classList.add("heart");
    }

    div.textContent = card;
    handDiv.appendChild(div);
  });

  handDiv.style.display = "flex";
});
