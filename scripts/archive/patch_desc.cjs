const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'name: "recordTransactions",\n            description: "Records one or more financial transactions. You MUST use one of the existing valid categories. If none fit, you MUST ask the user which to use.",',
  'name: "recordTransactions",\n            description: "Records one or more financial transactions. You MUST use one of the existing valid categories. If none fit, you MUST ask the user which to use. The tool returns the IDs of the new transactions. Keep track of these IDs so you can update them if the user corrects you later.",'
);

fs.writeFileSync('server.ts', content);
