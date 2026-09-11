from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class JobCreateOptions(BaseModel):
    conf_threshold: float = Field(0.60, ge=0.01, le=1.0)
    buffer_px: int = Field(15, ge=1, le=100)

class ValidationPoint(BaseModel):
    x: int
    y: int
    kedalaman_cm: float

class PotholeMetric(BaseModel):
    instance_id: int
    depth_max_cm: float
    depth_max_m: float
    depth_mean_cm: float
    depth_mean_m: float
    area_m2: float
    volume_m3: float
    n_points: Optional[int] = 0
    is_downsampled: Optional[bool] = False
    depth_points_cm: Optional[List[float]] = []
    depth_points_detail: Optional[List[Dict[str, Any]]] = []
    # Geometric validation points (tengah/kiri/kanan/atas/bawah) for comparison against
    # manual field measurements taken at the same 5 relative positions. See depth.py::compute_validation_points.
    titik_validasi: Optional[Dict[str, ValidationPoint]] = None
    # Triangulated surface of the fitted RANSAC reference plane, clipped to this pothole's own mask
    # contour: {"vertices": [[X,Y,Z], ...] (real-world coords), "faces": [[i,j,k], ...]}. Used to
    # render the plane inside the 3D mesh viewer.
    reference_plane_mesh: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = None  # YOLOv8-seg detection confidence (0-1)
    bbox: List[int] # [xmin, ymin, xmax, ymax]

class JobResultResponse(BaseModel):
    job_id: str
    job_name: Optional[str] = None
    status: str
    created_at: str
    n_potholes: int
    total_volume_m3: float
    max_depth_cm: float
    potholes: List[PotholeMetric]
    gsd_cm: float
    images: Dict[str, str]
    mesh: Optional[Dict[str, str]] = None
    export: Dict[str, str]

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued | processing | done | failed
    progress: float  # 0.0 to 1.0
    stage: str
    error: Optional[str] = None
    # Live per-pothole RANSAC fitting log (ring size, trial/inlier count, resulting depth),
    # appended to as each instance's fit completes during the "RANSAC 3D Surface Fitting" stage.
    ransac_log: Optional[List[str]] = None
