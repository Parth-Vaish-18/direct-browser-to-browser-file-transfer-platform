import React from 'react';
import { useSender } from './hooks/useSender';
import DropZone from './components/DropZone';
import FileCard from './components/FileCard';
import ShareLink from './components/ShareLink';
import ConnectionStatus from './components/ConnectionStatus';
import TransferProgress from './components/TransferProgress';

export default function SenderView() {
  const {
    status,
    error,
    roomId,
    shareLink,
    file,
    progress,
    speed,
    eta,
    bytesSent,
    setFile,
    clearFile,
  } = useSender();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease forwards' }}>
      
      {/* Header & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>Send a File</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Generate a secure room and share the link.
          </p>
        </div>
        <ConnectionStatus status={status} />
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '16px',
          background: 'var(--danger-dim)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius)',
          color: '#ffb3b3',
          fontSize: '14px',
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Interaction Area */}
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}>
        
        {/* Step 1: File Selection (Visible initially) */}
        {!file ? (
          <DropZone onFile={setFile} disabled={status === 'error' || status === 'disconnected'} />
        ) : (
          <FileCard 
            name={file.name} 
            size={file.size} 
            type={file.type} 
            onRemove={(status === 'waiting' || status === 'connected') ? clearFile : undefined} 
          />
        )}

        {/* Step 2: Share Link (Only visible AFTER the file is picked and the link is generated!) */}
        {shareLink && roomId && (status === 'waiting' || status === 'connecting' || status === 'connected') && (
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <ShareLink link={shareLink} />
          </div>
        )}

        {/* Step 3: Progress Bar (Visible during transfer and upon completion) */}
        {(status === 'transferring' || status === 'done') && file && (
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <TransferProgress
              progress={progress}
              speed={speed}
              eta={eta}
              bytesDone={bytesSent}
              totalBytes={file.size}
              label={status === 'done' ? 'Transfer Complete' : 'Sending...'}
            />
          </div>
        )}
      </div>
      
      {/* Reset button if done or error */}
      {(status === 'done' || status === 'error' || status === 'disconnected') && (
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.background = 'var(--surface)'}
          onMouseLeave={(e) => e.target.style.background = 'var(--surface-2)'}
        >
          Start a New Transfer
        </button>
      )}
    </div>
  );
}