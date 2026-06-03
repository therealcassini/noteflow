/* ═══════════════ NoteFlow Application ═══════════════ */

// ─── State ────────────────────────────────────────────────
const state = {
  currentView: 'month',
  prevView: 'month',
  selectedDate: null,
  currentNoteId: null,
  selectedTags: [],
  detailTags: [],      // tags for detail editor
  pendingImage: null,
  tags: [],            // loaded tag definitions
  activeFilterTag: null, // tag name for filtering, null = show all
  searchQuery: '',     // current search text
  autoSaveTimer: null, // debounce timer ID
  // Date navigation
  monthDate: new Date(),
  weekDate: new Date(),
  yearDate: new Date(),
};

// ─── Utility ──────────────────────────────────────────────
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMonthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function getMonthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function getWeekStart(d) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
function getWeekEnd(d) {
  const start = getWeekStart(d);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

const MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const WEEKDAY_NAMES = ['日','一','二','三','四','五','六'];

function htmlToPlain(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── API Wrappers ─────────────────────────────────────────
const api = window.noteFlow;

async function loadMonthDots(yearMonth) {
  try { return await api.getMonthDots(yearMonth); } catch (e) { return []; }
}

async function loadNotesByDate(date) {
  try { return await api.getNotesByDate(date); } catch (e) { return []; }
}

async function loadNotesByRange(start, end) {
  try { return await api.getNotesByRange(start, end); } catch (e) { return []; }
}

async function createNote(data) {
  try { return await api.createNote(data); } catch (e) { return null; }
}

async function updateNote(data) {
  try { return await api.updateNote(data); } catch (e) { return null; }
}

async function deleteNote(id) {
  try { return await api.deleteNote(id); } catch (e) { return null; }
}

async function loadYearStats(year) {
  try { return await api.getYearStats(year); } catch (e) { return { total: 0, activeMonths: 0, peakMonth: null, peakCount: 0, monthly: [], daily: [] }; }
}

async function saveImageData(noteId, buffer, originalName) {
  try { return await api.saveImage({ noteId, buffer: Array.from(new Uint8Array(buffer)), originalName }); } catch (e) { return null; }
}

async function readImageFile(filename) {
  try { return await api.readImage(filename); } catch (e) { return null; }
}

async function getNoteImages(noteId) {
  try { return await api.getImagesByNote(noteId); } catch (e) { return []; }
}

// ─── Tag Management ────────────────────────────────────────
async function loadTags() {
  try { state.tags = await api.listTags(); } catch (e) { state.tags = []; }
  if (!state.tags || state.tags.length === 0) {
    state.tags = [
      { id: 1, name: '工作', color: '#D97706' },
      { id: 2, name: '个人', color: '#22C55E' },
      { id: 3, name: '想法', color: '#8B5CF6' },
    ];
  }
  renderSidebarTags();
  renderToolbarTags();
}

function getTagById(id) { return state.tags.find(t => t.id === id); }

function renderSidebarTags() {
  const container = document.getElementById('tagList');
  container.innerHTML = state.tags.map(t => {
    const active = state.activeFilterTag === t.name ? ' active' : '';
    return `
      <div class="tag-item${active}" data-tag-name="${t.name}" data-tag-id="${t.id}">
        <span class="tag-dot" style="background:${t.color}"></span>
        <span class="tag-name">${escapeHtml(t.name)}</span>
        <span class="tag-count" id="tagCount_${t.id}">0</span>
        <span class="tag-delete" data-action="delete" title="删除标签">×</span>
      </div>`;
  }).join('');

  // Tag click → toggle filter
  container.querySelectorAll('.tag-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete"]')) return; // don't filter on delete click
      const tagName = item.dataset.tagName;
      state.activeFilterTag = state.activeFilterTag === tagName ? null : tagName;
      renderSidebarTags();
      if (state.currentView === 'month') renderMonthView();
      if (state.currentView === 'week') renderWeekView();
    });
  });

  // Delete button
  container.querySelectorAll('.tag-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagId = parseInt(btn.closest('.tag-item').dataset.tagId);
      deleteTagAndRefresh(tagId);
    });
  });
}

function renderToolbarTags() {
  // Quick editor toolbar
  const quickContainer = document.getElementById('tbTags');
  if (quickContainer) {
    quickContainer.innerHTML = state.tags.map(t => `
      <button class="tb-tag" data-tag="${t.name}" data-tag-id="${t.id}" style="background:${t.color}">${escapeHtml(t.name)}</button>
    `).join('');
    bindTagButtons(quickContainer, 'quick');
  }

  // Detail editor toolbar
  const detailContainer = document.getElementById('detailTbTags');
  if (detailContainer) {
    detailContainer.innerHTML = state.tags.map(t => `
      <button class="tb-tag" data-tag="${t.name}" data-tag-id="${t.id}" style="background:${t.color}">${escapeHtml(t.name)}</button>
    `).join('');
    bindTagButtons(detailContainer, 'detail');
  }
}

function bindTagButtons(container, mode) {
  container.querySelectorAll('.tb-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const tagList = mode === 'detail' ? state.detailTags : state.selectedTags;
      if (tagList.includes(tag)) {
        if (mode === 'detail') state.detailTags = state.detailTags.filter(t => t !== tag);
        else state.selectedTags = state.selectedTags.filter(t => t !== tag);
        btn.classList.remove('active');
      } else {
        if (mode === 'detail') state.detailTags.push(tag);
        else state.selectedTags.push(tag);
        btn.classList.add('active');
      }
      if (mode === 'quick') updateTagDisplay();
    });
  });
}

async function addTag() {
  const input = document.getElementById('tagAddInput');
  const name = input.value.trim();
  if (!name) return;
  const tag = await api.createTag(name);
  if (tag) {
    state.tags.push(tag);
    renderSidebarTags();
    renderToolbarTags();
    input.value = '';
  } else {
    alert('标签已存在或创建失败');
  }
}

async function deleteTagAndRefresh(id) {
  if (!confirm('删除标签不会删除已有笔记，确定删除？')) return;
  await api.deleteTag(id);
  state.tags = state.tags.filter(t => t.id !== id);
  state.activeFilterTag = null;
  renderSidebarTags();
  renderToolbarTags();
  updateTagDisplay();
}

function noteMatchesFilter(note) {
  if (!state.activeFilterTag) return true;
  const tags = (note.tags || '').split(',').filter(Boolean);
  return tags.includes(state.activeFilterTag);
}

function noteMatchesSearch(note) {
  if (!state.searchQuery) return true;
  const q = state.searchQuery.toLowerCase();
  const title = (note.title || '').toLowerCase();
  const plain = (note.plain_text || '').toLowerCase();
  return title.includes(q) || plain.includes(q);
}

// ─── Filter Bar ────────────────────────────────────────────
function updateFilterBar() {
  const hasFilter = state.activeFilterTag || state.searchQuery;
  const bar = document.getElementById('filterBar');
  const weekBar = document.getElementById('weekFilterBar');
  const text = document.getElementById('filterText');
  const weekText = document.getElementById('weekFilterText');

  if (hasFilter) {
    const parts = [];
    if (state.activeFilterTag) parts.push(`标签: <strong>${escapeHtml(state.activeFilterTag)}</strong>`);
    if (state.searchQuery) parts.push(`搜索: <strong>${escapeHtml(state.searchQuery)}</strong>`);
    const msg = parts.join(' &nbsp;|&nbsp; ');
    if (text) text.innerHTML = msg;
    if (weekText) weekText.innerHTML = msg;
  }

  if (bar) bar.classList.toggle('hidden', !hasFilter);
  if (weekBar) weekBar.classList.toggle('hidden', !hasFilter);
}

function clearAllFilters() {
  state.activeFilterTag = null;
  state.searchQuery = '';
  document.getElementById('searchInput').value = '';
  renderSidebarTags();
  updateFilterBar();

  if (state.currentView === 'month') renderMonthView();
  if (state.currentView === 'week') renderWeekView();
}

// ─── View Switching ───────────────────────────────────────
function switchView(viewName) {
  state.prevView = state.currentView;
  state.currentView = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewMap = { month: 'monthView', week: 'weekView', year: 'yearView', edit: 'editView', stats: 'statsView' };
  const navMap = { month: 'navMonth', week: 'navWeek', year: 'navYear', edit: 'navYear', stats: 'navStats' };
  const viewEl = document.getElementById(viewMap[viewName]);
  const navEl = document.getElementById(navMap[viewName]);

  if (viewEl) viewEl.classList.remove('hidden');
  if (navEl) navEl.classList.add('active');

  if (viewName === 'month') renderMonthView();
  if (viewName === 'week') renderWeekView();
  if (viewName === 'year') renderYearView();
  if (viewName === 'edit') renderEditView();
  if (viewName === 'stats') renderStatsView();
}

function goBackFromEdit() {
  // Restore the view that the user came from
  const target = state.prevView && state.prevView !== 'edit' ? state.prevView : 'month';
  switchView(target);
}

// ─── Month View ───────────────────────────────────────────
async function renderMonthView() {
  const d = state.monthDate;
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthStart = getMonthStart(d);
  const monthEnd = getMonthEnd(d);

  document.getElementById('monthTitle').textContent = `${year}年 ${month + 1}月`;

  // Load all notes in the visible calendar range (prev month start → next month end)
  const prevMonthStart = new Date(year, month, 0); // last day of prev month
  const nextMonthEnd = new Date(year, month + 1, 1); // first day of next month
  const prevMonthFirst = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), 1);
  prevMonthFirst.setDate(prevMonthFirst.getDate() - (prevMonthFirst.getDay())); // back to Sunday
  const rangeStart = formatDate(prevMonthFirst);
  const rangeEndDate = new Date(year, month + 1, 1);
  rangeEndDate.setDate(rangeEndDate.getDate() + (6 - rangeEndDate.getDay())); // forward to Saturday
  const rangeEnd = formatDate(rangeEndDate);

  const rangeNotes = await loadNotesByRange(rangeStart, rangeEnd);

  // Apply tag + search filter
  const filteredNotes = rangeNotes.filter(n => noteMatchesFilter(n) && noteMatchesSearch(n));

  // Build map: date → [{title, tags}]
  const titleMap = {};
  const dotMap = {};
  filteredNotes.forEach(n => {
    if (!titleMap[n.date]) titleMap[n.date] = [];
    const t = n.title || (n.plain_text || '').substring(0, 20);
    if (t) titleMap[n.date].push({ title: t, tags: (n.tags || '').split(',').filter(Boolean) });
    dotMap[n.date] = (dotMap[n.date] || 0) + 1;
  });

  const today = formatDate(new Date());
  const startDay = monthStart.getDay();

  const grid = document.getElementById('monthGrid');
  grid.innerHTML = '';

  const totalCells = startDay + monthEnd.getDate();
  const rows = Math.ceil(totalCells / 7);

  // Previous month fill
  const prevMonthEndDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthEndDay - i;
    const dateStr = month === 0
      ? `${year - 1}-12-${String(day).padStart(2, '0')}`
      : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.appendChild(createCalendarCell(day, dateStr, dotMap, titleMap, true));
  }

  // Current month
  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.appendChild(createCalendarCell(day, dateStr, dotMap, titleMap, false));
  }

  // Next month fill
  const remaining = rows * 7 - totalCells;
  for (let day = 1; day <= remaining; day++) {
    const dateStr = month === 11
      ? `${year + 1}-01-${String(day).padStart(2, '0')}`
      : `${year}-${String(month + 2).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.appendChild(createCalendarCell(day, dateStr, dotMap, titleMap, true));
  }

  updateTagCounts(year, month);
  updateFilterBar();
}

function createCalendarCell(day, dateStr, dotMap, titleMap, otherMonth) {
  const cell = document.createElement('div');
  cell.className = 'calendar-cell';
  if (otherMonth) cell.classList.add('other-month');

  const today = formatDate(new Date());
  if (dateStr === today) cell.classList.add('today');
  if (dateStr === state.selectedDate) cell.classList.add('selected');

  // Day number badge
  const dayNum = document.createElement('span');
  dayNum.className = 'day-num';
  dayNum.textContent = day;
  cell.appendChild(dayNum);

  // Titles (let CSS overflow decide how many to show)
  const titles = titleMap[dateStr] || [];
  if (titles.length > 0) {
    const titlesDiv = document.createElement('div');
    titlesDiv.className = 'cell-titles';
    titles.forEach(t => {
      const span = document.createElement('span');
      span.className = 'cell-title';
      const inner = document.createElement('span');
      inner.className = 'cell-title-inner';
      inner.textContent = t.title;
      span.appendChild(inner);
      span.title = t.title;
      titlesDiv.appendChild(span);
    });
    cell.appendChild(titlesDiv);
  }

  cell.addEventListener('click', () => selectDate(dateStr));
  return cell;
}

async function selectDate(dateStr) {
  state.selectedDate = dateStr;
  document.getElementById('panelDate').textContent = dateStr;
  document.getElementById('editorBody').innerHTML = '';
  state.currentNoteId = null;
  state.selectedTags = [];
  updateTagDisplay();

  // Load notes for this date
  const notes = await loadNotesByDate(dateStr);
  renderNoteList(notes);
  renderMonthView();
}

function renderNoteList(notes) {
  const container = document.getElementById('noteList');
  if (notes.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无笔记<br>点击「+ 新建」开始记录</div>';
    return;
  }
  container.innerHTML = notes.map(n => {
    const tags = (n.tags || '').split(',').filter(Boolean);
    const timeStr = n.updated_at ? new Date(n.updated_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    const title = n.title ? `<div class="note-title">${escapeHtml(n.title)}</div>` : '';
    return `
      <div class="note-card" data-id="${n.id}" onclick="openNoteDetail(${n.id})">
        ${title}
        <div class="note-content">${n.content}</div>
        <div class="note-meta">
          ${tags.map(t => `<span class="note-tag" style="background:${getTagColor(t)}">${escapeHtml(t)}</span>`).join('')}
          <span class="note-time">${timeStr}</span>
        </div>
      </div>`;
  }).join('');
}

function getTagClass(tag) {
  const tagDef = state.tags.find(t => t.name === tag);
  return tagDef ? '' : 'tag-work'; // fallback
}

function getTagColor(tagName) {
  const tagDef = state.tags.find(t => t.name === tagName);
  return tagDef ? tagDef.color : '#D97706';
}

async function updateTagCounts(year, month) {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-31`;
  const notes = await loadNotesByRange(start, end);
  const counts = {};
  state.tags.forEach(t => { counts[t.id] = 0; });
  notes.forEach(n => {
    const tags = (n.tags || '').split(',').filter(Boolean);
    tags.forEach(tagName => {
      const tagDef = state.tags.find(t => t.name === tagName);
      if (tagDef) counts[tagDef.id] = (counts[tagDef.id] || 0) + 1;
    });
  });
  for (const [tid, cnt] of Object.entries(counts)) {
    const el = document.getElementById('tagCount_' + tid);
    if (el) el.textContent = cnt;
  }
}

// ─── Note CRUD ───────────────────────────────────────────
async function saveNote() {
  const dateStr = state.selectedDate || formatDate(new Date());
  const title = document.getElementById('quickTitle').value.trim();
  const content = document.getElementById('editorBody').innerHTML.trim();
  if (!title && !content) { alert('请输入标题或内容'); return; }
  const plainText = htmlToPlain(content);
  const tags = state.selectedTags.join(',');

  if (state.currentNoteId) {
    await updateNote({ id: state.currentNoteId, title, content, plain_text: plainText, tags });
  } else {
    const result = await createNote({ title, content, plain_text: plainText, date: dateStr, tags });
    if (result) state.currentNoteId = result.id;
  }

  // Handle pending image
  if (state.pendingImage && state.currentNoteId) {
    const blob = state.pendingImage;
    const buffer = await blob.arrayBuffer();
    const name = `paste_${Date.now()}.png`;
    await saveImageData(state.currentNoteId, buffer, name);
    state.pendingImage = null;
  }

  document.getElementById('quickTitle').value = '';
  document.getElementById('editorBody').innerHTML = '';
  state.currentNoteId = null;
  state.selectedTags = [];
  updateTagDisplay();
  const notes = await loadNotesByDate(dateStr);
  renderNoteList(notes);
  renderMonthView();
}

function updateTagDisplay() {
  document.getElementById('currentTags').textContent = state.selectedTags.length
    ? '标签: ' + state.selectedTags.join(', ')
    : '';
}

async function openNoteDetail(id) {
  state.currentNoteId = id;
  const note = await api.getNoteById(id);
  if (!note) return;

  // Populate title and body separately
  document.getElementById('detailTitle').value = note.title || '';
  document.getElementById('detailBody').innerHTML = note.content || '';

  // Restore tags
  state.detailTags = (note.tags || '').split(',').filter(Boolean);
  document.querySelectorAll('#detailTbTags .tb-tag').forEach(btn => {
    btn.classList.toggle('active', state.detailTags.includes(btn.dataset.tag));
  });

  // Load images and append to body
  const images = await getNoteImages(id);
  for (const img of images) {
      const dataUrl = await readImageFile(img.filename);
      if (dataUrl) {
        insertImageIntoEditor(document.getElementById('detailBody'), dataUrl);
      }
  }

  // Switch to edit view with this note
  switchView('edit');
  renderEditNoteList();
}

async function saveNoteDetail() {
  if (!state.currentNoteId) return;
  const title = document.getElementById('detailTitle').value.trim();
  const content = document.getElementById('detailBody').innerHTML;
  const plainText = htmlToPlain(content);
  // Read tags directly from active buttons (most reliable)
  const tagNames = [];
  document.querySelectorAll('#detailTbTags .tb-tag.active').forEach(btn => {
    tagNames.push(btn.dataset.tag);
  });
  state.detailTags = tagNames;
  await updateNote({ id: state.currentNoteId, title, content, plain_text: plainText, tags: tagNames.join(',') });
  renderEditNoteList();
}

async function deleteCurrentNote() {
  if (!state.currentNoteId) return;
  if (!confirm('确定删除这条笔记吗？')) return;
  await deleteNote(state.currentNoteId);
  state.currentNoteId = null;
  document.getElementById('detailBody').innerHTML = '';
  renderEditNoteList();
}

// ─── Auto-Save ────────────────────────────────────────────
function scheduleAutoSave() {
  if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(async () => {
    if (state.currentView === 'edit' && state.currentNoteId) {
      await saveNoteDetail();
    } else if (state.currentView === 'month' && state.currentNoteId) {
      const content = document.getElementById('editorBody').innerHTML;
      if (content.trim()) await saveNoteSilent();
    }
    showAutoSaveIndicator();
    state.autoSaveTimer = null;
  }, 3000);
}

async function saveNoteSilent() {
  if (!state.currentNoteId) return;
  const title = document.getElementById('quickTitle').value.trim();
  const content = document.getElementById('editorBody').innerHTML;
  const plainText = htmlToPlain(content);
  const tags = state.selectedTags.join(',');
  await updateNote({ id: state.currentNoteId, title, content, plain_text: plainText, tags });
}

function showAutoSaveIndicator() {
  const el = document.getElementById('autosaveIndicator');
  if (!el) return;
  el.classList.add('show');
  el.classList.remove('hidden');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 400);
  }, 2000);
}

async function renderEditNoteList() {
  const container = document.getElementById('editNoteList');
  const start = `${state.yearDate.getFullYear()}-01-01`;
  const end = `${state.yearDate.getFullYear()}-12-31`;
  let notes = await loadNotesByRange(start, end);

  // Apply search filter if active
  if (state.searchQuery) {
    const ql = state.searchQuery.toLowerCase();
    notes = notes.filter(n => {
      const title = (n.title || '').toLowerCase();
      const plain = (n.plain_text || '').toLowerCase();
      return title.includes(ql) || plain.includes(ql);
    });
  }

  if (notes.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无笔记</div>';
    return;
  }

  container.innerHTML = notes.map(n => {
    const title = n.title || (n.plain_text || htmlToPlain(n.content)).substring(0, 30);
    const plain = n.plain_text || htmlToPlain(n.content);
    const preview = plain.substring(0, 60) + (plain.length > 60 ? '...' : '');
    const tags = (n.tags || '').split(',').filter(Boolean);
    const active = n.id === state.currentNoteId ? 'active' : '';
    return `
      <div class="edit-note-item ${active}" data-id="${n.id}" onclick="openNoteDetail(${n.id})">
        <div class="title-line">${escapeHtml(title)}</div>
        <div class="preview-line">${escapeHtml(preview)}</div>
        <div class="meta-line">
          <span>${n.date}</span>
          ${tags.map(t => `<span class="note-tag" style="background:${getTagColor(t)};font-size:10px;height:18px;margin-left:4px">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ─── Week View ────────────────────────────────────────────
async function renderWeekView() {
  const d = state.weekDate;
  const weekStart = getWeekStart(d);
  const weekEnd = getWeekEnd(d);

  document.getElementById('weekTitle').textContent =
    `${weekStart.getFullYear()}年 ${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;

  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';

  const startStr = formatDate(weekStart);
  const endStr = formatDate(weekEnd);
  const notes = await loadNotesByRange(startStr, endStr);
  const filteredNotes = notes.filter(n => noteMatchesFilter(n) && noteMatchesSearch(n));
  const today = formatDate(new Date());

  // Group notes by date
  const notesByDate = {};
  filteredNotes.forEach(n => {
    if (!notesByDate[n.date]) notesByDate[n.date] = [];
    notesByDate[n.date].push(n);
  });

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const dateStr = formatDate(day);
    const isToday = dateStr === today;
    const dayNotes = notesByDate[dateStr] || [];

    const col = document.createElement('div');
    col.className = 'week-col' + (isToday ? ' today' : '');

    col.innerHTML = `
      <div class="week-col-header">
        <div>${day.getDate()}日</div>
        <div class="weekday">周${WEEKDAY_NAMES[day.getDay()]}</div>
      </div>
      <div class="week-col-body">
        ${dayNotes.map(n => {
          const title = n.title || (n.plain_text || htmlToPlain(n.content)).substring(0, 25);
          return `<div class="week-note" onclick="openNoteDetail(${n.id})">${escapeHtml(title)}</div>`;
        }).join('')}
      </div>
      <div class="week-col-add" data-date="${dateStr}" onclick="quickAddFromWeek('${dateStr}')">+ 添加</div>`;

    grid.appendChild(col);
  }
  updateFilterBar();
}

function quickAddFromWeek(dateStr) {
  state.selectedDate = dateStr;
  switchView('month');
  document.getElementById('panelDate').textContent = dateStr;
  document.getElementById('editorBody').focus();
}

// ─── Year View ────────────────────────────────────────────
async function renderYearView() {
  const year = state.yearDate.getFullYear();
  document.getElementById('yearTitle').textContent = `${year}年`;

  // Load stats
  const stats = await loadYearStats(year);
  document.getElementById('statTotal').textContent = `${stats.total || 0}条`;

  // ── Time progress ─────────────────────────────────────
  const now = new Date();
  const today = formatDate(now);

  // Year progress: (days elapsed) / (total days in year)
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const daysInYear = Math.ceil((yearEnd - yearStart) / 86400000) + 1;
  let yearDaysElapsed;
  if (year < now.getFullYear()) {
    yearDaysElapsed = daysInYear; // past year = 100%
  } else if (year > now.getFullYear()) {
    yearDaysElapsed = 0; // future year = 0%
  } else {
    yearDaysElapsed = Math.floor((now - yearStart) / 86400000) + 1;
  }
  const yearPct = Math.round((yearDaysElapsed / daysInYear) * 100);
  document.getElementById('statYearPct').textContent = yearPct + '%';
  document.getElementById('barYear').style.width = yearPct + '%';

  // Month progress: (day of month) / (days in this month)
  let monthPct;
  if (year === now.getFullYear()) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    monthPct = Math.round((now.getDate() / daysInMonth) * 100);
  } else if (year > now.getFullYear()) {
    monthPct = 0;
  } else {
    monthPct = 100; // past year, all months complete
  }
  document.getElementById('statMonthPct').textContent = monthPct + '%';
  document.getElementById('barMonth').style.width = monthPct + '%';

  // Week progress: (weekday index) / 7
  let weekPct;
  if (year === now.getFullYear()) {
    const dow = now.getDay(); // 0=Sun
    const dayIdx = dow === 0 ? 7 : dow; // Mon=1..Sun=7
    weekPct = Math.round((dayIdx / 7) * 100);
  } else if (year > now.getFullYear()) {
    weekPct = 0;
  } else {
    weekPct = 100; // past year
  }
  document.getElementById('statWeekPct').textContent = weekPct + '%';
  document.getElementById('barWeek').style.width = weekPct + '%';

  // Build daily dot map
  const dotMap = {};
  if (stats.daily) stats.daily.forEach(d => { dotMap[d.date] = d.count; });

  const currentMonthIdx = new Date().getMonth();

  // Render month cards
  const grid = document.getElementById('yearGrid');
  grid.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const card = document.createElement('div');
    card.className = 'month-card';
    if (year === now.getFullYear() && m === currentMonthIdx) {
      card.classList.add('current');
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'month-card-name';
    nameDiv.textContent = MONTH_NAMES[m];
    card.appendChild(nameDiv);

    const wdDiv = document.createElement('div');
    wdDiv.className = 'month-card-weekdays';
    WEEKDAY_NAMES.forEach(w => {
      const span = document.createElement('span');
      span.textContent = w;
      wdDiv.appendChild(span);
    });
    card.appendChild(wdDiv);

    const datesDiv = document.createElement('div');
    datesDiv.className = 'month-card-dates';

    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('span');
      cell.className = 'month-card-cell empty';
      cell.textContent = '.';
      datesDiv.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('span');
      cell.className = 'month-card-cell';
      // Note dot
      if (dotMap[dateStr] && dotMap[dateStr] > 0) {
        cell.classList.add('has-note');
        cell.title = `${dotMap[dateStr]} 条笔记`;
      }
      // Today highlight
      if (dateStr === today) {
        cell.style.fontWeight = '700';
        cell.style.outline = '2px solid var(--accent)';
        cell.style.outlineOffset = '-2px';
        cell.style.borderRadius = '3px';
      }
      // Passed day dimming — only for current year
      if (year === now.getFullYear() && dateStr < today) {
        cell.classList.add('passed');
      }
      cell.textContent = day;
      datesDiv.appendChild(cell);
    }

    card.appendChild(datesDiv);

    card.addEventListener('click', () => {
      state.monthDate = new Date(year, m, 1);
      switchView('month');
    });

    grid.appendChild(card);
  }
}

// ─── Edit View ────────────────────────────────────────────
async function renderEditView() {
  renderEditNoteList();
  if (!state.currentNoteId) {
    document.getElementById('detailTitle').value = '';
    document.getElementById('detailBody').innerHTML = '';
    state.detailTags = [];
    document.querySelectorAll('#detailTbTags .tb-tag').forEach(b => b.classList.remove('active'));
  }
}

// ─── Stats View ────────────────────────────────────────────
let statsCharts = {};

async function renderStatsView() {
  const now = new Date();
  const year = now.getFullYear();

  // Populate year filter
  const yearSel = document.getElementById('statsYearFilter');
  if (yearSel.options.length === 0) {
    for (let y = year; y >= year - 5; y--) {
      yearSel.add(new Option(y + '年', y));
    }
    yearSel.value = year;
  }

  // Populate month filter
  const monthSel = document.getElementById('statsMonthFilter');
  if (monthSel.options.length <= 1) {
    for (let m = 1; m <= 12; m++) {
      monthSel.add(new Option(m + '月', m));
    }
  }

  const selectedYear = parseInt(yearSel.value);
  const selectedMonth = monthSel.value;

  const data = await api.getStatsData({ year: selectedYear, month: selectedMonth });

  // Dispose old charts
  Object.values(statsCharts).forEach(c => c.dispose());
  statsCharts = {};

  // ── Bar Chart ──
  const barDom = document.getElementById('chartBar');
  if (barDom && data.dayData.length > 0) {
    const barChart = echarts.init(barDom);
    barChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'category',
        data: data.dayData.map(d => d.date.substring(5)),
        axisLabel: { rotate: 45, fontSize: 10, color: '#78716C' }
      },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#f0ece6' } } },
      series: [{
        type: 'bar',
        data: data.dayData.map(d => d.count),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#D97706' },
            { offset: 1, color: '#FDE68A' }
          ])
        },
        barWidth: '60%'
      }]
    });
    statsCharts.bar = barChart;
  } else if (barDom) {
    barDom.innerHTML = '<div class="empty-state">暂无数据</div>';
  }

  // ── Pie Chart ──
  const pieDom = document.getElementById('chartPie');
  if (pieDom && data.tagData.length > 0) {
    const pieChart = echarts.init(pieDom);
    const colors = data.tagData.map((_, i) => {
      const palette = ['#D97706','#22C55E','#8B5CF6','#EF4444','#3B82F6','#EC4899','#14B8A6','#F97316'];
      return palette[i % palette.length];
    });
    pieChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 11, color: '#78716C' } },
      series: [{
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['50%', '48%'],
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: data.tagData.map((d, i) => ({ ...d, itemStyle: { color: colors[i] } }))
      }]
    });
    statsCharts.pie = pieChart;
  } else if (pieDom) {
    pieDom.innerHTML = '<div class="empty-state">暂无数据</div>';
  }

  // ── Graph (Node Chart) ──
  const graphDom = document.getElementById('chartGraph');
  if (graphDom && data.graph.nodes.length > 0) {
    const graphChart = echarts.init(graphDom);
    const tagColors = {};
    data.graph.nodes.forEach(n => {
      const noteTags = (state.tags || []).map(t => t.name).filter(name => {
        // find note's tags from original data
        return true; // fallback
      });
    });

    graphChart.setOption({
      tooltip: { formatter: p => p.dataType === 'node' ? p.name : '关联' },
      series: [{
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        force: { repulsion: 200, edgeLength: [80, 180], gravity: 0.1 },
        data: data.graph.nodes.map(n => ({
          ...n,
          itemStyle: { color: '#D97706' }
        })),
        links: data.graph.links,
        lineStyle: { color: '#E7E5E4', curveness: 0.2, opacity: 0.6 },
        label: { show: true, fontSize: 10, color: '#44403C' },
        emphasis: { focus: 'adjacency', lineStyle: { width: 2 } }
      }]
    });
    statsCharts.graph = graphChart;
  } else if (graphDom) {
    graphDom.innerHTML = '<div class="empty-state">暂无关联数据</div>';
  }

  // Filter change handler
  yearSel.onchange = () => renderStatsView();
  monthSel.onchange = () => renderStatsView();
}
// ─── Resizable Image Helper ────────────────────────────────
function createResizableImage(src) {
  const wrapper = document.createElement('div');
  wrapper.className = 'img-resizable';
  wrapper.setAttribute('contenteditable', 'false');
  const img = document.createElement('img');
  img.src = src;
  img.draggable = false;
  img.onload = () => {
    const w = Math.min(img.naturalWidth || 400, 600);
    const h = img.naturalHeight ? (w / img.naturalWidth * img.naturalHeight) : 300;
    wrapper.style.width = w + 'px';
    wrapper.style.height = h + 'px';
  };
  wrapper.appendChild(img);
  return wrapper;
}

function insertImageIntoEditor(editorEl, src) {
  editorEl.focus();
  const wrapper = createResizableImage(src);
  const sel = window.getSelection();
  if (sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(wrapper);
    range.setStartAfter(wrapper);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    editorEl.appendChild(wrapper);
    editorEl.appendChild(document.createElement('br'));
  }
}

function setupImageHandling() {
  const editorBody = document.getElementById('editorBody');
  const detailBody = document.getElementById('detailBody');
  const imageModal = document.getElementById('imageModal');
  const imagePreview = document.getElementById('imagePreview');

  // Paste handler
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // block browser's own image paste
        const blob = item.getAsFile();
        state.pendingImage = blob;

        // Show preview in editor
        const reader = new FileReader();
        reader.onload = (ev) => {
          const activeEl = document.activeElement;
          if (activeEl === editorBody || activeEl === detailBody) {
            insertImageIntoEditor(activeEl, ev.target.result);
          }
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  });

  // Insert image button in quick editor
  document.getElementById('btnInsertImage').addEventListener('click', async () => {
    const files = await api.openImageDialog();
    if (!files || files.length === 0) return;

    for (const file of files) {
      const blob = new Blob([new Uint8Array(file.buffer)]);
      state.pendingImage = blob;

      const reader = new FileReader();
      reader.onload = (ev) => {
        insertImageIntoEditor(editorBody, ev.target.result);
      };
      reader.readAsDataURL(blob);
    }
  });

  // Detail editor image insert
  document.getElementById('detailInsertImage').addEventListener('click', async () => {
    const files = await api.openImageDialog();
    if (!files || files.length === 0) return;

    for (const file of files) {
      const blob = new Blob([new Uint8Array(file.buffer)]);
      const buffer = await blob.arrayBuffer();

      // Save immediately if editing a note
      if (state.currentNoteId) {
        const result = await saveImageData(state.currentNoteId, buffer, file.originalName);
        if (result) {
          const dataUrl = await readImageFile(result.filename);
          if (dataUrl) {
            insertImageIntoEditor(detailBody, dataUrl);
          }
        }
      } else {
        // For quick editor - defer save
        state.pendingImage = blob;
        const reader = new FileReader();
        reader.onload = (ev) => {
          insertImageIntoEditor(detailBody, ev.target.result);
        };
        reader.readAsDataURL(blob);
      }
    }
  });
}

// ─── Rich Text Toolbar ────────────────────────────────────
function setupToolbar() {
  // Quick editor toolbar
  document.querySelectorAll('#quickEditor .tb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('editorBody').focus();
      document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
    });
  });

  // Detail editor toolbar
  document.querySelectorAll('#detailEditor .tb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('detailBody').focus();
      document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
    });
  });
}

// ─── Search ───────────────────────────────────────────────
async function renderSearchedEditList(q) {
  const start = `${state.yearDate.getFullYear()}-01-01`;
  const end = `${state.yearDate.getFullYear()}-12-31`;
  const notes = await loadNotesByRange(start, end);
  const container = document.getElementById('editNoteList');
  const ql = q.toLowerCase();
  const filtered = notes.filter(n => {
    const title = (n.title || '').toLowerCase();
    const plain = (n.plain_text || '').toLowerCase();
    return title.includes(ql) || plain.includes(ql);
  });
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">未找到包含「${escapeHtml(q)}」的笔记</div>`;
    return;
  }
  container.innerHTML = filtered.map(n => {
    const title = n.title || (n.plain_text || htmlToPlain(n.content)).substring(0, 30);
    const plain = n.plain_text || htmlToPlain(n.content);
    const preview = plain.substring(0, 60) + (plain.length > 60 ? '...' : '');
    const tags = (n.tags || '').split(',').filter(Boolean);
    const active = n.id === state.currentNoteId ? 'active' : '';
    return `
      <div class="edit-note-item ${active}" data-id="${n.id}" onclick="openNoteDetail(${n.id})">
        <div class="title-line">${escapeHtml(title)}</div>
        <div class="preview-line">${escapeHtml(preview)}</div>
        <div class="meta-line"><span>${n.date}</span>${tags.map(t => `<span class="note-tag" style="background:${getTagColor(t)};font-size:10px;height:18px;margin-left:4px">${escapeHtml(t)}</span>`).join('')}</div>
      </div>`;
  }).join('');
}

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    state.searchQuery = q;

    if (!q) {
      // Clear filter, re-render current view
      if (state.currentView === 'month') renderMonthView();
      if (state.currentView === 'week') renderWeekView();
      if (state.currentView === 'edit') renderEditNoteList();
      return;
    }

    // Re-render current view with search filter applied
    if (state.currentView === 'month') renderMonthView();
    if (state.currentView === 'week') renderWeekView();
    if (state.currentView === 'edit') renderEditNoteList();
  });
}

// ─── Navigation ───────────────────────────────────────────
function setupNavigation() {
  // View switching
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  // Month navigation
  document.getElementById('monthPrev').addEventListener('click', () => {
    state.monthDate.setMonth(state.monthDate.getMonth() - 1);
    renderMonthView();
  });
  document.getElementById('monthNext').addEventListener('click', () => {
    state.monthDate.setMonth(state.monthDate.getMonth() + 1);
    renderMonthView();
  });
  document.getElementById('monthToday').addEventListener('click', () => {
    state.monthDate = new Date();
    renderMonthView();
  });

  // Week navigation
  document.getElementById('weekPrev').addEventListener('click', () => {
    state.weekDate.setDate(state.weekDate.getDate() - 7);
    renderWeekView();
  });
  document.getElementById('weekNext').addEventListener('click', () => {
    state.weekDate.setDate(state.weekDate.getDate() + 7);
    renderWeekView();
  });
  document.getElementById('weekToday').addEventListener('click', () => {
    state.weekDate = new Date();
    renderWeekView();
  });

  // Year navigation
  document.getElementById('yearPrev').addEventListener('click', () => {
    state.yearDate.setFullYear(state.yearDate.getFullYear() - 1);
    renderYearView();
  });
  document.getElementById('yearNext').addEventListener('click', () => {
    state.yearDate.setFullYear(state.yearDate.getFullYear() + 1);
    renderYearView();
  });
  document.getElementById('yearToday').addEventListener('click', () => {
    state.yearDate = new Date();
    renderYearView();
  });

  // Save buttons
  document.getElementById('btnSaveNote').addEventListener('click', saveNote);
  document.getElementById('btnUpdateNote').addEventListener('click', saveNoteDetail);
  document.getElementById('btnDeleteNote').addEventListener('click', deleteCurrentNote);
  document.getElementById('btnBackFromEdit').addEventListener('click', goBackFromEdit);

  // New note button
  document.getElementById('btnNewNote').addEventListener('click', () => {
    document.getElementById('quickTitle').value = '';
    document.getElementById('editorBody').innerHTML = '';
    document.getElementById('editorBody').focus();
    state.currentNoteId = null;
    state.selectedTags = [];
    updateTagDisplay();
    document.querySelectorAll('.tb-tag').forEach(b => b.classList.remove('active'));
  });

  // Tag add
  document.getElementById('btnAddTag').addEventListener('click', addTag);
  document.getElementById('tagAddInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  });

  // Clear filters
  document.getElementById('btnClearFilter').addEventListener('click', clearAllFilters);
  document.getElementById('btnWeekClearFilter').addEventListener('click', clearAllFilters);
}

// ─── Keyboard Shortcuts ───────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S - Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.currentView === 'edit' && state.currentNoteId) {
        saveNoteDetail();
      } else if (state.currentView === 'month') {
        saveNote();
      }
    }
    // Ctrl+N - New note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      switchView('month');
      document.getElementById('btnNewNote').click();
    }
  });
}

// ─── Theme Switching ───────────────────────────────────────
function setupTheme() {
  const saved = localStorage.getItem('noteflow-theme') || 'warm';
  applyTheme(saved);

  document.querySelectorAll('.theme-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('noteflow-theme', theme);
    });
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-item').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}

// ─── Init ─────────────────────────────────────────────────
async function init() {
  setupNavigation();
  setupToolbar();
  setupImageHandling();
  setupSearch();
  setupKeyboard();
  setupTheme();

  // Load tags first (needed for toolbar rendering)
  await loadTags();

  // Select today by default
  state.selectedDate = formatDate(new Date());
  document.getElementById('panelDate').textContent = state.selectedDate;

  // Load default view (month)
  switchView('month');

  // Load today's notes
  const notes = await loadNotesByDate(state.selectedDate);
  renderNoteList(notes);

  // Chart resize on window resize
  window.addEventListener('resize', () => {
    Object.values(statsCharts).forEach(c => { try { c.resize(); } catch (e) {} });
  });

  // ── Auto-save listeners ───────────────────────────────
  const els = [
    document.getElementById('editorBody'),
    document.getElementById('quickTitle'),
    document.getElementById('detailBody'),
    document.getElementById('detailTitle')
  ];
  els.forEach(el => {
    if (!el) return;
    el.addEventListener('input', scheduleAutoSave);
  });
  // Tag clicks in both toolbars
  document.addEventListener('click', (e) => {
    if (e.target.closest('.tb-tag')) scheduleAutoSave();
  });
}

document.addEventListener('DOMContentLoaded', init);
