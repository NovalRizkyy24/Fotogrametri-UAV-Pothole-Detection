import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export default function DeleteConfirmModal({ isOpen, jobId, onConfirm, onCancel, loading }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 999,
      background: 'var(--bg-modal-backdrop)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '460px',
        width: '100%',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        boxShadow: '0 12px 40px rgba(239, 68, 68, 0.15)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header Icon & Close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Trash2 size={24} color="#ef4444" />
          </div>

          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Text */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Hapus Riwayat Job Survei?
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Apakah Anda yakin ingin menghapus job ID <span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>{jobId?.substring(0, 16)}...</span> secara permanen?
          </p>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            ⚠️ Seluruh berkas hasil visualisasi, peta kedalaman, dan tabel ekspor Excel/CSV pada server akan dihapus.
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary"
            style={{ padding: '10px 18px', fontSize: '0.88rem' }}
          >
            Batal
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#ffffff',
              fontWeight: 600,
              padding: '10px 20px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.88rem',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
            }}
          >
            {loading ? 'Menghapus...' : 'Ya, Hapus Permanen'}
          </button>
        </div>
      </div>
    </div>
  );
}
