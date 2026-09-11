import subprocess
import sys
import time
import os
from pathlib import Path

def main():
    root_dir = Path(__file__).resolve().parent

    print("==========================================================================")
    print(" 🚀 MEMULAI SERVER BACKEND FASTAPI & FRONTEND VITE REACT")
    print("==========================================================================")
    print("  Backend API  : http://localhost:8000")
    print("  API Docs     : http://localhost:8000/docs")
    print("  Frontend UI  : http://localhost:5173")
    print("==========================================================================")

    # Launch FastAPI backend
    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    backend_proc = subprocess.Popen(backend_cmd, cwd=str(root_dir))

    # Launch Vite frontend
    frontend_dir = root_dir / "frontend"
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_cmd = [npm_cmd, "run", "dev"]
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=str(frontend_dir))

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nStopping servers...")
        backend_proc.terminate()
        frontend_proc.terminate()

if __name__ == "__main__":
    main()
