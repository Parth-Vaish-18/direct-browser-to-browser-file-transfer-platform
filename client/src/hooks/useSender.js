import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { sha256, generateRoomId, generateKey, exportKeyToUrl, encryptChunk } from '../utils/crypto';
import { RTC_CONFIG, DC_CONFIG, CHUNK_SIZE, BUFFER_THRESHOLD } from '../utils/webrtc';

const SIGNAL_URL = process.env.REACT_APP_SIGNAL_URL || 'http://localhost:4000';

export function useSender() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [shareLink, setShareLink] = useState('');
  const [file, setFileState] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [isHashing, setIsHashing] = useState(false);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const fileRef = useRef(null);
  const cryptoKeyRef = useRef(null);
  const roomIdRef = useRef(null);

  const cleanup = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
  }, []);

  useEffect(() => {
    const socket = io(SIGNAL_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', async () => {
      const id = generateRoomId();
      setRoomId(id);
      roomIdRef.current = id;
      socket.emit('create-room', id);
      setStatus('creating');
      
      // Generate E2E Key instantly
      const key = await generateKey();
      cryptoKeyRef.current = key;
      const keyString = await exportKeyToUrl(key);
      setShareLink(`${window.location.origin}/room/${id}#key=${keyString}`);
    });

    socket.on('room-created', () => setStatus('waiting'));

    socket.on('peer-joined', async () => {
      setStatus('connecting');
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        const dc = pc.createDataChannel('file-transfer', DC_CONFIG);
        dcRef.current = dc;
        dc.binaryType = 'arraybuffer';

        dc.onopen = () => setStatus('connected'); // Don't auto-send, wait for Receiver's READY signal

        // Listen for the Auto-Resume / Ready signal from Receiver
        dc.onmessage = async ({ data }) => {
          if (typeof data === 'string') {
            const msg = JSON.parse(data);
            if (msg.type === 'READY' && fileRef.current) {
              sendFile(fileRef.current, msg.offset);
            }
          }
        };

        dc.onclose = () => { if (status !== 'done') setStatus('disconnected'); };
        dc.onerror = (e) => { setError(`DataChannel error: ${e.message}`); setStatus('error'); };

        pc.onicecandidate = ({ candidate }) => {
          if (candidate) socket.emit('ice-candidate', { roomId: roomIdRef.current, candidate });
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') { setError('Connection failed.'); setStatus('error'); }
          if (pc.connectionState === 'disconnected') { setStatus('disconnected'); setError('Peer disconnected.'); }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { roomId: roomIdRef.current, offer });
      } catch (err) {
        setError(err.message); setStatus('error');
      }
    });

    socket.on('answer', async ({ answer }) => pcRef.current?.setRemoteDescription(answer));
    socket.on('ice-candidate', async ({ candidate }) => pcRef.current?.addIceCandidate(candidate).catch(()=>{}));
    socket.on('peer-disconnected', () => { setStatus('disconnected'); cleanup(); });
    socket.on('error', ({ message }) => { setError(message); setStatus('error'); });

    return () => { cleanup(); socket.disconnect(); };
  }, []);

  const sendFile = useCallback(async (targetFile, startOffset = 0) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;

    try {
      setIsHashing(true);
      const fileHash = await sha256(targetFile);
      setIsHashing(false);

      // Only send metadata if we are starting fresh
      if (startOffset === 0) {
        dc.send(JSON.stringify({
          name: targetFile.name, size: targetFile.size, type: targetFile.type, hash: fileHash,
        }));
      }

      setStatus('transferring');
      const buffer = await targetFile.arrayBuffer();
      let offset = startOffset; // RESUME SUPPORT
      let totalSent = startOffset;
      const speedWindow = { bytes: 0, time: Date.now() };

      while (offset < buffer.byteLength) {
        if (dc.bufferedAmount > BUFFER_THRESHOLD) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        const end = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
        const rawChunk = buffer.slice(offset, end);
        
        // ZERO KNOWLEDGE ENCRYPTION
        const encryptedChunk = await encryptChunk(rawChunk, cryptoKeyRef.current);
        dc.send(encryptedChunk);

        offset = end;
        totalSent += rawChunk.byteLength;

        setProgress(Math.round((totalSent / buffer.byteLength) * 100));
        setBytesSent(totalSent);

        const now = Date.now();
        speedWindow.bytes += rawChunk.byteLength;
        if ((now - speedWindow.time) / 1000 >= 0.5) {
          const bps = speedWindow.bytes / ((now - speedWindow.time) / 1000);
          setSpeed(bps); setEta((buffer.byteLength - totalSent) / bps);
          speedWindow.bytes = 0; speedWindow.time = now;
        }
      }

      dc.send(JSON.stringify({ type: 'EOF' }));
      setProgress(100); setStatus('done');
    } catch (err) {
      setError(`Transfer failed: ${err.message}`); setStatus('error');
    }
  }, []);

  const setFile = useCallback((f) => {
    setFileState(f);
    fileRef.current = f;
    // Tell receiver we have a file, wait for them to request the byte offset
    if (dcRef.current?.readyState === 'open') dcRef.current.send(JSON.stringify({ type: 'FILE_SELECTED' }));
  }, []);

  const clearFile = useCallback(() => {
    setFileState(null); fileRef.current = null; setProgress(0); setBytesSent(0); setSpeed(0); setEta(0);
    setStatus(roomIdRef.current ? 'waiting' : 'idle'); setError(null);
  }, []);

  return { status, error, roomId, shareLink, file, progress, speed, eta, bytesSent, isHashing, setFile, clearFile };
}