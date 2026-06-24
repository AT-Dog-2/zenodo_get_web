let currentTaskId = null;
let eventSource = null;
let downloadLogs = [];
let validatedFiles = [];
let validatedDoi = '';
let fileSelectionState = {};
const STORAGE_KEY = 'zenodo_active_task_id';
const LANG_STORAGE_KEY = 'zenodo_language';

let currentLang = 'zh';

const translations = {
    zh: {
        appTitle: 'Zenodo Downloader',
        appSubtitle: '从 Zenodo 研究数据仓库下载记录文件',
        doiLabel: 'DOI 或记录 ID',
        doiPlaceholder: '10.5281/zenodo.1234567 或 1234567',
        validateBtn: '验证',
        selectFiles: '选择文件',
        selectAll: '全选',
        deselectAll: '全不选',
        invertSelection: '反选',
        filterPlaceholder: '筛选文件名...',
        downloadDir: '下载目录',
        dirPlaceholder: '选择保存路径',
        browseDir: '选择...',
        openDir: '打开',
        startDownload: '开始下载',
        downloadStatus: '下载状态',
        waiting: '等待开始',
        paused: '暂停',
        resume: '继续',
        delete: '删除',
        progress: '进度',
        files: '文件',
        downloaded: '已下载',
        speed: '速度',
        current: '当前:',
        log: '日志',
        logCount: '{count} 条',
        logPlaceholder: '验证 DOI 并选择文件后开始下载',
        taskHistory: '历史任务',
        file: '文件',
        noMatchingFiles: '没有匹配的文件',
        selected: '已选 {selected}/{total} 个文件，共 {size}',
        validating: '验证中',
        validatingText: '正在验证...',
        validationSuccess: '验证成功',
        validationFailed: '验证失败',
        networkError: '网络错误',
        enterDoi: '请输入 DOI 或记录 ID',
        validateFirst: '请先点击「验证」获取文件列表',
        selectAtLeastOne: '请至少选择一个文件',
        selectingDir: '正在选择目录...',
        cannotOpenDir: '无法打开目录',
        started: '启动中',
        starting: '正在启动...',
        downloadInProgress: '<span class="spinner"></span> 下载进行中...',
        pausing: '正在暂停...',
        downloadPaused: '已暂停',
        downloadCompleted: '下载完成',
        downloadCancelled: '已取消',
        downloadInterrupted: '已中断（可点击继续恢复）',
        downloadError: '下载失败',
        downloadPausedToast: '下载已暂停',
        resumeDownload: '继续下载',
        cannotResume: '无法恢复',
        confirmDelete: '确定删除此任务记录吗？已下载的文件不会被删除。',
        taskDeleted: '任务已删除',
        completed: '完成',
        downloading: '下载中',
        running: '下载中',
        error: '失败',
        interrupted: '已中断',
        cancelled: '已取消',
        recordId: '记录 ID',
        unknownError: '未知错误',
        startFailed: '启动失败',
        startError: '启动错误: ',
        cannotOpenFolderPicker: '无法打开文件夹选择器: ',
        enterDownloadDir: '请先填写或选择下载目录',
    },
    en: {
        appTitle: 'Zenodo Downloader',
        appSubtitle: 'Download files from Zenodo research data repository',
        doiLabel: 'DOI or Record ID',
        doiPlaceholder: '10.5281/zenodo.1234567 or 1234567',
        validateBtn: 'Validate',
        selectFiles: 'Select Files',
        selectAll: 'Select All',
        deselectAll: 'Deselect All',
        invertSelection: 'Invert',
        filterPlaceholder: 'Filter filenames...',
        downloadDir: 'Download Directory',
        dirPlaceholder: 'Select save path',
        browseDir: 'Browse...',
        openDir: 'Open',
        startDownload: 'Start Download',
        downloadStatus: 'Download Status',
        waiting: 'Waiting',
        paused: 'Pause',
        resume: 'Resume',
        delete: 'Delete',
        progress: 'Progress',
        files: 'Files',
        downloaded: 'Downloaded',
        speed: 'Speed',
        current: 'Current:',
        log: 'Log',
        logCount: '{count} entries',
        logPlaceholder: 'Validate DOI and select files to start download',
        taskHistory: 'Task History',
        file: 'file',
        noMatchingFiles: 'No matching files',
        selected: '{selected}/{total} files selected, {size}',
        validating: 'Validating',
        validatingText: 'Validating...',
        validationSuccess: 'Validation Success',
        validationFailed: 'Validation Failed',
        networkError: 'Network Error',
        enterDoi: 'Please enter DOI or record ID',
        validateFirst: 'Please click "Validate" first to get file list',
        selectAtLeastOne: 'Please select at least one file',
        selectingDir: 'Selecting directory...',
        cannotOpenDir: 'Cannot open directory',
        started: 'Starting',
        starting: 'Starting...',
        downloadInProgress: '<span class="spinner"></span> Downloading...',
        pausing: 'Pausing...',
        downloadPaused: 'Paused',
        downloadCompleted: 'Download Complete',
        downloadCancelled: 'Cancelled',
        downloadInterrupted: 'Interrupted (click Resume to continue)',
        downloadError: 'Download Failed',
        downloadPausedToast: 'Download paused',
        resumeDownload: 'Resuming download',
        cannotResume: 'Cannot resume',
        confirmDelete: 'Confirm delete this task? Downloaded files will not be deleted.',
        taskDeleted: 'Task deleted',
        completed: 'Done',
        downloading: 'Downloading',
        running: 'Downloading',
        error: 'Failed',
        interrupted: 'Interrupted',
        cancelled: 'Cancelled',
        recordId: 'Record ID',
        unknownError: 'Unknown error',
        startFailed: 'Start failed',
        startError: 'Start error: ',
        cannotOpenFolderPicker: 'Cannot open folder picker: ',
        enterDownloadDir: 'Please enter or select download directory',
    }
};

function t(key, params = {}) {
    let text = translations[currentLang][key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });
    
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn) {
        langBtn.textContent = lang === 'zh' ? 'EN' : '中文';
    }
    
    if (currentTaskId) {
        fetch(`/api/progress/${currentTaskId}`)
            .then(r => r.json())
            .then(progress => {
                updateProgressUI(progress);
            }).catch(() => {});
    }
    
    loadTaskHistory();
}

document.addEventListener('DOMContentLoaded', () => {
    currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'zh';
    setLanguage(currentLang);

    document.getElementById('lang-toggle').addEventListener('click', () => {
        setLanguage(currentLang === 'zh' ? 'en' : 'zh');
    });

    document.getElementById('doi-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') validateDOI();
    });
    document.getElementById('doi-input').addEventListener('input', () => {
        const doi = document.getElementById('doi-input').value.trim();
        if (doi !== validatedDoi) {
            validatedFiles = [];
            validatedDoi = '';
            fileSelectionState = {};
            document.getElementById('file-selection-section').style.display = 'none';
        }
    });

    fetch('/api/default_dir')
        .then(r => r.json())
        .then(data => {
            const input = document.getElementById('output-dir');
            if (input.value === '.' && data.path) {
                input.value = data.path;
            }
        })
        .catch(() => {});

    loadTaskHistory().then(() => restoreActiveTask());
});

function saveActiveTask(taskId) {
    if (taskId) {
        localStorage.setItem(STORAGE_KEY, taskId);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

async function restoreActiveTask() {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;

    try {
        const response = await fetch(`/api/progress/${savedId}`);
        if (!response.ok) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        const progress = await response.json();
        currentTaskId = savedId;
        updateProgressUI(progress);
        if (['running', 'paused'].includes(progress.status)) {
            startProgressMonitor();
        }
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }
}

async function loadTaskHistory() {
    try {
        const response = await fetch('/api/tasks');
        const tasks = await response.json();
        const entries = Object.values(tasks);
        const section = document.getElementById('task-history-section');
        const list = document.getElementById('task-history-list');

        if (entries.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        entries.sort((a, b) => (b.overall_progress || 0) - (a.overall_progress || 0));

        list.innerHTML = entries.map(t => {
            const statusLabel = {
                running: t('running'), paused: t('downloadPaused'), completed: t('downloadCompleted'),
                cancelled: t('cancelled'), error: t('error'), interrupted: t('interrupted'),
            }[t.status] || t.status;
            return `
                <div class="task-item ${t.task_id === currentTaskId ? 'active' : ''}"
                     onclick="selectTask('${t.task_id}')">
                    <div class="task-item-info">
                        <div class="task-item-doi">${escapeHtml(t.doi)}</div>
                        <div class="task-item-meta">
                            ${t.completed_files}/${t.total_files} ${t('file')} ·
                            ${formatSize(t.downloaded_size)} / ${formatSize(t.total_size)}
                        </div>
                    </div>
                    <span class="task-status-tag ${t.status}">${statusLabel}</span>
                    <div class="task-item-actions" onclick="event.stopPropagation()">
                        ${['paused', 'interrupted', 'cancelled', 'error'].includes(t.status)
                            ? `<button class="btn btn-primary btn-sm" onclick="resumeTask('${t.task_id}')">${t('resume')}</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteTaskById('${t.task_id}')">${t('delete')}</button>
                    </div>
                </div>`;
        }).join('');
    } catch { /* ignore */ }
}

function selectTask(taskId) {
    currentTaskId = taskId;
    saveActiveTask(taskId);
    fetch(`/api/progress/${taskId}`)
        .then(r => r.json())
        .then(progress => {
            updateProgressUI(progress);
            if (['running', 'paused'].includes(progress.status)) {
                startProgressMonitor();
            }
        });
    loadTaskHistory();
}

function renderFileSelection() {
    const section = document.getElementById('file-selection-section');
    const list = document.getElementById('file-selection-list');
    const summary = document.getElementById('file-selection-summary');
    const filter = document.getElementById('file-filter').value.trim().toLowerCase();

    if (!validatedFiles.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const filtered = validatedFiles.filter(f =>
        !filter || f.key.toLowerCase().includes(filter)
    );

    list.innerHTML = filtered.map(f => {
        const globalIdx = validatedFiles.findIndex(v => v.key === f.key);
        const checked = fileSelectionState[f.key] !== false;
        return `
            <label class="file-check-item">
                <input type="checkbox" ${checked ? 'checked' : ''}
                       onchange="toggleFileSelectionByIdx(${globalIdx}, this.checked)">
                <span class="file-check-name">${escapeHtml(f.key)}</span>
                <span class="file-check-size">${formatSize(f.size)}</span>
            </label>`;
    }).join('') || `<div class="empty-dir">${t('noMatchingFiles')}</div>`;

    const selected = getSelectedFiles();
    const selectedSize = validatedFiles
        .filter(f => selected.includes(f.key))
        .reduce((sum, f) => sum + f.size, 0);
    summary.textContent = t('selected', {
        selected: selected.length,
        total: validatedFiles.length,
        size: formatSize(selectedSize)
    });
}

function toggleFileSelectionByIdx(idx, checked) {
    if (validatedFiles[idx]) {
        fileSelectionState[validatedFiles[idx].key] = checked;
        renderFileSelection();
    }
}

function getSelectedFiles() {
    return validatedFiles
        .filter(f => fileSelectionState[f.key] !== false)
        .map(f => f.key);
}

function selectAllFiles(select) {
    validatedFiles.forEach(f => {
        fileSelectionState[f.key] = select;
    });
    renderFileSelection();
}

function invertFileSelection() {
    validatedFiles.forEach(f => {
        fileSelectionState[f.key] = fileSelectionState[f.key] === false;
    });
    renderFileSelection();
}

async function validateDOI() {
    const doi = document.getElementById('doi-input').value.trim();
    if (!doi) {
        showToast(t('enterDoi'), 'error');
        return;
    }

    const btn = document.getElementById('validate-btn');
    const panel = document.getElementById('validation-panel');
    const header = document.getElementById('validation-header');
    const meta = document.getElementById('validation-meta');

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${t('validating')}`;
    panel.className = 'validation-panel show';
    header.className = 'validation-header';
    header.textContent = t('validatingText');
    meta.textContent = '';

    try {
        const response = await fetch('/api/validate_doi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doi }),
        });
        const data = await response.json();

        if (data.valid) {
            panel.classList.add('success');
            header.className = 'validation-header success';
            header.textContent = t('validationSuccess');
            meta.innerHTML = `
                <strong>${escapeHtml(data.title)}</strong><br>
                ${t('recordId')}: ${data.record_id} · ${data.files_count} ${t('file')} · ${formatSize(data.total_size)}
            `;

            validatedFiles = data.files || [];
            validatedDoi = doi;
            fileSelectionState = {};
            validatedFiles.forEach(f => { fileSelectionState[f.key] = true; });
            document.getElementById('file-filter').value = '';
            renderFileSelection();
        } else {
            panel.classList.add('error');
            header.className = 'validation-header error';
            header.textContent = t('validationFailed');
            meta.textContent = data.error || t('unknownError');
            validatedFiles = [];
            document.getElementById('file-selection-section').style.display = 'none';
        }
    } catch (error) {
        panel.classList.add('error');
        header.className = 'validation-header error';
        header.textContent = t('networkError');
        meta.textContent = error.message;
    } finally {
        btn.disabled = false;
        btn.textContent = t('validateBtn');
    }
}

async function startDownload() {
    const doi = document.getElementById('doi-input').value.trim();
    const outputDir = document.getElementById('output-dir').value.trim();

    if (!doi) {
        showToast(t('enterDoi'), 'error');
        return;
    }

    if (validatedDoi !== doi || !validatedFiles.length) {
        showToast(t('validateFirst'), 'error');
        return;
    }

    const selectedFiles = getSelectedFiles();
    if (selectedFiles.length === 0) {
        showToast(t('selectAtLeastOne'), 'error');
        return;
    }

    const btn = document.getElementById('download-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${t('started')}`;

    document.getElementById('status-badge').className = 'status-badge running';
    document.getElementById('status-badge').innerHTML = `<span class="spinner"></span> ${t('starting')}`;
    document.getElementById('log-body').innerHTML = '';
    downloadLogs = [];
    resetProgress();
    lastDownloadedSize = 0;
    lastUpdateTime = Date.now();

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doi,
                output_dir: outputDir,
                selected_files: selectedFiles,
            }),
        });
        const data = await response.json();

        if (response.ok) {
            currentTaskId = data.task_id;
            saveActiveTask(currentTaskId);
            startProgressMonitor();
            loadTaskHistory();
        } else {
            throw new Error(data.error || t('startFailed'));
        }
    } catch (error) {
        showError(t('startError') + error.message);
    }
}

async function pickDirectory() {
    const current = document.getElementById('output-dir').value.trim() || '.';
    try {
        const response = await fetch('/api/pick_dir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: current }),
        });
        const data = await response.json();
        if (data.path) {
            document.getElementById('output-dir').value = data.path;
        } else if (data.error) {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast(t('cannotOpenFolderPicker') + error.message, 'error');
    }
}

async function openDirectory() {
    const path = document.getElementById('output-dir').value.trim();
    if (!path) {
        showToast(t('enterDownloadDir'), 'error');
        return;
    }
    try {
        const response = await fetch('/api/open_dir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || t('cannotOpenDir'), 'error');
        }
    } catch (error) {
        showToast(t('cannotOpenDir') + ': ' + error.message, 'error');
    }
}

function resetProgress() {
    document.getElementById('overall-progress').style.width = '0%';
    document.getElementById('progress-percent').textContent = '0%';
    document.getElementById('stat-files').textContent = '0/0';
    document.getElementById('stat-size').textContent = '0 B';
    document.getElementById('stat-speed').textContent = '-';
    document.getElementById('current-file-name').textContent = '-';
}

function resetProgressIdle() {
    resetProgress();
    document.getElementById('status-badge').className = 'status-badge idle';
    document.getElementById('status-badge').textContent = t('waiting');
    document.getElementById('progress-controls').style.display = 'none';
    document.getElementById('log-body').innerHTML =
        `<div class="log-entry log-placeholder">${t('logPlaceholder')}</div>`;
    document.getElementById('log-count').textContent = t('logCount', { count: 0 });
}

function startProgressMonitor() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/progress/sse/${currentTaskId}`);

    eventSource.onmessage = (event) => {
        updateProgressUI(JSON.parse(event.data));
    };

    eventSource.onerror = () => {
        eventSource.close();
        pollProgress();
    };
}

async function pollProgress() {
    if (!currentTaskId) return;
    try {
        const response = await fetch(`/api/progress/${currentTaskId}`);
        const progress = await response.json();
        updateProgressUI(progress);
        if (!['completed', 'error', 'cancelled'].includes(progress.status)) {
            setTimeout(pollProgress, 500);
        }
    } catch {
        setTimeout(pollProgress, 1000);
    }
}

let lastDownloadedSize = 0;
let lastUpdateTime = Date.now();

function updateControlButtons(status) {
    const controls = document.getElementById('progress-controls');
    const pauseResumeBtn = document.getElementById('pause-resume-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const downloadBtn = document.getElementById('download-btn');

    controls.style.display = 'flex';
    deleteBtn.style.display = 'inline-flex';
    deleteBtn.textContent = t('delete');

    if (status === 'running') {
        pauseResumeBtn.style.display = 'inline-flex';
        pauseResumeBtn.textContent = t('paused');
        pauseResumeBtn.className = 'btn btn-secondary btn-sm';
        pauseResumeBtn.onclick = pauseDownload;
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = `<span class="spinner"></span> ${t('downloading')}`;
    } else {
        pauseResumeBtn.style.display = 'inline-flex';
        pauseResumeBtn.textContent = t('resume');
        pauseResumeBtn.className = 'btn btn-primary btn-sm';
        pauseResumeBtn.onclick = resumeDownload;
        downloadBtn.disabled = false;
        downloadBtn.textContent = t('startDownload');
    }
}

function updateProgressUI(progress) {
    const pct = Math.min(progress.overall_progress || 0, 100);
    document.getElementById('overall-progress').style.width = `${pct}%`;
    document.getElementById('progress-percent').textContent = `${pct.toFixed(1)}%`;
    document.getElementById('stat-files').textContent =
        `${progress.completed_files}/${progress.total_files}`;
    document.getElementById('stat-size').textContent =
        `${formatSize(progress.downloaded_size)} / ${formatSize(progress.total_size)}`;

    const now = Date.now();
    const elapsed = (now - lastUpdateTime) / 1000;
    if (elapsed >= 1 && progress.downloaded_size > lastDownloadedSize) {
        const speed = (progress.downloaded_size - lastDownloadedSize) / elapsed;
        document.getElementById('stat-speed').textContent = `${formatSize(speed)}/s`;
        lastDownloadedSize = progress.downloaded_size;
        lastUpdateTime = now;
    }

    document.getElementById('current-file-name').textContent =
        progress.current_file || '-';

    if (progress.messages && progress.messages.length > 0) {
        downloadLogs = progress.messages;
        renderLog(progress.messages);
    }

    const badge = document.getElementById('status-badge');
    updateControlButtons(progress.status);

    const statusText = {
        running: t('downloadInProgress'),
        pausing: t('pausing'),
        paused: t('downloadPaused'),
        completed: t('downloadCompleted'),
        cancelled: t('downloadCancelled'),
        interrupted: t('downloadInterrupted'),
        error: t('downloadError'),
    };

    badge.className = `status-badge ${progress.status}`;
    badge.innerHTML = statusText[progress.status] || progress.status;

    if (progress.status === 'completed') {
        document.getElementById('stat-speed').textContent = t('completed');
        saveActiveTask(null);
    } else if (progress.status === 'error') {
        const errMsg = progress.messages.filter(m =>
            m.includes('failed') || m.includes('Error') || m.includes('error') || m.includes('失败')
        ).pop() || t('downloadError');
        showError(errMsg, false);
    }

    loadTaskHistory();
}

function renderLog(messages) {
    const body = document.getElementById('log-body');
    const recent = messages.slice(-20);
    body.innerHTML = recent.map(m =>
        `<div class="log-entry">${escapeHtml(m)}</div>`
    ).join('');
    body.scrollTop = body.scrollHeight;
    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = t('logCount', { count: messages.length });
}

function showError(message, resetBtn = true) {
    document.getElementById('status-badge').className = 'status-badge error';
    document.getElementById('status-badge').textContent = t('downloadError');
    if (resetBtn) {
        document.getElementById('download-btn').disabled = false;
        document.getElementById('download-btn').textContent = t('startDownload');
    }
    renderLog(downloadLogs.length ? downloadLogs : [message]);
    showToast(message, 'error');
}

async function pauseDownload() {
    if (!currentTaskId) return;
    const response = await fetch(`/api/tasks/${currentTaskId}/pause`, { method: 'POST' });
    const result = await response.json();
    if (result.ok) {
        updateControlButtons('paused');
        showToast(t('downloadPausedToast'), 'info');
    }
}

async function resumeDownload() {
    await resumeTask(currentTaskId);
}

async function resumeTask(taskId) {
    if (!taskId) return;
    currentTaskId = taskId;
    saveActiveTask(taskId);
    const response = await fetch(`/api/tasks/${taskId}/resume`, { method: 'POST' });
    const data = await response.json();
    if (response.ok) {
        showToast(t('resumeDownload'), 'info');
        startProgressMonitor();
    } else {
        showToast(data.error || t('cannotResume'), 'error');
    }
}

async function deleteTask() {
    await deleteTaskById(currentTaskId);
}

async function deleteTaskById(taskId) {
    if (!taskId) return;
    if (!confirm(t('confirmDelete'))) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (taskId === currentTaskId) {
        currentTaskId = null;
        saveActiveTask(null);
        if (eventSource) eventSource.close();
        resetProgressIdle();
    }
    showToast('任务已删除', 'info');
    loadTaskHistory();
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
            padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;
            z-index:9999;transition:opacity 0.3s;pointer-events:none;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    const colors = {
        error: ['var(--error-bg)', 'var(--error)', 'rgba(240,113,120,0.3)'],
        info: ['var(--accent-soft)', 'var(--accent)', 'rgba(27,154,170,0.3)'],
    };
    const [bg, color, border] = colors[type] || colors.info;
    toast.style.background = bg;
    toast.style.color = color;
    toast.style.border = `1px solid ${border}`;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}
