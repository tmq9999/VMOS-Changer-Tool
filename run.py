"""Entry point — khởi động FastAPI backend."""
import sys
import os

# Thêm chính thư mục Tool vào path để import vmos_sdk (vendored) + backend
_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[os.path.join(_here, "backend")],
    )
