const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Paths ───────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'upload');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── JSON File Store ─────────────────────────────────────
let DATA_PATH;
const DEFAULT_TAGS = [
  { id: 1, name: '工作', color: '#D97706' },
  { id: 2, name: '个人', color: '#22C55E' },
  { id: 3, name: '想法', color: '#8B5CF6' },
];
const TAG_COLORS = ['#D97706','#22C55E','#8B5CF6','#EF4444','#3B82F6','#EC4899','#14B8A6','#F97316'];
let store = { notes: [], images: [], tags: [], nextNoteId: 1, nextImageId: 1, nextTagId: 100 };

function loadStore() {
  const DATA_DIR = path.join(__dirname, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  DATA_PATH = path.join(DATA_DIR, 'noteflow-data.json');

  // Migrate old data from AppData if exists
  const oldPath = path.join(app.getPath('userData'), 'noteflow-data.json');
  if (fs.existsSync(oldPath) && !fs.existsSync(DATA_PATH)) {
    fs.copyFileSync(oldPath, DATA_PATH);
  }
  if (fs.existsSync(DATA_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      store.notes = store.notes || [];
      store.images = store.images || [];
      store.tags = store.tags || [];
      store.nextNoteId = store.nextNoteId || 1;
      store.nextImageId = store.nextImageId || 1;
      store.nextTagId = store.nextTagId || 100;
      // Backward compat
      for (const n of store.notes) {
        if (n.title === undefined) n.title = '';
      }
      // Seed default tags if empty
      if (store.tags.length === 0) {
        store.tags = [...DEFAULT_TAGS];
        store.nextTagId = 100;
        saveStore();
      }
    } catch (e) {
      store = { notes: [], images: [], tags: [...DEFAULT_TAGS], nextNoteId: 1, nextImageId: 1, nextTagId: 100 };
    }
  } else {
    store = { notes: [], images: [], tags: [...DEFAULT_TAGS], nextNoteId: 1, nextImageId: 1, nextTagId: 100 };
  }
}

function saveStore() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function initDatabase() {
  loadStore();
}

// ─── IPC Handlers ────────────────────────────────────────

function setupIPC() {
  // Get all notes for a date range
  ipcMain.handle('notes:getByRange', (_, startDate, endDate) => {
    loadStore();
    return store.notes
      .filter(n => n.date >= startDate && n.date <= endDate)
      .sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      });
  });

  // Get notes for a specific date
  ipcMain.handle('notes:getByDate', (_, date) => {
    loadStore();
    return store.notes
      .filter(n => n.date === date)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  });

  // Get a single note
  ipcMain.handle('notes:getById', (_, id) => {
    loadStore();
    return store.notes.find(n => n.id === id) || null;
  });

  // Create a note
  ipcMain.handle('notes:create', (_, { content, plain_text, date, tags, title }) => {
    loadStore();
    const now = new Date().toISOString();
    const note = {
      id: store.nextNoteId++,
      title: title || '',
      content: content || '',
      plain_text: plain_text || '',
      date: date,
      tags: tags || '',
      has_image: 0,
      created_at: now,
      updated_at: now
    };
    store.notes.push(note);
    saveStore();
    return { id: note.id };
  });

  // Update a note
  ipcMain.handle('notes:update', (_, { id, content, plain_text, tags, title }) => {
    loadStore();
    const note = store.notes.find(n => n.id === id);
    if (!note) return { success: false };
    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    if (plain_text !== undefined) note.plain_text = plain_text;
    if (tags !== undefined) note.tags = tags;
    note.updated_at = new Date().toISOString();
    saveStore();
    return { success: true };
  });

  // Delete a note
  ipcMain.handle('notes:delete', (_, id) => {
    loadStore();
    // Delete associated image files
    const imgs = store.images.filter(img => img.note_id === id);
    for (const img of imgs) {
      const imgPath = path.join(UPLOAD_DIR, img.filename);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    // Remove images metadata
    store.images = store.images.filter(img => img.note_id !== id);
    // Remove note
    store.notes = store.notes.filter(n => n.id !== id);
    saveStore();
    return { success: true };
  });

  // Get year statistics
  ipcMain.handle('notes:getYearStats', (_, year) => {
    loadStore();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const yearNotes = store.notes.filter(n => n.date >= startDate && n.date <= endDate);
    const total = yearNotes.length;

    // Active months
    const months = new Set(yearNotes.map(n => n.date.substring(0, 7)));
    const activeMonths = months.size;

    // Peak month
    const monthCounts = {};
    for (const n of yearNotes) {
      const m = n.date.substring(0, 7);
      monthCounts[m] = (monthCounts[m] || 0) + 1;
    }
    let peakMonth = null;
    let peakCount = 0;
    for (const [m, c] of Object.entries(monthCounts)) {
      if (c > peakCount) { peakMonth = m; peakCount = c; }
    }

    // Per-month counts
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      monthly.push({ month: key, count: monthCounts[key] || 0 });
    }

    // Per-day counts for heatmap
    const dayCounts = {};
    for (const n of yearNotes) {
      dayCounts[n.date] = (dayCounts[n.date] || 0) + 1;
    }
    const daily = Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { total, activeMonths, peakMonth, peakCount, monthly, daily };
  });

  // Get notes count per day for a month (calendar dots)
  ipcMain.handle('notes:getMonthDots', (_, yearMonth) => {
    loadStore();
    const dayCounts = {};
    for (const n of store.notes) {
      if (n.date.startsWith(yearMonth)) {
        dayCounts[n.date] = (dayCounts[n.date] || 0) + 1;
      }
    }
    return Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  // ── Tag CRUD ──────────────────────────────────────────
  ipcMain.handle('tags:list', () => {
    loadStore();
    return store.tags;
  });

  ipcMain.handle('tags:create', (_, { name }) => {
    loadStore();
    if (!name || !name.trim()) return null;
    // Check duplicate
    if (store.tags.find(t => t.name === name.trim())) return null;
    const color = TAG_COLORS[(store.tags.length - 3) % TAG_COLORS.length];
    const tag = { id: store.nextTagId++, name: name.trim(), color };
    store.tags.push(tag);
    saveStore();
    return tag;
  });

  ipcMain.handle('tags:delete', (_, id) => {
    loadStore();
    store.tags = store.tags.filter(t => t.id !== id);
    saveStore();
    return { success: true };
  });

  // ── Stats data ────────────────────────────────────────
  ipcMain.handle('stats:getData', (_, { year, month }) => {
    loadStore();

    // Filter notes by year (and optionally month)
    let notes = store.notes;
    if (year) {
      const yearStr = String(year);
      notes = notes.filter(n => n.date.startsWith(yearStr));
      if (month && month !== 'all') {
        const monthStr = yearStr + '-' + String(month).padStart(2, '0');
        notes = notes.filter(n => n.date.startsWith(monthStr));
      }
    }

    // Tag counts
    const tagCounts = {};
    notes.forEach(n => {
      const tags = (n.tags || '').split(',').filter(Boolean);
      tags.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    const tagData = Object.entries(tagCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Daily counts
    const dayCounts = {};
    notes.forEach(n => {
      dayCounts[n.date] = (dayCounts[n.date] || 0) + 1;
    });
    const dayData = Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Graph nodes: notes linked by shared tags
    const graphNodes = [];
    const graphLinks = [];
    const nodeIds = new Set();

    notes.forEach(n => {
      const tags = (n.tags || '').split(',').filter(Boolean);
      if (tags.length === 0) return;
      const title = n.title || (n.plain_text || '').substring(0, 15);
      const label = title.length > 12 ? title.substring(0, 12) + '...' : title;
      graphNodes.push({ id: 'n' + n.id, name: label, symbolSize: 8 + Math.min(tags.length * 4, 24), category: 0 });
      nodeIds.add('n' + n.id);
    });

    // Links between notes sharing tags
    for (let i = 0; i < notes.length; i++) {
      const ti = (notes[i].tags || '').split(',').filter(Boolean);
      if (ti.length === 0) continue;
      for (let j = i + 1; j < notes.length; j++) {
        const tj = (notes[j].tags || '').split(',').filter(Boolean);
        const shared = ti.filter(t => tj.includes(t));
        if (shared.length > 0) {
          graphLinks.push({ source: 'n' + notes[i].id, target: 'n' + notes[j].id, value: shared.length });
        }
      }
    }

    // Limit graph data for performance
    const maxLinks = 200;
    const limitedLinks = graphLinks.slice(0, maxLinks);

    return { tagData, dayData, graph: { nodes: graphNodes, links: limitedLinks } };
  });

  // Image handling
  ipcMain.handle('image:save', (_, { noteId, buffer, originalName }) => {
    loadStore();
    const ext = path.extname(originalName) || '.png';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));

    const img = {
      id: store.nextImageId++,
      note_id: noteId,
      filename,
      original_name: originalName || '',
      created_at: new Date().toISOString()
    };
    store.images.push(img);

    // Mark note as having images
    const note = store.notes.find(n => n.id === noteId);
    if (note) note.has_image = 1;

    saveStore();
    return { filename, filepath };
  });

  // Get images for a note
  ipcMain.handle('image:getByNote', (_, noteId) => {
    loadStore();
    return store.images
      .filter(img => img.note_id === noteId)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  });

  // Read image file as base64 for display
  ipcMain.handle('image:read', (_, filename) => {
    const filepath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filepath)) return null;

    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp'
    };
    const mime = mimeMap[ext] || 'image/png';
    const data = fs.readFileSync(filepath);
    return `data:${mime};base64,${data.toString('base64')}`;
  });

  // Delete an image
  ipcMain.handle('image:delete', (_, imageId) => {
    loadStore();
    const idx = store.images.findIndex(img => img.id === imageId);
    if (idx === -1) return { success: false };

    const img = store.images[idx];
    const filepath = path.join(UPLOAD_DIR, img.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    store.images.splice(idx, 1);

    // Check if note still has images
    const remaining = store.images.filter(i => i.note_id === img.note_id);
    if (remaining.length === 0) {
      const note = store.notes.find(n => n.id === img.note_id);
      if (note) note.has_image = 0;
    }

    saveStore();
    return { success: true };
  });

  // File dialog for image upload
  ipcMain.handle('dialog:openImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    });
    if (result.canceled) return [];

    const files = [];
    for (const filepath of result.filePaths) {
      const buffer = fs.readFileSync(filepath);
      const originalName = path.basename(filepath);
      files.push({ buffer: Array.from(buffer), originalName });
    }
    return files;
  });
}

// ─── App Lifecycle ───────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'NoteFlow',
    icon: path.join(__dirname, 'upload', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  initDatabase();
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
