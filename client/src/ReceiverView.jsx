import React from 'react';
import { useParams } from 'react-router-dom';
import { useReceiver } from './hooks/useReceiver';
import FileCard from './components/FileCard';
import ConnectionStatus from './components/ConnectionStatus';
import TransferProgress from './components/TransferProgress';

export default function ReceiverView() {
  const { roomId } = useParams();
  const {
    status,
    error,
    fileMeta,
    progress,
    speed,
    eta,
    bytesReceived,
    verifying,
  } = useReceiver(roomId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease forwards' }}>
      
      {/* Header & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>Receive File</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Room ID: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{roomId}</span>
          </p>
        </div>
        <ConnectionStatus status={verifying ? 'verifying' : status} />
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
        
        {/* Waiting State */}
        {!fileMeta && status !== 'error' && status !== 'disconnected' && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px', animation: 'pulse-ring 2s infinite' }}>⏳</div>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Waiting for Sender</h3>
            <p style={{ fontSize: '14px' }}>Keep this tab open. The transfer will begin automatically once the sender selects a file.</p>
          </div>
        )}

        {/* File Info State */}
        {fileMeta && (
          <FileCard 
            name={fileMeta.name} 
            size={fileMeta.size} 
            type={fileMeta.type} 
          />
        )}

        {/* Transfer Progress */}
        {(status === 'receiving' || status === 'verifying' || status === 'done') && fileMeta && (
          <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <TransferProgress
              progress={progress}
              speed={speed}
              eta={eta}
              bytesDone={bytesReceived}
              totalBytes={fileMeta.size}
              label={status === 'done' ? 'Download Complete ✓' : verifying ? 'Verifying SHA-256 Hash...' : 'Downloading...'}
            />
          </div>
        )}
      </div>
      
      {status === 'done' && (
        <div style={{ textAlign: 'center', color: 'var(--success)', fontSize: '14px', fontWeight: 500 }}>
          File downloaded successfully. Check your downloads folder.
        </div>
      )}
    </div>
  );
}