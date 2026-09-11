import React, { useState } from 'react';
import { X, Download, Copy, Check, BarChart2, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DepthPointsModal({ isOpen, pothole, onClose }) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50); // 50 rows per page for ultra smooth 60fps UI

  if (!isOpen || !pothole) return null;

  const pointsDetail = pothole.depth_points_detail || [];
  const pointsCm = pothole.depth_points_cm || [];
  const totalNPixels = pothole.n_points || pointsDetail.length || 0;
  const isDownsampled = pothole.is_downsampled || false;

  const minDepth = pointsCm.length > 0
    ? pointsCm.reduce((min, val) => (val < min ? val : min), pointsCm[0]).toFixed(2)
    : '0.00';
  const calculatedMax = pointsCm.length > 0
    ? pointsCm.reduce((max, val) => (val > max ? val : max), pointsCm[0]).toFixed(2)
    : '0.00';
  const maxDepth = pothole.depth_max_cm != null ? Number(pothole.depth_max_cm).toFixed(2) : calculatedMax;

  // Filtered Points based on Search
  const filteredPoints = pointsDetail.filter((pt) =>
    pt.point_id.toString().includes(searchTerm) ||
    pt.x.toString().includes(searchTerm) ||
    pt.y.toString().includes(searchTerm) ||
    pt.depth_cm.toString().includes(searchTerm)
  );

  // Pagination Math
  const totalPages = Math.ceil(filteredPoints.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedPoints = filteredPoints.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(JSON.stringify(pointsCm, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCsv = () => {
    let csvContent = "data:text/csv;charset=utf-8,Point_ID,Pixel_X,Pixel_Y,Depth_cm\n";
    pointsDetail.forEach((pt) => {
      csvContent += `${pt.point_id},${pt.x},${pt.y},${pt.depth_cm}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pothole_${pothole.instance_id}_depth_points.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: 'var(--bg-modal-backdrop)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '900px',
        width: '100%',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 242, 254, 0.05)'
        }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={20} color="var(--accent-cyan)" />
              Detail Kedalaman Per Piksel — Lubang #{pothole.instance_id}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Daftar sampel titik elevasi sebelum dihitung rata-ratanya (Dilengkapi Pagination & Downsampling)
            </p>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Performance Info Banner for Large Datasets */}
          {isDownsampled && (
            <div style={{
              background: 'rgba(0, 242, 254, 0.08)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.82rem',
              color: 'var(--accent-cyan)'
            }}>
              <ShieldCheck size={22} />
              <div>
                <strong>Optimasi Performa Browser Aktif:</strong> Total terdapat <strong>{totalNPixels.toLocaleString()} piksel</strong>. Untuk menjaga UI tetap cepat tanpa lag, <strong>{pointsDetail.length.toLocaleString()} titik sampel representatif</strong> ditampilkan di tabel UI. (Seluruh {totalNPixels.toLocaleString()} piksel tetap dihitung 100% akurat pada perhitungan Volume/Luas).
              </div>
            </div>
          )}

          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'var(--bg-panel-softer)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Piksel Mask (N)</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }} className="font-mono">
                {totalNPixels.toLocaleString()} Piksel
              </div>
            </div>

            <div style={{ background: 'var(--bg-panel-softer)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kedalaman Min</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34c759' }} className="font-mono">
                {minDepth} cm
              </div>
            </div>

            <div style={{ background: 'var(--bg-panel-softer)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kedalaman Max</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }} className="font-mono">
                {maxDepth} cm
              </div>
            </div>

          </div>

          {/* Table Header & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                placeholder="Cari Titik / Koordinat..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  background: 'var(--bg-panel-softer)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  outline: 'none',
                  width: '200px'
                }}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Menampilkan {filteredPoints.length.toLocaleString()} titik
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCopyRaw} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                {copied ? <Check size={14} color="#34c759" /> : <Copy size={14} />} {copied ? 'Tercopy!' : 'Copy JSON'}
              </button>
              <button onClick={handleDownloadCsv} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Paginated Data Table Grid */}
          <div style={{ overflowY: 'auto', maxHeight: '280px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-table-head)', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '10px 14px' }}>Titik #</th>
                  <th style={{ padding: '10px 14px' }}>Koordinat Piksel (X, Y)</th>
                  <th style={{ padding: '10px 14px' }}>Nilai Kedalaman (cm)</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPoints.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Tidak ada titik yang sesuai pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedPoints.map((pt) => (
                    <tr key={pt.point_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }} className="font-mono">
                        #{pt.point_id}
                      </td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-secondary)' }} className="font-mono">
                        X: {pt.x}, Y: {pt.y}
                      </td>
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: 'var(--accent-cyan)' }} className="font-mono">
                        {pt.depth_cm} cm
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <div>
              Halaman <strong style={{ color: 'var(--text-primary)' }}>{safePage}</strong> dari <strong style={{ color: 'var(--text-primary)' }}>{totalPages}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => handlePageChange(safePage - 1)}
                disabled={safePage <= 1}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem', opacity: safePage <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} /> Prev
              </button>

              <button
                onClick={() => handlePageChange(safePage + 1)}
                disabled={safePage >= totalPages}
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem', opacity: safePage >= totalPages ? 0.4 : 1 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
