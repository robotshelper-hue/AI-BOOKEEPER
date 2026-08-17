import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001/live');
ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    init: {
      ledger: 'personal',
      mode: 'unified',
      transactions: [],
      userId: 'test'
    }
  }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.ready) {
    console.log('Ready!');
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: "Hello AI! How are you?" }]
        }],
        turnComplete: true
      }
    }));
  }
  else if (msg.text) console.log('GOT TEXT:', msg.text);
  else console.log('GOT MSG:', Object.keys(msg));
});
