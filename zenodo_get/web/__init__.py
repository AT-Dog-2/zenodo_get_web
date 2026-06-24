#!/usr/bin/env python3
"""
Web interface for zenodo_get - a Flask-based web application
that provides a browser frontend for downloading Zenodo records.
"""

import fnmatch
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, render_template, request
from loguru import logger

from zenodo_get.downloader import _get_system_proxy, get_client, reset_client

app = Flask(__name__, static_folder="static", template_folder="templates")

MAX_TASKS = 50
TASKS_DIR = Path.home() / ".zenodo_get"
TASKS_FILE = TASKS_DIR / "web_tasks.json"
_tasks_lock = threading.Lock()
download_tasks: dict[str, dict[str, Any]] = {}


def _load_tasks_from_disk() -> None:
    if not TASKS_FILE.exists():
        return
    try:
        data = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
        for task_id, info in data.get("tasks", {}).items():
            callback = ProgressCallback(task_id)
            callback.status = info.get("status", "interrupted")
            if callback.status in ("running", "paused"):
                callback.status = "interrupted"
            callback.current_file = info.get("current_file", "")
            callback.current_file_progress = info.get("current_file_progress", 0)
            callback.total_files = info.get("total_files", 0)
            callback.completed_files = info.get("completed_files", 0)
            callback.total_size = info.get("total_size", 0)
            callback.downloaded_size = info.get("downloaded_size", 0)
            callback.messages = info.get("messages", [])[-50:]
            download_tasks[task_id] = {
                "callback": callback,
                "doi": info.get("doi", ""),
                "output_dir": info.get("output_dir", "."),
                "file_glob": info.get("file_glob", "*"),
                "selected_files": info.get("selected_files", []),
                "record_id": info.get("record_id", ""),
                "files": info.get("files", []),
                "cancel_event": threading.Event(),
                "pause_event": threading.Event(),
                "thread": None,
            }
    except Exception as exc:
        logger.warning(f"Failed to load task history: {exc}")


def _persist_task(task_id: str) -> None:
    if task_id not in download_tasks:
        return
    with _tasks_lock:
        try:
            TASKS_DIR.mkdir(parents=True, exist_ok=True)
            all_tasks: dict[str, Any] = {}
            if TASKS_FILE.exists():
                all_tasks = json.loads(TASKS_FILE.read_text(encoding="utf-8")).get("tasks", {})
            task = download_tasks[task_id]
            progress = task["callback"].get_progress()
            all_tasks[task_id] = {
                "doi": task["doi"],
                "output_dir": task["output_dir"],
                "file_glob": task["file_glob"],
                "selected_files": task.get("selected_files", []),
                "record_id": task.get("record_id", ""),
                "files": task.get("files", []),
                "status": progress["status"],
                "current_file": progress["current_file"],
                "current_file_progress": progress["current_file_progress"],
                "total_files": progress["total_files"],
                "completed_files": progress["completed_files"],
                "total_size": progress["total_size"],
                "downloaded_size": progress["downloaded_size"],
                "messages": progress["messages"][-50:],
            }
            TASKS_FILE.write_text(
                json.dumps({"tasks": all_tasks}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.warning(f"Failed to persist task {task_id}: {exc}")


def _delete_task_from_disk(task_id: str) -> None:
    with _tasks_lock:
        try:
            if not TASKS_FILE.exists():
                return
            data = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
            data.get("tasks", {}).pop(task_id, None)
            TASKS_FILE.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.warning(f"Failed to delete task {task_id} from disk: {exc}")


def init_web_client() -> None:
    """Reset HTTP client and verify Zenodo connectivity on startup."""
    _load_tasks_from_disk()
    reset_client()
    proxy = _get_system_proxy()
    if proxy:
        print(f"[zenodo_get] 使用系统代理: {proxy}")
    else:
        print("[zenodo_get] 未检测到系统代理，直连 Zenodo")
    try:
        get_client().get("https://zenodo.org/api/", timeout=10)
        print("[zenodo_get] Zenodo 连接正常")
    except Exception as exc:
        print(f"[zenodo_get] 警告: 无法连接 Zenodo - {_format_network_error(exc)}")


def _pick_directory(initial: str = "") -> str | None:
    """Open native OS folder picker dialog."""
    init_dir = initial if initial and os.path.isdir(initial) else str(Path.home())
    script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "root = tk.Tk()\n"
        "root.withdraw()\n"
        "root.attributes('-topmost', True)\n"
        f"path = filedialog.askdirectory(initialdir={init_dir!r})\n"
        "print(path or '')\n"
    )
    try:
        kwargs: dict[str, Any] = {
            "capture_output": True,
            "text": True,
            "timeout": 120,
        }
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        result = subprocess.run([sys.executable, "-c", script], **kwargs)
        path = result.stdout.strip()
        return path if path and os.path.isdir(path) else None
    except Exception as exc:
        logger.warning(f"Folder picker failed: {exc}")
        return None


def _open_directory(path: str) -> None:
    """Open a directory in the system file manager."""
    abs_path = os.path.abspath(path)
    if not os.path.isdir(abs_path):
        raise ValueError(f"目录不存在: {abs_path}")
    if os.name == "nt":
        os.startfile(abs_path)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", abs_path])
    else:
        subprocess.Popen(["xdg-open", abs_path])


def _filter_files(
    files: list[dict[str, Any]],
    file_glob: str,
    selected_files: list[str] | None,
) -> list[dict[str, Any]]:
    if selected_files:
        selected = set(selected_files)
        return [f for f in files if f["key"] in selected]
    if file_glob != "*":
        return [f for f in files if fnmatch.fnmatch(f["key"], file_glob)]
    return files


def _format_network_error(exc: Exception) -> str:
    msg = str(exc)
    if "getaddrinfo failed" in msg or "11004" in msg:
        return (
            "无法连接 Zenodo（DNS 解析失败）。"
            "请确认代理/VPN 已开启（如 Clash 端口 7897），"
            "或设置环境变量 HTTPS_PROXY。"
        )
    if "ConnectError" in type(exc).__name__ or "Connection refused" in msg:
        return "网络连接失败，请检查代理/VPN 是否正在运行。"
    return msg


class ProgressCallback:
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.lock = threading.Lock()
        self.status = "running"
        self.current_file = ""
        self.current_file_progress = 0
        self.total_files = 0
        self.completed_files = 0
        self.total_size = 0
        self.downloaded_size = 0
        self.messages: list[str] = []

    def update(self, **kwargs: Any) -> None:
        with self.lock:
            for key in (
                "status", "current_file", "current_file_progress",
                "total_files", "completed_files", "total_size", "downloaded_size",
            ):
                if key in kwargs:
                    setattr(self, key, kwargs[key])
            if "message" in kwargs:
                self.messages.append(kwargs["message"])
                if len(self.messages) > 100:
                    self.messages = self.messages[-50:]
        if "status" in kwargs or "completed_files" in kwargs or "message" in kwargs:
            _persist_task(self.task_id)

    def get_progress(self) -> dict[str, Any]:
        with self.lock:
            return {
                "task_id": self.task_id,
                "status": self.status,
                "current_file": self.current_file,
                "current_file_progress": self.current_file_progress,
                "total_files": self.total_files,
                "completed_files": self.completed_files,
                "total_size": self.total_size,
                "downloaded_size": self.downloaded_size,
                "messages": self.messages.copy(),
                "overall_progress": self._calculate_overall_progress(),
            }

    def _calculate_overall_progress(self) -> float:
        if self.total_files > 0:
            file_progress = (self.completed_files / self.total_files) * 100
            current_contrib = (self.current_file_progress / 100) / self.total_files * 100
            return min(file_progress + current_contrib, 100)
        return 0


def _cleanup_old_tasks() -> None:
    if len(download_tasks) <= MAX_TASKS:
        return
    finished = [
        tid for tid, t in download_tasks.items()
        if t["callback"].status in ("completed", "error")
    ]
    for tid in finished[: len(download_tasks) - MAX_TASKS]:
        download_tasks.pop(tid, None)


def get_record_id_from_doi(doi_or_record: str) -> str:
    """Extract record ID from DOI or return the record ID directly."""
    try:
        return str(int(doi_or_record))
    except ValueError:
        doi = doi_or_record
        for prefix in ("https://doi.org/", "http://doi.org/", "doi.org/"):
            if doi.startswith(prefix):
                doi = doi[len(prefix):]
                break

        client = get_client()
        response = client.head(f"https://doi.org/{doi}", follow_redirects=True)
        final_url = str(response.url)

        for marker in ("/records/", "/record/"):
            if marker in final_url:
                return final_url.split(marker)[-1].split("/")[0].split("?")[0]

        raise ValueError(f"无法从 URL 提取记录 ID: {final_url}")


def get_file_list(record_id: str) -> list[dict[str, Any]]:
    """Get list of files from Zenodo record."""
    client = get_client()
    response = client.get(f"https://zenodo.org/api/records/{record_id}")
    response.raise_for_status()
    data = response.json()

    files = []
    for file in data.get("files", []):
        files.append({
            "key": file.get("key", ""),
            "size": file.get("size", 0),
            "checksum": file.get("checksum", ""),
            "links": file.get("links", {}),
        })
    return files


def get_record_metadata(record_id: str) -> dict[str, Any]:
    """Fetch full record metadata."""
    client = get_client()
    response = client.get(f"https://zenodo.org/api/records/{record_id}")
    response.raise_for_status()
    return response.json()


def download_file_with_progress(
    url: str,
    filename: str,
    output_dir: str,
    callback: ProgressCallback,
    downloaded_so_far: int,
    cancel_event: threading.Event,
    pause_event: threading.Event,
    chunk_size: int = 8192,
) -> int:
    """Download a single file with progress updates. Returns updated downloaded size."""
    if cancel_event.is_set():
        raise InterruptedError("cancelled")

    output_path = Path(output_dir) / filename
    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = get_client()

    with client.stream("HEAD", url, timeout=30.0) as response:
        response.raise_for_status()
        total_size = int(response.headers.get("content-length", 0))

    existing_size = output_path.stat().st_size if output_path.exists() else 0
    if total_size > 0 and existing_size == total_size:
        callback.update(
            current_file=filename,
            current_file_progress=100,
            message=f"已存在，跳过: {filename}",
        )
        return downloaded_so_far + total_size

    resume_from = 0
    headers: dict[str, str] = {}
    file_mode = "wb"
    if existing_size > 0 and existing_size < total_size:
        resume_from = existing_size
        headers["Range"] = f"bytes={existing_size}-"
        file_mode = "ab"
        callback.update(message=f"断点续传: {filename} ({existing_size}/{total_size} bytes)")

    downloaded = resume_from
    callback.update(
        current_file=filename,
        current_file_progress=(downloaded / total_size * 100) if total_size else 0,
        message=f"开始下载: {filename} ({total_size / (1024 * 1024):.2f} MB)",
    )

    with client.stream("GET", url, headers=headers, timeout=30.0) as response:
        response.raise_for_status()
        with output_path.open(file_mode) as f:
            for chunk in response.iter_bytes(chunk_size=chunk_size):
                while pause_event.is_set() and not cancel_event.is_set():
                    time.sleep(0.3)
                if cancel_event.is_set():
                    raise InterruptedError("cancelled")
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    progress = (downloaded / total_size) * 100
                    callback.update(
                        current_file_progress=progress,
                        downloaded_size=downloaded_so_far + downloaded,
                    )

    file_bytes = total_size if total_size > 0 else downloaded
    callback.update(
        current_file_progress=100,
        downloaded_size=downloaded_so_far + file_bytes,
        message=f"完成: {filename}",
    )
    return downloaded_so_far + file_bytes


def _wait_if_paused(task_id: str) -> None:
    task = download_tasks[task_id]
    while task["pause_event"].is_set():
        if task["cancel_event"].is_set():
            raise InterruptedError("cancelled")
        time.sleep(0.3)


def download_worker(
    task_id: str,
    record_or_doi: str,
    output_dir: str,
    file_glob: str = "*",
    selected_files: list[str] | None = None,
    resume: bool = False,
) -> None:
    callback = download_tasks[task_id]["callback"]
    cancel_event = download_tasks[task_id]["cancel_event"]
    pause_event = download_tasks[task_id]["pause_event"]
    try:
        callback.update(status="running", message="正在解析 DOI...")

        record_id = download_tasks[task_id].get("record_id") or get_record_id_from_doi(record_or_doi)
        download_tasks[task_id]["record_id"] = record_id
        callback.update(message=f"记录 ID: {record_id}")

        files = download_tasks[task_id].get("files") or get_file_list(record_id)
        if not resume or not files:
            files = _filter_files(files, file_glob, selected_files)
        download_tasks[task_id]["files"] = files

        if not files:
            callback.update(status="error", message="没有匹配的文件")
            return

        total_size = sum(f["size"] for f in files)
        total_files = len(files)
        start_index = callback.completed_files if resume else 0

        if not resume:
            downloaded_so_far = sum(
                f["size"] for f in files[:start_index]
                if (Path(output_dir) / f["key"]).exists()
                and (Path(output_dir) / f["key"]).stat().st_size == f["size"]
            )
        else:
            downloaded_so_far = callback.downloaded_size

        callback.update(
            total_files=total_files,
            total_size=total_size,
            message=f"找到 {total_files} 个文件，共 {total_size / (1024 ** 3):.2f} GB",
        )
        _persist_task(task_id)

        for i in range(start_index, len(files)):
            _wait_if_paused(task_id)
            if cancel_event.is_set():
                callback.update(status="cancelled", message="下载已取消")
                return

            file = files[i]
            filename = file["key"]
            download_url = file["links"].get("self", "")
            if not download_url:
                download_url = (
                    f"https://zenodo.org/api/records/{record_id}"
                    f"/files/{filename}/content"
                )

            downloaded_so_far = download_file_with_progress(
                download_url, filename, output_dir, callback,
                downloaded_so_far, cancel_event, pause_event,
            )
            callback.update(
                completed_files=i + 1,
                current_file_progress=100,
                downloaded_size=downloaded_so_far,
            )

        callback.update(
            status="completed",
            message=f"下载完成！共 {total_files} 个文件",
        )

    except InterruptedError:
        if pause_event.is_set() and not cancel_event.is_set():
            callback.update(status="paused", message="下载已暂停")
        else:
            callback.update(status="cancelled", message="下载已取消")
    except Exception as e:
        import traceback
        callback.update(status="error", message=f"下载失败: {e}")
        logger.error(f"Download error: {traceback.format_exc()}")


def _start_task_thread(task_id: str, resume: bool = False) -> None:
    task = download_tasks[task_id]
    task["cancel_event"] = threading.Event()
    task["pause_event"] = threading.Event()
    thread = threading.Thread(
        target=download_worker,
        args=(
            task_id,
            task["doi"],
            task["output_dir"],
            task["file_glob"],
            task.get("selected_files") or None,
            resume,
        ),
        daemon=True,
    )
    task["thread"] = thread
    thread.start()


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/default_dir")
def default_dir() -> Response:
    home = Path.home()
    candidates = [
        home / "Downloads",
        home / "下载",
        home / "Desktop",
        home / "桌面",
    ]
    for path in candidates:
        if path.is_dir():
            return jsonify({"path": str(path)})
    return jsonify({"path": str(home)})


@app.route("/api/download", methods=["POST"])
def start_download() -> Response:
    data = request.json
    if not data or "doi" not in data:
        return jsonify({"error": "DOI is required"}), 400

    doi = data["doi"].strip()
    output_dir = data.get("output_dir", ".").strip() or "."
    file_glob = data.get("file_glob", "*").strip() or "*"
    selected_files = data.get("selected_files") or None
    if selected_files is not None and not isinstance(selected_files, list):
        return jsonify({"error": "selected_files must be a list"}), 400

    if not doi:
        return jsonify({"error": "DOI cannot be empty"}), 400

    if selected_files is not None and len(selected_files) == 0:
        return jsonify({"error": "请至少选择一个文件"}), 400

    task_id = str(uuid.uuid4())
    callback = ProgressCallback(task_id)

    download_tasks[task_id] = {
        "callback": callback,
        "doi": doi,
        "output_dir": output_dir,
        "file_glob": file_glob,
        "selected_files": selected_files or [],
        "record_id": "",
        "files": [],
        "cancel_event": threading.Event(),
        "pause_event": threading.Event(),
        "thread": None,
    }
    _cleanup_old_tasks()
    _start_task_thread(task_id)

    return jsonify({"task_id": task_id})


@app.route("/api/progress/<task_id>")
def get_progress(task_id: str) -> Response:
    if task_id not in download_tasks:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(download_tasks[task_id]["callback"].get_progress())


@app.route("/api/progress/sse/<task_id>")
def progress_sse(task_id: str) -> Response:
    if task_id not in download_tasks:
        return jsonify({"error": "Task not found"}), 404

    def generate():
        import json
        import time

        callback = download_tasks[task_id]["callback"]
        while True:
            progress = callback.get_progress()
            yield f"data: {json.dumps(progress)}\n\n"
            if progress["status"] in ("completed", "error", "cancelled"):
                break
            time.sleep(0.5)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/tasks")
def list_tasks() -> Response:
    tasks = {}
    for task_id, task_info in download_tasks.items():
        progress = task_info["callback"].get_progress()
        tasks[task_id] = {
            "task_id": task_id,
            "doi": task_info["doi"],
            "output_dir": task_info["output_dir"],
            "file_glob": task_info["file_glob"],
            "status": progress["status"],
            "completed_files": progress["completed_files"],
            "total_files": progress["total_files"],
            "overall_progress": progress["overall_progress"],
            "downloaded_size": progress["downloaded_size"],
            "total_size": progress["total_size"],
        }
    return jsonify(tasks)


@app.route("/api/tasks/<task_id>/pause", methods=["POST"])
def pause_task(task_id: str) -> Response:
    if task_id not in download_tasks:
        return jsonify({"error": "Task not found"}), 404
    task = download_tasks[task_id]
    status = task["callback"].status
    if status != "running":
        return jsonify({"error": f"任务状态为 {status}，无法暂停"}), 400
    task["pause_event"].set()
    task["callback"].update(status="paused", message="下载已暂停")
    return jsonify({"ok": True, "status": "paused"})


@app.route("/api/tasks/<task_id>/resume", methods=["POST"])
def resume_task(task_id: str) -> Response:
    if task_id not in download_tasks:
        return jsonify({"error": "Task not found"}), 404
    task = download_tasks[task_id]
    status = task["callback"].status
    if status == "running":
        task["pause_event"].clear()
        return jsonify({"ok": True, "status": "running"})
    if status == "paused":
        if task["thread"] and task["thread"].is_alive():
            task["pause_event"].clear()
            task["callback"].update(status="running", message="继续下载...")
            return jsonify({"ok": True, "status": "running"})
        task["callback"].update(status="running", message="继续下载...")
        _start_task_thread(task_id, resume=True)
        return jsonify({"ok": True, "status": "running"})
    if status in ("interrupted", "cancelled", "error"):
        task["callback"].update(status="running", message="继续下载...")
        _start_task_thread(task_id, resume=True)
        return jsonify({"ok": True, "status": "running"})
    if status == "completed":
        return jsonify({"error": "任务已完成"}), 400
    return jsonify({"error": f"无法恢复状态: {status}"}), 400


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id: str) -> Response:
    if task_id not in download_tasks:
        return jsonify({"error": "Task not found"}), 404
    task = download_tasks[task_id]
    if task["callback"].status == "running":
        task["cancel_event"].set()
        task["pause_event"].clear()
    download_tasks.pop(task_id, None)
    _delete_task_from_disk(task_id)
    return jsonify({"ok": True})


@app.route("/api/validate_doi", methods=["POST"])
def validate_doi() -> Response:
    data = request.json
    if not data or "doi" not in data:
        return jsonify({"error": "DOI is required"}), 400

    doi = data["doi"].strip()
    if not doi:
        return jsonify({"error": "DOI cannot be empty"}), 400

    try:
        record_id = get_record_id_from_doi(doi)
        metadata = get_record_metadata(record_id)
        files = get_file_list(record_id)
        total_size = sum(f["size"] for f in files)

        return jsonify({
            "valid": True,
            "record_id": record_id,
            "title": metadata.get("metadata", {}).get("title", "Unknown"),
            "files_count": len(files),
            "total_size": total_size,
            "files": files,
        })
    except Exception as e:
        return jsonify({"valid": False, "error": _format_network_error(e)})


@app.route("/api/pick_dir", methods=["POST"])
def pick_dir() -> Response:
    data = request.json or {}
    initial = data.get("path", "").strip()
    try:
        selected = _pick_directory(initial)
        if not selected:
            return jsonify({"cancelled": True})
        return jsonify({"path": selected})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/open_dir", methods=["POST"])
def open_dir() -> Response:
    data = request.json or {}
    path = data.get("path", "").strip()
    if not path:
        return jsonify({"error": "路径不能为空"}), 400
    try:
        _open_directory(path)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/browse_dir", methods=["POST"])
def browse_directory() -> Response:
    data = request.json
    path = data.get("path", ".")

    try:
        abs_path = os.path.abspath(path)
        if not os.path.isdir(abs_path):
            return jsonify({"error": f"目录不存在或无效: {abs_path}"}), 400

        entries = []
        for entry in os.listdir(abs_path):
            entry_path = os.path.join(abs_path, entry)
            try:
                if os.path.isdir(entry_path):
                    entries.append({"name": entry, "path": entry_path, "is_dir": True})
            except PermissionError:
                pass

        entries.sort(key=lambda x: x["name"].lower())

        parent = os.path.dirname(abs_path)
        is_root = (
            abs_path == "/"
            or (os.name == "nt" and len(abs_path) == 3 and abs_path[1:] == ":\\")
        )

        return jsonify({
            "path": abs_path,
            "parent": parent if not is_root and parent != abs_path else None,
            "entries": entries,
        })
    except PermissionError:
        return jsonify({"error": f"没有权限访问目录: {path}"}), 400
    except Exception as e:
        return jsonify({"error": f"错误: {e}"}), 400
