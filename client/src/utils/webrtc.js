/**
 * WebRTC configuration.
 *
 * ICE servers: Google's free STUN servers cover ~85% of connection scenarios.
 * For corporate firewalls (symmetric NAT), a TURN server would be needed —
 * documented as a known limitation.
 */
export const RTC_CONFIG = {
  iceServers: [
    // The STUN server
    { urls: 'stun:stun.l.google.com:19302' },
    
    // TURN Server 1 (UDP)
    {
      urls: 'turn:global.relay.metered.ca:80', // LEAVE THIS EXACTLY AS IS
      username: '3fba4f70f86fe4885c332e33',          // PASTE YOUR USERNAME
      credential: 'JWhIyRoVEIBiHsbt'         // PASTE YOUR PASSWORD
    },
    
    // TURN Server 2 (TCP)
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp', // LEAVE THIS EXACTLY AS IS
      username: '3fba4f70f86fe4885c332e33',                        // PASTE YOUR USERNAME
      credential: 'JWhIyRoVEIBiHsbt'                       // PASTE YOUR PASSWORD
    },
    
    // TURN Server 3 (Secure TLS)
    {
      urls: 'turn:global.relay.metered.ca:443?transport=tcp', // LEAVE THIS EXACTLY AS IS
      username: '3fba4f70f86fe4885c332e33',                         // PASTE YOUR USERNAME
      credential: 'JWhIyRoVEIBiHsbt'                        // PASTE YOUR PASSWORD
    }
  ],
  iceCandidatePoolSize: 10,
};

/**
 * DataChannel configuration.
 * ordered: true — chunks must arrive in order (no reordering overhead).
 *
 * NOTE: We intentionally do NOT set maxRetransmits or maxPacketLifeTime.
 * Either of those makes the channel "partially reliable" (PR-SCTP) — after
 * the limit is hit, SCTP silently DROPS the message forever. For a file
 * transfer that's verified byte-for-byte via SHA-256, that's data
 * corruption, not just a delay. Leaving both unset gives the default
 * fully-reliable, ordered (TCP-like) delivery, which is what we need —
 * especially on lossy/high-latency mobile networks where a chunk may
 * need many retransmits before it gets through.
 */
export const DC_CONFIG = {
  ordered: true,
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