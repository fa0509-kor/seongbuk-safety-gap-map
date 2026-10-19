"""테스트는 임시 폴더의 SQLite·사진 폴더와 Mock AI로만 돈다 (실제 키·DB를 건드리지 않음)."""
import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="sbgap-test-")
os.environ["VAR_DIR"] = _tmp
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(Path(_tmp, "uploads"))
os.environ["STORAGE"] = "local"
os.environ["VISION_PROVIDER"] = "mock"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # 저장소 루트
