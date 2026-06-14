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

  const setStatusBoth = (s) => { statusRef.current = s; setStatus(s); };

  const cleanup = useCallback(() => {
    try { pcRef.current?.close(); } catch (_) {}
    pcRef.current = null;
  }, []);

  const initOPFS = async (reset = true) => {
    const root = await navigator.storage.getDirectory();
    if (reset) {
      try { await root.removeEntry('p2p_temp_transfer'); } catch (_) {}
    }
    opfsFileHandleRef.current = await root.getFileHandle('p2p_temp_transfer', { create: true });
    const existing = await opfsFileHandleRef.current.getFile();
    opfsWritableRef.current = await opfsFileHandleRef.current.createWritable({
      keepExistingData: !reset,
    });
    
    if (!reset && existing.size > 0) {
      await opfsWritableRef.current.seek(existing.size);
      totalWrittenRef.current = existing.size;
    } else {
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
      await opfsWritableRef.current?.close();
      opfsWritableRef.current = null;
      
      const finalFile = await opfsFileHandleRef.current.getFile();
      const arrayBuffer = await finalFile.arrayBuffer();
      const receivedHash = await sha256(arrayBuffer);
      
      if (receivedHash !== meta.hash) {
        setVerifying(false);
        setError('File integrity check FAILED — SHA-256 mismatch. The file may be corrupted.');
        setStatusBoth('error');
        try {
          const root = await navigator.storage.getDirectory();
          await root.removeEntry('p2p_temp_transfer');
        } catch (_) {}
        return;
      }

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
      
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('p2p_temp_transfer');
      } catch (_) {
        console.warn('[OPFS] cleanup delayed');
      }
      totalWrittenRef.current = 0;
      metaRef.current = null;
      
    } catch (err) {
      setVerifying(false);
      setError(`Finalization error: ${err.message}`);
      setStatusBoth('error');
    }
  }, []);

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
    socket.on('room-joined', () => setStatusBoth('waiting'));

    socket.on('offer', async ({ offer }) => {
      setStatusBoth('connecting');
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        pc.ondatachannel = ({ channel }) => {
          channel.binaryType = 'arraybuffer';
          
          channel.onopen = async () => {
            setStatusBoth('connected');
            try {
              const offset = await initOPFS(true);
              setBytesReceived(offset);
              speedWindowRef.current = { bytes: 0, time: Date.now() };
              channel.send(JSON.stringify({ type: 'READY', offset: 0 }));
            } catch (err) {
              setError(err.message);
              setStatusBoth('error');
            }
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
              await opfsWritableRef.current.write(decryptedChunk);
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

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { roomId, answer });
      } catch (err) {
        setError(err.message);
        setStatusBoth('error');
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(candidate); }
      catch (_) {}
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