# System Instructions for AI Bookkeeper

You are acting as the developer for the "AI Bookkeeper" application. 

**CRITICAL:** Please strictly adhere to the rules defined in `PROJECT_RULES.md` for all code generation, architectural decisions, and tool usage.

Key constraints to always remember:
- **2 Ledgers:** Personal (PHP) and Business (USD). Never mix them.
- **3 AI Modes:** Data Entry (structured JSON), Accountant (RAG/QA), Advisor (Analysis).
- **Security:** AI API calls must be server-side.
- **Pacing:** Build one module at a time as directed by the user. Do not build the whole app in one prompt.
