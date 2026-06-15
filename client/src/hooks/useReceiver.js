import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { sha256, importKeyFromUrl, decryptChunk } from '../utils/crypto';
import { RTC_CONFIG } from '../utils/webrtc';

const SIGNAL_URL = process.env.REACT_APP_SIGNAL_URL || 'http://localhost:4000';

export function useReceiver(roomId) {
  const [status, setStatus]           = useState('joining');
  const [error, setError]             = useState(null);
  const [fileMeta, setFileMeta]       = useState(null);
  const [progress, setProgress]       = useState(0);
  const [speed, setSpeed]             = useState(0);
  const [eta, setEta]                 = useState(0);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [verifying, setVerifying]     = useState(false);

  const socketRef      = useRef(null);
  const pcRef          = useRef(null);
  const cryptoKeyRef   = useRef(null);
  const metaRef        = useRef(null);

  const statusRef      = useRef('joining');
  const mountedRef     = useRef(false);

  const opfsFileHandleRef = useRef(null);
  const opfsWritableRef   = useRef(null);
  const totalWrittenRef   = useRef(0);
  const speedWindowRef    = useRef({ bytes: 0, time: Date.now() });
  const pendingCandidatesRef = useRef([]); // ICE candidates that arrived before remote SDP was set
  const useMemoryBufferRef = useRef(false); // true on browsers without OPFS createWritable (Safari/iOS)
  const memoryChunksRef    = useRef([]);

  const setStatusBoth = (s) => { statusRef.current = s; setStatus(s); };

  const cleanup = useCallback(() => {
    try { pcRef.current?.close(); } catch (_) {}
    pcRef.current = null;
  }, []);

  const initOPFS = async (reset = true) => {
    try {
      const root = await navigator.storage.getDirectory();
      if (reset) {
        try { await root.removeEntry('p2p_temp_transfer'); } catch (_) {}
      }
      const fileHandle = await root.getFileHandle('p2p_temp_transfer', { create: true });

      // Safari / iOS (all browsers on iOS are WebKit) implement OPFS but
      // do NOT implement createWritable() on FileSystemFileHandle.
      if (typeof fileHandle.createWritable !== 'function') {
        throw new Error('OPFS createWritable() unsupported on this browser');
      }

      opfsFileHandleRef.current = fileHandle;
      const existing = await fileHandle.getFile();
      opfsWritableRef.current = await fileHandle.createWritable({
        keepExistingData: !reset,
      });
      useMemoryBufferRef.current = false;

      if (!reset && existing.size > 0) {
        await opfsWritableRef.current.seek(existing.size);
        totalWrittenRef.current = existing.size;
      } else {
        totalWrittenRef.current = 0;
      }
    } catch (err) {
      // Fallback: buffer the file in memory. Works everywhere but is
      // limited by available RAM, so it's a last resort.
      console.warn('[OPFS] unavailable, falling back to memory buffer:', err.message);
      useMemoryBufferRef.current = true;
      memoryChunksRef.current = [];
      opfsFileHandleRef.current = null;
      opfsWritableRef.current = null;
      totalWrittenRef.current = 0;
    }
    return totalWrittenRef.current;
  };

  const finalize = useCallback(async () => {
    const meta = metaRef.current;
    if (!meta) return;
    
    setVerifying(true);
    setStatusBoth('verifying');
    
    try {
      let arrayBuffer;

      if (useMemoryBufferRef.current) {
        const blob = new Blob(memoryChunksRef.current);
        arrayBuffer = await blob.arrayBuffer();
      } else {
        await opfsWritableRef.current?.close();
        opfsWritableRef.current = null;

        const finalFile = await opfsFileHandleRef.current.getFile();
        arrayBuffer = await finalFile.arrayBuffer();
      }

      // --- STEP 2 FIX: Safely handle the large-file hash bypass ---
      if (meta.hash !== 'skipped-due-to-size') {
        const receivedHash = await sha256(arrayBuffer);
        
        if (receivedHash !== meta.hash) {
          setVerifying(false);
          setError('File integrity check FAILED — SHA-256 mismatch. The file may be corrupted.');
          setStatusBoth('error');
          if (!useMemoryBufferRef.current) {
            try {
              const root = await navigator.storage.getDirectory();
              await root.removeEntry('p2p_temp_transfer');
            } catch (_) {}
          }
          memoryChunksRef.current = [];
          return;
        }
      }
      // -------------------------------------------------------------

      const blob = new Blob([arrayBuffer], { type: meta.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = meta.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      
      setVerifying(false);
      setProgress(100);
      setStatusBoth('done');
      
      if (useMemoryBufferRef.current) {
        memoryChunksRef.current = [];
      } else {
        try {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry('p2p_temp_transfer');
        } catch (_) {
          console.warn('[OPFS] cleanup delayed');
        }
      }
      totalWrittenRef.current = 0;
      metaRef.current = null;
      
    } catch (err) {
      setVerifying(false);
      setError(`Finalization error: ${err.message}`);
      setStatusBoth('error');
    }
  }, []);;

  useEffect(() => {
    if (!roomId) return;
    if (mountedRef.current) return;
    mountedRef.current = true;

    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    const keyString = hashParams.get('key');
    if (!keyString) {
      setError('Decryption key missing from URL. Cannot receive file.');
      setStatusBoth('error');
      return;
    }

    importKeyFromUrl(keyString)
      .then((key) => { cryptoKeyRef.current = key; })
      .catch(() => { setError('Invalid or corrupt decryption key in URL.'); setStatusBoth('error'); });

    const socket = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('join-room', roomId));
    socket.on('room-joined', () => setStatusBoth('awaiting-peer'));

    socket.on('offer', async ({ offer }) => {
      setStatusBoth('connecting');
      try {
        let pc = pcRef.current;
        const isNewConnection = !pc;

        if (isNewConnection) {
          pc = new RTCPeerConnection(RTC_CONFIG);
          pcRef.current = pc;

          pc.ondatachannel = ({ channel }) => {
            channel.binaryType = 'arraybuffer';

            channel.onopen = () => {
              setStatusBoth('connected');
              // We intentionally do nothing else here!
              // The disk will initialize when we receive 'FILE_SELECTED' in onmessage.
            };

            channel.onclose = () => {
              if (statusRef.current !== 'done') {
                setStatusBoth('disconnected');
              }
            };

            channel.onerror = (e) => {
              setError(`DataChannel error: ${e.message || 'unknown'}`);
              setStatusBoth('error');
            };

            channel.onmessage = async ({ data }) => {
              if (typeof data === 'string') {
                let parsed;
                try { parsed = JSON.parse(data); }
                catch { setError('Malformed message.'); setStatusBoth('error'); return; }

                if (parsed.type === 'FILE_SELECTED') {
                  try {
                    const offset = await initOPFS(true);
                    setBytesReceived(offset);
                    speedWindowRef.current = { bytes: 0, time: Date.now() };
                    channel.send(JSON.stringify({ type: 'READY', offset: 0 }));
                  } catch (err) {
                    setError(err.message); setStatusBoth('error');
                  }
                  return;
                }

                if (parsed.type === 'EOF') {
                  await finalize();
                  return;
                }

                metaRef.current = parsed;
                setFileMeta(parsed);
                setStatusBoth('receiving');
                return;
              }

              try {
                const decryptedChunk = await decryptChunk(data, cryptoKeyRef.current);
                if (useMemoryBufferRef.current) {
                  memoryChunksRef.current.push(decryptedChunk);
                } else {
                  await opfsWritableRef.current.write(decryptedChunk);
                }
                totalWrittenRef.current += decryptedChunk.byteLength;
                const total = totalWrittenRef.current;
                setBytesReceived(total);

                if (metaRef.current) {
                  setProgress(Math.round((total / metaRef.current.size) * 100));
                  const sw = speedWindowRef.current;
                  sw.bytes += decryptedChunk.byteLength;
                  const now = Date.now();
                  const elapsed = (now - sw.time) / 1000;

                  if (elapsed >= 0.5) {
                    const bps = sw.bytes / elapsed;
                    setSpeed(bps);
                    setEta((metaRef.current.size - total) / bps);
                    sw.bytes = 0;
                    sw.time = now;
                  }
                }
              } catch (err) {
                setError('Decryption or disk write failed. Transfer aborted.');
                setStatusBoth('error');
                channel.close();
              }
            };
          };

          pc.onicecandidate = ({ candidate }) => {
            if (candidate) socket.emit('ice-candidate', { roomId, candidate });
          };

          let iceRestartTimer = null;
          pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === 'disconnected') {
              iceRestartTimer = setTimeout(() => {
                if (pc.connectionState !== 'connected') {
                  try { pc.restartIce(); }
                  catch (err) { console.warn('restartIce error:', err.message); }
                }
              }, 3000);
            }
            if (state === 'connected') {
              if (iceRestartTimer) { clearTimeout(iceRestartTimer); iceRestartTimer = null; }
            }
            if (state === 'failed') {
              if (iceRestartTimer) clearTimeout(iceRestartTimer);
              setError('WebRTC connection failed. Your network may block P2P connections.');
              setStatusBoth('error');
            }
          };
        }

        await pc.setRemoteDescription(offer);

        // Flush any ICE candidates that arrived before this (re)negotiation's
        // remote description was set
        const queued = pendingCandidatesRef.current;
        pendingCandidatesRef.current = [];
        for (const candidate of queued) {
          try { await pc.addIceCandidate(candidate); }
          catch (err) { console.warn('addIceCandidate (queued) error:', err.message); }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { roomId, answer });
      } catch (err) {
        setError(err.message);
        setStatusBoth('error');
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try { await pc.addIceCandidate(candidate); }
      catch (err) { console.warn('addIceCandidate error:', err.message); }
    });

    socket.on('peer-disconnected', () => {
      if (statusRef.current !== 'done') {
        setStatusBoth('disconnected');
        setError('The sender has disconnected.');
      }
      cleanup();
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setStatusBoth('error');
    });

    return () => {
      mountedRef.current = false;
      cleanup();
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return { status, error, fileMeta, progress, speed, eta, bytesReceived, verifying };
}