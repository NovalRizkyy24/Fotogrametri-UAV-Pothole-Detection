from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging

from backend.app.config import STORAGE_DIR, RESULTS_DIR
from backend.app.routers import jobs

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="API Deteksi & Estimasi Dimensi Lubang Jalan (YOLOv8-seg + SfM-DSM)",
    description="Backend API untuk memproses GeoTIFF Orthomosaic & DSM, deteksi YOLOv8-seg, RANSAC 3D plane fitting, dan ekspor metrik fisik lubang.",
    version="1.0.0"
)

# Enable CORS for frontend Vite dev server & production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Files directory for serving generated result PNGs and 3D meshes
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")
app.mount("/results", StaticFiles(directory=str(RESULTS_DIR)), name="results")

# Include API Routers
app.include_router(jobs.router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Pothole Detection & Volume Estimation API",
        "version": "1.0.0",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
