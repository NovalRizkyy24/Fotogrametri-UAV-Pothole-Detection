import React, { useEffect, useState } from 'react';
import { UploadCloud, History, ScanSearch, Layers, Ruler, Box, FileSpreadsheet, ArrowRight, MapPinned, Mountain, Database, Droplets } from 'lucide-react';
import { api } from '../services/api';
import MetricCard from '../components/MetricCard';
import heroImage from '../assets/drone-pothole.jpg';

const STEPS = [
  { icon: Layers, title: 'Validasi & Penyelarasan', desc: 'Orthomosaic dan DSM dicek lalu di-reproject/resample agar grid pikselnya sama.' },
  { icon: ScanSearch, title: 'Deteksi YOLOv8-seg', desc: 'Model segmentasi menghasilkan mask poligon untuk setiap lubang pada orthomosaic.' },
  { icon: Mountain, title: 'Estimasi Kedalaman', desc: 'Bidang permukaan jalan di sekitar mask di-fit dengan RANSAC, lalu dibandingkan dengan DSM.' },
  { icon: Ruler, title: 'Perhitungan Metrik', desc: 'Luas, kedalaman maksimum/rata-rata, volume, dan titik validasi tiap lubang.' },
  { icon: FileSpreadsheet, title: 'Visualisasi & Ekspor', desc: 'Gambar overlay 2D, tampilan mesh 3D, serta ekspor hasil ke CSV/XLSX.' }
];

const INPUTS = [
  { icon: MapPinned, label: 'Orthomosaic', note: 'GeoTIFF, wajib', color: 'var(--accent-cyan)' },
  { icon: Mountain, label: 'DSM', note: 'GeoTIFF, wajib', color: 'var(--accent-blue)' },
  { icon: Box, label: 'Mesh 3D', note: '.obj + .mtl + tekstur, opsional', color: '#a78bfa' },
  { icon: Database, label: 'Model .pt', note: 'opsional, default dari server', color: '#34c759' }
];

export default function HomePage({ onStart, onOpenHistory }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getJobsHistory()
      .then((jobs) => {
        const done = jobs.filter((j) => j.status === 'done');
        setStats({
          jobs: done.length,
          potholes: done.reduce((sum, j) => sum + (Number(j.n_potholes) || 0), 0),
          volume: done.reduce((sum, j) => sum + (Number(j.total_volume_m3) || 0), 0)
        });
      })
      .catch((err) => console.error('Error fetching history:', err));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* Hero */}
      <section className="glass-panel" style={{ padding: 'clamp(28px, 5vw, 56px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 85% 20%, rgba(0, 242, 254, 0.12), transparent 45%), radial-gradient(circle at 10% 90%, rgba(127, 0, 255, 0.10), transparent 40%)',
          pointerEvents: 'none'
        }} />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '40px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <span style={{
            alignSelf: 'flex-start',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: 'var(--accent-cyan)',
            background: 'rgba(0, 242, 254, 0.1)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            padding: '6px 14px',
            borderRadius: '20px'
          }}>
            Fotogrametri UAV · YOLOv8-seg · RANSAC
          </span>
          <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Deteksi lubang jalan dan estimasi volumenya dari foto udara
          </h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Unggah Orthomosaic dan DSM hasil pengolahan fotogrametri. Sistem akan menyegmentasi setiap lubang,
            menghitung kedalaman terhadap bidang permukaan jalan, lalu menyajikan luas, kedalaman, dan volume
            lengkap dengan visualisasi 2D dan 3D.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
            <button className="btn-primary" onClick={onStart}>
              <UploadCloud size={18} />
              Mulai Analisis
            </button>
            <button className="btn-secondary" onClick={onOpenHistory}>
              <History size={18} />
              Lihat Riwayat
            </button>
          </div>
        </div>

          <img
            src={heroImage}
            alt="Ilustrasi drone UAV memindai permukaan jalan dan mendeteksi lubang"
            style={{
              width: '100%',
              aspectRatio: '3 / 2',
              objectFit: 'cover',
              borderRadius: '16px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 12px 40px var(--shadow-panel)'
            }}
          />
        </div>
      </section>

      {/* Ringkasan dari riwayat job */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <MetricCard title="Job Selesai" value={stats ? stats.jobs : '–'} icon={Layers} subtitle="Total survei yang telah diproses" />
        <MetricCard title="Lubang Terdeteksi" value={stats ? stats.potholes : '–'} unit="unit" icon={ScanSearch} color="var(--severity-medium)" subtitle="Akumulasi dari seluruh job" />
        <MetricCard title="Total Volume" value={stats ? stats.volume.toFixed(3) : '–'} unit="m³" icon={Droplets} color="var(--accent-blue)" subtitle="Estimasi volume material perbaikan" />
      </section>

      {/* Alur pemrosesan */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 600 }}>Alur Pemrosesan</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <div key={title} className="glass-panel" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(0, 242, 254, 0.1)',
                  border: '1px solid rgba(0, 242, 254, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={20} color="var(--accent-cyan)" />
                </div>
                <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>0{i + 1}</span>
              </div>
              <span style={{ fontWeight: 600 }}>{title}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Data yang dibutuhkan */}
      <section className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 600 }}>Data yang Dibutuhkan</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Hasil pengolahan fotogrametri, misalnya dari Pix4Dmapper.
            </p>
          </div>
          <button className="btn-secondary" onClick={onStart}>
            Ke Halaman Upload
            <ArrowRight size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {INPUTS.map(({ icon: Icon, label, note, color }) => (
            <div key={label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'var(--bg-panel-soft)',
              border: '1px solid var(--border-color)'
            }}>
              <Icon size={20} color={color} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{note}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
