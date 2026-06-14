/**
 * WebRTC configuration.
 *
 * ICE servers: Google's free STUN servers cover ~85% of connection scenarios.
 * For corporate firewalls (symmetric NAT), a TURN server would be needed —
 * documented as a known limitation.
 */
export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * DataChannel configuration.
 * ordered: true  — chunks must arrive in order (no reordering overhead)
 * maxRetransmits: 30 — retry each packet up to 30 times before dropping
 */
export const DC_CONFIG = {
  ordered: true,
  maxRetransmits: 30,
};

/** Chunk size in bytes. 64 KB is safe across all browsers. */
export const CHUNK_SIZE = 64 * 1024; // 64 KB

/**
 * Maximum DataChannel buffer before we apply backpressure.
 * If bufferedAmount exceeds this, we pause sending until it drains.
 */
export const BUFFER_THRESHOLD = 8 * 1024 * 1024; // 8 MB

/** Max file size accepted by the sender (Increased to 2GB for OPFS support). */
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB
