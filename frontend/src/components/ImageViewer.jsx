import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Eye, Layers, Flame, Crosshair } from 'lucide-react';
import { api } from '../services/api';

export default function ImageViewer({ images }) {
  const [activeView, setActiveView] = useState('all'); // 'all' | 'ortho' | 'overlay' | 'heatmap'
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showValidationPoints, setShowValidationPoints] = useState(true);

  // Backend ships two versions of the overlay PNG: one with the 5 validation points + confidence %,
  // and a clean one without either — toggle just swaps which is displayed, no re-processing needed.
  const hasNoPointsVariant = Boolean(images?.overlay_no_points);
  const orthoUrl = api.getImageUrl(images?.orthomosaic);
  const overlayUrl = api.getImageUrl(
    showValidationPoints || !hasNoPointsVariant ? images?.overlay : images?.overlay_no_points
  );
  const heatmapUrl = api.getImageUrl(images?.heatmap);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => setZoomLevel(1);

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Visualisasi Photogrammetry & Deteksi 3D</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Hasil Orthomosaic RGB, Overlay Segmentasi Mask YOLOv8, dan Heatmap Kedalaman DSM RANSAC
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Mode Switch Buttons */}
          <div style={{ display: 'flex', background: 'var(--bg-input-strong)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveView('all')}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                border: 'none',
                background: activeView === 'all' ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
                color: activeView === 'all' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              3 Panel
            </button>
            <button
              onClick={() => setActiveView('ortho')}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                border: 'none',
                background: activeView === 'ortho' ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
                color: activeView === 'ortho' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              <Eye size={14} /> Orthomosaic
            </button>
            <button
              onClick={() => setActiveView('overlay')}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                border: 'none',
                background: activeView === 'overlay' ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
                color: activeView === 'overlay' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              <Layers size={14} /> Contour Overlay
            </button>
            <button
              onClick={() => setActiveView('heatmap')}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                border: 'none',
                background: activeView === 'heatmap' ? 'rgba(0, 242, 254, 0.2)' : 'transparent',
                color: activeView === 'heatmap' ? 'var(--accent-cyan)' : 'var(--text-secondary)'
              }}
            >
              <Flame size={14} /> Depth Heatmap
            </button>
          </div>

          {/* Validation Points Toggle — only meaningful when the overlay panel is visible */}
          {hasNoPointsVariant && (activeView === 'all' || activeView === 'overlay') && (
            <button
              onClick={() => setShowValidationPoints((prev) => !prev)}
              className="btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                background: showValidationPoints ? 'rgba(255, 0, 220, 0.15)' : 'transparent',
                color: showValidationPoints ? '#ff2edd' : 'var(--text-secondary)',
                borderColor: showValidationPoints ? 'rgba(255, 0, 220, 0.4)' : 'var(--border-color)'
              }}
              title="Tampilkan/sembunyikan label ID, kedalaman, confidence, dan 5 titik validasi pada overlay deteksi"
            >
              <Crosshair size={14} /> Label & Titik Validasi {showValidationPoints ? 'ON' : 'OFF'}
            </button>
          )}

          {/* Zoom Controls */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleZoomOut} className="btn-secondary" style={{ padding: '6px 10px' }} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 6px' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button onClick={handleZoomIn} className="btn-secondary" style={{ padding: '6px 10px' }} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <button onClick={handleResetZoom} className="btn-secondary" style={{ padding: '6px 10px' }} title="Reset Zoom">
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Image Displays */}
      <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
        {activeView === 'all' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {/* Panel 1: Orthomosaic */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Eye size={16} color="var(--accent-blue)" /> 1. Orthomosaic Asli (RGB)
              </div>
              <div style={{ overflow: 'hidden', borderRadius: '12px', background: 'var(--bg-image-slot)', border: '1px solid var(--border-color)', height: '440px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={orthoUrl}
                  alt="Orthomosaic"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transform: `scale(${zoomLevel})`,
                    transition: 'transform 0.2s ease-out'
                  }}
                />
              </div>
            </div>

            {/* Panel 2: Detection Contour Overlay */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={16} color="var(--accent-cyan)" /> 2. Overlay Deteksi YOLOv8-seg
              </div>
              <div style={{ overflow: 'hidden', borderRadius: '12px', background: 'var(--bg-image-slot)', border: '1px solid var(--border-color)', height: '440px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={overlayUrl}
                  alt="Detection Overlay"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transform: `scale(${zoomLevel})`,
                    transition: 'transform 0.2s ease-out'
                  }}
                />
              </div>
            </div>

            {/* Panel 3: Depth Heatmap */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Flame size={16} color="#f97316" /> 3. Peta Kedalaman (Depth Heatmap)
              </div>
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', background: 'var(--bg-image-slot)', border: '1px solid var(--border-color)', height: '440px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={heatmapUrl}
                  alt="Depth Heatmap"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transform: `scale(${zoomLevel})`,
                    transition: 'transform 0.2s ease-out'
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Single Large Image View */
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '14px', background: 'var(--bg-image-slot)', border: '1px solid var(--border-color)', height: '620px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <img
              src={activeView === 'ortho' ? orthoUrl : activeView === 'overlay' ? overlayUrl : heatmapUrl}
              alt="Expanded View"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s ease-out'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
