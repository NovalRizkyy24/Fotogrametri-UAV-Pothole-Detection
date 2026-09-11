import React, { useState } from 'react';
import Navbar from './components/Navbar';
import UploadPage from './pages/UploadPage';
import ProgressPage from './pages/ProgressPage';
import ResultPage from './pages/ResultPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'progress' | 'result' | 'history'
  const [currentJobId, setCurrentJobId] = useState(null);

  const handleJobStarted = (jobId) => {
    setCurrentJobId(jobId);
    setActiveTab('progress');
  };

  const handleJobCompleted = (jobId) => {
    setCurrentJobId(jobId);
    setActiveTab('result');
  };

  const handleViewResultFromHistory = (jobId) => {
    setCurrentJobId(jobId);
    setActiveTab('result');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} currentJobId={currentJobId} />

      <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        {activeTab === 'upload' && (
          <UploadPage
            onJobStarted={handleJobStarted}
            onSampleStarted={handleJobStarted}
          />
        )}

        {activeTab === 'progress' && currentJobId && (
          <ProgressPage
            jobId={currentJobId}
            onJobCompleted={handleJobCompleted}
          />
        )}

        {activeTab === 'result' && currentJobId && (
          <ResultPage
            jobId={currentJobId}
            onBackToUpload={() => setActiveTab('upload')}
          />
        )}

        {activeTab === 'history' && (
          <HistoryPage
            onViewResult={handleViewResultFromHistory}
          />
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Pothole3D Vision Engine &copy; 2026 — Sistem Deteksi YOLOv8-seg & Photogrammetry Volume Estimation
      </footer>
    </div>
  );
}
