import React, { useState } from 'react';
import { ArrowUpDown, Search, ListFilter, Eye } from 'lucide-react';
import DepthPointsModal from './DepthPointsModal';

export default function PotholeTable({ potholes }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('depth_max_cm');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedPotholeForModal, setSelectedPotholeForModal] = useState(null);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredPotholes = potholes
    .filter((p) => {
      return p.instance_id.toString().includes(searchTerm);
    })
    .sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Table Header & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Tabel Pengukuran Dimensi Per Lubang</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Menampilkan data kedalaman maksimum, luas permukaan, volume, dan rincian sampel titik kedalaman
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Cari ID Lubang..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'var(--bg-panel-softer)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '8px 12px 8px 36px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      {/* Table Data */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => handleSort('instance_id')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ID Lubang <ArrowUpDown size={14} />
                </div>
              </th>
              <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => handleSort('confidence')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Confidence <ArrowUpDown size={14} />
                </div>
              </th>
              <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => handleSort('depth_max_cm')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Kedalaman Max (cm) <ArrowUpDown size={14} />
                </div>
              </th>
              <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => handleSort('area_m2')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Luas (m²) <ArrowUpDown size={14} />
                </div>
              </th>
              <th style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => handleSort('volume_m3')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Volume (m³) <ArrowUpDown size={14} />
                </div>
              </th>
              <th style={{ padding: '12px 16px' }}>
                Rincian Sampel Titik Kedalaman
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPotholes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Tidak ada data lubang terdeteksi yang sesuai filter.
                </td>
              </tr>
            ) : (
              filteredPotholes.map((p) => {
                const pointCount = p.n_points || p.depth_points_cm?.length || 0;
                return (
                  <tr
                    key={p.instance_id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background 0.2s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 700 }} className="font-mono">
                      #{p.instance_id}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {p.confidence != null ? (
                        <span
                          className="font-mono"
                          style={{
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            padding: '3px 9px',
                            borderRadius: '20px',
                            color: p.confidence >= 0.8 ? '#34c759' : p.confidence >= 0.5 ? '#ffcc00' : '#ef4444',
                            background: p.confidence >= 0.8 ? 'rgba(52, 199, 89, 0.12)' : p.confidence >= 0.5 ? 'rgba(255, 204, 0, 0.12)' : 'rgba(239, 68, 68, 0.12)'
                          }}
                        >
                          {(p.confidence * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--accent-cyan)' }} className="font-mono">
                      {p.depth_max_cm} cm
                    </td>
                    <td style={{ padding: '14px 16px' }} className="font-mono">
                      {p.area_m2} m²
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 600 }} className="font-mono">
                      {p.volume_m3} m³
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={() => setSelectedPotholeForModal(p)}
                        className="btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          borderColor: 'rgba(0, 242, 254, 0.3)',
                          color: 'var(--accent-cyan)',
                          background: 'rgba(0, 242, 254, 0.08)'
                        }}
                      >
                        <Eye size={14} /> Lihat {pointCount} Titik Kedalaman
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Depth Points Detail Modal */}
      <DepthPointsModal
        isOpen={Boolean(selectedPotholeForModal)}
        pothole={selectedPotholeForModal}
        onClose={() => setSelectedPotholeForModal(null)}
      />
    </div>
  );
}
