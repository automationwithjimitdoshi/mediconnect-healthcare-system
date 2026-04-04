'use client';
// Inline SVG sparkline — no external library needed
export default function DeltaSparkline({ data = [], width = 80, height = 30, color = '#3b82f6' }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => parseFloat(d.value) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const lastVal  = values[values.length - 1];
  const firstVal = values[0];
  const trend    = lastVal > firstVal ? 'up' : lastVal < firstVal ? 'down' : 'flat';
  const trendColor = trend === 'up' ? '#ef4444' : trend === 'down' ? '#22c55e' : '#94a3b8';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <polyline
          points={points}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots at each data point */}
        {values.map((v, i) => {
          const x = (i / (values.length - 1)) * width;
          const y = height - ((v - min) / range) * height;
          return <circle key={i} cx={x} cy={y} r="2" fill={trendColor} />;
        })}
      </svg>
      <span style={{ fontSize: 10, color: trendColor, fontWeight: 600 }}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
      </span>
    </div>
  );
}