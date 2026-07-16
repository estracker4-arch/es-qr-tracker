import React from 'react';
import Ring from './Ring';

// The wordmark, set in type with the terminator ring as the O.
// Appears exactly once per screen, at rest.
export default function Wordmark({ size = 18, style }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: size,
        letterSpacing: '-0.01em',
        color: 'var(--sol-500)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        lineHeight: 1,
        userSelect: 'none',
        ...style,
      }}
    >
      Nuev
      <Ring size={size * 0.72} color="var(--sol-500)" fill={0.5} style={{ margin: '0 1px' }} />
      sol
    </span>
  );
}
