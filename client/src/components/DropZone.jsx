import React, { useCallback, useRef, useState } from 'react';
import { MAX_FILE_SIZE } from '../utils/webrtc';
import { formatBytes } from '../utils/format';

export default function DropZone({ onFile, disabled = false }) {
  const [dragging, setDragging] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const inputRef = useRef(null);

  const formattedLimit = formatBytes(MAX_FILE_SIZE);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setSizeError(true);
      setTimeout(() => setSizeError(false), 4000);
      return;
    }
    setSizeError(false);
    onFile(file);
  }, [onFile]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  }, [disabled, handleFile]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }, []);

  const onInputChange = useCallback((e) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  }, [handleFile]);

  const borderColor = sizeError ? 'var(--danger)' : dragging ? 'var(--accent)' : 'var(--border-glow)';
  const bgColor = sizeError ? 'var(--danger-dim)' : dragging ? 'var(--accent-dim)' : 'var(--surface-glass)';

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      style={{
        width: '100%',
        minHeight: '240px',
        border: `2px dashed ${borderColor}`,
        borderRadius: 'var(--radius-lg)',
        background: bgColor,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: '40px 24px',
        textAlign: 'center',
        userSelect: 'none',
        transform: (!disabled && dragging) ? 'scale(1.02)' : 'scale(1)',
        boxShadow: dragging ? '0 12px 40px rgba(108, 99, 255, 0.15)' : 'none',
      }}
      onMouseEnter={(e) => { if (!disabled && !dragging) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { if (!disabled && !dragging) e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={onInputChange} disabled={disabled} />

      <div style={{
        width: '72px', height: '72px', borderRadius: '50%',
        background: dragging ? 'var(--accent-glow)' : 'var(--surface-2)',
        border: `1px solid ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '32px', transition: 'all 0.3s ease',
        transform: dragging ? 'scale(1.1) translateY(-5px)' : 'scale(1)',
        boxShadow: dragging ? '0 8px 24px var(--accent-glow)' : 'none',
      }}>
        {sizeError ? '🛑' : dragging ? '✨' : '📁'}
      </div>

      {sizeError ? (
        <div style={{ animation: 'bounce-in 0.4s ease' }}>
          <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--danger)', margin: 0 }}>File too large</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Maximum file size is {formattedLimit}</p>
        </div>
      ) : dragging ? (
        <div>
          <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)', margin: 0 }}>Drop to encrypt & share</p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Drag & drop a file here</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>or click to browse — max {formattedLimit}</p>
        </div>
      )}
    </div>
  );
}