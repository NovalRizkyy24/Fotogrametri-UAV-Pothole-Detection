import React, { useState, useEffect } from 'react';
import { UploadCloud, FileSpreadsheet, Settings, Play, CheckCircle2, AlertCircle, Box, Cpu } from 'lucide-react';
import { api } from '../services/api';

const CUSTOM_MODEL_OPTION = '__custom__';

export default function UploadPage({ onJobStarted }) {
  const [jobName, setJobName] = useState('');
  const [orthoFile, setOrthoFile] = useState(null);
  const [dsmFile, setDsmFile] = useState(null);
  const [modelFile, setModelFile] = useState(null);

  // Model picker: models deployed on the server, defaulting to whichever the backend marks best
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModelName, setSelectedModelName] = useState('');

  useEffect(() => {
    api.getModels()
      .then((res) => {
        setAvailableModels(res.models || []);
        setSelectedModelName(res.default_model || '');
      })
      .catch(() => {
        // Model list unavailable — silently fall back to the backend's own default model
        setAvailableModels([]);
      });
  }, []);

  // Optional 3D Mesh Files (Pix4D)
  const [meshObjFile, setMeshObjFile] = useState(null);
  const [meshMtlFile, setMeshMtlFile] = useState(null);
  const [meshTextureFile, setMeshTextureFile] = useState(null);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confThreshold, setConfThreshold] = useState(0.60);
  const [bufferPx, setBufferPx] = useState(15);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orthoFile || !dsmFile) {
      setErrorMsg('Mohon unggah kedua file wajib: Orthomosaic (.tif) dan DSM (.tif)');
      return;
    }
    if (selectedModelName === CUSTOM_MODEL_OPTION && !modelFile) {
      setErrorMsg('Mohon unggah file model custom (.pt), atau pilih salah satu model yang sudah tersedia di server.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('orthomosaic', orthoFile);
      formData.append('dsm', dsmFile);
      if (jobName.trim()) formData.append('job_name', jobName.trim());

      if (selectedModelName === CUSTOM_MODEL_OPTION && modelFile) {
        formData.append('custom_model', modelFile);
      } else if (selectedModelName) {
        formData.append('model_name', selectedModelName);
      }

      if (meshObjFile && meshMtlFile && meshTextureFile) {
        formData.append('mesh_obj', meshObjFile);
        formData.append('mesh_mtl', meshMtlFile);
        formData.append('mesh_texture', meshTextureFile);
      }
      
      formData.append('conf_threshold', confThreshold);
      formData.append('buffer_px', bufferPx);

      const res = await api.startJob(formData);
      onJobStarted(res.job_id);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Gagal memulai pemrosesan. Pastikan backend server berjalan.');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Title & Hero */}
      <div style={{ textAlign: 'center', margin: '20px 0 10px 0' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Unggah Hasil Photogrammetry UAV
        </h2>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '14px 20px', borderRadius: '12px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
          <AlertCircle size={20} /> {errorMsg}
        </div>
      )}

      {/* Main Upload Form */}
      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Job Name Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Nama Job / Lokasi Survei <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(Opsional)</span>
          </label>
          <input
            type="text"
            placeholder="Contoh: Survei Jalan Raya KM 12 - Sektor A"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '12px 16px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {/* File 1: Orthomosaic */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              1. File Orthomosaic RGB (.tif / .tiff) <span style={{ color: 'var(--accent-cyan)' }}>*Wajib</span>
            </label>
            <div style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '14px',
              padding: '24px',
              textAlign: 'center',
              background: orthoFile ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-panel-soft)',
              borderColor: orthoFile ? 'var(--accent-cyan)' : 'var(--border-color)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}>
              <input
                type="file"
                accept=".tif,.tiff"
                onChange={(e) => setOrthoFile(e.target.files[0])}
                style={{ display: 'none' }}
                id="ortho-upload"
              />
              <label htmlFor="ortho-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {orthoFile ? <CheckCircle2 size={32} color="var(--accent-cyan)" /> : <UploadCloud size={32} color="var(--text-muted)" />}
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: orthoFile ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                  {orthoFile ? orthoFile.name : 'Pilih / Drag & Drop Orthomosaic'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hasil Fotogrametri Pix4D / WebODM</span>
              </label>
            </div>
          </div>

          {/* File 2: DSM */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              2. File DSM Elevasi (.tif / .tiff) <span style={{ color: 'var(--accent-cyan)' }}>*Wajib</span>
            </label>
            <div style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '14px',
              padding: '24px',
              textAlign: 'center',
              background: dsmFile ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-panel-soft)',
              borderColor: dsmFile ? 'var(--accent-cyan)' : 'var(--border-color)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}>
              <input
                type="file"
                accept=".tif,.tiff"
                onChange={(e) => setDsmFile(e.target.files[0])}
                style={{ display: 'none' }}
                id="dsm-upload"
              />
              <label htmlFor="dsm-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {dsmFile ? <CheckCircle2 size={32} color="var(--accent-cyan)" /> : <FileSpreadsheet size={32} color="var(--text-muted)" />}
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: dsmFile ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                  {dsmFile ? dsmFile.name : 'Pilih / Drag & Drop DSM'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Digital Surface Model align dengan Orthomosaic</span>
              </label>
            </div>
          </div>
        </div>

        {/* Model Deteksi Picker */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={20} color="var(--accent-cyan)" />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              3. Model Deteksi YOLOv8-seg <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(Opsional — default model terbaik)</span>
            </span>
          </div>

          <select
            value={selectedModelName}
            onChange={(e) => setSelectedModelName(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '12px 16px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          >
            {availableModels.length === 0 && (
              <option value="">Model default server</option>
            )}
            {availableModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.is_default ? `★ ${m.name} (Model Terbaik, Default)` : `${m.name} (${m.size_mb} MB)`}
              </option>
            ))}
            <option value={CUSTOM_MODEL_OPTION}>Unggah Model Custom (.pt)...</option>
          </select>

          {selectedModelName === CUSTOM_MODEL_OPTION && (
            <div style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '14px',
              padding: '18px',
              textAlign: 'center',
              background: modelFile ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-panel-soft)',
              borderColor: modelFile ? 'var(--accent-cyan)' : 'var(--border-color)'
            }}>
              <input
                type="file"
                accept=".pt"
                onChange={(e) => setModelFile(e.target.files[0])}
                style={{ display: 'none' }}
                id="model-upload"
              />
              <label htmlFor="model-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {modelFile ? <CheckCircle2 size={28} color="var(--accent-cyan)" /> : <UploadCloud size={28} color="var(--text-muted)" />}
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: modelFile ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                  {modelFile ? modelFile.name : 'Pilih file model YOLOv8-seg (.pt)'}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Optional 3D Model Upload Section (Pix4D Mesh) */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box size={20} color="var(--accent-cyan)" />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Visualisasi 3D Surface Model (Pix4Dmapper) <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(Opsional)</span>
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {/* 3D OBJ */}
            <div style={{ background: 'var(--bg-panel-soft)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                .OBJ File (Simplified 3D Mesh)
              </label>
              <input
                type="file"
                accept=".obj"
                onChange={(e) => setMeshObjFile(e.target.files[0])}
                style={{ fontSize: '0.8rem', color: 'var(--text-primary)', width: '100%' }}
              />
            </div>

            {/* 3D MTL */}
            <div style={{ background: 'var(--bg-panel-soft)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                .MTL File (Material)
              </label>
              <input
                type="file"
                accept=".mtl"
                onChange={(e) => setMeshMtlFile(e.target.files[0])}
                style={{ fontSize: '0.8rem', color: 'var(--text-primary)', width: '100%' }}
              />
            </div>

            {/* 3D Texture JPG */}
            <div style={{ background: 'var(--bg-panel-soft)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                .JPG / .PNG File (Tekstur Foto)
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png"
                onChange={(e) => setMeshTextureFile(e.target.files[0])}
                style={{ fontSize: '0.8rem', color: 'var(--text-primary)', width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Options */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Settings size={18} /> Pengaturan Lanjutan (Confidence Threshold, Buffer RANSAC) {showAdvanced ? '▲' : '▼'}
          </button>

          {showAdvanced && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '16px', background: 'var(--bg-input)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Confidence Threshold YOLO ({confThreshold})</label>
                <input
                  type="range"
                  min="0.05"
                  max="0.9"
                  step="0.05"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Buffer Ring RANSAC ({bufferPx} px)</label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={bufferPx}
                  onChange={(e) => setBufferPx(parseInt(e.target.value))}
                  style={{ width: '100%', marginTop: '6px', background: 'var(--bg-image-slot)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '6px', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !orthoFile || !dsmFile}
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '1rem' }}
        >
          <Play size={18} /> {loading ? 'Mengunggah & Memproses...' : 'Proses Deteksi & Estimasi Volume'}
        </button>
      </form>
    </div>
  );
}
