const state = {
    currentDate: new Date(),
    checklistData: [],
    isLoading: false, // Prevent saving during data load
    isLoaded: false   // Ensure we have loaded data before allowing a save
};

// Global UI Elements
let indicator, msg, badge;

document.addEventListener('DOMContentLoaded', () => {
    indicator = document.getElementById('sync-status');
    msg = document.getElementById('sync-msg');
    badge = document.getElementById('sync-badge');

    initDateDisplay();
    renderTimeBlocks();
    loadFromSheet();

    // Attach listeners safely
    const btnPrev = document.getElementById('prev-date');
    const btnNext = document.getElementById('next-date');
    const btnAddItem = document.getElementById('add-item-btn');
    const inputNewItem = document.getElementById('new-item-input');
    if (btnPrev) btnPrev.onclick = () => changeDate(-1);
    if (btnNext) btnNext.onclick = () => changeDate(1);

    if (btnAddItem) {
        btnAddItem.onclick = () => {
            addNewItem();
            saveToSheet();
        };
    }

    if (inputNewItem) {
        inputNewItem.onkeypress = (e) => {
            if (e.key === 'Enter') {
                addNewItem();
                saveToSheet();
            }
        };
    }

    // Real-time Sync: Refresh data every 10 seconds if not currently editing
    setInterval(() => {
        if (!state.isLoading && document.visibilityState === 'visible') {
            loadFromSheet(true); // silent load
        }
    }, 10000);
});

function initDateDisplay() {
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    const display = document.getElementById('date-display');
    if (display) {
        display.textContent = state.currentDate.toLocaleDateString('ko-KR', options);
    }
}

function renderTimeBlocks() {
    const container = document.getElementById('time-blocks-container');
    container.innerHTML = '';

    for (let i = 6; i <= 23; i++) {
        const hour = i > 12 ? i - 12 : i;
        const ampm = i >= 12 ? 'PM' : 'AM';

        createBlock(container, `${hour}:00`, ampm, `${i}00`);
        createBlock(container, `${hour}:30`, ampm, `${i}30`);
    }
}

function createBlock(container, label, ampm, id) {
    const row = document.createElement('div');
    row.className = 'time-row';
    row.dataset.time = id;

    const timeLabel = document.createElement('div');
    timeLabel.className = 'time-label';
    timeLabel.textContent = `${label} ${ampm}`; // Single line

    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'time-checkbox-container';

    const checkbox = document.createElement('div');
    checkbox.className = 'time-checkbox';
    checkbox.onclick = () => {
        checkbox.classList.toggle('checked');
        row.classList.toggle('completed');
        
        if (checkbox.classList.contains('checked')) {
            row.classList.add('completed');
        } else {
            row.classList.remove('completed');
        }
        saveToSheet();
    };

    checkboxContainer.appendChild(checkbox);

    const select = document.createElement('select');
    select.className = 'block-select';
    select.dataset.time = id;
    select.onchange = (e) => {
        applyRowColor(row, e.target.value);
        saveToSheet();
    };

    row.appendChild(timeLabel);
    row.appendChild(checkboxContainer);
    row.appendChild(select);
    container.appendChild(row);
}

function applyRowColor(row, taskName) {
    if (taskName) {
        const hue = getHueFromString(taskName);
        row.style.setProperty('--row-bg', `hsla(${hue}, 70%, 92%, 0.8)`);
    } else {
        row.style.removeProperty('--row-bg');
    }
}

function getHueFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
}

function clearUI() {
    state.checklistData = [];
    const braindumpList = document.getElementById('braindump-list');
    if (braindumpList) braindumpList.innerHTML = '';
    
    const t1 = document.getElementById('top1');
    const t2 = document.getElementById('top2');
    const t3 = document.getElementById('top3');
    if (t1) t1.value = '';
    if (t2) t2.value = '';
    if (t3) t3.value = '';

    const selects = document.querySelectorAll('.block-select');
    const checkboxes = document.querySelectorAll('.time-checkbox');
    const rows = document.querySelectorAll('.time-row');

    selects.forEach(s => s.value = '');
    checkboxes.forEach(c => c.classList.remove('checked'));
    rows.forEach(r => {
        r.classList.remove('completed');
        r.style.removeProperty('--row-bg');
    });
    
    updateTimelineDropdowns();
}

function changeDate(days) {
    state.currentDate.setDate(state.currentDate.getDate() + days);
    initDateDisplay();
    state.isLoaded = false; // Block saves until new data is loaded
    clearUI();
    loadFromSheet();
}

function getFormattedDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Checklist Logic
function addNewItem(text = '', checked = false) {
    const input = document.getElementById('new-item-input');
    const taskText = text || input.value.trim();

    if (!taskText) return;

    // Duplicate check (case-insensitive)
    const isDuplicate = state.checklistData.some(item => 
        item.text.trim().toLowerCase() === taskText.toLowerCase()
    );

    if (isDuplicate) {
        if (!text) { // Only show feedback if manually entered
            const msg = document.getElementById('sync-msg');
            const originalMsg = msg.textContent;
            msg.textContent = '이미 존재하는 항목입니다.';
            msg.style.color = '#ff4d4d';
            setTimeout(() => {
                msg.textContent = originalMsg;
                msg.style.color = '';
            }, 2000);
            input.value = '';
        }
        return;
    }

    const item = { id: Date.now() + Math.random(), text: taskText, checked: checked };
    state.checklistData.push(item);
    renderChecklistItem(item);

    if (!text) input.value = '';
    updateTopPriorities();
    updateTimelineDropdowns();
}

function renderChecklistItem(item) {
    const container = document.getElementById('braindump-list');
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.dataset.id = item.id;

    const hue = getHueFromString(item.text);
    div.style.setProperty('--item-bg', `hsla(${hue}, 70%, 94%, 0.8)`);

    div.innerHTML = `
        <div class="custom-checkbox ${item.checked ? 'checked' : ''}"></div>
        <span class="item-text ${item.checked ? 'strikethrough' : ''}">${item.text}</span>
        <button class="delete-item-btn">×</button>
    `;

    // Toggle Checkbox
    div.querySelector('.custom-checkbox').onclick = (e) => {
        item.checked = !item.checked;
        e.target.classList.toggle('checked');
        div.querySelector('.item-text').classList.toggle('strikethrough');
        updateTopPriorities();
        updateTimelineDropdowns();
        saveToSheet(); // Real-time sync
    };

    // Delete Item
    div.querySelector('.delete-item-btn').onclick = () => {
        state.checklistData = state.checklistData.filter(i => i.id !== item.id);
        div.remove();
        updateTopPriorities();
        updateTimelineDropdowns();
        saveToSheet(); // Real-time sync
    };

    container.appendChild(div);
}

function updateTopPriorities() {
    const checkedItems = state.checklistData.filter(i => i.checked).map(i => i.text);

    const t1 = document.getElementById('top1');
    const t2 = document.getElementById('top2');
    const t3 = document.getElementById('top3');

    t1.value = checkedItems[0] || '';
    t2.value = checkedItems[1] || '';
    t3.value = checkedItems[2] || '';

    // Add real-time sync for manual edits if any (though usually auto-filled)
    [t1, t2, t3].forEach(el => {
        if (!el.dataset.hasListener) {
            el.addEventListener('change', () => saveToSheet());
            el.dataset.hasListener = 'true';
        }
    });
}

function updateTimelineDropdowns() {
    const selects = document.querySelectorAll('.block-select');
    const checkedItems = state.checklistData.filter(i => i.checked);
    const uncheckItems = state.checklistData.filter(i => !i.checked);

    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">- 미션 선택 -</option>';

        // Group 1: Top 3 (Checked)
        if (checkedItems.length > 0) {
            const groupChecked = document.createElement('optgroup');
            groupChecked.label = "최우선 Top 3";
            checkedItems.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.text;
                opt.textContent = item.text;
                groupChecked.appendChild(opt);
            });
            select.appendChild(groupChecked);
        }

        // Group 2: Others (Unchecked)
        if (uncheckItems.length > 0) {
            const groupUnchecked = document.createElement('optgroup');
            groupUnchecked.label = "브레인 덤프";
            uncheckItems.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.text;
                opt.textContent = item.text;
                groupUnchecked.appendChild(opt);
            });
            select.appendChild(groupUnchecked);
        }

        // Restore value if it still exists
        select.value = currentValue;
        applyRowColor(select.closest('.time-row'), currentValue);
    });
}

let saveTimeout = null;
function saveToSheet() {
    if (state.isLoading || !state.isLoaded) return;
    
    // Debounce: Wait 1 second after the last change before saving
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(performSave, 1000);
}

async function performSave() {
    if (badge) badge.textContent = '클라우드 전송 중...';
    if (indicator) indicator.className = 'status-indicator syncing';
    if (msg) msg.textContent = '데이터 동기화 중...';

    const data = {
        date: getFormattedDate(state.currentDate),
        top1: document.getElementById('top1').value,
        top2: document.getElementById('top2').value,
        top3: document.getElementById('top3').value,
        braindump: JSON.stringify(state.checklistData),
        timebox: getTimeboxData()
    };

    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const errorRes = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(errorRes.error || `HTTP ${res.status}`);
        }

        const result = await res.json();
        if (result.success) {
            if (badge) badge.textContent = '실시간 동기화 활성';
            if (indicator) indicator.className = 'status-indicator online';
            if (msg) msg.textContent = '클라우드와 실시간 연동 중';
        } else {
            throw new Error(result.error || '저장 실패');
        }
    } catch (err) {
        console.error('Save failed:', err);
        if (badge) badge.textContent = '전송 일시 중단';
        if (indicator) indicator.className = 'status-indicator';

        let errorMsg = '오류 발생';
        if (window.location.protocol === 'file:') {
            errorMsg = '파일로 열림 (서버 실행 필요)';
        } else if (err.message.includes('fetch') || err.name === 'TypeError') {
            errorMsg = '서버 연결 실패';
        } else {
            errorMsg = err.message;
        }

        if (msg) msg.textContent = errorMsg;
    }
}

function getTimeboxData() {
    const rows = document.querySelectorAll('.time-row');
    const data = {};
    rows.forEach(row => {
        const select = row.querySelector('.block-select');
        const checkbox = row.querySelector('.time-checkbox');
        if (select.value || checkbox.classList.contains('checked')) {
            data[row.dataset.time] = {
                task: select.value,
                completed: checkbox.classList.contains('checked')
            };
        }
    });
    return data;
}

async function loadFromSheet(silent = false) {
    if (state.isLoading) return;
    const requestedDate = getFormattedDate(state.currentDate);
    
    try {
        state.isLoading = true;
        if (!silent) {
            if (indicator) indicator.className = 'status-indicator syncing';
            if (msg) msg.textContent = '데이터 로딩 중...';
        }

        const res = await fetch(`/api/load?date=${requestedDate}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const result = await res.json();

        // Race condition check: If user switched dates while loading, ignore these results
        if (getFormattedDate(state.currentDate) !== requestedDate) return;

        if (result.success && result.data) {
            const d = result.data;

            if (d.braindump) {
                try {
                    const list = JSON.parse(d.braindump);
                    if (Array.isArray(list)) {
                        state.checklistData = [];
                        document.getElementById('braindump-list').innerHTML = '';
                        list.forEach(item => addNewItem(item.text, item.checked));
                    }
                } catch (e) {
                    const lines = d.braindump.split('\n').filter(l => l.trim());
                    lines.forEach(line => addNewItem(line, false));
                }
            }

            updateTimelineDropdowns();

            if (d.timebox) {
                Object.keys(d.timebox).forEach(time => {
                    const row = document.querySelector(`.time-row[data-time="${time}"]`);
                    if (row) {
                        const select = row.querySelector('.block-select');
                        const checkbox = row.querySelector('.time-checkbox');
                        const val = d.timebox[time];

                        if (select) select.value = val.task || '';
                        if (checkbox && val.completed) {
                            checkbox.classList.add('checked');
                            row.classList.add('completed');
                        }
                        applyRowColor(row, val.task);
                    }
                });
            }

            const badge = document.getElementById('sync-badge');
            updateTopPriorities();
            state.isLoaded = true; // Mark as successfully loaded
            if (!silent) {
                if (indicator) indicator.className = 'status-indicator online';
                if (msg) msg.textContent = '실시간 연동 완료';
                if (badge) badge.textContent = '실시간 동기화 활성';
            }
        } else {
            clearUI(); // Crucial: Clear if day is empty
            state.isLoaded = true;
            if (!silent) {
                if (indicator) indicator.className = 'status-indicator online';
                if (msg) msg.textContent = '새로운 타임라인 (연동됨)';
                if (badge) badge.textContent = '실시간 동기화 활성';
            }
        }
    } catch (err) {
        console.error('Data load failed:', err);
        if (!silent) {
            if (indicator) indicator.className = 'status-indicator';
            if (msg) msg.textContent = '오프라인 모드';
        }
    } finally {
        state.isLoading = false;
    }
}
