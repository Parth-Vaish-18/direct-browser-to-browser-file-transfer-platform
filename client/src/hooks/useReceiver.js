import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { sha256, importKeyFromUrl, decryptChunk } from '../utils/crypto';
import { RTC_CONFIG } from '../utils/webrtc';

const SIGNAL_URL = process.env.REACT_APP_SIGNAL_URL || 'http://localhost:4000';

export function useReceiver(roomId) {
  const [status, setStatus] = useState('joining');
  const [error, setError] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  
  // OPFS Disk Streaming Refs (Replaces RAM Chunk Array)
  const opfsFileHandleRef = useRef(null);
  const opfsWritableRef = useRef(null);
  const totalWrittenRef = useRef(0);

  const metaRef = useRef(null);
  const cryptoKeyRef = useRef(null);
  const speedWindowRef = useRef({ bytes: 0, time: Date.now() });

  const cleanup = useCallback(() => { pcRef.current?.close(); pcRef.current = null; }, []);

  // Initialize OPFS Directory and File Stream
  const initOPFS = async (reset = false) => {
    try {
      const root = await navigator.storage.getDirectory();
      if (reset) {
         try { await root.removeEntry('p2p_temp_transfer'); } catch(e) {} // Clear old file
      }
      
      opfsFileHandleRef.current = await root.getFileHandle('p2p_temp_transfer', { create: true });
      const currentFile = await opfsFileHandleRef.current.getFile();
      
      // keepExistingData allows us to append chunks for Auto-Resume
      opfsWritableRef.current = await opfsFileHandleRef.current.createWritable({ keepExistingData: !reset });
      
      if (!reset && currentFile.size > 0) {
        await opfsWritableRef.current.seek(currentFile.size);
        totalWrittenRef.current = currentFile.size;
      } else {
        totalWrittenRef.current = 0;
      }
      return totalWrittenRef.current;
    } catch (err) {
      console.error("OPFS Error:", err);
      throw new Error("Your browser does not support OPFS Local Storage streaming.");
    }
  };

  useEffect(() => {
    if (!roomId) return;

    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    const keyString = hashParams.get('key');
    if (!keyString) {
      setError('Decryption key missing. Cannot receive files.'); setStatus('error'); return;
    }

    importKeyFromUrl(keyString)
      .then(key => cryptoKeyRef.current = key)
      .catch(() => { setError('Invalid decryption key.'); setStatus('error'); });

    const socket = io(SIGNAL_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => socket.emit('join-room', roomId));
    socket.on('room-joined', () => setStatus('waiting'));

    socket.on('offer', async ({ offer }) => {
      setStatus('connecting');
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        pc.ondatachannel = ({ channel }) => {
          channel.binaryType = 'arraybuffer';
          
          channel.onopen = async () => {
            setStatus('connected');
            try {
              // Initialize disk storage and ask sender to resume from our disk size
              const offset = await initOPFS(false);
              setBytesReceived(offset);
              channel.send(JSON.stringify({ type: 'READY', offset }));
            } catch (err) {
              setError(err.message); setStatus('error');
            }
          };

          channel.onclose = () => { if (status !== 'done') setStatus('disconnected'); };
          channel.onerror = (e) => { setError(`DataChannel error: ${e.message}`); setStatus('error'); };

          channel.onmessage = async ({ data }) => {
            if (typeof data === 'string') {
              const parsed = JSON.parse(data);
              if (parsed.type === 'FILE_SELECTED') {
                 const offset = await initOPFS(false);
                 channel.send(JSON.stringify({ type: 'READY', offset }));
              } else if (parsed.type === 'EOF') {
                await finalize();
              } else {
                metaRef.current = parsed; setFileMeta(parsed);
                // If it's a completely new file, wipe the OPFS disk
                if (totalWrittenRef.current === 0 || totalWrittenRef.current === parsed.size) {
                  await initOPFS(true);
                  speedWindowRef.current = { bytes: 0, time: Date.now() };
                  setBytesReceived(0);
                }
                setStatus('receiving');
              }
              return;
            }

            try {
              // 1. Decrypt incoming chunk
              const decryptedChunk = await decryptChunk(data, cryptoKeyRef.current);
              
              // 2. Stream directly to Hard Drive (OPFS)
              await opfsWritableRef.current.write(decryptedChunk);
              
              totalWrittenRef.current += decryptedChunk.byteLength;
              const currentTotal = totalWrittenRef.current;
              setBytesReceived(currentTotal);

              if (metaRef.current) {
                setProgress(Math.round((currentTotal / metaRef.current.size) * 100));
                
                const sw = speedWindowRef.current;
                sw.bytes += decryptedChunk.byteLength;
                const now = Date.now();
                if ((now - sw.time) / 1000 >= 0.5) {
                  const bps = sw.bytes / ((now - sw.time) / 1000);
                  setSpeed(bps); setEta((metaRef.current.size - currentTotal) / bps);
                  sw.bytes = 0; sw.time = now;
                }
              }
            } catch (err) {
              setError('Decryption or Disk Write failed. Connection compromised.');
              setStatus('error'); channel.close();
            }
          };
        };

        pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('ice-candidate', { roomId, candidate }); };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') { setError('WebRTC failed.'); setStatus('error'); }
          if (pc.connectionState === 'disconnected') setStatus('disconnected');
        };

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { roomId, answer });
      } catch (err) { setError(err.message); setStatus('error'); }
    });

    socket.on('ice-candidate', async ({ candidate }) => pcRef.current?.addIceCandidate(candidate).catch(()=>{}));
    socket.on('peer-disconnected', () => { if (status !== 'done') setStatus('disconnected'); cleanup(); });
    socket.on('error', ({ message }) => { setError(message); setStatus('error'); });

    return () => { cleanup(); socket.disconnect(); };
  }, [roomId]);

  const finalize = useCallback(async () => {
    const meta = metaRef.current;
    if (!meta) return;

    setVerifying(true); setStatus('verifying');
    try {
      // 1. Close the OPFS write stream
      await opfsWritableRef.current.close();
      
      // 2. Read the final file from OPFS as a disk-backed File object
      const finalFile = await opfsFileHandleRef.current.getFile();

      // 3. Create a disk-backed Blob URL and auto-download
      const url = URL.createObjectURL(finalFile);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = meta.name;
      document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // Successfully finish the UI state
      setVerifying(false); setProgress(100); setStatus('done');
      
      // 4. THE FIX: Silent Cleanup & State Reset
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('p2p_temp_transfer');
        // Reset our variables so the NEXT transfer starts at 0 bytes
        totalWrittenRef.current = 0; 
        metaRef.current = null;
      } catch (cleanupErr) {
        console.warn('Mobile browser delayed cleanup, forcing state reset anyway.');
        // Even if the mobile browser blocks the deletion, reset our memory tracker!
        totalWrittenRef.current = 0;
        metaRef.current = null;
      }

    } catch (err) {
      setVerifying(false); setError(`File finalization error: ${err.message}`); setStatus('error');
    }
  }, []);

  return { status, error, fileMeta, progress, speed, eta, bytesReceived, verifying };
}