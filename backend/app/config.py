import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
RESULTS_DIR = STORAGE_DIR / "results"
SAMPLE_DIR = STORAGE_DIR / "samples"
MODELS_DIR = BASE_DIR / "models_weights"

# Ensure directories exist
for folder in [UPLOADS_DIR, RESULTS_DIR, SAMPLE_DIR, MODELS_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

DEFAULT_MODEL_PATH = MODELS_DIR / "best.pt"
if not DEFAULT_MODEL_PATH.exists():
    if (PROJECT_ROOT / "best.pt").exists():
        import shutil
        shutil.copy(PROJECT_ROOT / "best.pt", MODELS_DIR / "best.pt")
        DEFAULT_MODEL_PATH = MODELS_DIR / "best.pt"
    elif (MODELS_DIR / "ModelTerbaik.pt").exists():
        DEFAULT_MODEL_PATH = MODELS_DIR / "ModelTerbaik.pt"

# Default Processing Hyperparameters
DEFAULT_CONF_THRESHOLD = 0.60
DEFAULT_BUFFER_PX = 15

# How far the 4 edge validation points (kiri/kanan/atas/bawah) sit from the pothole's deepest point,
# as a fraction of the distance from that deepest point to the mask's edge in each direction
# (0.0 = right on top of the deepest point, 1.0 = right at the mask edge). 0.6 keeps them well
# separated from the deepest point while leaving a ~40% margin from the shallow edge/transition zone.
# Empirical value — tune once field-measurement validation results are available.
DEFAULT_OFFSET_RATIO = 0.6
