import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

export const api = {
  // Start job processing
  startJob: async (formData) => {
    const res = await axios.post(`${API_BASE_URL}/api/jobs`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  // List models deployed on the server (for the model picker)
  getModels: async () => {
    const res = await axios.get(`${API_BASE_URL}/api/jobs/models`);
    return res.data;
  },

  // Start job using sample dataset
  startSampleJob: async () => {
    const res = await axios.post(`${API_BASE_URL}/api/jobs/sample`);
    return res.data;
  },

  // Check status
  getJobStatus: async (jobId) => {
    const res = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}`);
    return res.data;
  },

  // Get result
  getJobResult: async (jobId) => {
    const res = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/result`);
    return res.data;
  },

  // Get job history
  getJobsHistory: async () => {
    const res = await axios.get(`${API_BASE_URL}/api/jobs`);
    return res.data;
  },

  // Delete job from history & storage
  deleteJob: async (jobId) => {
    const res = await axios.delete(`${API_BASE_URL}/api/jobs/${jobId}`);
    return res.data;
  },

  // Rename job in history
  renameJob: async (jobId, newName) => {
    const res = await axios.patch(`${API_BASE_URL}/api/jobs/${jobId}/rename`, { job_name: newName });
    return res.data;
  },

  // Helper for full image URLs
  getImageUrl: (relativeUrl) => {
    if (!relativeUrl) return '';
    return relativeUrl.startsWith('http') ? relativeUrl : `${API_BASE_URL}${relativeUrl}`;
  },

  // Helper for export download links
  getExportUrl: (jobId, format) => {
    return `${API_BASE_URL}/api/jobs/${jobId}/export/${format}`;
  }
};
