import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { sha256, generateRoomId, generateKey, exportKeyToUrl, encryptChunk } from '../utils/crypto';
import { RTC_CONFIG, DC_CONFIG, CHUNK_SIZE, BUFFER_THRESHOLD } from '../utils/webrtc';

const SIGNAL_URL = process.env.REACT_APP_SIGNAL_URL || 'http://localhost:4000';

export function useSender() {
  const [status, setStatus] = useState('idle');
  const [error, setError]   = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [shareLink, setShareLink] = useState('');
  const [file, setFileState]      = useState(null);
  const [progress, setProgress]   = useState(0);
  const [speed, setSpeed]         = useState(0);
  const [eta, setEta]             = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [isHashing, setIsHashing] = useState(false);

  const socketRef      = useRef(null);
  const pcRef          = useRef(null);
  const dcRef          = useRef(null);
  const fileRef        = useRef(null);
  const cryptoKeyRef   = useRef(null);
  const roomIdRef      = useRef(null);

  const statusRef      = useRef('idle');
  const mountedRef     = useRef(false);

  const setStatusBoth = (s) => { statusRef.current = s; setStatus(s); };

  const cleanupPeer = useCallback(() => {
    if (dcRef.current) { try { dcRef.current.close(); } catch (_) {} dcRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} pcRef.current = null; }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const socket = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', async () => {
      const id = generateRoomId();
      setRoomId(id);
      roomIdRef.current = id;
      socket.emit('create-room', id);
      setStatusBoth('creating');
      
      const key = await generateKey();
      cryptoKeyRef.current = key;
      const keyString = await exportKeyToUrl(key);
      setShareLink(`${window.location.origin}/room/${id}#key=${keyString}`);
    });

    socket.on('room-created', () => setStatusBoth('waiting'));

    socket.on('peer-joined', async () => {
      cleanupPeer();
      setStatusBoth('connecting');
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        const dc = pc.createDataChannel('file-transfer', DC_CONFIG);
        dcRef.current = dc;
        dc.binaryType = 'arraybuffer';
        
        dc.onopen = () => {
          setStatusBoth('connected');
          if (fileRef.current) {
            dc.send(JSON.stringify({ type: 'FILE_SELECTED' }));
          }
        };

        dc.onmessage = async ({ data }) => {
          if (typeof data === 'string') {
            const msg = JSON.parse(data);
            if (msg.type === 'READY' && fileRef.current) {
              await sendFile(fileRef.current, msg.offset || 0);
            }
          }
        };

        dc.onclose = () => {
          if (statusRef.current !== 'done') {
            setStatusBoth('disconnected');
            setError('Connection closed before transfer completed.');
          }
        };

        dc.onerror = (e) => {
          setError(`DataChannel error: ${e.message || 'unknown'}`);
          setStatusBoth('error');
        };

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            socket.emit('ice-candidate', { roomId: roomIdRef.current, candidate });
          }
        };

        let iceRestartTimer = null;
        pc.onconnectionstatechange = async () => {
          const state = pc.connectionState;
          
          if (state === 'disconnected') {
            iceRestartTimer = setTimeout(async () => {
              if (pc.connectionState !== 'connected') {
                try {
                  pc.restartIce();
                  const offer = await pc.createOffer({ iceRestart: true });
                  await pc.setLocalDescription(offer);
                  socket.emit('offer', { roomId: roomIdRef.current, offer });
                } catch (err) {
                  setStatusBoth('disconnected');
                  setError('Connection lost. Peer may have disconnected.');
                }
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

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { roomId: roomIdRef.current, offer });
      } catch (err) {
        setError(err.message);
        setStatusBoth('error');
      }
    });

    socket.on('answer', async ({ answer }) => {
      try { await pcRef.current?.setRemoteDescription(answer); }
      catch (err) { console.warn('setRemoteDescription error:', err.message); }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      try { await pcRef.current?.addIceCandidate(candidate); }
      catch (_) {} 
    });

    socket.on('peer-disconnected', () => {
      setStatusBoth('disconnected');
      setError('The receiver has disconnected.');
      cleanupPeer();
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setStatusBoth('error');
    });

    return () => {
      mountedRef.current = false;
      cleanupPeer();
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendFile = useCallback(async (targetFile, startOffset = 0) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    try {
      setIsHashing(true);
      const fileHash = await sha256(targetFile);
      setIsHashing(false);
      
      if (startOffset === 0) {
        dc.send(JSON.stringify({
          name: targetFile.name,
          size: targetFile.size,
          type: targetFile.type || 'application/octet-stream',
          hash: fileHash,
        }));
      }
      
      setStatusBoth('transferring');
      const buffer = await targetFile.arrayBuffer();
      let offset = startOffset;
      let totalSent = startOffset;
      const speedWindow = { bytes: 0, time: Date.now() };
      
      while (offset < buffer.byteLength) {
        if (dc.readyState !== 'open') {
          throw new Error('DataChannel closed during transfer.');
        }
        if (dc.bufferedAmount > BUFFER_THRESHOLD) {
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        const end = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
        const rawChunk = buffer.slice(offset, end);
        const encryptedChunk = await encryptChunk(rawChunk, cryptoKeyRef.current);
        
        dc.send(encryptedChunk);
        offset = end;
        totalSent += rawChunk.byteLength;
        
        setProgress(Math.round((totalSent / buffer.byteLength) * 100));
        setBytesSent(totalSent);
        
        const now = Date.now();
        speedWindow.bytes += rawChunk.byteLength;
        const elapsed = (now - speedWindow.time) / 1000;
        
        if (elapsed >= 0.5) {
          const bps = speedWindow.bytes / elapsed;
          setSpeed(bps);
          setEta((buffer.byteLength - totalSent) / bps);
          speedWindow.bytes = 0;
          speedWindow.time = now;
        }
      }
      
      dc.send(JSON.stringify({ type: 'EOF' }));
      setProgress(100);
      setStatusBoth('done');
    } catch (err) {
      setError(`Transfer failed: ${err.message}`);
      setStatusBoth('error');
    }
  }, []);

  const setFile = useCallback((f) => {
    setFileState(f);
    fileRef.current = f;
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({ type: 'FILE_SELECTED' }));
    }
  }, []);

  const clearFile = useCallback(() => {
    setFileState(null);
    fileRef.current = null;
    setProgress(0); setBytesSent(0); setSpeed(0); setEta(0);
    setStatusBoth(roomIdRef.current ? 'waiting' : 'idle');
    setError(null);
  }, []);

  return { status, error, roomId, shareLink, file, progress, speed, eta, bytesSent, isHashing, setFile, clearFile };
}