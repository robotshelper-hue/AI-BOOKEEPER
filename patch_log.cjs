const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /session = await ai\.live\.connect\(\{/g,
  `console.log("Connecting to live API with mode:", mode, "ledger:", ledger);
          session = await ai.live.connect({`
);

code = code.replace(
  /clientWs\.on\("message", async \(data\) => \{/g,
  `clientWs.on("message", async (data) => {
      console.log("WS Message received");`
);

fs.writeFileSync('server.ts', code);
