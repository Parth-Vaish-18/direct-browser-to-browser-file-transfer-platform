import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SIGNAL_URL =
  process.env.REACT_APP_SIGNAL_URL || 'http://localhost:4000';

/**
 * useSocket
 *
 * Creates and manages a single Socket.io connection for the component lifecycle.
 * Automatically disconnects on unmount.
 *
 * @returns {{ socketRef: React.MutableRefObject<import('socket.io-client').Socket|null> }}
 */
export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[socket] Connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { socketRef };
}
