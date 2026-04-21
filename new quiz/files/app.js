/* ═══════════════════════════════════════════════════════════════
   MedLab Week 2026 – Quiz Platform  |  Firebase Edition
   Firestore → quizzes, creators
   Storage   → picture-round images, background images
═══════════════════════════════════════════════════════════════ */
'use strict';

/* ──────────────────────────────────────────────────────────────
   FIREBASE INIT  (compat mode – no bundler required)
────────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyAqcMeWPuZZgmBjqVygEFDG_dfNKDKTOD8",
  authDomain:        "medlab-quiz-2026.firebaseapp.com",
  projectId:         "medlab-quiz-2026",
  storageBucket:     "medlab-quiz-2026.firebasestorage.app",
  messagingSenderId: "685527702230",
  appId:             "1:685527702230:web:5868270a234ba56a334777",
  measurementId:     "G-7L9QKZM5H9"
};

firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();

/* ──────────────────────────────────────────────────────────────
   LOADING OVERLAY
────────────────────────────────────────────────────────────── */
function showLoading(msg = 'Loading…') {
  const el = document.getElementById('loading-overlay');
  if (el) { el.querySelector('.loading-msg').textContent = msg; el.classList.remove('hidden'); }
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

/* ──────────────────────────────────────────────────────────────
   IMAGE UTILITIES
────────────────────────────────────────────────────────────── */
function compressToDataUrl(file, maxW = 1400, quality = 0.72) {
  return new Promise(resolve => {
    const img    = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale  = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(blobUrl);
    };
    img.onerror = () => resolve('');
    img.src = blobUrl;
  });
}

async function uploadImageToStorage(file, storagePath, maxW = 1000, quality = 0.75) {
  const dataUrl = await compressToDataUrl(file, maxW, quality);
  const blob    = await fetch(dataUrl).then(r => r.blob());
  const ref     = storage.ref(storagePath);
  await ref.put(blob, { contentType: 'image/jpeg' });
  return await ref.getDownloadURL();
}

/* ──────────────────────────────────────────────────────────────
   AUTH MODULE  (Firestore-backed creators; admin hardcoded)
────────────────────────────────────────────────────────────── */
const Auth = (() => {
  const ADMIN_USER  = 'ADMIN';
  const ADMIN_PASS  = '7418902200';
  const SESSION_KEY = 'mlw_session';

  async function login(username, password) {
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const s = { role: 'admin', username: ADMIN_USER, name: 'Administrator' };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      return s;
    }
    try {
      const doc = await db.collection('creators').doc(username).get();
      if (doc.exists && doc.data().password === password) {
        const d = doc.data();
        const s = { role: 'creator', username: d.username, name: d.name || username };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        return s;
      }
    } catch (e) { console.error('Login error:', e); }
    return null;
  }

  function loginGuest() {
    const s = { role: 'guest', username: 'Guest', name: 'Guest' };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }

  function logout()     { sessionStorage.removeItem(SESSION_KEY); }
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  async function addCreator(username, password, name) {
    if (!username || !password) return { ok: false, msg: 'Username and password are required.' };
    if (password.length < 4)    return { ok: false, msg: 'Password must be at least 4 characters.' };
    if (username.toUpperCase() === ADMIN_USER) return { ok: false, msg: 'Cannot use reserved username ADMIN.' };
    try {
      const doc = await db.collection('creators').doc(username).get();
      if (doc.exists) return { ok: false, msg: `Username "${username}" already exists.` };
      await db.collection('creators').doc(username).set({
        username, password, name: name || username,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true };
    } catch (e) { return { ok: false, msg: 'Database error: ' + e.message }; }
  }

  async function deleteCreator(username) {
    await db.collection('creators').doc(username).delete();
  }

  async function getAllCreators() {
    const snap = await db.collection('creators').orderBy('createdAt').get();
    return snap.docs.map(d => d.data());
  }

  return { login, loginGuest, logout, getSession, addCreator, deleteCreator, getAllCreators };
})();

/* ──────────────────────────────────────────────────────────────
   STORE MODULE  (Firestore: quizzes collection)
   Document: quizzes/{quizId}
   Fields: id, title, timer, backgroundImage, questions[], pictureRounds[], createdAt
────────────────────────────────────────────────────────────── */
const Store = (() => {
  const COL = 'quizzes';

  async function getAllQuizzes() {
    const snap = await db.collection(COL).orderBy('createdAt').get();
    return snap.docs.map(d => d.data());
  }

  async function getQuiz(id) {
    if (!id) return null;
    const doc = await db.collection(COL).doc(id).get();
    return doc.exists ? doc.data() : null;
  }

  async function saveQuiz(id, data) {
    await db.collection(COL).doc(id).set(data, { merge: true });
  }

  async function newQuiz() {
    const ref = db.collection(COL).doc();
    const id  = ref.id;
    await ref.set({
      id, title: 'New Quiz', timer: 20,
      questions: [], pictureRounds: [], backgroundImage: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return id;
  }

  async function deleteQuiz(id) {
    await db.collection(COL).doc(id).delete();
  }

  return { getAllQuizzes, getQuiz, saveQuiz, newQuiz, deleteQuiz };
})();

/* ──────────────────────────────────────────────────────────────
   EMOJI EFFECTS
────────────────────────────────────────────────────────────── */
function spawnEmoji(emoji, count = 6) {
  const layer = document.getElementById('emoji-layer');
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const el = document.createElement('span');
      el.className = 'emoji-bubble';
      el.textContent = emoji;
      el.style.left = Math.random() * 95 + '%';
      el.style.animationDuration = (1.4 + Math.random() * 0.8) + 's';
      layer.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, i * 120);
  }
}

/* ──────────────────────────────────────────────────────────────
   SCREEN ROUTER
────────────────────────────────────────────────────────────── */
const Screens = (() => {
  const all = ['login-screen', 'admin-screen', 'app-wrapper'];
  function show(id) {
    all.forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }
  return { show };
})();

/* ──────────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showHomeSection(id) {
  ['home-screen','maker-screen','player-screen'].forEach(s =>
    $(s).classList.toggle('hidden', s !== id));
}

/* ──────────────────────────────────────────────────────────────
   ADMIN PANEL
────────────────────────────────────────────────────────────── */
const AdminPanel = (() => {
  async function render() {
    showLoading('Loading creators…');
    const list  = $('creator-list');
    const badge = $('creator-count-badge');
    try {
      const creators = await Auth.getAllCreators();
      badge.textContent = creators.length + ' creator' + (creators.length !== 1 ? 's' : '');
      if (!creators.length) {
        list.innerHTML = '<li class="empty-state">No creator accounts yet.</li>';
        return;
      }
      list.innerHTML = creators.map(c => `
        <li class="creator-item">
          <div class="creator-item-info">
            <div class="creator-item-name">${escHtml(c.username)}</div>
            ${c.name && c.name !== c.username
              ? `<div class="creator-item-display">${escHtml(c.name)}</div>` : ''}
          </div>
          <div class="creator-item-actions">
            <button class="delete-creator-btn" data-user="${escHtml(c.username)}">Delete</button>
          </div>
        </li>
      `).join('');
      list.querySelectorAll('.delete-creator-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const u = btn.dataset.user;
          if (!confirm(`Delete creator "${u}"?`)) return;
          showLoading('Deleting…');
          await Auth.deleteCreator(u);
          await render();
        });
      });
    } catch (e) {
      list.innerHTML = `<li class="empty-state" style="color:#fca5a5">Error: ${e.message}</li>`;
    } finally { hideLoading(); }
  }

  function init() {
    $('create-creator-btn').addEventListener('click', async () => {
      const username = $('new-creator-username').value.trim();
      const password = $('new-creator-password').value.trim();
      const name     = $('new-creator-name').value.trim();
      const status   = $('create-status');
      showLoading('Creating account…');
      const result = await Auth.addCreator(username, password, name);
      hideLoading();
      if (result.ok) {
        status.textContent = `✅ Creator "${username}" created!`;
        status.style.color = '#86efac';
        $('new-creator-username').value = '';
        $('new-creator-password').value = '';
        $('new-creator-name').value     = '';
        await render();
      } else {
        status.textContent = '❌ ' + result.msg;
        status.style.color = '#fca5a5';
      }
    });

    $('admin-logout-btn').addEventListener('click', () => {
      Auth.logout(); Screens.show('login-screen');
    });

    $('admin-go-home-btn').addEventListener('click', () => startApp());
  }

  return { init, render };
})();

/* ──────────────────────────────────────────────────────────────
   QUIZ APP STATE
────────────────────────────────────────────────────────────── */
let currentQuizId       = null;
let playerQuizId        = null;
let currentQuestions    = [];
let currentQ            = 0;
let score               = 0;
let timerInterval       = null;
let timeLeft            = 20;
let answered            = false;
let pictureRounds       = [];
let currentPictureRound = 0;
let pictureScore        = 0;
let pictureTimerInterval = null;
let pictureTimeLeft     = 20;
let pictureAnswered     = false;
let _makerInited        = false;
let _playerInited       = false;

/* ──────────────────────────────────────────────────────────────
   QUIZ MAKER  –  selects & rendering
────────────────────────────────────────────────────────────── */
async function refreshQuizSelect() {
  showLoading('Loading quizzes…');
  try {
    const quizzes = await Store.getAllQuizzes();
    const sel = $('quiz-select');
    sel.innerHTML = quizzes.length
      ? quizzes.map(q => `<option value="${q.id}">${escHtml(q.title)}</option>`).join('')
      : '<option value="">— No quizzes —</option>';

    if (!currentQuizId || !quizzes.find(q => q.id === currentQuizId)) {
      currentQuizId = quizzes.length ? quizzes[0].id : null;
    }
    for (const opt of sel.options) opt.selected = (opt.value === currentQuizId);
    await loadQuizIntoMaker(currentQuizId);
  } finally { hideLoading(); }
}

async function loadQuizIntoMaker(id) {
  if (!id) {
    $('quiz-title-input').value    = '';
    $('timer-seconds-input').value = 20;
    $('question-list').innerHTML   = '';
    $('picture-list').innerHTML    = '';
    $('quiz-count-badge').textContent = '0 questions';
    return;
  }
  const quiz = await Store.getQuiz(id);
  if (!quiz) return;
  $('quiz-title-input').value    = quiz.title || '';
  $('timer-seconds-input').value = quiz.timer || 20;
  renderQuestionList(quiz.questions || []);
  renderPictureList(quiz.pictureRounds || []);
}

function renderQuestionList(questions) {
  const ul = $('question-list');
  $('quiz-count-badge').textContent = questions.length + ' question' + (questions.length !== 1 ? 's' : '');
  if (!questions.length) { ul.innerHTML = '<li style="color:var(--muted);padding:0.5rem">No questions yet.</li>'; return; }
  ul.innerHTML = questions.map((q, i) => `
    <li>
      <strong>${i + 1}. ${escHtml(q.question)}</strong><br>
      <small style="color:var(--muted)">
        A: ${escHtml(q.options[0])} | B: ${escHtml(q.options[1])} |
        C: ${escHtml(q.options[2])} | D: ${escHtml(q.options[3])}
      </small><br>
      <small style="color:#86efac">Answer: ${['A','B','C','D'][q.answer]}</small>
      <button onclick="deleteQuestion(${i})"
        style="width:auto;padding:0.2rem 0.5rem;margin-left:0.5rem;background:#4b1d1d;
               border:1px solid var(--danger);border-radius:6px;font-size:0.8rem;cursor:pointer">✕</button>
    </li>
  `).join('');
}

async function deleteQuestion(index) {
  if (!currentQuizId) return;
  showLoading('Saving…');
  const quiz = await Store.getQuiz(currentQuizId);
  quiz.questions.splice(index, 1);
  await Store.saveQuiz(currentQuizId, quiz);
  renderQuestionList(quiz.questions);
  hideLoading();
}

function renderPictureList(rounds) {
  const ul = $('picture-list');
  if (!rounds.length) { ul.innerHTML = '<li style="color:var(--muted);padding:0.5rem">No picture rounds yet.</li>'; return; }
  ul.innerHTML = rounds.map((r, i) => `
    <li>
      <strong>Round ${i + 1}:</strong> Answer = <em>${escHtml(r.answer)}</em>
      (${r.images.length} image${r.images.length !== 1 ? 's' : ''})
      <button onclick="deletePictureRound(${i})"
        style="width:auto;padding:0.2rem 0.5rem;margin-left:0.5rem;background:#4b1d1d;
               border:1px solid var(--danger);border-radius:6px;font-size:0.8rem;cursor:pointer">✕</button>
    </li>
  `).join('');
}

async function deletePictureRound(index) {
  if (!currentQuizId) return;
  showLoading('Saving…');
  const quiz = await Store.getQuiz(currentQuizId);
  quiz.pictureRounds.splice(index, 1);
  await Store.saveQuiz(currentQuizId, quiz);
  renderPictureList(quiz.pictureRounds);
  hideLoading();
}

/* ──────────────────────────────────────────────────────────────
   INIT MAKER
────────────────────────────────────────────────────────────── */
function initMaker() {
  if (_makerInited) return;
  _makerInited = true;

  $('quiz-select').addEventListener('change', async e => {
    currentQuizId = e.target.value;
    showLoading('Loading quiz…');
    await loadQuizIntoMaker(currentQuizId);
    hideLoading();
  });

  $('add-new-quiz-btn').addEventListener('click', async () => {
    showLoading('Creating quiz…');
    const id = await Store.newQuiz();
    currentQuizId = id;
    await refreshQuizSelect();
    $('quiz-title-input').focus();
    $('quiz-title-input').select();
    $('title-status').textContent = '✏️ New quiz created — enter a title and click Save Title.';
    setTimeout(() => $('title-status').textContent = '', 4000);
  });

  $('delete-quiz-btn').addEventListener('click', async () => {
    if (!currentQuizId) return;
    if (!confirm('Delete this quiz? This cannot be undone.')) return;
    showLoading('Deleting quiz…');
    await Store.deleteQuiz(currentQuizId);
    currentQuizId = null;
    await refreshQuizSelect();
  });

  $('save-title-btn').addEventListener('click', async () => {
    if (!currentQuizId) { alert('Please create a quiz first.'); return; }
    showLoading('Saving…');
    const quiz = await Store.getQuiz(currentQuizId);
    quiz.title = $('quiz-title-input').value.trim() || 'Untitled Quiz';
    quiz.timer = parseInt($('timer-seconds-input').value) || 20;
    await Store.saveQuiz(currentQuizId, quiz);
    await refreshQuizSelect();
    $('title-status').textContent = '✅ Saved!';
    setTimeout(() => $('title-status').textContent = '', 2000);
  });

  $('background-image-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file || !currentQuizId) return;
    showLoading('Uploading background…');
    try {
      const url  = await uploadImageToStorage(file, `backgrounds/${currentQuizId}/bg_${Date.now()}.jpg`, 1400, 0.72);
      const quiz = await Store.getQuiz(currentQuizId);
      quiz.backgroundImage = url;
      await Store.saveQuiz(currentQuizId, quiz);
      $('title-status').textContent = '🖼️ Background saved.';
      setTimeout(() => $('title-status').textContent = '', 2000);
    } catch (err) {
      $('title-status').textContent = '❌ Upload failed: ' + err.message;
    } finally { hideLoading(); }
  });

  $('clear-background-btn').addEventListener('click', async () => {
    if (!currentQuizId) return;
    showLoading('Removing…');
    const quiz = await Store.getQuiz(currentQuizId);
    quiz.backgroundImage = '';
    await Store.saveQuiz(currentQuizId, quiz);
    $('background-image-input').value = '';
    $('title-status').textContent = '🗑️ Background removed.';
    setTimeout(() => $('title-status').textContent = '', 2000);
    hideLoading();
  });

  $('question-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentQuizId) { alert('Please create or select a quiz first.'); return; }
    showLoading('Saving question…');
    const q = {
      question: $('question-text').value.trim(),
      options:  [$('opt-a').value.trim(), $('opt-b').value.trim(),
                 $('opt-c').value.trim(), $('opt-d').value.trim()],
      answer:   parseInt($('correct-answer').value)
    };
    const quiz = await Store.getQuiz(currentQuizId);
    quiz.questions.push(q);
    await Store.saveQuiz(currentQuizId, quiz);
    renderQuestionList(quiz.questions);
    hideLoading();
    e.target.reset();
  });

  $('clear-quiz-btn').addEventListener('click', async () => {
    if (!currentQuizId) return;
    if (!confirm('Clear all questions?')) return;
    showLoading('Clearing…');
    const quiz = await Store.getQuiz(currentQuizId);
    quiz.questions = [];
    await Store.saveQuiz(currentQuizId, quiz);
    renderQuestionList([]);
    hideLoading();
  });

  $('upload-btn').addEventListener('click', () => {
    const file = $('quiz-file-input').files[0];
    if (!file) { alert('Please select a file.'); return; }
    if (!currentQuizId) { alert('Please create or select a quiz first.'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    if      (ext === 'xlsx' || ext === 'xls') importExcel(file);
    else if (ext === 'docx')                  importDocx(file);
    else alert('Unsupported file type. Use .xlsx, .xls, or .docx');
  });

  $('download-excel-format-btn').addEventListener('click', downloadExcelTemplate);
  $('download-word-format-btn').addEventListener('click',  downloadWordTemplate);

  $('picture-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentQuizId) { alert('Please create or select a quiz first.'); return; }
    const answer = $('picture-answer-input').value.trim();
    if (!answer) { alert('Please enter a correct answer.'); return; }
    const urlsRaw   = $('picture-urls-input').value.trim();
    const urlImages = urlsRaw
      ? urlsRaw.split('\n').map(u => u.trim()).filter(u => u.startsWith('http')) : [];
    const files = Array.from($('picture-images-input').files || []);
    if (!files.length && !urlImages.length) { alert('Please provide at least one image.'); return; }

    showLoading('Uploading images…');
    try {
      const uploadedUrls = await Promise.all(
        files.map((f, i) => uploadImageToStorage(
          f, `pictureRounds/${currentQuizId}/${Date.now()}_${i}.jpg`, 900, 0.78))
      );
      const quiz = await Store.getQuiz(currentQuizId);
      quiz.pictureRounds.push({ answer, images: [...uploadedUrls, ...urlImages] });
      await Store.saveQuiz(currentQuizId, quiz);
      renderPictureList(quiz.pictureRounds);
      e.target.reset();
      $('picture-urls-input').value = '';
    } catch (err) {
      alert('Upload error: ' + err.message);
    } finally { hideLoading(); }
  });

  $('clear-picture-btn').addEventListener('click', async () => {
    if (!currentQuizId) return;
    if (!confirm('Clear all picture rounds?')) return;
    showLoading('Clearing…');
    const quiz = await Store.getQuiz(currentQuizId);
    quiz.pictureRounds = [];
    await Store.saveQuiz(currentQuizId, quiz);
    renderPictureList([]);
    hideLoading();
  });

  $('back-home-from-maker').addEventListener('click', () => showHomeSection('home-screen'));
}

/* ──────────────────────────────────────────────────────────────
   EXCEL / DOCX IMPORT
────────────────────────────────────────────────────────────── */
function importExcel(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const questions = [];
      rows.forEach(row => {
        const keys = Object.keys(row).map(k => k.toLowerCase().trim());
        const get  = (...ns) => { for (const n of ns) { const k = keys.find(k=>k.includes(n)); if(k) return String(row[Object.keys(row)[keys.indexOf(k)]]).trim(); } return ''; };
        const q=get('question','q'), o1=get('option1','opt1','opta'), o2=get('option2','opt2','optb'),
              o3=get('option3','opt3','optc'), o4=get('option4','opt4','optd'),
              ans=get('answer','correct','ans').toUpperCase();
        if (!q || !o1) return;
        const idx = ['A','B','C','D'].indexOf(ans.charAt(0));
        questions.push({ question:q, options:[o1,o2,o3,o4], answer: idx>=0 ? idx : 0 });
      });
      if (!questions.length) { $('upload-status').textContent = '⚠️ No valid rows found.'; return; }
      showLoading('Saving…');
      const quiz = await Store.getQuiz(currentQuizId);
      quiz.questions = [...quiz.questions, ...questions];
      await Store.saveQuiz(currentQuizId, quiz);
      renderQuestionList(quiz.questions);
      $('upload-status').textContent = `✅ Imported ${questions.length} question(s).`;
    } catch (err) { $('upload-status').textContent = '❌ ' + err.message; }
    finally { hideLoading(); }
  };
  reader.readAsArrayBuffer(file);
}

function importDocx(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const result    = await mammoth.extractRawText({ arrayBuffer: e.target.result });
      const lines     = result.value.split('\n').map(l=>l.trim()).filter(Boolean);
      const questions = parseDocxLines(lines);
      if (!questions.length) { $('upload-status').textContent = '⚠️ Could not parse. Check format.'; return; }
      showLoading('Saving…');
      const quiz = await Store.getQuiz(currentQuizId);
      quiz.questions = [...quiz.questions, ...questions];
      await Store.saveQuiz(currentQuizId, quiz);
      renderQuestionList(quiz.questions);
      $('upload-status').textContent = `✅ Imported ${questions.length} question(s).`;
    } catch (err) { $('upload-status').textContent = '❌ ' + err.message; }
    finally { hideLoading(); }
  };
  reader.readAsArrayBuffer(file);
}

function parseDocxLines(lines) {
  const questions=[], isQ=l=>/^(Q\s*[:.]|Question\s*[:.]|\d+[\.\)])/i.test(l),
        isOpt=l=>/^[ABCD][\.\)]\s*\S/i.test(l)||/^[1-4][\.\)]\s*\S/.test(l),
        isAns=l=>/^(answer|ans|correct)\s*[:]/i.test(l);
  let current=null;
  for (const line of lines) {
    if (isQ(line)) {
      if (current && current.options.filter(Boolean).length>=2) questions.push(finaliseQ(current));
      current={ question: line.replace(/^(Q\s*[:.]|Question\s*[:.]|\d+[\.\)])\s*/i,'').trim(), options:['','','',''], answer:0 };
    } else if (isOpt(line) && current) {
      const ch=line.trim().charAt(0).toUpperCase(), idx={A:0,B:1,C:2,D:3,'1':0,'2':1,'3':2,'4':3}[ch];
      if (idx!==undefined) current.options[idx]=line.replace(/^[ABCD1-4][\.\)]\s*/i,'').trim();
    } else if (isAns(line) && current) {
      const raw=line.replace(/^(answer|ans|correct)\s*[:]\s*/i,'').trim().toUpperCase();
      const map={A:0,B:1,C:2,D:3,'1':0,'2':1,'3':2,'4':3};
      if (map[raw.charAt(0)]!==undefined) current.answer=map[raw.charAt(0)];
    }
  }
  if (current && current.options.filter(Boolean).length>=2) questions.push(finaliseQ(current));
  return questions;
}
function finaliseQ(q) { q.options=q.options.map(o=>o||'—'); return q; }

function downloadExcelTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Question','Option1','Option2','Option3','Option4','Answer'],
    ['What is the normal pH of blood?','7.35–7.45','6.9–7.1','7.5–7.7','8.0–8.2','A'],
    ['Which cell type produces antibodies?','T lymphocyte','B lymphocyte','Neutrophil','Monocyte','B']
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Quiz');
  XLSX.writeFile(wb, 'quiz_template.xlsx');
}
function downloadWordTemplate() {
  const a=Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(new Blob([`Q: Sample question?\nA) Option A\nB) Option B\nC) Option C\nD) Option D\nAnswer: A\n`],{type:'text/plain'})),
    download:'quiz_template.txt'
  });
  a.click();
}

/* ──────────────────────────────────────────────────────────────
   QUIZ PLAYER
────────────────────────────────────────────────────────────── */
async function refreshPlaySelect() {
  showLoading('Loading quizzes…');
  try {
    const quizzes = await Store.getAllQuizzes();   // always fresh from Firestore
    const sel     = $('play-quiz-select');
    sel.innerHTML = quizzes.length
      ? quizzes.map(q=>`<option value="${q.id}">${escHtml(q.title)}</option>`).join('')
      : '<option value="">No quizzes available</option>';
    if (playerQuizId && quizzes.find(q=>q.id===playerQuizId))
      for (const opt of sel.options) opt.selected=(opt.value===playerQuizId);
  } finally { hideLoading(); }
}

function initPlayer() {
  if (_playerInited) return;
  _playerInited = true;

  $('back-home-from-player').addEventListener('click', () => {
    stopQuizTimer(); stopPictureTimer();
    showHomeSection('home-screen');
  });

  $('start-quiz-btn').addEventListener('click', async () => {
    const id = $('play-quiz-select').value;
    if (!id) { alert('No quiz available. Please create one first.'); return; }
    showLoading('Loading quiz…');
    const quiz = await Store.getQuiz(id);
    hideLoading();
    if (!quiz || !quiz.questions.length) { alert('This quiz has no questions.'); return; }
    startQuiz(quiz);
  });

  $('start-picture-game-btn').addEventListener('click', async () => {
    const id = $('play-quiz-select').value;
    if (!id) { alert('No quiz available.'); return; }
    showLoading('Loading game…');
    const quiz = await Store.getQuiz(id);
    hideLoading();
    if (!quiz || !quiz.pictureRounds || !quiz.pictureRounds.length) {
      alert('No picture rounds in this quiz.'); return;
    }
    startPictureGame(quiz);
  });

  $('next-btn').addEventListener('click', nextQuestion);

  $('restart-btn').addEventListener('click', async () => {
    $('quiz-summary').classList.add('hidden');
    $('quiz-player').classList.add('hidden');
    $('picture-player').classList.add('hidden');
    stopQuizTimer(); stopPictureTimer();
    await refreshPlaySelect();
  });

  $('picture-submit-btn').addEventListener('click', submitPictureAnswer);
  $('picture-next-btn').addEventListener('click', nextPictureRound);
  $('picture-answer-play-input').addEventListener('keydown', e => {
    if (e.key==='Enter' && !pictureAnswered) submitPictureAnswer();
  });
}

/* ── Quiz game ── */
function startQuiz(quiz) {
  playerQuizId     = quiz.id;
  currentQuestions = [...quiz.questions];
  currentQ         = 0;
  score            = 0;
  const ps = $('player-screen');
  if (quiz.backgroundImage) {
    ps.style.backgroundImage = `url("${quiz.backgroundImage}")`;
    ps.classList.add('with-bg');
  } else { ps.style.backgroundImage=''; ps.classList.remove('with-bg'); }
  $('quiz-player').classList.remove('hidden');
  $('picture-player').classList.add('hidden');
  $('quiz-summary').classList.add('hidden');
  showQuestion(quiz.timer||20);
}

function showQuestion(timerSecs) {
  stopQuizTimer();
  answered = false;
  const q = currentQuestions[currentQ];
  $('progress-label').textContent  = `Question ${currentQ+1} / ${currentQuestions.length}`;
  $('score-label').textContent     = `Score: ${score}`;
  $('play-question').textContent   = q.question;
  $('answer-feedback').textContent = '';
  $('answer-feedback').className   = 'feedback';
  $('next-btn').classList.add('hidden');
  const optDiv = $('play-options');
  optDiv.innerHTML = q.options.map((o,i)=>
    `<button class="play-option" data-idx="${i}">${['A','B','C','D'][i]}. ${escHtml(o)}</button>`
  ).join('');
  optDiv.querySelectorAll('.play-option').forEach(btn=>
    btn.addEventListener('click', ()=>handleAnswer(parseInt(btn.dataset.idx))));
  timeLeft = timerSecs;
  updateTimerLabel();
  timerInterval = setInterval(()=>{ timeLeft--; updateTimerLabel(); if(timeLeft<=0){clearInterval(timerInterval);autoExpire();} },1000);
}

function updateTimerLabel() {
  const lbl=$('timer-label');
  lbl.textContent=`Time: ${timeLeft}s`;
  lbl.classList.toggle('warning', timeLeft<=5);
}

function handleAnswer(idx) {
  if (answered) return;
  answered=true; stopQuizTimer();
  const q=currentQuestions[currentQ];
  const btns=$('play-options').querySelectorAll('.play-option');
  btns.forEach(b=>b.disabled=true);
  btns[q.answer].classList.add('correct');
  if (idx===q.answer) {
    score++; btns[idx].classList.add('correct');
    $('answer-feedback').textContent='✅ Correct!';
    $('answer-feedback').className='feedback ok';
    spawnEmoji('🎉',5);
  } else {
    btns[idx].classList.add('wrong');
    $('answer-feedback').textContent=`❌ Wrong! Correct: ${['A','B','C','D'][q.answer]}`;
    $('answer-feedback').className='feedback nope';
  }
  $('score-label').textContent=`Score: ${score}`;
  $('next-btn').classList.remove('hidden');
}

function autoExpire() {
  if (answered) return;
  answered=true;
  const q=currentQuestions[currentQ];
  const btns=$('play-options').querySelectorAll('.play-option');
  btns.forEach(b=>b.disabled=true);
  btns[q.answer].classList.add('correct');
  $('answer-feedback').textContent=`⏰ Time's up! Correct: ${['A','B','C','D'][q.answer]}`;
  $('answer-feedback').className='feedback nope';
  $('next-btn').classList.remove('hidden');
}

async function nextQuestion() {
  const quiz = await Store.getQuiz(playerQuizId);
  currentQ++;
  if (currentQ>=currentQuestions.length) showSummary();
  else showQuestion(quiz ? quiz.timer||20 : 20);
}

function showSummary() {
  $('quiz-player').classList.add('hidden');
  $('quiz-summary').classList.remove('hidden');
  const pct=Math.round((score/currentQuestions.length)*100);
  $('summary-text').innerHTML=`You scored <strong>${score}</strong> out of <strong>${currentQuestions.length}</strong> (${pct}%).`;
  if (pct===100) spawnEmoji('🏆',12);
  else if (pct>=60) spawnEmoji('🌟',8);
}

function stopQuizTimer() { clearInterval(timerInterval); timerInterval=null; }

/* ── Picture Connection game ── */
function startPictureGame(quiz) {
  playerQuizId        = quiz.id;
  pictureRounds       = quiz.pictureRounds;
  currentPictureRound = 0;
  pictureScore        = 0;
  $('quiz-player').classList.add('hidden');
  $('quiz-summary').classList.add('hidden');
  $('picture-player').classList.remove('hidden');
  showPictureRound(quiz.timer||20);
}

function showPictureRound(timerSecs) {
  stopPictureTimer();
  pictureAnswered=false;
  const round=pictureRounds[currentPictureRound];
  $('picture-progress-label').textContent = `Round ${currentPictureRound+1} / ${pictureRounds.length}`;
  $('picture-score-label').textContent    = `Score: ${pictureScore}`;
  $('picture-feedback').textContent       = '';
  $('picture-feedback').className         = 'feedback';
  $('picture-answer-play-input').value    = '';
  $('picture-answer-play-input').disabled = false;
  $('picture-submit-btn').classList.remove('hidden');
  $('picture-next-btn').classList.add('hidden');
  $('picture-images-grid').innerHTML = round.images.map(src=>
    `<img src="${escHtml(src)}" alt="Picture clue" loading="lazy">`).join('');
  pictureTimeLeft=timerSecs;
  updatePictureTimerLabel();
  pictureTimerInterval=setInterval(()=>{ pictureTimeLeft--; updatePictureTimerLabel(); if(pictureTimeLeft<=0){clearInterval(pictureTimerInterval);autoPictureExpire();} },1000);
}

function updatePictureTimerLabel() {
  const lbl=$('picture-timer-label');
  lbl.textContent=`Time: ${pictureTimeLeft}s`;
  lbl.classList.toggle('warning',pictureTimeLeft<=5);
}

function submitPictureAnswer() {
  if (pictureAnswered) return;
  const ua=$('picture-answer-play-input').value.trim();
  if (!ua) { alert('Please type an answer.'); return; }
  revealPictureResult(ua);
}

function revealPictureResult(userAns) {
  pictureAnswered=true; stopPictureTimer();
  const round=pictureRounds[currentPictureRound];
  $('picture-answer-play-input').disabled=true;
  $('picture-submit-btn').classList.add('hidden');
  if (userAns.toLowerCase()===round.answer.toLowerCase()) {
    pictureScore++;
    $('picture-feedback').textContent='✅ Correct!';
    $('picture-feedback').className='feedback ok';
    spawnEmoji('🎊',6);
  } else {
    $('picture-feedback').textContent=`❌ Wrong! Answer: ${round.answer}`;
    $('picture-feedback').className='feedback nope';
  }
  $('picture-score-label').textContent=`Score: ${pictureScore}`;
  $('picture-next-btn').classList.remove('hidden');
}

function autoPictureExpire() {
  if (pictureAnswered) return;
  pictureAnswered=true;
  $('picture-answer-play-input').disabled=true;
  $('picture-submit-btn').classList.add('hidden');
  $('picture-feedback').textContent=`⏰ Time's up! Answer: ${pictureRounds[currentPictureRound].answer}`;
  $('picture-feedback').className='feedback nope';
  $('picture-next-btn').classList.remove('hidden');
}

async function nextPictureRound() {
  currentPictureRound++;
  if (currentPictureRound>=pictureRounds.length) {
    $('picture-player').classList.add('hidden');
    $('quiz-summary').classList.remove('hidden');
    $('summary-text').innerHTML=`Picture game: <strong>${pictureScore}</strong> / <strong>${pictureRounds.length}</strong>`;
    if (pictureScore===pictureRounds.length) spawnEmoji('🏆',12);
  } else {
    const quiz=await Store.getQuiz(playerQuizId);
    showPictureRound(quiz ? quiz.timer||20 : 20);
  }
}

function stopPictureTimer() { clearInterval(pictureTimerInterval); pictureTimerInterval=null; }

/* ──────────────────────────────────────────────────────────────
   APP STARTUP
────────────────────────────────────────────────────────────── */
async function startApp(session) {
  if (!session) session = Auth.getSession();
  Screens.show('app-wrapper');

  const role = session ? session.role : 'guest';
  $('session-bar').classList.remove('hidden');
  $('session-user-label').textContent =
    role==='admin'   ? '👑 Admin'                  :
    role==='creator' ? '✏️ Creator: '+session.name :
                       '🎮 Playing as Guest';

  // Rebind logout cleanly
  const old = $('nav-logout-btn');
  const fresh = old.cloneNode(true);
  old.replaceWith(fresh);
  $('nav-logout-btn').addEventListener('click', () => { Auth.logout(); location.reload(); });

  if (role==='creator' || role==='admin') {
    $('home-make-quiz-row').classList.remove('hidden');
    $('home-play-only-row').classList.add('hidden');
  } else {
    $('home-make-quiz-row').classList.add('hidden');
    $('home-play-only-row').classList.remove('hidden');
  }

  showHomeSection('home-screen');

  // Rebind nav buttons cleanly
  ['go-maker-btn','go-player-btn','go-player-only-btn','go-picture-player-btn'].forEach(id => {
    const el=$(id); if (!el) return;
    const f=el.cloneNode(true); el.replaceWith(f);
  });

  $('go-maker-btn')?.addEventListener('click', async () => {
    await refreshQuizSelect(); showHomeSection('maker-screen');
  });
  const goPlayer = async () => { await refreshPlaySelect(); showHomeSection('player-screen'); };
  $('go-player-btn')?.addEventListener('click', goPlayer);
  $('go-player-only-btn')?.addEventListener('click', goPlayer);
  $('go-picture-player-btn').addEventListener('click', goPlayer);

  initMaker();
  initPlayer();

  // Ensure at least one quiz exists
  showLoading('Loading…');
  const quizzes = await Store.getAllQuizzes();
  if (!quizzes.length) await Store.newQuiz();
  await refreshQuizSelect();
}

/* ──────────────────────────────────────────────────────────────
   LOGIN SCREEN
────────────────────────────────────────────────────────────── */
function initLogin() {
  const doLogin = async () => {
    const username=$('login-username').value.trim();
    const password=$('login-password').value;
    const errEl=$('login-error');
    if (!username || !password) {
      errEl.textContent='Please enter username and password.';
      errEl.classList.remove('hidden'); return;
    }
    showLoading('Signing in…');
    const session = await Auth.login(username, password);
    hideLoading();
    if (!session) {
      errEl.textContent='Incorrect username or password.';
      errEl.classList.remove('hidden'); return;
    }
    errEl.classList.add('hidden');
    if (session.role==='admin') { Screens.show('admin-screen'); await AdminPanel.render(); }
    else                         await startApp(session);
  };

  $('login-btn').addEventListener('click', doLogin);
  $('login-password').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  $('login-username').addEventListener('keydown', e=>{ if(e.key==='Enter') $('login-password').focus(); });
  $('guest-play-btn').addEventListener('click', async () => { await startApp(Auth.loginGuest()); });
}

/* ──────────────────────────────────────────────────────────────
   BOOT
────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  AdminPanel.init();
  initLogin();
  const session = Auth.getSession();
  if (session) {
    if (session.role==='admin') { Screens.show('admin-screen'); await AdminPanel.render(); }
    else                         await startApp(session);
  } else {
    Screens.show('login-screen');
  }
});
