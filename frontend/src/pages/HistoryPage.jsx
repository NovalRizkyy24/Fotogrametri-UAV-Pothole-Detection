import React, { useEffect, useState } from 'react';
import { History, Eye, Calendar, Layers, ShieldAlert, ArrowRight, Trash2, Edit2, Check, X } from 'lucide-react';
import { api } from '../services/api';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

export default function HistoryPage({ onViewResult }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeleteJobId, setSelectedDeleteJobId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inline Job Name Edit State
  const [editingJobId, setEditingJobId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const fetchHistory = async () => {
    try {
      const data = await api.getJobsHistory();
      setHistory(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching history:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const openDeleteModal = (jobId, e) => {
    e.stopPropagation();
    setSelectedDeleteJobId(jobId);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setSelectedDeleteJobId(null);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDeleteJobId) return;
    setIsDeleting(true);

    try {
      await api.deleteJob(selectedDeleteJobId);
      setHistory((prev) => prev.filter((item) => item.job_id !== selectedDeleteJobId));
      setSelectedDeleteJobId(null);
    } catch (err) {
      console.error('Error deleting job:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEdit = (job, e) => {
    e.stopPropagation();
    setEditingJobId(job.job_id);
    setEditingName(job.job_name || `Survei Photogrammetry #${job.job_id.substring(0, 8)}`);
  };

  const handleSaveRename = async (jobId) => {
    if (!editingName.trim()) return;
    try {
      await api.renameJob(jobId, editingName.trim());
      setHistory((prev) =>
        prev.map((item) =>
          item.job_id === jobId ? { ...item, job_name: editingName.trim() } : item
        )
      );
      setEditingJobId(null);
    } catch (err) {
      console.error('Error renaming job:', err);
      alert('Gagal mengubah nama job.');
    }
  };

  const handleCancelRename = () => {
    setEditingJobId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Memuat riwayat pekerjaan...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Riwayat Pemrosesan Job</h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Daftar seluruh survei photogrammetry yang pernah dianalisis oleh sistem
          </p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <History size={48} style={{ opacity: 0.5, marginBottom: '12px' }} />
          <p>Belum ada riwayat pemrosesan. Mulai dengan mengunggah file di menu Upload.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {history.map((job) => {
            const isEditing = editingJobId === job.job_id;
            const displayName = job.job_name || `Survei Photogrammetry #${job.job_id.substring(0, 8)}`;

            return (
              <div
                key={job.job_id}
                className="glass-panel"
                style={{
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  border: '1px solid var(--border-color)',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Header: Status Badge & Delete Icon */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    ID: {job.job_id.substring(0, 13)}...
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '12px',
                        textTransform: 'uppercase',
                        background: job.status === 'done' ? 'rgba(52, 199, 89, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: job.status === 'done' ? '#34c759' : '#ef4444',
                        border: `1px solid ${job.status === 'done' ? 'rgba(52, 199, 89, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}
                    >
                      {job.status}
                    </span>

                    {/* Delete Job Button */}
                    <button
                      onClick={(e) => openDeleteModal(job.job_id, e)}
                      title="Hapus Job dari Riwayat"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '8px',
                        padding: '6px',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Job Name Title & Inline Edit */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(job.job_id);
                          if (e.key === 'Escape') handleCancelRename();
                        }}
                        autoFocus
                        style={{
                          background: 'var(--bg-input-strong)',
                          border: '1px solid var(--accent-cyan)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          color: 'var(--text-primary)',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          width: '100%',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={() => handleSaveRename(job.job_id)}
                        title="Simpan Nama"
                        style={{ background: 'rgba(52, 199, 89, 0.2)', border: '1px solid #34c759', color: '#34c759', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={handleCancelRename}
                        title="Batal"
                        style={{ background: 'var(--bg-overlay-hover-strong)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word', flex: 1 }}>
                        {displayName}
                      </h4>
                      <button
                        onClick={(e) => handleStartEdit(job, e)}
                        title="Edit Nama Job"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-cyan)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      >
                        <Edit2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Metrics Summary Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--bg-panel-soft)', padding: '12px', borderRadius: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Jumlah Lubang</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                      {job.n_potholes} Unit
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Volume Total</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {job.total_volume_m3} m³
                    </div>
                  </div>
                </div>

                {/* Footer Date & Action */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} /> {job.created_at}
                  </span>
                  
                  {job.status === 'done' && (
                    <button
                      onClick={() => onViewResult(job.job_id)}
                      className="btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      Lihat Hasil <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modern Custom UI Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(selectedDeleteJobId)}
        jobId={selectedDeleteJobId}
        onConfirm={handleConfirmDelete}
        onCancel={closeDeleteModal}
        loading={isDeleting}
      />
    </div>
  );
}
