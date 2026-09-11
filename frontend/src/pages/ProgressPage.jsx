import React, { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Layers, Cpu, Compass, Image as ImageIcon, Terminal } from 'lucide-react';
import { api } from '../services/api';

export default function ProgressPage({ jobId, onJobCompleted }) {
  const [statusData, setStatusData] = useState({
    status: 'queued',
    progress: 0.0,
    stage: 'Inisialisasi...',
    ransac_log: []
  });
  const [errorMsg, setErrorMsg] = useState('');
  const logEndRef = useRef(null);

  useEffect(() => {
    let intervalId;
    const pollStatus = async () => {
      try {
        const res = await api.getJobStatus(jobId);
        setStatusData(res);

        if (res.status === 'done') {
          clearInterval(intervalId);
          setTimeout(() => {
            onJobCompleted(jobId);
          }, 800);
        } else if (res.status === 'failed') {
          clearInterval(intervalId);
          setErrorMsg(res.error || 'Terjadi kesalahan saat memproses job.');
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    };

    pollStatus();
    intervalId = setInterval(pollStatus, 1500);

    return () => clearInterval(intervalId);
  }, [jobId, onJobCompleted]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [statusData.ransac_log]);

  const stagesList = [
    { title: 'Validasi & Alignment GeoTIFF', icon: Compass, minProgress: 0.1 },
    { title: 'Inferensi YOLOv8-seg (Citra Penuh)', icon: Cpu, minProgress: 0.3 },
    { title: 'Elevasi DSM & RANSAC 3D Plane Fitting', icon: Layers, minProgress: 0.6 },
    { title: 'Generating Visualisasi & Export', icon: ImageIcon, minProgress: 0.85 },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {statusData.status === 'failed' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <AlertTriangle size={64} color="#ef4444" />
            <h3 style={{ fontSize: '1.5rem', color: '#ef4444' }}>Pemrosesan Gagal</h3>
            <p style={{ color: 'var(--text-secondary)' }}>{errorMsg}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <Loader2 size={54} color="var(--accent-cyan)" style={{ animation: 'spin 1.5s linear infinite' }} />
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Memproses Deteksi & Dimensi 3D...</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }} className="font-mono">
                Job ID: {jobId}
              </p>
            </div>

            {/* Progress Bar Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>{statusData.stage}</span>
                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  {Math.round(statusData.progress * 100)}%
                </span>
              </div>

              <div style={{ height: '12px', background: 'var(--bg-input-strong)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(5, statusData.progress * 100)}%`,
                    background: 'linear-gradient(90deg, #00f2fe 0%, #4facfe 100%)',
                    borderRadius: '10px',
                    transition: 'width 0.4s ease-out',
                    boxShadow: '0 0 12px rgba(0, 242, 254, 0.5)'
                  }}
                />
              </div>
            </div>

            {/* Pipeline Stage Tracker */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '16px' }}>
              {stagesList.map((stg, idx) => {
                const isComplete = statusData.progress >= stg.minProgress;
                const Icon = stg.icon;
                return (
                  <div
                    key={idx}
                    style={{
                      background: isComplete ? 'rgba(0, 242, 254, 0.08)' : 'var(--bg-panel-soft)',
                      border: `1px solid ${isComplete ? 'rgba(0, 242, 254, 0.3)' : 'var(--border-color)'}`,
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      textAlign: 'center'
                    }}
                  >
                    {isComplete ? <CheckCircle2 size={20} color="var(--accent-cyan)" /> : <Icon size={20} color="var(--text-muted)" />}
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isComplete ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {stg.title}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Live RANSAC Per-Pothole Log */}
            {statusData.ransac_log && statusData.ransac_log.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  <Terminal size={16} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Log RANSAC 3D Plane Fitting (per lubang)
                  </span>
                </div>
                <div
                  style={{
                    background: 'var(--bg-panel-strong)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    fontSize: '0.78rem',
                    lineHeight: 1.6
                  }}
                  className="font-mono"
                >
                  {statusData.ransac_log.map((line, idx) => (
                    <div key={idx} style={{ color: idx === statusData.ransac_log.length - 1 ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
