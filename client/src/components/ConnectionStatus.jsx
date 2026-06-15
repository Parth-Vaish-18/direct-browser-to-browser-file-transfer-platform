import React from 'react';

/**
 * Maps internal status strings to human-readable labels and visual styles.
 */
const STATUS_MAP = {
  idle:         { label: 'Setting up room…',        color: '#8888aa', pulse: false },
  creating:     { label: 'Creating room…',           color: '#8888aa', pulse: false },
  waiting:      { label: 'Waiting for receiver',     color: '#f59e0b', pulse: true  },
  'awaiting-peer': { label: 'Waiting for sender',    color: '#f59e0b', pulse: true  },
  joining:      { label: 'Joining room…',            color: '#8888aa', pulse: false },
  connecting:   { label: 'Establishing connection',  color: '#6c63ff', pulse: true  },
  connected:    { label: 'Connected',                color: '#22c55e', pulse: false },
  transferring: { label: 'Transferring…',            color: '#6c63ff', pulse: true  },
  receiving:    { label: 'Receiving…',               color: '#6c63ff', pulse: true  },
  verifying:    { label: 'Verifying integrity…',     color: '#f59e0b', pulse: true  },
  done:         { label: 'Transfer complete',        color: '#22c55e', pulse: false },
  disconnected: { label: 'Peer disconnected',        color: '#ef4444', pulse: false },
  error:        { label: 'Error',                    color: '#ef4444', pulse: false },
};

/**
 * ConnectionStatus
 *
 * @param {{ status: string, className?: string }} props
 */
export default function ConnectionStatus({ status, className = '' }) {
  const config = STATUS_MAP[status] || STATUS_MAP.idle;

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        borderRadius: '999px',
        border: `1px solid ${config.color}44`,
        background: `${config.color}14`,
        fontSize: '13px',
        fontWeight: 500,
        color: config.color,
        fontFamily: 'var(--font-display)',
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: config.color,
          display: 'inline-block',
          flexShrink: 0,
          animation: config.pulse
            ? 'pulse-ring 1.4s ease infinite'
            : 'none',
        }}
      />
      {config.label}
    </div>
  );
}