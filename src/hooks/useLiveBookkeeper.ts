import { useState, useRef, useEffect, useCallback } from 'react';

// Convert Float32Array PCM data to Base64
function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    // Convert to 16-bit PCM
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // true = little-endian
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 back to PCM Float32Array
function base64ToPcm(base64: string): Float32Array {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  const int16View = new Int16Array(buffer);
  const float32 = new Float32Array(int16View.length);
  for (let i = 0; i < int16View.length; i++) {
    float32[i] = int16View[i] / (int16View[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32;
}

const CONNECT_TIMEOUT_MS = 15000;

export function useLiveBookkeeper(ledger: string, mode: string, transactions: any[], categories: any[], history: any[], onToolCall?: (name: string, args: any) => Promise<any> | any, onMessage?: (text: string, isUser: boolean) => void, onTurnComplete?: () => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const onMessageRef = useRef(onMessage);
  const onTurnCompleteRef = useRef(onTurnComplete);
  const onToolCallRef = useRef(onToolCall);
  const ledgerRef = useRef(ledger);
  const modeRef = useRef(mode);
  const transactionsRef = useRef(transactions);
  const categoriesRef = useRef(categories);
  const historyRef = useRef(history);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onTurnCompleteRef.current = onTurnComplete;
    onToolCallRef.current = onToolCall;
    ledgerRef.current = ledger;
    modeRef.current = mode;
    transactionsRef.current = transactions;
    categoriesRef.current = categories;
    historyRef.current = history;
  });
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isConnectingRef = useRef(false);
  const isEndingSessionRef = useRef(false);
  const serverTurnCompletedRef = useRef(false);

  const stop = useCallback(() => {
    isConnectingRef.current = false;
    setIsConnecting(false);
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
      speechRecognitionRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
    setIsConnected(false);
    nextStartTimeRef.current = 0;
    isEndingSessionRef.current = false;
    serverTurnCompletedRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  useEffect(() => {
    stop();
  }, [ledger, mode, stop]);

  const playAudioChunk = (audioCtx: AudioContext, base64Audio: string) => {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const pcmData = base64ToPcm(base64Audio);
    const buffer = audioCtx.createBuffer(1, pcmData.length, audioCtx.sampleRate);
    buffer.copyToChannel(pcmData, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    activeSourcesRef.current.add(source);
    
    const checkEndSession = () => {
      if (isEndingSessionRef.current && serverTurnCompletedRef.current && activeSourcesRef.current.size === 0) {
        setTimeout(stop, 500);
      }
    };

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      checkEndSession();
    };

    const currentTime = audioCtx.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime; // Reset if we fell behind
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buffer.duration;
  };

  const start = useCallback(async () => {
    if (wsRef.current || isConnectingRef.current) return;
    isConnectingRef.current = true;
    isEndingSessionRef.current = false;
    serverTurnCompletedRef.current = false;
    setIsConnecting(true);
    try {
      setError(null);
      // Determine WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputAudioCtx;
      if (inputAudioCtx.state === 'suspended') {
        inputAudioCtx.resume();
      }
      
      const outputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioCtxRef.current = outputAudioCtx;
      if (outputAudioCtx.state === 'suspended') {
        outputAudioCtx.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      if (!isConnectingRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      // Safety net: if the WebSocket/Gemini Live handshake stalls after the mic
      // permission is granted, the connect guard above would otherwise leave the
      // hook permanently stuck (wsRef/isConnectingRef never reset, mic button
      // silently does nothing on further clicks) until the page is refreshed.
      connectTimeoutRef.current = setTimeout(() => {
        console.error('Live session connection timed out');
        setError('Connection timed out. Please try again.');
        stop();
      }, CONNECT_TIMEOUT_MS);

      const source = inputAudioCtx.createMediaStreamSource(stream);
      const processor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputAudioCtx.destination);

      let serverReady = false;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && serverReady) {
          // Prevent echo: don't send audio if the assistant is currently speaking
          const isSpeaking = outputAudioCtxRef.current && 
                             outputAudioCtxRef.current.state === 'running' && 
                             nextStartTimeRef.current > outputAudioCtxRef.current.currentTime;
          if (!isSpeaking) {
            const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        }
      };

      ws.onopen = () => {
        isConnectingRef.current = false;
        setIsConnecting(false);
        setIsConnected(true);
        ws.send(JSON.stringify({
          init: {
            ledger: ledgerRef.current,
            mode: modeRef.current,
            transactions: transactionsRef.current,
            categories: categoriesRef.current,
            history: historyRef.current
          }
        }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          console.error("Live session error:", msg.error);
          setError(msg.error);
          stop();
          return;
        }
        if (msg.ready) {
          serverReady = true;
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
        }
        if (msg.audio && outputAudioCtxRef.current) {
          playAudioChunk(outputAudioCtxRef.current, msg.audio);
        }
        if (msg.text && onMessageRef.current) {
          onMessageRef.current(msg.text, false);
        }
        if (msg.userText && onMessageRef.current) {
          onMessageRef.current(msg.userText, true);
        }
        if (msg.interrupted) {
          activeSourcesRef.current.forEach(source => {
            try { source.stop(); } catch (e) {}
          });
          activeSourcesRef.current.clear();
          nextStartTimeRef.current = 0; // stop playback / clear queue basically
        }
        if (msg.endSession) {
          isEndingSessionRef.current = true;
          // Mute mic immediately so user doesn't interrupt the goodbye
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
          }
        }
        if (msg.turnComplete) {
          serverTurnCompletedRef.current = true;
          if (onTurnCompleteRef.current) {
            onTurnCompleteRef.current();
          }
          if (isEndingSessionRef.current && activeSourcesRef.current.size === 0) {
            setTimeout(stop, 500);
          }
        }
        if (msg.toolCall && onToolCallRef.current) {
          Promise.resolve(onToolCallRef.current(msg.toolCall.name, msg.toolCall.args)).then((result) => {
            ws.send(JSON.stringify({
              toolResponse: {
                id: msg.toolCall.id,
                name: msg.toolCall.name,
                response: result || { result: "Action completed successfully" }
              }
            }));
          }).catch((err) => {
             ws.send(JSON.stringify({
              toolResponse: {
                id: msg.toolCall.id,
                name: msg.toolCall.name,
                response: { error: err.message || "Failed to execute action" }
              }
            }));
          });
        }
      };

      ws.onclose = () => {
        stop();
      };
      
      ws.onerror = (e) => {
        console.error('WebSocket Error:', e);
        setError('Connection error');
        stop();
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to start Live API session');
      stop();
    }
  }, [stop]);

  const sendText = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }));
      if (onMessageRef.current) {
        onMessageRef.current(text, true);
      }
    }
  }, []);

  return { isConnected, isConnecting, start, stop, error, sendText };
}
