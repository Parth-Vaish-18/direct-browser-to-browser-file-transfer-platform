import React, { useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import SenderView from './SenderView';
import ReceiverView from './ReceiverView';

export default function App() {
    useEffect(() => {
  const clearStaleStorage = async () => {
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('p2p_temp_transfer', { recursive: true });
        console.log('Stale OPFS storage cleared successfully on app launch.');
      }
    } catch (err) {
      console.log('No stale storage to clear.');
    }
  };
  clearStaleStorage();
}, []);
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
          }}>
            ⚡
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
              <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
                P2P Web Share
              </Link>
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Direct Browser-to-Browser Transfer
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px',
      }}>
        <div style={{ width: '100%', maxWidth: '600px' }}>
          <Routes>
            <Route path="/" element={<SenderView />} />
            <Route path="/room/:roomId" element={<ReceiverView />} />
          </Routes>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '12px',
        borderTop: '1px solid var(--border)',
      }}>
        <p>MARS Open Projects 2026 • End-to-End Encrypted via WebRTC</p>
      </footer>
    </div>
  );
}
