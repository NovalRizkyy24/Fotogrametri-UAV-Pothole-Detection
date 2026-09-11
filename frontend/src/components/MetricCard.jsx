import React from 'react';

export default function MetricCard({ title, value, unit, subtitle, icon: Icon, color = 'var(--accent-cyan)' }) {
  return (
    <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{title}</span>
        {Icon && (
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${color}30`
          }}>
            <Icon size={20} color={color} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>{unit}</span>}
      </div>

      {subtitle && (
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
