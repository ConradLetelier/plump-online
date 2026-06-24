const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// Serve client files
app.use(express.static(path.join(__dirname, "public")));

// ---- Your Plump game logic goes here ----
// (Use the server.js I gave you earlier — it works as-is)


// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
