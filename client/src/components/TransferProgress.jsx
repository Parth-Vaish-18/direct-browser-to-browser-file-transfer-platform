import React from 'react';
import { formatBytes, formatSpeed, formatETA } from '../utils/format';

/**
 * TransferProgress
 * Shows an animated progress bar with live transfer stats.
 *
 * @param {{
 *   progress: number,     // 0–100
 *   speed: number,        // bytes/sec
 *   eta: number,          // seconds remaining
 *   bytesDone: number,    // bytes transferred so far
 *   totalBytes: number,   // total file size in bytes
 *   label?: string,       // "Sending" | "Receiving"
 * }} props
 */
export default function TransferProgress({
  progress,
  speed,
  eta,
  bytesDone,
  totalBytes,
  label = 'Transferring',
}) {
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px 24px',
      width: '100%',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {label}
        </span>
        <span style={{
          fontSize: '22px',
          fontWeight: 700,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
        }}>
          {pct}%
        </span>
      </div>

      {/* Progress track */}
      <div style={{
        width: '100%',
        height: '8px',
        background: 'var(--surface-2)',
        borderRadius: '999px',
        overflow: 'hidden',
        marginBottom: '14px',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: '999px',
          background: pct === 100
            ? 'var(--success)'
            : 'linear-gradient(90deg, var(--accent) 0%, #9c95ff 100%)',
          transition: 'width 0.3s ease',
          position: 'relative',
        }}>
          {/* Shimmer effect */}
          {pct < 100 && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }} />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <StatChip
          label="Speed"
          value={formatSpeed(speed)}
        />
        <StatChip
          label="Transferred"
          value={`${formatBytes(bytesDone)} / ${formatBytes(totalBytes)}`}
        />
        {eta > 0 && pct < 100 && (
          <StatChip
            label="ETA"
            value={formatETA(eta)}
          />
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    }}>
      <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        {value}
      </span>
    </div>
  );
}
