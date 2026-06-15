# P2P Web Share — Direct Browser-to-Browser File Transfer

Send files directly from one browser to another using **WebRTC** — no file is ever uploaded to a server, no storage limits, no account required. A lightweight signaling server only helps two browsers find each other; once connected, the file streams **peer-to-peer**, encrypted end-to-end, straight from the sender's device to the receiver's.

---

##  Live Deployment

| Component | URL |
|---|---|
| **Web App (Frontend)** | https://direct-browser-to-browser-file-tran-wheat.vercel.app |
| **Signaling Server (Backend)** | https://direct-browser-to-browser-file-transfer-0eot.onrender.com |

> Open the web app link, drop a file, share the generated link with the recipient — that's it.

---

##  Features

### Core
- **Drag-and-drop file sharing** — drop a file to instantly generate a unique, shareable room link.
- **Direct P2P transfer** — files move over a WebRTC `RTCDataChannel` directly between browsers; the signaling server never sees file contents.
- **End-to-end encryption** — each transfer gets a fresh AES-GCM key generated in the browser. The key is embedded in the **URL hash fragment** (`#key=...`), which is never sent to any server (browsers don't transmit the fragment in HTTP requests). Only someone with the full link can decrypt the file.
- **Chunked transfer with integrity verification** — the file is streamed in 64 KB chunks and verified end-to-end with a **SHA-256 hash**, guaranteeing zero corruption.
- **Real-time progress UI** — live transfer percentage, speed (MB/s), ETA, and connection status for both sender and receiver.
- **Graceful disconnect handling** — if either side closes the tab or loses connection, the other side is notified instead of hanging or crashing.
- **Auto-download** — the receiver automatically reassembles and downloads the file once the transfer completes and passes verification.

### Advanced
- **Origin Private File System (OPFS) streaming** — large files are written directly to disk-backed storage as they arrive, bypassing browser RAM limits, with an automatic **in-memory fallback** for browsers (e.g. Safari/iOS) that don't support OPFS writable streams.
- **ICE restart / connection recovery** — if the network changes mid-transfer (e.g. a mobile device switching between Wi-Fi and cellular), the existing peer connection and data channel are reused and renegotiated instead of being torn down.
- **TURN relay support** — falls back to TURN servers (via [Metered](https://www.metered.ca/)) when a direct connection isn't possible due to restrictive NATs/firewalls, in addition to STUN.

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| P2P Communication | WebRTC (`RTCPeerConnection`, `RTCDataChannel`) |
| Signaling | Node.js, Express, Socket.IO |
| Encryption | Web Crypto API (AES-GCM) |
| Large File Storage | Origin Private File System (OPFS) with in-memory fallback |
| Hosting | Vercel (frontend), Render (backend signaling server) |

---

##  How It Works

1. **Sender** opens the app and drops a file. The browser:
   - Generates a random AES-GCM key.
   - Computes the SHA-256 hash of the file.
   - Connects to the signaling server and creates a "room", receiving a `roomId`.
   - Builds a share link: `https://<app>/room/<roomId>#key=<base64-key>`.
2. **Receiver** opens that link. Their browser joins the same room via the signaling server.
3. The signaling server relays a **WebRTC offer/answer + ICE candidates** between the two browsers (this is the *only* thing it does — it never sees file data).
4. Once the `RTCPeerConnection` is established, an `RTCDataChannel` opens directly between the two browsers.
5. The sender streams the file in 64 KB chunks, **encrypted** with the AES-GCM key from the URL fragment.
6. The receiver decrypts each chunk on the fly and writes it to OPFS (or an in-memory buffer as fallback).
7. After the last chunk, the receiver verifies the SHA-256 hash of the reassembled file and automatically triggers a download.

---

##  Project Structure

```
direct-browser-to-browser-file-transfer-platform-main/
├── client/                     # React frontend
│   ├── public/
│   ├── src/
│   │   ├── App.jsx             # Routes: "/" (sender) and "/room/:roomId" (receiver)
│   │   ├── SenderView.jsx
│   │   ├── ReceiverView.jsx
│   │   ├── components/         # DropZone, FileCard, ShareLink, ConnectionStatus, TransferProgress
│   │   ├── hooks/
│   │   │   ├── useSender.js    # Sender-side signaling + WebRTC + file streaming logic
│   │   │   └── useReceiver.js  # Receiver-side signaling + WebRTC + file receiving logic
│   │   └── utils/
│   │       ├── webrtc.js       # RTC_CONFIG (STUN/TURN), data channel config, chunk size
│   │       └── crypto.js       # AES-GCM encryption/decryption, SHA-256 hashing
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
└── server/                      # Signaling server
    ├── index.js                 # Express + Socket.IO room/signaling relay
    ├── .env.example
    └── package.json
```

---

##  Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- Two browser windows/tabs (or two devices on the same network) to test a transfer

### 1. Clone the repository
```bash
git clone https://github.com/Parth-Vaish-18/direct-browser-to-browser-file-transfer-platform
cd direct-browser-to-browser-file-transfer-platform-main
```

### 2. Set up the signaling server
```bash
cd server
npm install
cp .env.example .env
```
Edit `server/.env`:
```env
PORT=4000
CLIENT_URL=http://localhost:3000
```
Start the server:
```bash
npm run dev     
# or
npm start
```
You should see the server listening on port 4000. Verify with:
```bash
curl http://localhost:4000
# {"status":"ok","service":"P2P Web Share Signaling Server","activeRooms":0,...}
```

### 3. Set up the frontend
In a new terminal:
```bash
cd client
npm install
cp .env.example .env
```
Edit `client/.env`:
```env
REACT_APP_SIGNAL_URL=http://localhost:4000
```
Start the dev server:
```bash
npm start
```
This opens `http://localhost:3000`.

### 4. Test a transfer
1. On `http://localhost:3000`, drop a file — a share link is generated.
2. Open that link in a second browser tab/window (or on another device, replacing `localhost` with your machine's LAN IP).
3. Watch the transfer complete and the file auto-download.

---

##  Environment Variables

### `client/.env`
| Variable | Description | Local value | Production value |
|---|---|---|---|
| `REACT_APP_SIGNAL_URL` | URL of the signaling server | `http://localhost:4000` | `https://direct-browser-to-browser-file-transfer-0eot.onrender.com` |

### `server/.env`
| Variable | Description | Local value | Production value |
|---|---|---|---|
| `PORT` | Port the signaling server listens on | `4000` | (set automatically by Render) |
| `CLIENT_URL` | URL of the deployed frontend (used for CORS) | `http://localhost:3000` | `https://direct-browser-to-browser-file-tran-wheat.vercel.app` |

---

##  Deployment

### Backend → Render
1. Push the `server/` folder to a GitHub repo (or use the monorepo with Render's "Root Directory" set to `server`).
2. Create a new **Web Service** on [Render](https://render.com/):
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add environment variables:
   - `CLIENT_URL` = your Vercel app URL (e.g. `https://direct-browser-to-browser-file-tran-wheat.vercel.app`)
   - Render sets `PORT` automatically.
4. Deploy. Verify the health check at `https://<your-render-app>.onrender.com/`.

### Frontend → Vercel
1. Import the repo into [Vercel](https://vercel.com/), with the **Root Directory** set to `client`.
2. Framework preset: **Create React App**.
3. Add environment variable (for **Production** and **Preview**):
   - `REACT_APP_SIGNAL_URL` = your Render backend URL (e.g. `https://direct-browser-to-browser-file-transfer-0eot.onrender.com`)
4. Deploy.
5. After any change to `REACT_APP_SIGNAL_URL`, **redeploy without build cache** so the new value is baked into the bundle.

---

##  Security & Privacy

- **Zero-knowledge signaling**: the signaling server only ever sees room IDs, WebRTC SDP offers/answers, and ICE candidates — never file contents or decryption keys.
- **Decryption key in URL fragment**: the AES-GCM key lives after the `#` in the share link, which browsers never send to any server (including the signaling server or hosting providers' access logs).
- **Integrity guarantee**: a SHA-256 hash of the original file is computed before sending and re-verified after reassembly on the receiver's end. Any mismatch is reported and the partial file is discarded.
- **No persistence**: nothing is written to a database. Rooms are held in memory on the signaling server only for the duration of the handshake and are cleaned up on disconnect.

---

##  Limitations / Known Issues

- **File size**: capped at 2 GB (`MAX_FILE_SIZE` in `client/src/utils/webrtc.js`); receivers without OPFS support fall back to in-memory buffering, which is further limited by available RAM.
- **NAT traversal**: connections across restrictive NATs (e.g. some mobile carrier networks) require a TURN relay. The included TURN configuration uses a free Metered.ca account, which has limited bandwidth/usage quotas.
- **Both peers must be online simultaneously**: there's no offline queuing — the receiver must open the link while the sender's tab is open and connected.
- **Single recipient (MVP)**: the current implementation supports one sender ↔ one receiver per room (no mesh/multi-peer swarming).

---

---
