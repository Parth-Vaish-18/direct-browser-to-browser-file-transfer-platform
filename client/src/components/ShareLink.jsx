import React, { useState, useCallback } from 'react';

/**
 * ShareLink
 * Displays the share URL with a copy-to-clipboard button.
 * @param {{ link: string }} props
 */
export default function ShareLink({ link }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = link;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [link]);

  return (
    <div style={{
      width: '100%',
      animation: 'fadeIn 0.3s ease forwards',
    }}>
      <p style={{
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
      }}>
        Share this link with the receiver
      </p>

      <div style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'stretch',
      }}>
        {/* Link field */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border-glow)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          minWidth: 0,
        }}>
          <span style={{
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {link}
          </span>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          style={{
            background: copied ? 'var(--success-dim)' : 'var(--accent-dim)',
            border: `1px solid ${copied ? 'var(--success)' : 'var(--accent)'}`,
            borderRadius: 'var(--radius-sm)',
            color: copied ? 'var(--success)' : 'var(--accent)',
            fontFamily: 'var(--font-display)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '10px 20px',
            whiteSpace: 'nowrap',
            transition: 'all var(--transition)',
            flexShrink: 0,
          }}
        >
          {copied ? '✓ Copied!' : 'Copy link'}
        </button>
      </div>

      {/* Helper text */}
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
        The receiver must open this link while you keep this tab open.
      </p>
    </div>
  );
}
