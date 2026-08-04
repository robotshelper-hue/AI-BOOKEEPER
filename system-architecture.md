# AI Bookkeeper - System Architecture

## System Information
- **Project Name**: AI Bookkeeper
- **Environment**: Node.js + Express backend, React + Vite frontend
- **Deployment**: Google Cloud Run (Containerized)
- **Primary Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Styling**: Tailwind CSS

## Core Architecture
The system follows a Full-Stack SPA architecture.
- **Frontend**: A React Single Page Application that handles user routing, UI state, and audio capture/playback for the live AI session.
- **Backend**: An Express.js server that serves the Vite application in production, provides API routes, and establishes a WebSocket connection with the client to bridge audio and text data to the Gemini Live API.

## Assets Built & Discussed
1. **Ledgers**:
   - **Personal Finance**: Uses Philippine Peso (PHP, ₱).
   - **Business Finance**: Uses US Dollar (USD, $).
2. **AI Modes**:
   - **Data Entry (Bookkeeper)**: Collects transaction details (type, amount, currency, category, notes) and records them.
   - **Accountant**: Uses historical transaction data to answer user queries (Q&A/RAG).
   - **Advisor**: Analyzes data to provide financial insights and recommendations.
3. **Core Modules/Tabs**:
   - **AI Hub**: The main interface for the Unified Agent voice and text interaction.
   - **Transactions**: A ledger view of all recorded financial data.
   - **Analytics**: Historical data visualization using Recharts.
   - **Clients**: Specific to the business ledger, for managing client relations.
   - **Settings**: Allows category management and notification preferences.

## Tools & Libraries Used
- **Frontend**:
  - `react`, `react-dom`, `react-router-dom` for UI and routing.
  - `lucide-react` for iconography.
  - `recharts` for analytics data visualization.
  - `tailwindcss` for styling.
  - `firebase` for client-side Auth and Firestore data fetching.
- **Backend**:
  - `express` for the HTTP server.
  - `ws` for WebSocket communication between the client and the Node server.
  - `@google/genai` for integrating with the Gemini API.
- **Build/Dev**:
  - `vite` for fast development and bundling.
  - `esbuild` for bundling the server codebase.
  - `tsx` for running TypeScript Node natively during development.

## Models, LLMs, and Instructions
- **Model Used**: `gemini-3.1-flash-live-preview`
- **Integration**: Real-time Interactions API via WebSockets.
- **System Instructions**:
  - The AI acts as a professional Bookkeeper, Accountant, and Advisor.
  - Based on the selected ledger (Personal or Business), the AI enforces the correct currency (PHP vs USD).
  - The AI receives JSON-formatted historical transactions in its system prompt to accurately answer Q&A and provide analysis.
  - It utilizes function calling (`recordTransaction`) to persistently store new transactions directly into the Firestore database when the user requests data entry.
- **Voices**:
  - Aoede (Default/Bookkeeper)
  - Charon (Accountant)
  - Kore (Advisor)

## How the System Works
1. **Authentication**: Users sign in or register via Firebase Auth.
2. **Ledger Selection**: Users choose between their Personal or Business ledger. This sets the context (currency, transaction categories) for the rest of the session.
3. **Live AI Session**: 
   - The user navigates to the AI Hub.
   - The browser captures microphone audio via the Web Audio API and `MediaStream` and sends base64-encoded PCM audio chunks via a WebSocket to the Express server.
   - The Express server forwards this audio stream to the Gemini Live API using the `@google/genai` SDK.
   - Gemini processes the audio, executes tools if necessary (like `recordTransaction`), and streams audio responses back to the server.
   - The server forwards the response audio back to the client via WebSocket.
   - The client decodes and plays the audio in real-time, displaying transcriptions in a chat interface.
4. **Data Storage**: When the AI triggers the `recordTransaction` function, the server acknowledges it, and the client receives the event via the WebSocket to save the data securely to Firestore.
5. **Real-time Updates**: Once a transaction is saved, the client re-fetches the ledger data to update the Analytics and Transactions tabs instantly.
