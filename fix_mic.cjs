const fs = require('fs');
let code = fs.readFileSync('src/hooks/useLiveBookkeeper.ts', 'utf8');

code = code.replace(
  /        if \(msg\.ready\) \{/g,
  `        if (msg.error) {
          console.error("Live session error:", msg.error);
          setError(msg.error);
          stop();
          return;
        }
        if (msg.ready) {`
);

fs.writeFileSync('src/hooks/useLiveBookkeeper.ts', code);

let serverCode = fs.readFileSync('server.ts', 'utf8');
serverCode = serverCode.replace(
  /      \} catch \(e\) \{\s*console\.error\('Error handling live session message', e\);\s*\}/g,
  `      } catch (e: any) {
        console.error('Error handling live session message', e);
        clientWs.send(JSON.stringify({ error: e.message || "Failed to start live session" }));
      }`
);

fs.writeFileSync('server.ts', serverCode);
