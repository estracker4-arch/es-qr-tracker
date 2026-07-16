import React from 'react';

/*
 * The terminator ring — the one signature element, from the O of the
 * Nuevosol wordmark: a disc split on a vertical line, one half solid,
 * one half hollow. The fill always sweeps from the terminator.
 *
 * Modes:
 *   fill=0    hollow  (pending / off)
 *   fill=0.5  half    (active / in a state)
 *   fill=1    solid   (done / selected)
 *   spinning  twelve rays rotate around a hollow disc (loading), 1.6s linear
 *   rays      static twelve rays around a half disc (the origin mark)
 */
export default function Ring({ size = 10, color = 'currentColor', fill = 0.5, spinning = false, rays = false, style, className }) {
  const r = 40;

  if (spinning || rays) {
    const rayLines = Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 * Math.PI) / 180;
      return (
        <line
          key={i}
          x1={Math.sin(a) * (r + 14)} y1={-Math.cos(a) * (r + 14)}
          x2={Math.sin(a) * (r + 30)} y2={-Math.cos(a) * (r + 30)}
          stroke={color} strokeWidth="7"
          opacity={spinning ? 0.3 + (i / 12) * 0.7 : 1}
        />
      );
    });
    return (
      <svg
        width={size} height={size} viewBox="-75 -75 150 150"
        className={[spinning ? 'ring-spin' : '', className || ''].join(' ').trim() || undefined}
        style={style} aria-hidden="true"
      >
        {rayLines}
        <circle r={r} fill="none" stroke={color} strokeWidth="8" />
        {rays && <path d={`M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`} fill={color} />}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" style={style} className={className} aria-hidden="true">
      <circle r={r} fill="none" stroke={color} strokeWidth="10" />
      {fill >= 1
        ? <circle r={r} fill={color} />
        : fill > 0
          ? <path d={`M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`} fill={color} />
          : null}
    </svg>
  );
}
