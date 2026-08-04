# AI Bookkeeper - Tech Stack & Architecture

## Frontend (Client)
- **Framework:** React 19 + Vite (TypeScript)
- **Routing:** React Router v6
- **Styling:** Tailwind CSS v4 + Lucide React (Icons)
- **Voice Recognition (Step 6):** Native HTML5 Web Speech API (`window.SpeechRecognition` / `window.webkitSpeechRecognition`). Lightweight, built directly into modern browsers.

## Backend (Server) & Database (Steps 1-4)
- **Database:** Firebase Firestore (NoSQL Document Store)
  - Collections: `Users`, `Transactions`, `Clients`, `Categories`, `Settings`, `AI Conversations`
- **Authentication:** Firebase Auth (Email/Password)
- **Security:** Standard Firestore Security Rules (currently mocked for dev).

## AI Engine (Steps 7-12)
- **Model SDK:** Google Gemini API (`@google/genai`)
- **Architecture (Crucial for Security):** Full-stack Express + Vite node server (or Firebase Cloud Functions) to proxy AI requests so `GEMINI_API_KEY` is never exposed to the client.
- **Data Parsing:** Gemini Structured Outputs (JSON schema) for accurate categorization of Bookkeeping Data Entry.
- **Context Handling (RAG):** Fetching historical Firestore documents to feed into the Gemini context for the Accountant and Advisor AI modes.

## Recommended Tooling (For Speed & Code Quality)
- **Validation:** `zod` - For strongly typed validation of the JSON payload returned by Gemini before it is pushed to Firestore.
- **Date Management:** `date-fns` - To ensure dates between the PHP and USD ledgers handle timezones easily without buggy offsets.
- **Charts/Reporting (Later Steps):** `recharts` - A fast, composable React charting library for the Advisor/Accountant dashboards.
- **Styling Components (Optional):** `shadcn/ui` or Headless UI components (Radix) for clean accessible modals if necessary down the line.
