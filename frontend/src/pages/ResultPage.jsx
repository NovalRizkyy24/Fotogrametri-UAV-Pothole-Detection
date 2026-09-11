import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, ShieldAlert, Layers, Maximize2, ArrowLeft, Box, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api';
import MetricCard from '../components/MetricCard';
import ImageViewer from '../components/ImageViewer';
import ThreeMeshViewer from '../components/ThreeMeshViewer';
import PotholeTable from '../components/PotholeTable';

export default function ResultPage({ jobId, onBackToUpload }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [displayMode, setDisplayMode] = useState('2d'); // '2d' | '3d'

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const data = await api.getJobResult(jobId);
        setResult(data);
        setLoading(false);
        // Default to 3D tab if mesh is present
        if (data.mesh) {
          setDisplayMode('3d');
        }
      } catch (err) {
        setErrorMsg('Gagal memuat hasil pekerjaan.');
        setLoading(false);
      }
    };
    fetchResult();
  }, [jobId]);

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Memuat hasil analisis...
      </div>
    );
  }

  if (errorMsg || !result) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#ef4444' }}>
        {errorMsg || 'Hasil tidak ditemukan.'}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Bar Navigation & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBackToUpload} className="btn-secondary" style={{ padding: '8px 14px' }}>
            <ArrowLeft size={16} /> Job Baru
          </button>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Hasil Deteksi & Dimensi Lubang Jalan</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }} className="font-mono">
              Job ID: {result.job_id} | Res. GSD: {result.gsd_cm} cm/px | Tanggal: {result.created_at}
            </p>
          </div>
        </div>

        {/* Download CSV & XLSX Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href={api.getExportUrl(jobId, 'csv')}
            download
            className="btn-secondary"
            style={{ textDecoration: 'none' }}
          >
            <Download size={16} /> Unduh CSV
          </a>
          <a
            href={api.getExportUrl(jobId, 'xlsx')}
            download
            className="btn-primary"
            style={{ textDecoration: 'none' }}
          >
            <FileSpreadsheet size={16} /> Unduh Excel (.xlsx)
          </a>
        </div>
      </div>

      {/* Summary Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <MetricCard
          title="Total Lubang Terdeteksi"
          value={result.n_potholes}
          unit="Unit"
          subtitle="Menggunakan YOLOv8-seg model"
          icon={ShieldAlert}
          color="var(--accent-cyan)"
        />
        <MetricCard
          title="Total Volume Material Hilang"
          value={result.total_volume_m3}
          unit="m³"
          subtitle="Estimasi bahan penambalan jalan"
          icon={Layers}
          color="var(--accent-blue)"
        />
        <MetricCard
          title="Kedalaman Maksimum Area"
          value={result.max_depth_cm}
          unit="cm"
          subtitle="Titik terburuk di lokasi survei"
          icon={Maximize2}
          color="#ef4444"
        />
      </div>

      {/* Mode Switcher Bar (2D Map vs 3D Model) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-overlay-subtle)', padding: '6px 12px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setDisplayMode('2d')}
            className="btn-secondary"
            style={{
              padding: '8px 16px',
              fontSize: '0.88rem',
              border: 'none',
              background: displayMode === '2d' ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
              color: displayMode === '2d' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
            }}
          >
            <ImageIcon size={16} /> Visualisasi 2D (Peta & Heatmap)
          </button>

          {result.mesh && (
            <button
              onClick={() => setDisplayMode('3d')}
              className="btn-secondary"
              style={{
                padding: '8px 16px',
                fontSize: '0.88rem',
                border: 'none',
                background: displayMode === '3d' ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
                color: displayMode === '3d' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              <Box size={16} color="var(--accent-cyan)" /> Model 3D Interaktif (Pix4D Mesh)
            </button>
          )}
        </div>

        {result.mesh && (
          <span style={{ fontSize: '0.78rem', color: '#34c759', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Box size={14} /> Model 3D Mesh Tersedia
          </span>
        )}
      </div>

      {/* Main Content Area based on Display Mode */}
      {displayMode === '3d' && result.mesh ? (
        <ThreeMeshViewer meshData={result.mesh} potholes={result.potholes} />
      ) : (
        <ImageViewer images={result.images} />
      )}

      {/* Pothole Dimensions Data Table */}
      <PotholeTable potholes={result.potholes} />
    </div>
  );
}
