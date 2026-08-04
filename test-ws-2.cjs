const { WebSocket } = require('ws');
const ws = new WebSocket('ws://127.0.0.1:3000/live');
ws.on('open', () => {
  console.log("Connected to /live!");
  ws.close();
});
ws.on('error', (e) => {
  console.error("error:", e);
});
