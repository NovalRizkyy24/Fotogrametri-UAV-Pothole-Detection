import React from 'react';
import { UploadCloud, BarChart3, History, ShieldAlert, Cpu, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function Navbar({ activeTab, setActiveTab, currentJobId }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header style={{
      borderBottom: '1px solid var(--border-color)',
      background: 'var(--bg-header)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => setActiveTab('upload')}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0, 242, 254, 0.35)'
          }}>
            <ShieldAlert size={24} color="#0b0f19" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Pothole3D Vision
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              YOLOv8-seg + SfM-MVS Photogrammetry Depth & Volume Engine
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('upload')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              transition: 'all 0.2s ease',
              background: activeTab === 'upload' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
              color: activeTab === 'upload' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
            }}
          >
            <UploadCloud size={18} />
            <span>Upload & Process</span>
          </button>

          {currentJobId && (
            <button
              onClick={() => setActiveTab('result')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                background: activeTab === 'result' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
                color: activeTab === 'result' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              <BarChart3 size={18} />
              <span>Hasil Analisis</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('history')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              transition: 'all 0.2s ease',
              background: activeTab === 'history' ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
              color: activeTab === 'history' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
            }}
          >
            <History size={18} />
            <span>Riwayat Job</span>
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* System Model Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(52, 199, 89, 0.1)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(52, 199, 89, 0.25)' }}>
            <Cpu size={16} color="#34c759" />
            <span style={{ fontSize: '0.8rem', color: '#34c759', fontWeight: 600 }}>YOLOv8-seg Active</span>
          </div>

          {/* Light / Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            aria-label="Toggle light/dark mode"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-panel-soft)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
