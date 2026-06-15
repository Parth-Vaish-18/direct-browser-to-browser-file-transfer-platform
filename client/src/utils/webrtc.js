/**
 * WebRTC configuration.
 */
export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:global.relay.metered.ca:80', 
      username: '3fba4f70f86fe4885c332e33',    
      credential: 'JWhIyRoVEIBiHsbt'      
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: '3fba4f70f86fe4885c332e33',                     
      credential: 'JWhIyRoVEIBiHsbt'              
    },
    {
      urls: 'turn:global.relay.metered.ca:443?transport=tcp', 
      username: '3fba4f70f86fe4885c332e33',                    
      credential: 'JWhIyRoVEIBiHsbt'                   
    }
  ],
  iceCandidatePoolSize: 10,
};
/**
 * DataChannel configuration.
 */
export const DC_CONFIG = {
  ordered: true,
};
export const CHUNK_SIZE = 64 * 1024; // 64 KB
export const BUFFER_THRESHOLD = 8 * 1024 * 1024; // 8 MB
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB