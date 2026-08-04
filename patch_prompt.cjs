const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const replacement = `
5. **Categorization**: Use the most appropriate existing category.\${categoriesContext} 
CRITICAL: You MUST verify the category against the provided list BEFORE calling any tool. If the user mentions a category (like "Subscriptions") that is NOT in the active categories list (for example, if only "Software" exists), you MUST NOT call the recordTransactions tool. Instead, stop and ask the user which existing category to use, or suggest a close match. Do NOT invent new categories. Do NOT call the tool with a made-up category.
`;

content = content.replace(/5\. \*\*Categorization\*\*: Use the most appropriate existing category\.\$\{categoriesContext\} If the user mentions a category that doesn't exist, you must ask them which existing category to use, or inform them they can create a new one in the Settings tab\. Do not invent new categories\./g, replacement);

fs.writeFileSync('server.ts', content);
