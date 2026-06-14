import React from 'react';
import { formatBytes, getFileTypeLabel, getFileTypeIcon } from '../utils/format';
import { MAX_FILE_SIZE } from '../utils/webrtc';

export default function FileCard({ name, size, type = '', onRemove }) {
  const typeLabel = getFileTypeLabel(type);
  const icon = getFileTypeIcon(typeLabel);
  const oversized = size > MAX_FILE_SIZE;
  const formattedLimit = formatBytes(MAX_FILE_SIZE);

  return (
    <div style={{
      background: 'var(--surface-glass)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${oversized ? 'var(--danger)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      width: '100%',
      animation: 'fadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
      boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
    }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '24px', flexShrink: 0,
      }}>
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: '6px',
        }}>
          {name}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {formatBytes(size)}
          </span>
          <span style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface-2)',
            padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--border)', textTransform: 'uppercase'
          }}>
            {typeLabel}
          </span>
          {oversized && (
            <span style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-dim)',
              padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--danger)44',
            }}>
              ⚠ Exceeds {formattedLimit} limit
            </span>
          )}
        </div>
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px',
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all var(--transition)', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-dim)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
        >
          ✕
        </button>
      )}
    </div>
  );
}