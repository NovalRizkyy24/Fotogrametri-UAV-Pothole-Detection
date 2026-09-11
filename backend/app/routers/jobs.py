from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException, Response
from fastapi.responses import FileResponse, JSONResponse
import uuid
import json
import shutil
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import logging

from backend.app.config import (
    UPLOADS_DIR, RESULTS_DIR, MODELS_DIR, DEFAULT_MODEL_PATH,
    DEFAULT_CONF_THRESHOLD, DEFAULT_BUFFER_PX, DEFAULT_OFFSET_RATIO
)
from backend.app.schemas import JobStatusResponse, JobResultResponse
from backend.app.services.sample_generator import generate_sample_dataset
from backend.app.services.mesh_service import generate_sample_mesh
from backend.app.services.validation import validate_and_align_geotiffs
from backend.app.services.inference import run_pothole_detection
from backend.app.services.depth import compute_depth_and_volume
from backend.app.services.visualize import generate_visualization_images

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# In-Memory Job Storage Database (Persistent to JSON on disk)
JOBS_DB: Dict[str, Dict] = {}
HISTORY_FILE = RESULTS_DIR / "jobs_history.json"

def load_jobs_history():
    global JOBS_DB
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r") as f:
                JOBS_DB = json.load(f)
        except Exception as e:
            logger.error(f"Error loading jobs history: {e}")

def save_jobs_history():
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(JOBS_DB, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving jobs history: {e}")

load_jobs_history()

def process_job_task(
    job_id: str,
    ortho_path: str,
    dsm_path: str,
    model_path: str,
    conf_threshold: float,
    buffer_px: int,
    mesh_paths: Optional[Dict[str, str]] = None
):
    try:
        job = JOBS_DB[job_id]
        job["status"] = "processing"
        job["progress"] = 0.1
        job["stage"] = "Validasi dan Penyejajaran Grid GeoTIFF (CRS & GSD)"
        save_jobs_history()

        job_dir = RESULTS_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        aligned_dsm_path = str(job_dir / "aligned_dsm.tif")

        # 1. Validation & Reprojection
        val_meta = validate_and_align_geotiffs(ortho_path, dsm_path, aligned_dsm_path)
        gsd_m = val_meta["gsd_m"]
        job["gsd_m"] = gsd_m
        job["progress"] = 0.3
        job["stage"] = "Inferensi YOLOv8-seg (Deteksi Citra Penuh)"
        save_jobs_history()

        # 2. YOLOv8 Detection
        instance_mask_map, instances = run_pothole_detection(
            ortho_path=ortho_path,
            model_path=model_path,
            conf_threshold=conf_threshold
        )

        job["progress"] = 0.6
        job["stage"] = "Analisis Elevasi DSM & RANSAC 3D Surface Fitting"
        job["ransac_log"] = []
        save_jobs_history()

        # 3. Depth & Volume Calculation via RANSAC
        # Live per-pothole progress: fills 0.6 -> 0.8 of the overall bar as each instance's RANSAC
        # fit completes, and appends a human-readable line (ring size, RANSAC trial/inlier count,
        # resulting depth) to job["ransac_log"] so the frontend can show what is actually happening
        # inside this stage instead of one static label.
        def _on_ransac_progress(idx: int, total: int, message: str):
            job["progress"] = 0.6 + 0.2 * (idx / total if total else 1)
            job["stage"] = f"RANSAC 3D Surface Fitting ({idx}/{total} lubang)"
            job["ransac_log"].append(message)
            save_jobs_history()

        depth_heatmap, metrics = compute_depth_and_volume(
            dsm_path=aligned_dsm_path,
            instance_mask_map=instance_mask_map,
            instances=instances,
            gsd_m=gsd_m,
            buffer_px=buffer_px,
            offset_ratio=DEFAULT_OFFSET_RATIO,
            on_progress=_on_ransac_progress
        )

        job["progress"] = 0.85
        job["stage"] = "Menghasilkan Gambar Visualisasi & Peta Kedalaman"
        save_jobs_history()

        # 4. Generate Visualizations
        image_urls = generate_visualization_images(
            ortho_path=ortho_path,
            instance_mask_map=instance_mask_map,
            depth_heatmap=depth_heatmap,
            metrics=metrics,
            output_dir=job_dir
        )

        # 5. Process 3D Mesh Files if provided
        mesh_urls = None
        if mesh_paths:
            mesh_out_dir = job_dir / "mesh"
            mesh_out_dir.mkdir(parents=True, exist_ok=True)

            obj_dst = mesh_out_dir / Path(mesh_paths["obj"]).name
            mtl_dst = mesh_out_dir / Path(mesh_paths["mtl"]).name
            tex_dst = mesh_out_dir / Path(mesh_paths["texture"]).name

            if not obj_dst.exists() and Path(mesh_paths["obj"]).exists():
                shutil.copy(mesh_paths["obj"], obj_dst)
            if not mtl_dst.exists() and Path(mesh_paths["mtl"]).exists():
                shutil.copy(mesh_paths["mtl"], mtl_dst)
            if not tex_dst.exists() and Path(mesh_paths["texture"]).exists():
                shutil.copy(mesh_paths["texture"], tex_dst)

            mesh_urls = {
                "obj": f"/storage/results/{job_id}/mesh/{obj_dst.name}",
                "mtl": f"/storage/results/{job_id}/mesh/{mtl_dst.name}",
                "texture": f"/storage/results/{job_id}/mesh/{tex_dst.name}"
            }

        # 6. Summaries & Finalize
        total_vol = sum(m["volume_m3"] for m in metrics)
        max_d = max((m["depth_max_cm"] for m in metrics), default=0.0)

        # Export CSV and XLSX
        df = pd.DataFrame(metrics)
        # Validation columns: flatten titik_validasi (tengah/kiri/kanan/atas/bawah) from each row's
        # nested dict into 5 top-level "Sistem_*" columns (cm), for offline comparison against
        # field-measured depths taken at the same 5 positions.
        validation_cols = {
            "tengah": "Sistem_Tengah",
            "kiri": "Sistem_Kiri",
            "kanan": "Sistem_Kanan",
            "atas": "Sistem_Atas",
            "bawah": "Sistem_Bawah",
        }
        if not df.empty:
            for point_key, col_name in validation_cols.items():
                df[col_name] = df["titik_validasi"].apply(
                    lambda tv, k=point_key: tv.get(k, {}).get("kedalaman_cm") if isinstance(tv, dict) else None
                )
            df_export = df.drop(columns=["bbox", "depth_points_cm", "depth_points_detail", "titik_validasi", "reference_plane_mesh"], errors="ignore")
        else:
            df_export = pd.DataFrame(columns=[
                "instance_id", "depth_max_cm", "depth_max_m", "depth_mean_cm", "depth_mean_m",
                "area_m2", "volume_m3", *validation_cols.values()
            ])

        csv_path = job_dir / "potholes_result.csv"
        xlsx_path = job_dir / "potholes_result.xlsx"
        df_export.to_csv(csv_path, index=False)
        df_export.to_excel(xlsx_path, index=False, engine='openpyxl')

        job["status"] = "done"
        job["progress"] = 1.0
        job["stage"] = "Pemrosesan Selesai"
        job["result"] = {
            "job_id": job_id,
            "job_name": job.get("job_name", f"Survei Photogrammetry #{job_id[:8]}"),
            "status": "done",
            "created_at": job["created_at"],
            "n_potholes": len(metrics),
            "total_volume_m3": round(total_vol, 6),
            "max_depth_cm": round(max_d, 2),
            "potholes": metrics,
            "gsd_cm": round(gsd_m * 100, 2),
            "images": image_urls,
            "mesh": mesh_urls,
            "export": {
                "csv": f"/api/jobs/{job_id}/export/csv",
                "excel": f"/api/jobs/{job_id}/export/xlsx"
            }
        }
        save_jobs_history()

    except Exception as e:
        logger.exception(f"Error processing job {job_id}: {e}")
        job["status"] = "failed"
        job["stage"] = f"Gagal: {str(e)}"
        job["error"] = str(e)
        save_jobs_history()

@router.get("/models")
async def list_available_models():
    """Lists YOLOv8-seg model weights deployed on the server, so the frontend can offer a picker
    instead of requiring every user to upload their own .pt file."""
    default_name = DEFAULT_MODEL_PATH.name
    models = []
    for pt_file in sorted(MODELS_DIR.glob("*.pt")):
        models.append({
            "name": pt_file.name,
            "size_mb": round(pt_file.stat().st_size / (1024 * 1024), 1),
            "is_default": pt_file.name == default_name
        })
    # Make sure the default model is always listed first even if filename sorting puts it elsewhere
    models.sort(key=lambda m: (not m["is_default"], m["name"]))
    return {"models": models, "default_model": default_name}

@router.post("")
async def create_job(
    background_tasks: BackgroundTasks,
    orthomosaic: UploadFile = File(...),
    dsm: UploadFile = File(...),
    job_name: Optional[str] = Form(None),
    model_name: Optional[str] = Form(None),
    custom_model: Optional[UploadFile] = File(None),
    mesh_obj: Optional[UploadFile] = File(None),
    mesh_mtl: Optional[UploadFile] = File(None),
    mesh_texture: Optional[UploadFile] = File(None),
    conf_threshold: float = Form(DEFAULT_CONF_THRESHOLD),
    buffer_px: int = Form(DEFAULT_BUFFER_PX)
):
    job_id = str(uuid.uuid4())
    created_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    final_job_name = job_name.strip() if (job_name and job_name.strip()) else f"Survei Photogrammetry #{job_id[:8]}"

    job_dir = UPLOADS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    ortho_path = job_dir / f"orthomosaic_{orthomosaic.filename}"
    dsm_path = job_dir / f"dsm_{dsm.filename}"

    with open(ortho_path, "wb") as f:
        shutil.copyfileobj(orthomosaic.file, f)

    with open(dsm_path, "wb") as f:
        shutil.copyfileobj(dsm.file, f)

    if custom_model:
        # Uploaded ad-hoc model takes priority over a picked one from the server's model list.
        model_path = job_dir / f"model_{custom_model.filename}"
        with open(model_path, "wb") as f:
            shutil.copyfileobj(custom_model.file, f)
    elif model_name:
        # Selected from the server-deployed model list. Resolve against MODELS_DIR only (via the
        # filename, not a client-supplied path) to prevent path traversal, and fall back to the
        # default model if the name doesn't match a real deployed file.
        candidate_path = MODELS_DIR / Path(model_name).name
        model_path = candidate_path if candidate_path.exists() else DEFAULT_MODEL_PATH
    else:
        model_path = DEFAULT_MODEL_PATH

    mesh_paths = None
    if mesh_obj and mesh_mtl and mesh_texture:
        obj_p = job_dir / mesh_obj.filename
        mtl_p = job_dir / mesh_mtl.filename
        tex_p = job_dir / mesh_texture.filename

        with open(obj_p, "wb") as f:
            shutil.copyfileobj(mesh_obj.file, f)
        with open(mtl_p, "wb") as f:
            shutil.copyfileobj(mesh_mtl.file, f)
        with open(tex_p, "wb") as f:
            shutil.copyfileobj(mesh_texture.file, f)

        mesh_paths = {
            "obj": str(obj_p),
            "mtl": str(mtl_p),
            "texture": str(tex_p)
        }

    JOBS_DB[job_id] = {
        "job_id": job_id,
        "job_name": final_job_name,
        "status": "queued",
        "progress": 0.0,
        "stage": "Dalam antrean pemrosesan",
        "created_at": created_now,
        "options": {
            "conf_threshold": conf_threshold,
            "buffer_px": buffer_px,
            "model_used": model_path.name  # for reproducibility — which weights produced this result
        }
    }
    save_jobs_history()

    background_tasks.add_task(
        process_job_task,
        job_id=job_id,
        ortho_path=str(ortho_path),
        dsm_path=str(dsm_path),
        model_path=str(model_path),
        conf_threshold=conf_threshold,
        buffer_px=buffer_px,
        mesh_paths=mesh_paths
    )

    return JSONResponse(status_code=202, content={"job_id": job_id, "status": "queued"})

@router.post("/sample")
async def create_sample_job(background_tasks: BackgroundTasks):
    """Triggers instant processing on synthetic sample GeoTIFF dataset and 3D mesh."""
    ortho_path, dsm_path = generate_sample_dataset()
    obj_p, mtl_p, tex_p = generate_sample_mesh()

    job_id = str(uuid.uuid4())

    mesh_paths = {
        "obj": str(obj_p),
        "mtl": str(mtl_p),
        "texture": str(tex_p)
    }

    JOBS_DB[job_id] = {
        "job_id": job_id,
        "job_name": "Sample Dataset Survei Jalan (GeoTIFF & 3D Mesh)",
        "status": "queued",
        "progress": 0.0,
        "stage": "Sample dataset dalam antrean pemrosesan",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "options": {
            "conf_threshold": DEFAULT_CONF_THRESHOLD,
            "buffer_px": DEFAULT_BUFFER_PX
        }
    }
    save_jobs_history()

    background_tasks.add_task(
        process_job_task,
        job_id=job_id,
        ortho_path=str(ortho_path),
        dsm_path=str(dsm_path),
        model_path=str(DEFAULT_MODEL_PATH),
        conf_threshold=DEFAULT_CONF_THRESHOLD,
        buffer_px=DEFAULT_BUFFER_PX,
        mesh_paths=mesh_paths
    )

    return JSONResponse(status_code=202, content={"job_id": job_id, "status": "queued"})

@router.get("")
async def list_jobs():
    """Returns list of job histories."""
    jobs_list = []
    for j_id, data in JOBS_DB.items():
        res = data.get("result", {})
        default_name = f"Survei Photogrammetry #{j_id[:8]}"
        jobs_list.append({
            "job_id": j_id,
            "job_name": data.get("job_name", default_name),
            "status": data["status"],
            "created_at": data["created_at"],
            "n_potholes": res.get("n_potholes", 0),
            "total_volume_m3": res.get("total_volume_m3", 0.0),
            "max_depth_cm": res.get("max_depth_cm", 0.0)
        })
    return sorted(jobs_list, key=lambda x: x["created_at"], reverse=True)

@router.patch("/{job_id}/rename")
async def rename_job(job_id: str, payload: Dict[str, Any]):
    if job_id not in JOBS_DB:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    new_name = str(payload.get("job_name", "")).strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Nama job tidak boleh kosong")
    
    JOBS_DB[job_id]["job_name"] = new_name
    if "result" in JOBS_DB[job_id] and isinstance(JOBS_DB[job_id]["result"], dict):
        JOBS_DB[job_id]["result"]["job_name"] = new_name
    
    save_jobs_history()
    return {"status": "success", "job_id": job_id, "job_name": new_name}

@router.get("/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in JOBS_DB:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    data = JOBS_DB[job_id]
    return {
        "job_id": job_id,
        "status": data["status"],
        "progress": data["progress"],
        "stage": data["stage"],
        "error": data.get("error"),
        "ransac_log": data.get("ransac_log", [])
    }

@router.get("/{job_id}/result")
async def get_job_result(job_id: str):
    if job_id not in JOBS_DB:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    data = JOBS_DB[job_id]
    if data["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Job belum selesai (status: {data['status']})")
    return data["result"]

@router.get("/{job_id}/export/{format_type}")
async def export_job_data(job_id: str, format_type: str):
    job_dir = RESULTS_DIR / job_id
    if format_type == "csv":
        file_path = job_dir / "potholes_result.csv"
        media = "text/csv"
    elif format_type == "xlsx":
        file_path = job_dir / "potholes_result.xlsx"
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise HTTPException(status_code=400, detail="Format tidak valid (csv/xlsx)")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File ekspor tidak ditemukan")

    return FileResponse(path=file_path, filename=file_path.name, media_type=media)

@router.delete("/{job_id}")
async def delete_job(job_id: str):
    if job_id not in JOBS_DB:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")
    
    del JOBS_DB[job_id]
    save_jobs_history()

    res_dir = RESULTS_DIR / job_id
    if res_dir.exists():
        shutil.rmtree(res_dir, ignore_errors=True)

    up_dir = UPLOADS_DIR / job_id
    if up_dir.exists():
        shutil.rmtree(up_dir, ignore_errors=True)

    return {"status": "success", "message": f"Job {job_id} berhasil dihapus"}
