/* ═══════════════════════════════════════════════
   DEFAULT DATA
═══════════════════════════════════════════════ */
const DEFAULT_SUBJECTS = [
  "Tarix","Turk tili","Geografiya","Mutolaa","Koreys tili","Xitoy tili",
  "Informatika","Ingliz tili","Matematika","Ona tili","Kimyo-Biologiya",
  "Tabiiy fan","Fizika","Arab tili","Rus tili"
];

const DEFAULT_STUDENTS = {
  "5-sinf": ["Yo'ldoshaliyev Abdulahad","Nabijonova Sitora","Abdumutaliyeva Asalxon","Usmonxo'jayeva Diyoraxon","Bekmirzayev Otabek","Hakimjonov Hamidullo","Rustamova Malikaxon","Usmonaliyev Alisher","Musajonov Hojimurod","Alijonov Islombek","Imomova Xushnoza","Nu'monova Madina","Sobirov Muhammadbobur","Zuxriddinova Yasminaxon","Inomjonov Ibrohim","Bannonov Abdulloh","Saidmo'minova Muhsinaxon","Muhammadolimov Fahriddin","Odiljonova Muslimaxon"],
  "6-sinf": ["Nosirjonova Layloxon","Muhammadaliyeva Sevaraxon","Mamasoliyeva Hadicha","To'lqinjonova Shahzoda","Mamasoliyeva Mubina","Qo'shoqboyev Muhammadaziz","Mansurjonov Hojakbar","Soliyev Shamsiddin","G'ulomjonov Muhammaddiyor","Soliyev Ziyovuddin","Rustamjonova Rayxona","Alijonov Anasxon","Yusufjonova Fotimaxon","Mamadnosirov G'olibjon","Odiljonova Salomatxon","Abdulazizova Nozimaxon"],
  "7-sinf": ["Yo'ldoshaliyeva Farzona","Abdullayev Muslimbek","Adhamov Jahongir","Muxtorov Abdulloh","Adhamjonov Muhammadyusuf","Ergashboyev Abdulloh","Abdumutalov Abdulbosit","Akramjonov Murodillo","Ashuraliyev Ilhomjon","Omonaliyev Muhammad","Bahodirov Saidabror","Alijonov Mus'ab","Kamoliddinov Shamshodbek","Bahriddinov Muhammadjon","Nuraliyev Muhammadyasin","Xoshimjonov Dovudbek","Ibrohimov Islomjon"],
  "8-sinf": ["Rustamova Mushtariy","Usmonaliyev Sanjarbek","Zokirjonova Zahroxon","Nurmatova Mohinabonu","Mamasoliyeva Arofatxon","Mirzajonov Fayzulloh","Zafarjonov Behruzbek","Oʻlmasova Mohichehra","Valijonova Zeboxon","Lazizxonova Oyshabonu","Tursunov Aliy","Qodirov Bobomurod","Inomjonova Umidaxon","Ortiqboyeva Malikaxon","Adhamjonov Muhammadsaid","Qodirova Sarvinoz","Abdulazizov Mashrabbek"]
};

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let db = (() => {
  try { return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || {}; } catch(e) { return {}; }
})();

let adminLoggedIn = false;

let testState = {
  questions:[], bookmarks:new Set(), cheats:0,
  startTime:null, totalSecs:0, remainingSecs:0, timerInterval:null,
  studentName:'', className:'', subjectName:'',
  lastReview: []   // kept for answer reveal
};

// Settings (admin-controlled)
let settings = (() => {
  try { return JSON.parse(localStorage.getItem(CONFIG.SETTINGS_KEY)) || {}; } catch(e) { return {}; }
})();
settings = Object.assign({
  maxAttempts: 3,
  questionCount: 15,
  timeLimit: 20,
  allowCustom: true,
  enableAttemptLimit: false
}, settings);

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
function initDefaults() {
  if (!db.classes)  db.classes  = {};
  if (!db.subjects) db.subjects = {};
  if (!db.results)  db.results  = [];
  if (!db.qs)       db.qs       = {};
  ['5-sinf','6-sinf','7-sinf','8-sinf'].forEach(cls => {
    if (!db.classes[cls])  db.classes[cls]  = DEFAULT_STUDENTS[cls] || [];
    if (!db.subjects[cls]) db.subjects[cls] = [...DEFAULT_SUBJECTS];
  });
  saveDB();
}
function saveDB() { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(db)); }
function saveSettings() {
  settings.maxAttempts        = parseInt(document.getElementById('settingMaxAttempts')?.value)||3;
  settings.questionCount      = parseInt(document.getElementById('settingQuestionCount')?.value)||15;
  settings.timeLimit          = parseInt(document.getElementById('settingTimeLimit')?.value)||20;
  settings.allowCustom        = document.getElementById('settingAllowCustom')?.checked||false;
  settings.enableAttemptLimit = document.getElementById('settingEnableAttemptLimit')?.checked||false;
  localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(settings));
  applySettingsToTestSetup();
}
function applySettingsToTestSetup() {
  const allowed = settings.allowCustom;
  const controls = document.getElementById('testSetupControls');
  const note = document.getElementById('adminSettingsNote');
  const noteText = document.getElementById('adminSettingsNoteText');
  if (controls) controls.style.display = allowed ? '' : 'none';
  if (note) {
    note.style.display = allowed ? 'none' : 'flex';
    if (noteText) noteText.textContent = `Savol soni: ${settings.questionCount} ta · Vaqt: ${settings.timeLimit} daqiqa (admin tomonidan belgilangan)`;
  }
}

initDefaults();
populateClassSelects();
renderClassList();
updateDashboardStats();
renderRecentResults();
applySettingsToTestSetup();
checkForResumeSession();

/* ═══════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════ */
const SCREENS = {
  'home':       { screen:'screen-home',       nav:'nav-home',   title:'Bosh sahifa',      bc:'Bosh sahifa' },
  'test-setup': { screen:'screen-test-setup', nav:'nav-test',   title:'Yangi test',       bc:'Yangi test boshlash' },
  'test':       { screen:'screen-test',       nav:'nav-test',   title:'Test topshirish',  bc:'Jarayonda...' },
  'result':     { screen:'screen-result',     nav:'nav-test',   title:'Natijalar',        bc:'Test natijalari' },
  'admin':      { screen:'screen-admin',      nav:'nav-admin',  title:'Admin Panel',      bc:'Admin boshqaruvi' },
  'manage':     { screen:'screen-manage',     nav:'nav-manage', title:'Boshqarish',       bc:'Sinflar va o\'quvchilar' },
  'sync':       { screen:'screen-sync',       nav:'nav-sync',   title:'Bazani yangilash', bc:'Google Sheets sinxronizatsiya' }
};
function navigateTo(page) {
  const cfg = SCREENS[page]; if (!cfg) return;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(cfg.screen)?.classList.add('active');
  document.getElementById(cfg.nav)?.classList.add('active');
  document.getElementById('topbarTitle').innerText = cfg.title;
  document.getElementById('topbarBreadcrumb').innerHTML = `<span>Ustoz Pro</span> › <span>${cfg.bc}</span>`;
  if (page==='manage') syncManageSelects();
  if (page==='home') { updateDashboardStats(); renderRecentResults(); }
  if (page==='admin' && adminLoggedIn) { populateAdminFilters(); renderResultsTable(); renderRatingPanel(); }
  closeSidebar(); window.scrollTo({top:0,behavior:'smooth'});
}

/* ═══════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════ */
function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('visible'); document.body.style.overflow='hidden'; }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('visible'); document.body.style.overflow=''; }
window.addEventListener('scroll', ()=>document.getElementById('topbar').classList.toggle('scrolled',window.scrollY>10));

/* ═══════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════ */
function showToast(icon, title, type='info', sub='', duration=3500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-body"><div class="toast-title">${title}</div>${sub?`<div class="toast-sub">${sub}</div>`:''}</div>`;
  c.appendChild(t);
  setTimeout(()=>{ t.style.transition='all 0.3s ease'; t.style.opacity='0'; t.style.transform='translateX(20px)'; setTimeout(()=>t.remove(),300); }, duration);
}

/* ═══════════════════════════════════════════════
   ADMIN AUTH
═══════════════════════════════════════════════ */
function adminLogin() {
  const login = document.getElementById('adminLoginInput').value.trim();
  const pass  = document.getElementById('adminPassInput').value;
  if (login===CONFIG.ADMIN_LOGIN && pass===CONFIG.ADMIN_PASS) {
    adminLoggedIn = true;
    document.getElementById('adminLoginSection').style.display = 'none';
    document.getElementById('adminDashboard').style.display   = 'block';
    document.getElementById('sidebarUserName').textContent = 'Admin';
    document.getElementById('sidebarUserRole').textContent = 'O\'qituvchi';
    populateAdminFilters();
    renderResultsTable();
    renderRatingPanel();
    loadSettingsUI();
    showToast('✅','Admin paneliga xush kelibsiz!','success','O\'qituvchi rejimida');
  } else {
    document.getElementById('adminPassInput').style.borderColor='var(--danger)';
    showToast('❌','Login yoki parol noto\'g\'ri!','error');
    setTimeout(()=>document.getElementById('adminPassInput').style.borderColor='',1500);
  }
}
function adminLogout() {
  adminLoggedIn = false;
  document.getElementById('adminLoginSection').style.display = 'block';
  document.getElementById('adminDashboard').style.display   = 'none';
  document.getElementById('adminLoginInput').value = '';
  document.getElementById('adminPassInput').value  = '';
  document.getElementById('sidebarUserName').textContent = 'Foydalanuvchi';
  document.getElementById('sidebarUserRole').textContent = 'O\'quvchi';
  showToast('👋','Admin paneldan chiqdingiz','info');
}
function loadSettingsUI() {
  document.getElementById('settingMaxAttempts').value        = settings.maxAttempts;
  document.getElementById('settingQuestionCount').value      = settings.questionCount;
  document.getElementById('settingTimeLimit').value          = settings.timeLimit;
  document.getElementById('settingAllowCustom').checked      = settings.allowCustom;
  document.getElementById('settingEnableAttemptLimit').checked = settings.enableAttemptLimit;
}

/* ═══════════════════════════════════════════════
   ADMIN TABS
═══════════════════════════════════════════════ */
function switchATab(tab) {
  ['results','rating','settings'].forEach(t=>{
    document.getElementById(`atab-${t}`)?.classList.toggle('active',t===tab);
    document.getElementById(`apanel-${t}`)?.classList.toggle('active',t===tab);
  });
  if (tab==='rating') renderRatingPanel();
  if (tab==='settings') loadSettingsUI();
}

/* ═══════════════════════════════════════════════
   ADMIN FILTERS
═══════════════════════════════════════════════ */
function populateAdminFilters() {
  const classes = Object.keys(db.classes);
  const allSubs = new Set();
  Object.values(db.subjects).forEach(a=>a.forEach(s=>allSubs.add(s)));

  ['filterClass','ratingFilterClass'].forEach(id=>{
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = '<option value="">— Barcha sinflar —</option>';
    classes.forEach(c=>el.innerHTML+=`<option value="${c}">${c}</option>`);
  });
  ['filterSubject','ratingFilterSub'].forEach(id=>{
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = '<option value="">— Barcha fanlar —</option>';
    [...allSubs].sort().forEach(s=>el.innerHTML+=`<option value="${s}">${s}</option>`);
  });
}

/* ═══════════════════════════════════════════════
   RESULTS TABLE
═══════════════════════════════════════════════ */
function renderResultsTable() {
  const fcls = document.getElementById('filterClass')?.value||'';
  const fsub = document.getElementById('filterSubject')?.value||'';
  let rows = db.results||[];
  if (fcls) rows = rows.filter(r=>r.cls===fcls);
  if (fsub) rows = rows.filter(r=>r.sub===fsub);
  const tbody = document.getElementById('resultsTableBody');
  if (!tbody) return;
  if (rows.length===0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text-dim)">Ma\'lumot yo\'q</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r,i)=>{
    const pct = r.percent||0;
    const cls = pct>=70?'high':pct>=50?'mid':'low';
    return `<tr>
      <td class="rank-cell">${i+1}</td>
      <td><b>${esc(r.name)}</b></td>
      <td>${esc(r.cls)}</td>
      <td>${esc(r.sub)}</td>
      <td>${r.score}/${r.total}</td>
      <td><span class="score-chip ${cls}">${pct}%</span></td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${r.elapsed||'—'}</td>
      <td style="color:${r.cheat>0?'var(--danger)':'var(--success)'};font-weight:700">${r.cheat||0}</td>
      <td style="font-size:11px;color:var(--text-dim)">${r.time||'—'}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   RATING SYSTEM
   1200 ballik (Mutolaa tashqari) + 2000 ballik Mutolaa
═══════════════════════════════════════════════ */
function renderRatingPanel() {
  const fcls = document.getElementById('ratingFilterClass')?.value||'';
  const fsub = document.getElementById('ratingFilterSub')?.value||'';
  let rows = db.results||[];
  if (fcls) rows = rows.filter(r=>r.cls===fcls);

  // Mutolaa va non-Mutolaa alohida
  const mutolaaRows   = rows.filter(r=>r.sub==='Mutolaa');
  const nonMutolaaRows = rows.filter(r=>r.sub!=='Mutolaa');

  // Jami noyob testlar soni (sub bo'yicha, Mutolaa tashqari)
  const nonMutSubjects = new Set(nonMutolaaRows.map(r=>r.sub));
  const totalNonMutTests = nonMutSubjects.size;

  // Koeffitsiyent
  const coeff  = totalNonMutTests > 0 ? (1200 / totalNonMutTests) : 0;
  const mutSubjects = new Set(mutolaaRows.map(r=>r.sub));
  const mutTotal = mutSubjects.size || 1;
  const mutCoeff = 2000 / mutTotal;

  // Formula info
  const infoEl = document.getElementById('ratingFormulaInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="info-note" style="margin-bottom:11px">
        📊 Jami fanlar (Mutolaa tashqari): <b>${totalNonMutTests}</b> ·
        Koeffitsiyent: <b>1200 / ${totalNonMutTests} = ${coeff.toFixed(2)}</b> ·
        Mutolaa koeffitsiyenti: <b>2000 / ${mutTotal} = ${mutCoeff.toFixed(2)}</b>
      </div>`;
  }

  // Monthly rating: har o'quvchi uchun barcha non-Mutolaa fanlardagi to'g'ri javoblar yig'indisi
  const studentMap = {};
  nonMutolaaRows.forEach(r=>{
    if (fcls && r.cls!==fcls) return;
    if (fsub && r.sub!==fsub) return;
    const key = `${r.name}__${r.cls}`;
    if (!studentMap[key]) studentMap[key] = {name:r.name, cls:r.cls, totalCorrect:0};
    studentMap[key].totalCorrect += (r.score||0);
  });
  const monthlyArr = Object.values(studentMap)
    .map(s=>({...s, ratingScore: Math.round(s.totalCorrect * coeff)}))
    .sort((a,b)=>b.ratingScore-a.ratingScore);

  const monthlyBody = document.getElementById('monthlyRatingBody');
  if (monthlyBody) {
    if (monthlyArr.length===0) {
      monthlyBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:22px;color:var(--text-dim)">Ma\'lumot yo\'q</td></tr>';
    } else {
      monthlyBody.innerHTML = monthlyArr.map((s,i)=>{
        const rankClass = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        const scoreClass = s.ratingScore>=800?'high':s.ratingScore>=400?'mid':'low';
        return `<tr>
          <td class="rank-cell ${rankClass}">${medal||i+1}</td>
          <td><b>${esc(s.name)}</b></td>
          <td>${esc(s.cls)}</td>
          <td style="font-family:'DM Mono',monospace">${s.totalCorrect} ta</td>
          <td><span class="score-chip ${scoreClass}">${s.ratingScore}</span></td>
        </tr>`;
      }).join('');
    }
  }

  // Mutolaa rating
  const mutStudentMap = {};
  mutolaaRows.forEach(r=>{
    if (fcls && r.cls!==fcls) return;
    const key = `${r.name}__${r.cls}`;
    if (!mutStudentMap[key]) mutStudentMap[key] = {name:r.name, cls:r.cls, mutCorrect:0};
    mutStudentMap[key].mutCorrect += (r.score||0);
  });
  const mutArr = Object.values(mutStudentMap)
    .map(s=>({...s, mutScore:Math.round(s.mutCorrect * mutCoeff)}))
    .sort((a,b)=>b.mutScore-a.mutScore);

  const mutBody = document.getElementById('mutolaaRatingBody');
  if (mutBody) {
    if (mutArr.length===0) {
      mutBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:22px;color:var(--text-dim)">Mutolaa natijalari yo\'q</td></tr>';
    } else {
      mutBody.innerHTML = mutArr.map((s,i)=>{
        const rankClass = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        return `<tr>
          <td class="rank-cell ${rankClass}">${medal||i+1}</td>
          <td><b>${esc(s.name)}</b></td>
          <td>${esc(s.cls)}</td>
          <td style="font-family:'DM Mono',monospace">${s.mutCorrect} ta</td>
          <td><span class="mutolaa-badge">📖 ${s.mutScore}</span></td>
        </tr>`;
      }).join('');
    }
  }
}

/* ═══════════════════════════════════════════════
   EXPORT EXCEL / PDF
═══════════════════════════════════════════════ */
function exportToExcel() {
  if (typeof XLSX==='undefined') { showToast('❌','XLSX kutubxonasi yuklanmadi','error'); return; }
  const fcls = document.getElementById('filterClass')?.value||'';
  const fsub = document.getElementById('filterSubject')?.value||'';
  let rows = db.results||[];
  if (fcls) rows = rows.filter(r=>r.cls===fcls);
  if (fsub) rows = rows.filter(r=>r.sub===fsub);
  if (rows.length===0) { showToast('⚠️','Chiqarish uchun ma\'lumot yo\'q','warning'); return; }

  const wsData = [
    ['#','Ism','Sinf','Fan','To\'g\'ri','Jami','Foiz (%)','Sarflangan vaqt','Chetlanish','Sana'],
    ...rows.map((r,i)=>[i+1,r.name,r.cls,r.sub,r.score,r.total,r.percent,r.elapsed||'—',r.cheat||0,r.time||'—'])
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Natijalar');
  XLSX.writeFile(wb, `UstazPro_Natijalar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.xlsx`);
  showToast('📥','Excel fayl yuklab olindi!','success');
}

function exportToPDF() {
  if (typeof window.jspdf==='undefined') { showToast('❌','jsPDF kutubxonasi yuklanmadi','error'); return; }
  const fcls = document.getElementById('filterClass')?.value||'';
  const fsub = document.getElementById('filterSubject')?.value||'';
  let rows = db.results||[];
  if (fcls) rows = rows.filter(r=>r.cls===fcls);
  if (fsub) rows = rows.filter(r=>r.sub===fsub);
  if (rows.length===0) { showToast('⚠️','Chiqarish uchun ma\'lumot yo\'q','warning'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'landscape'});
  doc.setFontSize(14);
  doc.text('Ustoz Pro - Test Natijalari', 14, 16);
  doc.setFontSize(10);
  doc.text(`Sanasi: ${new Date().toLocaleDateString('uz-UZ')}`, 14, 23);

  doc.autoTable({
    startY:28,
    head:[['#','Ism','Sinf','Fan','To\'g\'ri','Jami','%','Vaqt','Chetlanish','Sana']],
    body: rows.map((r,i)=>[i+1,r.name,r.cls,r.sub,r.score,r.total,r.percent+'%',r.elapsed||'—',r.cheat||0,r.time||'—']),
    styles:{fontSize:8,cellPadding:3},
    headStyles:{fillColor:[79,70,229],textColor:255},
    alternateRowStyles:{fillColor:[238,242,255]}
  });
  doc.save(`UstazPro_Natijalar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.pdf`);
  showToast('📄','PDF yuklab olindi!','success');
}

function clearAllResults() {
  if (!confirm('Barcha natijalarni o\'chirasizmi? Bu amalni orqaga qaytarib bo\'lmaydi!')) return;
  db.results = []; saveDB();
  renderResultsTable(); renderRatingPanel(); updateDashboardStats(); renderRecentResults();
  showToast('🗑️','Barcha natijalar o\'chirildi','info');
}

/* ═══════════════════════════════════════════════
   SESSION PERSISTENCE
═══════════════════════════════════════════════ */
function saveSession() {
  const answers = {};
  for (let i=0;i<testState.questions.length;i++) {
    const sel = document.querySelector(`input[name="q${i}"]:checked`);
    if (sel) answers[i] = sel.value;
  }
  localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({
    questions:testState.questions, bookmarks:[...testState.bookmarks],
    cheats:testState.cheats, startTime:testState.startTime?.toISOString(),
    totalSecs:testState.totalSecs, remainingSecs:testState.remainingSecs,
    studentName:testState.studentName, className:testState.className, subjectName:testState.subjectName,
    answers
  }));
}
function clearSession() { localStorage.removeItem(CONFIG.SESSION_KEY); }
function checkForResumeSession() {
  const raw = localStorage.getItem(CONFIG.SESSION_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (!s.questions||s.questions.length===0) return;
    const elapsed = Math.floor((Date.now()-new Date(s.startTime).getTime())/1000);
    if (elapsed>=s.totalSecs) { clearSession(); return; }
    showResumeBannerOnHome(s);
  } catch(e) { clearSession(); }
}
function showResumeBannerOnHome(session) {
  const rem = session.totalSecs - Math.floor((Date.now()-new Date(session.startTime).getTime())/1000);
  const m=Math.floor(rem/60),s=rem%60;
  const hs = document.getElementById('screen-home');
  document.getElementById('resumeBanner')?.remove();
  const b = document.createElement('div');
  b.id='resumeBanner'; b.className='resume-banner';
  b.innerHTML=`<div class="resume-banner-icon">⏸️</div>
    <div class="resume-banner-info">
      <div class="resume-banner-title">Tugallanmagan test topildi!</div>
      <div class="resume-banner-sub">${session.studentName} · ${session.subjectName} · Qolgan: ${m}:${s<10?'0'+s:s}</div>
    </div>
    <div class="resume-banner-actions">
      <button class="btn btn-primary btn-sm" onclick="resumeSession()">▶ Davom etish</button>
      <button class="btn btn-danger btn-xs" onclick="discardSession()" style="height:36px">✕</button>
    </div>`;
  hs.insertBefore(b, hs.firstChild);
}
function resumeSession() {
  const raw = localStorage.getItem(CONFIG.SESSION_KEY); if (!raw) return;
  const session = JSON.parse(raw);
  const elapsed = Math.floor((Date.now()-new Date(session.startTime).getTime())/1000);
  const remaining = session.totalSecs - elapsed;
  if (remaining<=0) { clearSession(); showToast('⏰','Sessiya muddati tugagan!','error'); document.getElementById('resumeBanner')?.remove(); return; }
  testState.questions=session.questions; testState.bookmarks=new Set(session.bookmarks||[]);
  testState.cheats=session.cheats||0; testState.startTime=new Date(session.startTime);
  testState.totalSecs=session.totalSecs; testState.remainingSecs=remaining;
  testState.studentName=session.studentName; testState.className=session.className; testState.subjectName=session.subjectName;
  document.getElementById('timerStudentChip').innerText=`👤 ${session.studentName}`;
  document.getElementById('timerSubChip').innerText=`📚 ${session.subjectName}`;
  renderQuestions();
  const answers = session.answers||{};
  Object.entries(answers).forEach(([idx,val])=>{
    const r=document.querySelector(`input[name="q${idx}"][value="${val}"]`);
    if (r){r.checked=true;markAnswered(parseInt(idx));}
  });
  testState.bookmarks.forEach(i=>{
    document.getElementById(`bmark-${i}`)?.classList.add('bookmarked');
    document.getElementById(`qdot-${i}`)?.classList.add('bookmarked');
    document.getElementById(`qcard-${i}`)?.classList.add('bookmarked-card');
  });
  navigateTo('test'); startTimer(remaining);
  showToast('▶','Test davom ettirildi!','success',`Qolgan vaqt: ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`);
}
function discardSession() { clearSession(); document.getElementById('resumeBanner')?.remove(); showToast('🗑️','Test o\'chirildi','info'); }

/* ═══════════════════════════════════════════════
   CSV PARSER (RFC-4180 compliant)
═══════════════════════════════════════════════ */
function parseCSVLine(line) {
  const result=[]; let current='',inQuotes=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i],next=line[i+1];
    if (inQuotes) {
      if (ch==='"'&&next==='"'){current+='"';i++;} else if (ch==='"'){inQuotes=false;} else {current+=ch;}
    } else {
      if (ch==='"'){inQuotes=true;} else if (ch===','){result.push(current.trim());current='';} else {current+=ch;}
    }
  }
  result.push(current.trim()); return result;
}

/* ═══════════════════════════════════════════════
   SYNC DATA
═══════════════════════════════════════════════ */
let syncInProgress=false;
async function syncData() {
  if (syncInProgress) return; syncInProgress=true;
  const setLoading=loading=>{
    ['syncBtnIcon','syncMainIcon'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerText=loading?'⌛':'🔄';});
    ['syncBtnText','syncMainText'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerText=loading?'Yangilanmoqda...':'Hozir yangilash';});
    const mb=document.getElementById('syncMainBtn'); if(mb) mb.disabled=loading;
  };
  setLoading(true);
  try {
    const res=await fetch(CONFIG.SHEET_CSV);
    const csv=await res.text();
    const rows=csv.split('\n').slice(1);
    db.qs={}; let count=0;
    rows.forEach(row=>{
      if (!row.trim()) return;
      const cols=parseCSVLine(row);
      if (cols.length<8) return;
      const [sinf,fan,q,a,b,c,d,cr,hint]=cols;
      if (!sinf||!fan||!q) return;

      // Class filtering: "5,6,7,8" formatini includes() bilan tekshiramiz
      // Sinf maydoni "5-sinf" yoki "5,6" bo'lishi mumkin
      // db.qs da kalit sifatida original sinf qiymatini saqlaymiz
      if (!db.qs[sinf]) db.qs[sinf]={};
      if (!db.qs[sinf][fan]) db.qs[sinf][fan]=[];
      db.qs[sinf][fan].push({q,a:a||'',b:b||'',c:c||'',d:d||'',cr:(cr||'').toLowerCase().trim(),hint:hint||''});
      count++;
    });
    saveDB();
    const st=document.getElementById('syncStatusText'); if(st) st.innerText=`Tayyor · ${count} ta savol yuklandi`;
    const sb=document.getElementById('syncStatusBox');
    if(sb){sb.style.display='block';sb.innerHTML=`<div style="padding:13px;background:var(--success-pale);border:1px solid rgba(5,150,105,0.2);border-radius:var(--r-sm);font-size:12px;color:#065f46;display:flex;gap:9px;align-items:center">✅ <span>Muvaffaqiyatli yangilandi! <b>${count}</b> ta savol yuklandi.</span></div>`;}
    showToast('✅','Baza yangilandi!','success',`${count} ta savol yuklandi`);
  } catch(e) { showToast('❌','Xatolik yuz berdi!','error','Internetni tekshiring'); }
  setLoading(false); syncInProgress=false;
}

/* ═══════════════════════════════════════════════
   CLASS MANAGEMENT
═══════════════════════════════════════════════ */
function populateClassSelects() {
  const classes=Object.keys(db.classes);
  ['sClass','manageClass','manageClassSub'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML='<option value="">— Sinfni tanlang —</option>';
    classes.forEach(c=>sel.innerHTML+=`<option value="${c}">${c}</option>`);
    if (cur&&classes.includes(cur)) sel.value=cur;
  });
}
function syncManageSelects() { populateClassSelects(); renderClassList(); }
function updateTestUI() {
  const cls=document.getElementById('sClass').value;
  const sn=document.getElementById('sName'); const ss=document.getElementById('sSub');
  sn.innerHTML='<option value="">— O\'quvchini tanlang —</option>';
  ss.innerHTML='<option value="">— Fanni tanlang —</option>';
  if (cls) {
    [...(db.classes[cls]||[])].sort().forEach(s=>sn.innerHTML+=`<option value="${s}">${s}</option>`);
    (db.subjects[cls]||DEFAULT_SUBJECTS).forEach(f=>ss.innerHTML+=`<option value="${f}">${f}</option>`);
  }
}
function addClass() {
  const name=document.getElementById('newClassName').value.trim();
  if (!name){showToast('⚠️','Sinf nomini kiriting!','warning');return;}
  if (db.classes[name]){showToast('⚠️','Bu sinf allaqachon mavjud!','warning');return;}
  db.classes[name]=[]; db.subjects[name]=[...DEFAULT_SUBJECTS];
  saveDB(); populateClassSelects(); renderClassList();
  document.getElementById('newClassName').value='';
  showToast('✅',`"${name}" sinfi qo'shildi!`,'success'); updateDashboardStats();
}
function removeClass(name) {
  if (!confirm(`"${name}" sinfini o'chirasizmi?`)) return;
  delete db.classes[name]; delete db.subjects[name];
  saveDB(); populateClassSelects(); renderClassList();
  showToast('🗑️',`"${name}" o'chirildi.`,'info'); updateDashboardStats();
}
function renderClassList() {
  const classes=Object.keys(db.classes);
  document.getElementById('classCount').innerText=classes.length;
  document.getElementById('classList').innerHTML=classes.length===0
    ?`<div class="empty-state">Sinflar yo'q. Yangi sinf qo'shing.</div>`
    :classes.map(c=>`<div class="list-item"><div class="li-icon">🏫</div><span class="li-text"><b>${c}</b> — ${(db.classes[c]||[]).length} o'quvchi</span><button class="li-del" onclick="removeClass('${c}')">🗑️</button></div>`).join('');
}

/* ═══════════════════════════════════════════════
   STUDENT MANAGEMENT
═══════════════════════════════════════════════ */
function addStudent() {
  const cls=document.getElementById('manageClass').value;
  const name=document.getElementById('newStudentName').value.trim();
  if (!cls){showToast('⚠️','Avval sinfni tanlang!','warning');return;}
  if (!name){showToast('⚠️','O\'quvchi ismini kiriting!','warning');return;}
  if (!db.classes[cls]) db.classes[cls]=[];
  if (db.classes[cls].includes(name)){showToast('⚠️','Bu o\'quvchi allaqachon mavjud!','warning');return;}
  db.classes[cls].push(name); saveDB();
  renderStudentList(); renderClassList();
  document.getElementById('newStudentName').value='';
  showToast('✅',`"${name}" qo'shildi!`,'success'); updateDashboardStats();
}
function removeStudent(cls,name) {
  db.classes[cls]=db.classes[cls].filter(s=>s!==name); saveDB();
  renderStudentList(); renderClassList();
  showToast('🗑️',`"${name}" o'chirildi.`,'info'); updateDashboardStats();
}
function renderStudentList() {
  const cls=document.getElementById('manageClass')?.value;
  const students=cls?(db.classes[cls]||[]):[];
  document.getElementById('studentCount').innerText=students.length;
  document.getElementById('studentList').innerHTML=students.length===0
    ?`<div class="empty-state">${cls?'O\'quvchilar yo\'q.':'Sinfni tanlang.'}</div>`
    :[...students].sort().map(s=>`<div class="list-item"><div class="li-icon">👤</div><span class="li-text">${s}</span><button class="li-del" onclick="removeStudent('${cls}','${s.replace(/'/g,"\\'")}')" >🗑️</button></div>`).join('');
}

/* ═══════════════════════════════════════════════
   SUBJECT MANAGEMENT
═══════════════════════════════════════════════ */
function addSubject() {
  const cls=document.getElementById('manageClassSub')?.value;
  const name=document.getElementById('newSubName').value.trim();
  if (!cls){showToast('⚠️','Avval sinfni tanlang!','warning');return;}
  if (!name){showToast('⚠️','Fan nomini kiriting!','warning');return;}
  if (!db.subjects[cls]) db.subjects[cls]=[];
  if (db.subjects[cls].includes(name)){showToast('⚠️','Bu fan allaqachon mavjud!','warning');return;}
  db.subjects[cls].push(name); saveDB(); renderSubjectList();
  document.getElementById('newSubName').value='';
  showToast('✅',`"${name}" fani qo'shildi!`,'success');
}
function removeSubject(cls,name) {
  db.subjects[cls]=db.subjects[cls].filter(s=>s!==name); saveDB(); renderSubjectList();
  showToast('🗑️',`"${name}" fani o'chirildi.`,'info');
}
function renderSubjectList() {
  const cls=document.getElementById('manageClassSub')?.value||document.getElementById('manageClass')?.value;
  const subs=cls?(db.subjects[cls]||[]):[];
  const el=document.getElementById('subjectList'); if (!el) return;
  document.getElementById('subjectCount').innerText=subs.length;
  el.innerHTML=subs.length===0
    ?`<div class="empty-state">${cls?'Fanlar yo\'q.':'Sinfni tanlang.'}</div>`
    :subs.map(s=>`<div class="list-item"><div class="li-icon">📖</div><span class="li-text">${s}</span><button class="li-del" onclick="removeSubject('${cls}','${s.replace(/'/g,"\\'")}')">🗑️</button></div>`).join('');
}

/* ═══════════════════════════════════════════════
   MANAGE TABS
═══════════════════════════════════════════════ */
function switchMTab(tab) {
  ['classes','students','subjects'].forEach(t=>{
    document.getElementById(`mtab-${t}`)?.classList.toggle('active',t===tab);
    document.getElementById(`mpanel-${t}`)?.classList.toggle('active',t===tab);
  });
  if (tab==='students') renderStudentList();
  if (tab==='subjects') renderSubjectList();
}

/* ═══════════════════════════════════════════════
   DASHBOARD STATS
═══════════════════════════════════════════════ */
function updateDashboardStats() {
  const total=Object.values(db.classes).reduce((s,a)=>s+a.length,0);
  const allS=new Set(); Object.values(db.subjects).forEach(a=>a.forEach(s=>allS.add(s)));
  document.getElementById('statStudentsCount').innerText=total;
  document.getElementById('statSubjectsCount').innerText=allS.size;
  document.getElementById('statTotalTests').innerText=(db.results||[]).length;
  if ((db.results||[]).length>0) {
    const avg=Math.round(db.results.reduce((s,r)=>s+(r.percent||0),0)/db.results.length);
    const tEl=document.getElementById('statAvgTrend');
    document.getElementById('statAvgScore').innerText=avg+'%';
    if (avg>=70){tEl.className='stat-trend trend-up';tEl.innerText='↑ Yaxshi daraja';}
    else{tEl.className='stat-trend trend-down';tEl.innerText='↓ Yaxshilash kerak';}
  }
}
function renderRecentResults() {
  const list=document.getElementById('recentResultsList');
  if (!db.results||db.results.length===0){list.innerHTML='<div class="empty-state">📭 Hali test natijasi yo\'q.</div>';return;}
  const recent=[...db.results].reverse().slice(0,5);
  list.innerHTML=recent.map(r=>{
    const key=r.percent>=90?'success':r.percent>=70?'primary':r.percent>=50?'warning':'danger';
    const emoji=r.percent>=90?'🥇':r.percent>=70?'🥈':r.percent>=50?'🥉':'📉';
    const grade=r.percent>=90?'A':r.percent>=70?'B':r.percent>=50?'C':'D';
    return `<div class="result-item"><div class="ri-icon" style="background:var(--${key}-pale)">${emoji}</div><div class="ri-info"><div class="ri-name">${r.name}</div><div class="ri-meta">${r.cls} · ${r.sub} · ${r.time}</div></div><div class="ri-score"><div class="ri-pct" style="color:var(--${key})">${r.percent}%</div><div class="ri-grade" style="color:var(--${key})">${grade} daraja</div></div></div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   ATTEMPT LIMIT CHECK
   Google Sheets "Class" ustunida "5,6,7,8" format uchun includes()
═══════════════════════════════════════════════ */
function checkAttemptLimit(studentName, cls, sub) {
  if (!settings.enableAttemptLimit) return true;
  const count = (db.results||[]).filter(r=>r.name===studentName&&r.cls===cls&&r.sub===sub).length;
  return count < settings.maxAttempts;
}

/* Google Sheets sinf ustunida vergul bilan ajratilgan sinflar uchun
   e.g. "5,6,7" -> o'quvchi "5-sinf" tanlasa "5" includes bilan tekshiriladi */
function getQuestionsForClassSub(selectedClass, selectedSub) {
  // Agar to'g'ridan-to'g'ri kalit bor bo'lsa
  if (db.qs[selectedClass]&&db.qs[selectedClass][selectedSub]) {
    return db.qs[selectedClass][selectedSub];
  }
  // Vergul bilan ajratilgan format: "5,6,7,8" -> tanlangan sinfning raqamini olish
  const classNum = selectedClass.replace(/[^0-9]/g,''); // "5-sinf" -> "5"
  const combined = [];
  Object.keys(db.qs).forEach(sheetClass=>{
    // Spread format: e.g. "5,6,7" yoki "5-8"
    const parts = sheetClass.split(',').map(p=>p.trim());
    const matches = parts.some(p=>{
      if (p===classNum||p===selectedClass) return true;
      // Range check "5-8"
      if (p.includes('-')&&!p.includes('sinf')) {
        const [from,to]=p.split('-').map(Number);
        const cn=parseInt(classNum);
        return !isNaN(from)&&!isNaN(to)&&cn>=from&&cn<=to;
      }
      return false;
    });
    if (matches&&db.qs[sheetClass]&&db.qs[sheetClass][selectedSub]) {
      combined.push(...db.qs[sheetClass][selectedSub]);
    }
  });
  return combined;
}

/* ═══════════════════════════════════════════════
   START TEST
═══════════════════════════════════════════════ */
function startTest() {
  const cls  = document.getElementById('sClass').value;
  const sub  = document.getElementById('sSub').value;
  const name = document.getElementById('sName').value;

  if (!cls||!sub||!name){showToast('⚠️','Barcha maydonlarni to\'ldiring!','warning');return;}

  // Attempt limit check
  if (!checkAttemptLimit(name,cls,sub)) {
    showToast('🚫','Urinishlar soni tugadi!','error',`${sub} fani uchun ${settings.maxAttempts} ta urinish haddi`);
    return;
  }

  // Admin yoki student sozlamasi
  const count = settings.allowCustom ? (parseInt(document.getElementById('sCount').value)||15) : settings.questionCount;
  const mins  = settings.allowCustom ? (parseInt(document.getElementById('sTime').value)||20)  : settings.timeLimit;

  // Savollarni topish (vergul bilan ajratilgan sinf formatini ham qo'llab-quvvatlaydi)
  const pool = getQuestionsForClassSub(cls, sub);

  if (!pool||pool.length===0) {
    showToast('📚','Savollar yuklanmagan!','error',`${cls} · ${sub} uchun avval bazani yangilang`);
    return;
  }

  clearSession();
  const take = Math.min(count, pool.length);
  testState.questions    = [...pool].sort(()=>Math.random()-0.5).slice(0,take);
  testState.bookmarks    = new Set();
  testState.cheats       = 0;
  testState.startTime    = new Date();
  testState.totalSecs    = mins*60;
  testState.remainingSecs = mins*60;
  testState.studentName  = name;
  testState.className    = cls;
  testState.subjectName  = sub;
  testState.lastReview   = [];

  document.getElementById('timerStudentChip').innerText=`👤 ${name}`;
  document.getElementById('timerSubChip').innerText=`📚 ${sub}`;

  renderQuestions();
  navigateTo('test');
  startTimer(mins*60);

  // Anti-cheat: window.blur & visibilitychange
  window.onblur = handleCheat;
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/* ═══════════════════════════════════════════════
   TIMER
═══════════════════════════════════════════════ */
function startTimer(initialSecs) {
  if (testState.timerInterval) clearInterval(testState.timerInterval);
  let remaining=initialSecs; testState.remainingSecs=remaining;
  const timerEl=document.getElementById('stickyTimer');
  const timerDig=document.getElementById('timerDigits');
  const timerBar=document.getElementById('timerBarFill');
  const timerPct=document.getElementById('timerPct');
  const updateDisplay=()=>{
    const m=Math.floor(remaining/60),s=remaining%60;
    const pct=(remaining/testState.totalSecs)*100;
    timerDig.innerText=`${m}:${s<10?'0'+s:s}`;
    timerBar.style.width=pct+'%'; timerPct.innerText=Math.round(pct)+'%';
    timerEl.classList.remove('warning','danger');
    if (remaining<=60) timerEl.classList.add('danger');
    else if (remaining<=testState.totalSecs*0.25) timerEl.classList.add('warning');
  };
  updateDisplay();
  testState.timerInterval=setInterval(()=>{
    remaining--; testState.remainingSecs=remaining; updateDisplay();
    if (remaining%10===0) saveSession();
    if (remaining<=0){clearInterval(testState.timerInterval);showToast('⏰','Vaqt tugadi!','error','Test avtomatik yakunlandi');finishTest();}
  },1000);
}

/* ═══════════════════════════════════════════════
   RENDER QUESTIONS
═══════════════════════════════════════════════ */
function renderQuestions() {
  const area=document.getElementById('questionsArea');
  const dotsC=document.getElementById('qDots');
  const total=testState.questions.length;
  document.getElementById('qProgLabel').innerText=`0 / ${total}`;
  area.innerHTML=testState.questions.map((q,i)=>`
    <div class="q-card" id="qcard-${i}" style="animation-delay:${i*0.025}s">
      <div class="q-card-top">
        <div class="q-card-left">
          <div class="q-num" id="qnum-${i}">${String(i+1).padStart(2,'0')}</div>
          <p class="q-text">${esc(q.q)}</p>
        </div>
        <div class="q-actions">
          <div class="q-action-btn" id="bmark-${i}" onclick="toggleBookmark(${i})" title="Bayroqcha">🔖</div>
        </div>
      </div>
      <div class="options-list">
        ${['a','b','c','d'].filter(opt=>q[opt]).map(opt=>`
          <label class="option-item" onclick="markAnswered(${i})">
            <input type="radio" name="q${i}" value="${opt}">
            <span class="option-letter">${opt.toUpperCase()}</span>
            <span class="option-txt">${esc(q[opt])}</span>
          </label>`).join('')}
      </div>
      <div class="hint-section">
        <div class="hint-btn" onclick="toggleHint(${i},this)">💡 Yordamchi izoh</div>
        <div class="hint-content" id="hint-${i}">${q.hint?esc(q.hint):'Bu savol uchun o\'qituvchi izohi qo\'shilmagan.'}</div>
      </div>
    </div>`).join('');
  dotsC.innerHTML=testState.questions.map((_,i)=>`<div class="q-dot" id="qdot-${i}" onclick="scrollToQ(${i})">${i+1}</div>`).join('');
}

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function scrollToQ(i){const card=document.getElementById(`qcard-${i}`);if(!card)return;window.scrollTo({top:card.getBoundingClientRect().top+window.scrollY-80,behavior:'smooth'});}
function markAnswered(i){
  document.getElementById(`qcard-${i}`)?.classList.add('answered');
  document.getElementById(`qdot-${i}`)?.classList.add('answered');
  updateQProgress(); setTimeout(saveSession,50);
}
function updateQProgress(){
  const total=testState.questions.length; let answered=0;
  for(let i=0;i<total;i++){if(document.querySelector(`input[name="q${i}"]:checked`))answered++;}
  const pct=Math.round((answered/total)*100);
  document.getElementById('qProgFill').style.width=pct+'%';
  document.getElementById('qProgLabel').innerText=`${answered} / ${total}`;
  document.getElementById('qProgPct').innerText=pct+'%';
}
function toggleBookmark(i){
  const btn=document.getElementById(`bmark-${i}`),dot=document.getElementById(`qdot-${i}`),card=document.getElementById(`qcard-${i}`);
  if(testState.bookmarks.has(i)){testState.bookmarks.delete(i);btn?.classList.remove('bookmarked');dot?.classList.remove('bookmarked');card?.classList.remove('bookmarked-card');showToast('🔖','Bayroqcha olib tashlandi','info','',1800);}
  else{testState.bookmarks.add(i);btn?.classList.add('bookmarked');dot?.classList.add('bookmarked');card?.classList.add('bookmarked-card');showToast('🔖','Belgilandi!','warning','Keyinroq qaytib kelishingiz mumkin',1800);}
  saveSession();
}
function toggleHint(i,btnEl){
  const el=document.getElementById(`hint-${i}`);if(!el)return;
  const v=el.classList.contains('visible');
  el.classList.toggle('visible',!v);
  if(btnEl)btnEl.innerText=v?'💡 Yordamchi izoh':'💡 Yashirish';
}

/* ═══════════════════════════════════════════════
   ANTI-CHEAT — window.blur & visibilitychange
═══════════════════════════════════════════════ */
function handleCheat(){testState.cheats++;saveSession();showCheatAlert();}
function onVisibilityChange(){if(document.hidden)handleCheat();}
function showCheatAlert(){
  document.querySelector('.cheat-overlay')?.remove();
  const o=document.createElement('div'); o.className='cheat-overlay';
  o.innerHTML=`<div class="cheat-modal">
    <span class="cheat-icon">🚫</span>
    <h2 class="cheat-title">Sahifadan chiqish taqiqlangan!</h2>
    <p class="cheat-desc">Testni topshirayotganda boshqa ilovalar yoki tablarni ochish qat'iyan man etiladi. Bu holat o'qituvchiga yuboriladi.</p>
    <div class="cheat-count-box">Ogohlantirish: <b>${testState.cheats}</b> marta</div>
    <button class="btn btn-primary btn-full btn-md" onclick="this.closest('.cheat-overlay').remove()">✓ Testni davom ettirish</button>
  </div>`;
  document.body.appendChild(o);
}

/* ═══════════════════════════════════════════════
   CONFIRM & FINISH
═══════════════════════════════════════════════ */
function confirmFinish(){
  const total=testState.questions.length; let answered=0;
  for(let i=0;i<total;i++){if(document.querySelector(`input[name="q${i}"]:checked`))answered++;}
  const ua=total-answered;
  if(ua>0){if(!confirm(`Hali ${ua} ta savol javoblanmagan. Shunga qaramay yakunlaysizmi?`))return;}
  finishTest();
}
async function finishTest(){
  clearInterval(testState.timerInterval);
  window.onblur=null;
  document.removeEventListener('visibilitychange',onVisibilityChange);
  clearSession();

  let score=0; const review=[];
  testState.questions.forEach((q,i)=>{
    const sel=document.querySelector(`input[name="q${i}"]:checked`)?.value;
    const correct=q.cr?.toLowerCase().trim();
    const isRight=sel&&sel===correct;
    if(isRight)score++;
    review.push({q:q.q, sel:sel?q[sel]:'Belgilanmagan', cr:q[correct]||correct||'?', isRight, correctLetter:correct});
  });
  testState.lastReview=review;

  const total=testState.questions.length;
  const percent=Math.round((score/total)*100);
  const elapsed=Math.round((new Date()-testState.startTime)/1000);
  const elMin=Math.floor(elapsed/60),elSec=elapsed%60;
  const result={
    name:testState.studentName, cls:testState.className, sub:testState.subjectName,
    score, total, percent, rating_score:score,
    cheat:testState.cheats, elapsed:`${elMin}:${elSec<10?'0'+elSec:elSec}`,
    time:new Date().toLocaleString('uz-UZ')
  };
  db.results.push(result); saveDB();
  buildResultScreen(result,review,elapsed);
  navigateTo('result');
  if(percent>=70) launchConfetti(percent);
  sendResults(result);
}

/* ═══════════════════════════════════════════════
   BUILD RESULT SCREEN
═══════════════════════════════════════════════ */
function buildResultScreen(result,review,elapsedSec){
  const {name,cls,sub,score,total,percent,cheat}=result;
  let emoji,msg;
  if(percent>=90){emoji='🥇';msg="Ajoyib! Siz zo'r natija ko'rsatdingiz!";}
  else if(percent>=70){emoji='🥈';msg="Yaxshi! Yana bir oz harakat bilan mukammal bo'ladi.";}
  else if(percent>=50){emoji='🥉';msg="O'rtacha. Ko'proq takrorlash kerak.";}
  else{emoji='😔';msg="Qoniqarsiz. Mavzularni yana bir bor o'qib chiqing.";}

  document.getElementById('resultEmoji').innerText=emoji;
  document.getElementById('resStudentName').innerText=name;
  document.getElementById('circScorePct').innerText=percent+'%';

  const circ=2*Math.PI*65;
  const offset=circ*(1-percent/100);
  const fillEl=document.getElementById('circFill');
  fillEl.style.strokeDasharray=`${circ}`;
  fillEl.style.strokeDashoffset=`${circ}`;

  const svgDefs=fillEl.closest('svg').querySelector('defs');
  if(!svgDefs.querySelector('#circGradGreen')){
    svgDefs.innerHTML+=`<linearGradient id="circGradGreen" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#059669"/><stop offset="100%" stop-color="#34d399"/></linearGradient><linearGradient id="circGradOrange" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#fcd34d"/></linearGradient><linearGradient id="circGradRed" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#dc2626"/><stop offset="100%" stop-color="#f87171"/></linearGradient>`;
  }
  fillEl.setAttribute('stroke',percent>=90?'url(#circGradGreen)':percent>=70?'url(#circGrad)':percent>=50?'url(#circGradOrange)':'url(#circGradRed)');
  requestAnimationFrame(()=>requestAnimationFrame(()=>fillEl.style.strokeDashoffset=`${offset}`));

  const elMin=Math.floor(elapsedSec/60),elSec=elapsedSec%60;
  document.getElementById('resMetaTags').innerHTML=`<span class="meta-pill">🏫 ${cls}</span><span class="meta-pill">📚 ${sub}</span><span class="meta-pill">⏱ ${elMin}m ${elSec}s</span><span class="meta-pill">📅 ${new Date().toLocaleDateString('uz-UZ')}</span>`;
  document.getElementById('resScore').innerText=`${score}/${total}`;
  document.getElementById('resPercent').innerText=`${percent}%`;
  document.getElementById('resCheat').innerText=cheat;
  document.getElementById('resMsgText').innerText=msg;

  const wrongCount=review.filter(r=>!r.isRight).length;
  document.getElementById('reviewBadge').innerText=`${wrongCount} ta xato`;

  // Show only wrong answers in review (not correct)
  const wrongs=review.filter(r=>!r.isRight);
  document.getElementById('reviewList').innerHTML= wrongs.length===0
    ?`<div style="text-align:center;padding:22px;color:var(--success);font-weight:700">🎉 Barcha savollar to'g'ri javoblandi!</div>`
    :wrongs.map((r,i)=>`
      <div class="review-item review-wrong" style="animation-delay:${i*0.02}s">
        <p class="review-q"><b>${review.indexOf(r)+1}.</b> ${esc(r.q)}</p>
        <div class="review-answer-row"><span class="review-dot dot-wrong"></span><span class="ans-lbl">Sizning javobingiz:&nbsp;</span><span class="ans-wrong">${esc(r.sel)}</span></div>
      </div>`).join('');

  // Hide correct answers section
  document.getElementById('correctAnswersSection')?.classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   ANSWER REVEAL (paroldan keyin)
═══════════════════════════════════════════════ */
function showAnswerLockModal(){
  const overlay=document.getElementById('answerLockOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('answerPasswordInput').value='';
  document.getElementById('answerPasswordInput').classList.remove('error');
  setTimeout(()=>document.getElementById('answerPasswordInput').focus(),100);
}
function closeAnswerLockModal(){document.getElementById('answerLockOverlay').classList.add('hidden');}
function checkAnswerPassword(){
  const inp=document.getElementById('answerPasswordInput');
  if(inp.value===CONFIG.ANSWER_PASS){
    closeAnswerLockModal();
    showCorrectAnswers();
  } else {
    inp.classList.add('error');
    setTimeout(()=>inp.classList.remove('error'),600);
    showToast('❌','Parol noto\'g\'ri!','error');
  }
}
function showCorrectAnswers(){
  const section=document.getElementById('correctAnswersSection');
  const list=document.getElementById('correctAnswersList');
  section.classList.remove('hidden');

  const review=testState.lastReview;
  if(!review||review.length===0){list.innerHTML='<div class="empty-state">Ma\'lumot yo\'q</div>';return;}

  list.innerHTML=review.map((r,i)=>`
    <div class="review-item ${r.isRight?'review-correct':'review-wrong'}" style="animation-delay:${i*0.02}s">
      <p class="review-q"><b>${i+1}.</b> ${esc(r.q)}</p>
      <div class="review-answer-row">
        <span class="review-dot dot-correct"></span>
        <span class="ans-lbl">To'g'ri javob:&nbsp;</span>
        <span class="ans-right">${esc(r.cr)} ${r.correctLetter?'('+r.correctLetter.toUpperCase()+')':''}</span>
      </div>
      ${!r.isRight?`<div class="review-answer-row"><span class="review-dot dot-wrong"></span><span class="ans-lbl">Sizning javobingiz:&nbsp;</span><span class="ans-wrong">${esc(r.sel)}</span></div>`:''}
    </div>`).join('');

  section.scrollIntoView({behavior:'smooth',block:'start'});
  showToast('🔓','To\'g\'ri javoblar ko\'rsatildi!','success','Faqat o\'qituvchi ko\'rishi mumkin');
}
function hideCorrectAnswers(){document.getElementById('correctAnswersSection').classList.add('hidden');}

/* ═══════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════ */
function launchConfetti(percent){
  const canvas=document.getElementById('confetti-canvas');
  const ctx=canvas.getContext('2d');
  canvas.width=window.innerWidth; canvas.height=window.innerHeight; canvas.style.display='block';
  const colors=['#4f46e5','#7c3aed','#059669','#d97706','#ec4899','#06b6d4','#f59e0b','#10b981','#6366f1','#f43f5e'];
  const shapes=['rect','circle','triangle'];
  const count=percent>=90?220:percent>=70?160:100;
  const pieces=[];
  for(let i=0;i<count;i++){
    pieces.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height*0.3-canvas.height*0.3,
      w:Math.random()*12+6,h:Math.random()*7+4,rot:Math.random()*360,rotV:(Math.random()-0.5)*7,
      color:colors[Math.floor(Math.random()*colors.length)],vy:Math.random()*3.5+1.5,vx:(Math.random()-0.5)*2.5,
      shape:shapes[Math.floor(Math.random()*shapes.length)]});
  }
  let startTime=null; const duration=3500;
  function draw(ts){
    if(!startTime)startTime=ts;
    const elapsed=ts-startTime,fadeStart=duration*0.65;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive=false;
    pieces.forEach(p=>{
      if(p.y>canvas.height+30)return; alive=true;
      const opacity=elapsed>fadeStart?Math.max(0,1-(elapsed-fadeStart)/(duration-fadeStart)):1;
      ctx.save();ctx.translate(p.x+p.w/2,p.y+p.h/2);ctx.rotate(p.rot*Math.PI/180);ctx.globalAlpha=opacity;ctx.fillStyle=p.color;
      if(p.shape==='rect'){ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);}
      else if(p.shape==='circle'){ctx.beginPath();ctx.arc(0,0,p.w/2.5,0,Math.PI*2);ctx.fill();}
      else{ctx.beginPath();ctx.moveTo(0,-p.h);ctx.lineTo(p.w/2,p.h/2);ctx.lineTo(-p.w/2,p.h/2);ctx.closePath();ctx.fill();}
      ctx.restore();
      p.y+=p.vy; p.x+=p.vx; p.rot+=p.rotV; p.vy+=0.06; p.vx+=Math.sin(p.y*0.02)*0.05;
    });
    if(elapsed<duration&&alive)requestAnimationFrame(draw);
    else{canvas.style.display='none';ctx.clearRect(0,0,canvas.width,canvas.height);}
  }
  requestAnimationFrame(draw);
}

/* ═══════════════════════════════════════════════
   SEND RESULTS — Supabase + Telegram
═══════════════════════════════════════════════ */
async function sendResults(d){
  const payload={
    student_name:d.name, class_name:d.cls, subject:d.sub,
    score:d.score, total:d.total, percent:d.percent,
    rating_score:d.rating_score, cheat_count:d.cheat,
    elapsed:d.elapsed, created_at:new Date().toISOString()
  };
  fetch(CONFIG.SUPABASE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(async res=>{if(!res.ok){const t=await res.text().catch(()=>'');console.warn('[Supabase] error:',res.status,t);}})
    .catch(err=>console.warn('[Supabase] fetch error:',err));

  const tgText=`📊 *YANGI TEST NATIJASI*\n\n👤 *O'quvchi:* ${d.name}\n🏫 *Sinf:* ${d.cls}\n📚 *Fan:* ${d.sub}\n✅ *To'g'ri:* ${d.score} / ${d.total}\n📈 *Foiz:* ${d.percent}%\n⏱ *Sarflangan vaqt:* ${d.elapsed}\n⚠️ *Chetlanish:* ${d.cheat} marta\n🕒 *Sana:* ${d.time}`;
  fetch(`https://api.telegram.org/bot${CONFIG.TG_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CONFIG.TG_CHAT,text:tgText,parse_mode:'Markdown'})}).catch(()=>{});
}
