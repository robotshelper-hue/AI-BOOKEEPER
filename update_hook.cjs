const fs = require('fs');
let code = fs.readFileSync('src/hooks/useLiveBookkeeper.ts', 'utf8');
code = code.replace(
  /onTransactionRecorded\?: \(tx: any\) => void/g,
  'onToolCall?: (name: string, args: any) => void'
);
code = code.replace(
  /const onTransactionRecordedRef = useRef\(onTransactionRecorded\);/g,
  'const onToolCallRef = useRef(onToolCall);'
);
code = code.replace(
  /onTransactionRecordedRef\.current = onTransactionRecorded;/g,
  'onToolCallRef.current = onToolCall;'
);
code = code.replace(
  /if \(msg\.toolCall && onTransactionRecordedRef\.current\) \{\n\s*\/\/.+\n\s*onTransactionRecordedRef\.current\(msg\.toolCall\.args\);\n\s*\}/g,
  `if (msg.toolCall && onToolCallRef.current) {\n          onToolCallRef.current(msg.toolCall.name, msg.toolCall.args);\n        }`
);
fs.writeFileSync('src/hooks/useLiveBookkeeper.ts', code);
