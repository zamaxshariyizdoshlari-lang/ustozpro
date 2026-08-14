/* ═══════════════════════════════════════════════
   SUPABASE CLIENT
═══════════════════════════════════════════════ */
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// get-test/submit-result endi chaqiruvchining HAQIQIY sessiya tokenini talab qiladi
// (mijoz aytgan ism-sinfga emas, shu token orqali aniqlangan hisobga ishonadi).
async function callEdgeFunction(name, body) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token || CONFIG.SUPABASE_ANON_KEY;
  const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': CONFIG.SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

/* ═══════════════════════════════════════════════
   DEFAULT SUBJECTS — yangi sinf yaratilganda avtomatik biriktiriladi
═══════════════════════════════════════════════ */
const DEFAULT_SUBJECTS = [
  "Tarix","Turk tili","Geografiya","Mutolaa","Koreys tili","Xitoy tili",
  "Informatika","Ingliz tili","Matematika","Ona tili","Kimyo-Biologiya",
  "Tabiiy fan","Fizika","Arab tili","Rus tili"
];

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let adminLoggedIn = false;
let teacherLoggedIn = false;
let teacherSubjects = []; // faqat shu o'qituvchiga biriktirilgan fan nomlari
let teacherName = '';
let studentLoggedIn = false;
let studentInfo = null; // {student_id, full_name, class_name, login}
let classesCache = [];   // [{id,name}]
let allStudents  = [];   // [{id,class_id,full_name}]
let allSubjects  = [];   // [{id,class_id,name}]
let adminResults = [];   // [{id,student_name,class_name,subject_name,score,total,percent,cheat_count,elapsed_seconds,created_at}]
let teacherResults = [];      // o'qituvchiga RLS orqali ko'rinadigan (faqat o'z fani) natijalar
let classAddBusy = false;
let studentAddBusy = false;
let subjectAddBusy = false;

let settings = {
  max_attempts: 3,
  question_count: 15,
  time_limit_minutes: 20,
  allow_custom: true,
  enable_attempt_limit: false
};

let testState = {
  sessionId: null,       // get-test qaytargan bir martalik test_sessions bileti — submit-result/reveal-answers shu orqali ishlaydi
  questions: [], bookmarks: new Set(), cheats: 0,
  startTime: null, totalSecs: 0, remainingSecs: 0, timerInterval: null,
  studentName: '', className: '', subjectName: '',
  lastAnswers: {},       // {questionId: 'a'|'b'|'c'|'d'}
  lastWrongReview: []    // [{question_text, selected_text}] — filled after submit-result
};

function studentsForClass(classId) { return allStudents.filter(s => s.class_id === classId); }
function subjectsForClass(classId) { return allSubjects.filter(s => s.class_id === classId); }
function classIdByName(name) { return classesCache.find(c => c.name === name)?.id; }

/* ═══════════════════════════════════════════════
   DATA REFRESH
═══════════════════════════════════════════════ */
async function refreshClasses() {
  const { data } = await supabaseClient.from('classes').select('id,name').order('name');
  classesCache = data || [];
}
async function refreshAllStudents() {
  const { data } = await supabaseClient.from('students').select('id,class_id,full_name').order('full_name');
  allStudents = data || [];
}
async function refreshAllSubjects() {
  const { data } = await supabaseClient.from('subjects').select('id,class_id,name').order('name');
  allSubjects = data || [];
}
async function refreshAdminResults() {
  const { data } = await supabaseClient.from('results').select('*').order('created_at', { ascending: false });
  adminResults = data || [];
}
// O'qituvchi natijalari — RLS (is_teacher_for_subject) so'rovni avtomatik o'z faniga cheklaydi
async function refreshTeacherResults() {
  const { data } = await supabaseClient.from('results').select('*').order('created_at', { ascending: false });
  teacherResults = data || [];
}
async function loadSettings() {
  const { data } = await supabaseClient.from('settings').select('*').eq('id', 1).single();
  if (data) settings = data;
}

/* ═══════════════════════════════════════════════
   INIT — sayt LOGIN DARVOZASI bilan boshlanadi.
   Jadvallarni o'qish endi faqat autentifikatsiyadan keyin ishlaydi (RLS shuni talab qiladi),
   shuning uchun bu yerda hech narsa oldindan yuklanmaydi.
═══════════════════════════════════════════════ */
async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    const role = await resolveCurrentRole();
    if (!role) showAuthGate();
  } else {
    showAuthGate();
  }
}
init();

function showAuthGate() {
  document.getElementById('authGate').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}
function hideAuthGate() {
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
}

function saveSettings() {
  const updated = {
    max_attempts: parseInt(document.getElementById('settingMaxAttempts')?.value) || 3,
    question_count: parseInt(document.getElementById('settingQuestionCount')?.value) || 15,
    time_limit_minutes: parseInt(document.getElementById('settingTimeLimit')?.value) || 20,
    allow_custom: document.getElementById('settingAllowCustom')?.checked || false,
    enable_attempt_limit: document.getElementById('settingEnableAttemptLimit')?.checked || false
  };
  supabaseClient.from('settings').update(updated).eq('id', 1).then(({ error }) => {
    if (error) { showToast('❌', 'Sozlamalarni saqlashda xatolik', 'error'); return; }
    settings = { ...settings, ...updated };
    applySettingsToTestSetup();
  });
}
// Sinf uchun alohida sozlama (class_settings) bo'lsa, global settings'ni shu bilan
// birlashtiradi (null maydonlar globaldan meros olinadi). Faqat o'quvchi paneli uchun.
let studentEffectiveSettings = null;
async function computeStudentEffectiveSettings() {
  const eff = { ...settings };
  const cls = classesCache.find(c=>c.name===studentInfo?.class_name);
  if (cls) {
    const { data: cs } = await supabaseClient.from('class_settings').select('*').eq('class_id', cls.id).maybeSingle();
    if (cs) {
      eff.question_count = cs.question_count ?? eff.question_count;
      eff.time_limit_minutes = cs.time_limit_minutes ?? eff.time_limit_minutes;
      eff.max_attempts = cs.max_attempts ?? eff.max_attempts;
      eff.enable_attempt_limit = cs.enable_attempt_limit ?? eff.enable_attempt_limit;
    }
  }
  studentEffectiveSettings = eff;
}
function applySettingsToTestSetup() {
  const eff = studentEffectiveSettings || settings;
  const allowed = eff.allow_custom;
  const controls = document.getElementById('stuTestSetupControls');
  const note = document.getElementById('stuAdminSettingsNote');
  const noteText = document.getElementById('stuAdminSettingsNoteText');
  if (controls) controls.style.display = allowed ? '' : 'none';
  if (note) {
    note.style.display = allowed ? 'none' : 'flex';
    if (noteText) noteText.textContent = `Savol soni: ${eff.question_count} ta · Vaqt: ${eff.time_limit_minutes} daqiqa (admin tomonidan belgilangan)`;
  }
}

/* ═══════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════ */
const SCREENS = {
  'home':       { screen:'screen-home',       nav:'nav-home',    title:'Bosh sahifa',      bc:'Bosh sahifa' },
  'test':       { screen:'screen-test',       nav:'nav-student', title:'Test topshirish',  bc:'Jarayonda...' },
  'result':     { screen:'screen-result',     nav:'nav-student', title:'Natijalar',        bc:'Test natijalari' },
  'admin':      { screen:'screen-admin',      nav:'nav-admin',   title:'Admin Panel',      bc:'Admin boshqaruvi' },
  'manage':     { screen:'screen-manage',     nav:'nav-manage',  title:'Boshqarish',       bc:'Sinflar va o\'quvchilar' },
  'sync':       { screen:'screen-sync',       nav:'nav-sync',    title:'Bazani yangilash', bc:'Google Sheets import' },
  'teacher':    { screen:'screen-teacher',    nav:'nav-teacher', title:'Mening panelim',   bc:'O\'qituvchi paneli' },
  'student':    { screen:'screen-student',    nav:'nav-student', title:'Mening kabinetim', bc:'O\'quvchi kabineti' }
};
function navigateTo(page) {
  const cfg = SCREENS[page]; if (!cfg) return;
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(cfg.screen)?.classList.add('active');
  document.getElementById(cfg.nav)?.classList.add('active');
  document.getElementById('topbarTitle').innerText = cfg.title;
  document.getElementById('topbarBreadcrumb').innerHTML = `<span>Ustoz Pro</span> › <span>${cfg.bc}</span>`;
  if (page==='manage' && adminLoggedIn) syncManageSelects();
  if (page==='home') { updateDashboardStats(); renderRecentResults(); }
  if (page==='admin' && adminLoggedIn) { populateAdminFilters(); refreshAdminResults().then(()=>{renderResultsTable(); renderRatingPanel();}); }
  if (page==='teacher' && teacherLoggedIn) { refreshTeacherResults().then(()=>teacherRenderResultsTable()); }
  if (page==='student' && studentLoggedIn) loadStudentPanel();
  closeSidebar(); window.scrollTo({top:0,behavior:'smooth'});
}
// Sidebar navigatsiyasini rolga qarab ko'rsatadi — har bir rol faqat o'z bo'limini ko'radi
function applyRoleNav(role) {
  const adminOnly = ['nav-home','nav-manage','nav-sync','nav-admin','navSectionAdmin'];
  adminOnly.forEach(id=>{ const el=document.getElementById(id); if (el) el.style.display = role==='admin' ? '' : 'none'; });
  const teacherEl = document.getElementById('nav-teacher'); if (teacherEl) teacherEl.style.display = role==='teacher' ? '' : 'none';
  const studentEl = document.getElementById('nav-student'); if (studentEl) studentEl.style.display = role==='student' ? '' : 'none';
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
   TYPE-TO-CONFIRM MODAL — halokatli amallar uchun
═══════════════════════════════════════════════ */
let typeConfirmResolve = null;
let typeConfirmExpected = '';
function askTypeConfirm(title, desc, expected) {
  return new Promise(resolve => {
    typeConfirmResolve = resolve;
    typeConfirmExpected = expected;
    document.getElementById('typeConfirmTitle').innerText = title;
    document.getElementById('typeConfirmDesc').innerText = `${desc} Tasdiqlash uchun quyidagi maydonga aynan "${expected}" deb yozing:`;
    const inp = document.getElementById('typeConfirmInput');
    inp.value=''; inp.placeholder=expected; inp.classList.remove('error');
    document.getElementById('typeConfirmOverlay').classList.remove('hidden');
    setTimeout(()=>inp.focus(),100);
  });
}
function submitTypeConfirm() {
  const inp = document.getElementById('typeConfirmInput');
  if (inp.value.trim() !== typeConfirmExpected) {
    inp.classList.add('error'); setTimeout(()=>inp.classList.remove('error'),600);
    showToast('⚠️','Yozilgan matn mos kelmadi','warning');
    return;
  }
  document.getElementById('typeConfirmOverlay').classList.add('hidden');
  const resolve = typeConfirmResolve; typeConfirmResolve = null;
  if (resolve) resolve(true);
}
function closeTypeConfirm() {
  document.getElementById('typeConfirmOverlay').classList.add('hidden');
  const resolve = typeConfirmResolve; typeConfirmResolve = null;
  if (resolve) resolve(false);
}

/* ═══════════════════════════════════════════════
   LOGIN DARVOZASI (Supabase Auth) — admin/o'qituvchi/o'quvchi
   uchun yagona kirish nuqtasi. Login email shaklida bo'lishi
   shart emas — "@" bo'lmasa avtomatik "@ustozpro.local" qo'shiladi
   (admin uchun ADMIN_LOGIN_HINT alohida moslashtiriladi).
═══════════════════════════════════════════════ */
async function gateLogin() {
  const loginRaw = document.getElementById('gateLoginInput').value.trim();
  const pass = document.getElementById('gatePassInput').value;
  if (!loginRaw || !pass) { showToast('⚠️','Login va parolni kiriting!','warning'); return; }

  let email;
  if (loginRaw.includes('@')) email = loginRaw;
  else if (loginRaw === CONFIG.ADMIN_LOGIN_HINT) email = CONFIG.ADMIN_EMAIL;
  else email = `${loginRaw}@ustozpro.local`;

  const btn = document.getElementById('gateLoginBtn'); if (btn) btn.disabled = true;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  if (btn) btn.disabled = false;
  if (error) {
    document.getElementById('gatePassInput').style.borderColor='var(--danger)';
    showToast('❌','Login yoki parol noto\'g\'ri!','error');
    setTimeout(()=>document.getElementById('gatePassInput').style.borderColor='',1500);
    return;
  }
  const role = await resolveCurrentRole();
  if (!role) { showToast('❌','Bu hisob tizimda tanilmadi','error'); return; }
  document.getElementById('gateLoginInput').value='';
  document.getElementById('gatePassInput').value='';
  const label = role==='admin'?'Admin':role==='teacher'?teacherName:studentInfo.full_name;
  showToast('✅',`Xush kelibsiz, ${label}!`,'success');
}
// Muvaffaqiyatli kirishdan keyin (yoki sahifa qayta yuklanganda) "men kimman"ni aniqlaydi:
// admin, o'qituvchi, o'quvchi — yoki hech biri (unda chiqarib yuboriladi).
async function resolveCurrentRole() {
  const { data: isAdminRes } = await supabaseClient.rpc('is_admin');
  if (isAdminRes) {
    adminLoggedIn = true; teacherLoggedIn = false; studentLoggedIn = false;
    teacherSubjects = []; teacherName = ''; studentInfo = null; mustChangePassword = false;
    await enterAdminMode();
    return 'admin';
  }
  const { data: teacherRows } = await supabaseClient.rpc('get_my_teacher_info');
  const tInfo = teacherRows && teacherRows[0];
  if (tInfo && tInfo.full_name) {
    adminLoggedIn = false; teacherLoggedIn = true; studentLoggedIn = false;
    teacherSubjects = tInfo.subject_names || []; teacherName = tInfo.full_name; studentInfo = null;
    mustChangePassword = !!tInfo.must_change_password;
    await enterTeacherMode();
    return 'teacher';
  }
  const { data: studentRows } = await supabaseClient.rpc('get_my_student_info');
  const sInfo = studentRows && studentRows[0];
  if (sInfo && sInfo.full_name) {
    adminLoggedIn = false; teacherLoggedIn = false; studentLoggedIn = true;
    teacherSubjects = []; teacherName = ''; studentInfo = sInfo;
    mustChangePassword = !!sInfo.must_change_password;
    await enterStudentMode();
    return 'student';
  }
  await supabaseClient.auth.signOut();
  adminLoggedIn = false; teacherLoggedIn = false; studentLoggedIn = false;
  teacherSubjects = []; teacherName = ''; studentInfo = null;
  return null;
}
async function doLogout() {
  await supabaseClient.auth.signOut();
  adminLoggedIn = false; teacherLoggedIn = false; studentLoggedIn = false;
  teacherSubjects = []; teacherName = ''; studentInfo = null;
  document.getElementById('sidebarUserName').textContent = 'Foydalanuvchi';
  document.getElementById('sidebarUserRole').textContent = 'O\'quvchi';
  showAuthGate();
  showToast('👋','Tizimdan chiqdingiz','info');
}
async function enterAdminMode() {
  hideAuthGate();
  applyRoleNav('admin');
  document.getElementById('sidebarUserName').textContent = 'Admin';
  document.getElementById('sidebarUserRole').textContent = 'Administrator';
  await Promise.all([refreshClasses(), refreshAllStudents(), refreshAllSubjects(), loadSettings()]);
  populateClassSelects();
  renderClassList();
  applySettingsToTestSetup();
  await updateDashboardStats();
  renderRecentResults();
  navigateTo('home');
}
// Admin bergan (yoki tiklagan) parol vaqtinchalik hisoblanadi — o'zi almashtirmaguncha
// panelning qolgan qismi (savol/natija/test bo'limlari) ko'rinmaydi.
let mustChangePassword = false;
function applyForcedPasswordGate() {
  const prefix = teacherLoggedIn ? 't' : 'stu';
  const banner = document.getElementById(`${prefix}ForcedPassBanner`);
  const normal = document.getElementById(`${prefix}NormalContent`);
  if (banner) banner.style.display = mustChangePassword ? '' : 'none';
  if (normal) normal.style.display = mustChangePassword ? 'none' : '';
}
async function enterTeacherMode() {
  hideAuthGate();
  applyRoleNav('teacher');
  document.getElementById('sidebarUserName').textContent = teacherName;
  document.getElementById('sidebarUserRole').textContent = 'O\'qituvchi';
  await Promise.all([refreshClasses(), refreshAllSubjects()]);
  document.getElementById('tPanelName').innerText = teacherName;
  document.getElementById('tPanelSubjects').innerText = teacherSubjects.join(', ') || '—';
  populateClassSelects();
  teacherPopulateFilters();
  applyForcedPasswordGate();
  navigateTo('teacher');
}
async function enterStudentMode() {
  hideAuthGate();
  applyRoleNav('student');
  document.getElementById('sidebarUserName').textContent = studentInfo.full_name;
  document.getElementById('sidebarUserRole').textContent = 'O\'quvchi';
  await Promise.all([refreshClasses(), refreshAllSubjects(), loadSettings()]);
  document.getElementById('stuPanelName').innerText = studentInfo.full_name;
  document.getElementById('stuPanelClass').innerText = `🏫 ${studentInfo.class_name}`;
  populateStudentTestSubjectSelect();
  await computeStudentEffectiveSettings();
  applySettingsToTestSetup();
  applyForcedPasswordGate();
  navigateTo('student');
  checkForResumeSession();
}
function loadSettingsUI() {
  document.getElementById('settingMaxAttempts').value          = settings.max_attempts;
  document.getElementById('settingQuestionCount').value        = settings.question_count;
  document.getElementById('settingTimeLimit').value            = settings.time_limit_minutes;
  document.getElementById('settingAllowCustom').checked        = settings.allow_custom;
  document.getElementById('settingEnableAttemptLimit').checked = settings.enable_attempt_limit;
  const csSel = document.getElementById('classSettingsSelect');
  if (csSel) csSel.innerHTML = '<option value="">— Sinfni tanlang —</option>'+classesCache.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('classSettingsFields').style.display = 'none';
}
async function loadClassSettings() {
  const clsId = document.getElementById('classSettingsSelect').value;
  const fields = document.getElementById('classSettingsFields');
  if (!clsId) { fields.style.display='none'; return; }
  fields.style.display='';
  const { data } = await supabaseClient.from('class_settings').select('*').eq('class_id', clsId).maybeSingle();
  document.getElementById('csQuestionCount').value = data?.question_count ?? '';
  document.getElementById('csTimeLimit').value = data?.time_limit_minutes ?? '';
  document.getElementById('csMaxAttempts').value = data?.max_attempts ?? '';
  document.getElementById('csEnableAttemptLimit').value = data?.enable_attempt_limit===true ? 'true' : data?.enable_attempt_limit===false ? 'false' : '';
}
async function saveClassSettings() {
  const clsId = document.getElementById('classSettingsSelect').value;
  if (!clsId) return;
  const qc = document.getElementById('csQuestionCount').value;
  const tl = document.getElementById('csTimeLimit').value;
  const ma = document.getElementById('csMaxAttempts').value;
  const eal = document.getElementById('csEnableAttemptLimit').value;
  const payload = {
    class_id: clsId,
    question_count: qc===''?null:parseInt(qc),
    time_limit_minutes: tl===''?null:parseInt(tl),
    max_attempts: ma===''?null:parseInt(ma),
    enable_attempt_limit: eal===''?null:(eal==='true')
  };
  const { error } = await supabaseClient.from('class_settings').upsert(payload);
  if (error) { showToast('❌','Saqlashda xatolik','error'); return; }
  showToast('✅','Sinf sozlamalari saqlandi!','success');
}
async function resetClassSettings() {
  const clsId = document.getElementById('classSettingsSelect').value;
  if (!clsId) return;
  await supabaseClient.from('class_settings').delete().eq('class_id', clsId);
  await loadClassSettings();
  showToast('↩️','Global sozlamaga qaytarildi.','info');
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
  const classes = classesCache.map(c=>c.name);
  const allSubs = new Set(allSubjects.map(s=>s.name));

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
// O'qituvchi natijalar filtri — faqat o'ziga biriktirilgan fan(lar)
function teacherPopulateFilters() {
  const classes = classesCache.map(c=>c.name);
  const el1 = document.getElementById('tFilterClass');
  if (el1) { el1.innerHTML = '<option value="">— Barcha sinflar —</option>'; classes.forEach(c=>el1.innerHTML+=`<option value="${c}">${c}</option>`); }
  const el2 = document.getElementById('tFilterSubject');
  if (el2) { el2.innerHTML = '<option value="">— Barcha fanlar —</option>'; teacherSubjects.forEach(s=>el2.innerHTML+=`<option value="${esc(s)}">${esc(s)}</option>`); }
}

/* ═══════════════════════════════════════════════
   FORMAT HELPERS
═══════════════════════════════════════════════ */
function fmtElapsed(sec) { if (sec==null) return '—'; const m=Math.floor(sec/60), s=sec%60; return `${m}:${s<10?'0'+s:s}`; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('uz-UZ') : '—'; }

/* ═══════════════════════════════════════════════
   RESULTS TABLE (admin)
═══════════════════════════════════════════════ */
// Ro'yxatlar 50 tadan ko'rsatiladi, qolgani "Yana ko'rsatish" bosilganda qo'shiladi
// (server so'rovini takrorlamasdan, allaqachon olingan massivni ko'proq ochib berish).
function loadMoreRowHtml(totalCount, visibleCount, colspan, onClickFnName) {
  if (visibleCount >= totalCount) return '';
  return `<tr><td colspan="${colspan}" style="text-align:center;padding:14px"><button class="btn btn-secondary btn-sm" onclick="${onClickFnName}()">Yana ko'rsatish (${totalCount - visibleCount} ta qoldi)</button></td></tr>`;
}
function loadMoreDivHtml(totalCount, visibleCount, onClickFnName) {
  if (visibleCount >= totalCount) return '';
  return `<div style="text-align:center;padding:14px"><button class="btn btn-secondary btn-sm" onclick="${onClickFnName}()">Yana ko'rsatish (${totalCount - visibleCount} ta qoldi)</button></div>`;
}

let resultsVisibleCount = 50;
function renderResultsTable(resetPage=true) {
  if (resetPage) resultsVisibleCount = 50;
  const fcls = document.getElementById('filterClass')?.value||'';
  const fsub = document.getElementById('filterSubject')?.value||'';
  let rows = adminResults||[];
  if (fcls) rows = rows.filter(r=>r.class_name===fcls);
  if (fsub) rows = rows.filter(r=>r.subject_name===fsub);
  const tbody = document.getElementById('resultsTableBody');
  if (!tbody) return;
  if (rows.length===0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:28px;color:var(--text-dim)">Ma\'lumot yo\'q</td></tr>';
    return;
  }
  const visible = rows.slice(0, resultsVisibleCount);
  tbody.innerHTML = visible.map((r,i)=>{
    const pct = r.percent||0;
    const cls = pct>=70?'high':pct>=50?'mid':'low';
    return `<tr>
      <td class="rank-cell">${i+1}</td>
      <td><b>${esc(r.student_name)}</b></td>
      <td>${esc(r.class_name)}</td>
      <td>${esc(r.subject_name)}</td>
      <td>${r.score}/${r.total}</td>
      <td><span class="score-chip ${cls}">${pct}%</span></td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${fmtElapsed(r.elapsed_seconds)}</td>
      <td style="color:${r.cheat_count>0?'var(--danger)':'var(--success)'};font-weight:700">${r.cheat_count||0}</td>
      <td style="font-size:11px;color:var(--text-dim)">${fmtDate(r.created_at)}</td>
    </tr>`;
  }).join('') + loadMoreRowHtml(rows.length, resultsVisibleCount, 9, 'showMoreResults');
}
function showMoreResults() { resultsVisibleCount += 50; renderResultsTable(false); }

/* ═══════════════════════════════════════════════
   RATING SYSTEM
   1200 ballik (Mutolaa tashqari) + 2000 ballik Mutolaa
═══════════════════════════════════════════════ */
async function renderRatingPanel() {
  const fcls = document.getElementById('ratingFilterClass')?.value||'';
  const fsub = document.getElementById('ratingFilterSub')?.value||'';

  // Reyting hisob-kitobi endi serverda (Postgres RPC) bajariladi —
  // barcha natijalarni brauzerga tortib client'da hisoblash o'rniga.
  const [{ data: formulaRows }, { data: monthlyArr }, { data: mutArr }] = await Promise.all([
    supabaseClient.rpc('get_rating_formula_info', { p_class: fcls || null }),
    supabaseClient.rpc('get_monthly_rating', { p_class: fcls || null, p_subject: fsub || null }),
    supabaseClient.rpc('get_mutolaa_rating', { p_class: fcls || null }),
  ]);
  const formula = (formulaRows && formulaRows[0]) || { total_non_mut_subjects:0, coeff:0, mut_total:1, mut_coeff:2000 };

  const infoEl = document.getElementById('ratingFormulaInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="info-note" style="margin-bottom:11px">
        📊 Jami fanlar (Mutolaa tashqari): <b>${formula.total_non_mut_subjects}</b> ·
        Koeffitsiyent: <b>1200 / ${formula.total_non_mut_subjects} = ${Number(formula.coeff).toFixed(2)}</b> ·
        Mutolaa koeffitsiyenti: <b>2000 / ${formula.mut_total} = ${Number(formula.mut_coeff).toFixed(2)}</b>
      </div>`;
  }

  const monthlyBody = document.getElementById('monthlyRatingBody');
  if (monthlyBody) {
    if (!monthlyArr || monthlyArr.length===0) {
      monthlyBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:22px;color:var(--text-dim)">Ma\'lumot yo\'q</td></tr>';
    } else {
      monthlyBody.innerHTML = monthlyArr.map((s,i)=>{
        const rankClass = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        const scoreClass = s.rating_score>=800?'high':s.rating_score>=400?'mid':'low';
        return `<tr>
          <td class="rank-cell ${rankClass}">${medal||i+1}</td>
          <td><b>${esc(s.student_name)}</b></td>
          <td>${esc(s.class_name)}</td>
          <td style="font-family:'DM Mono',monospace">${s.total_correct} ta</td>
          <td><span class="score-chip ${scoreClass}">${s.rating_score}</span></td>
        </tr>`;
      }).join('');
    }
  }

  const mutBody = document.getElementById('mutolaaRatingBody');
  if (mutBody) {
    if (!mutArr || mutArr.length===0) {
      mutBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:22px;color:var(--text-dim)">Mutolaa natijalari yo\'q</td></tr>';
    } else {
      mutBody.innerHTML = mutArr.map((s,i)=>{
        const rankClass = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
        const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        return `<tr>
          <td class="rank-cell ${rankClass}">${medal||i+1}</td>
          <td><b>${esc(s.student_name)}</b></td>
          <td>${esc(s.class_name)}</td>
          <td style="font-family:'DM Mono',monospace">${s.mut_correct} ta</td>
          <td><span class="mutolaa-badge">📖 ${s.mut_score}</span></td>
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
  let rows = adminResults||[];
  if (fcls) rows = rows.filter(r=>r.class_name===fcls);
  if (fsub) rows = rows.filter(r=>r.subject_name===fsub);
  if (rows.length===0) { showToast('⚠️','Chiqarish uchun ma\'lumot yo\'q','warning'); return; }

  const wsData = [
    ['#','Ism','Sinf','Fan','To\'g\'ri','Jami','Foiz (%)','Sarflangan vaqt','Chetlanish','Sana'],
    ...rows.map((r,i)=>[i+1,r.student_name,r.class_name,r.subject_name,r.score,r.total,r.percent,fmtElapsed(r.elapsed_seconds),r.cheat_count||0,fmtDate(r.created_at)])
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
  let rows = adminResults||[];
  if (fcls) rows = rows.filter(r=>r.class_name===fcls);
  if (fsub) rows = rows.filter(r=>r.subject_name===fsub);
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
    body: rows.map((r,i)=>[i+1,r.student_name,r.class_name,r.subject_name,r.score,r.total,r.percent+'%',fmtElapsed(r.elapsed_seconds),r.cheat_count||0,fmtDate(r.created_at)]),
    styles:{fontSize:8,cellPadding:3},
    headStyles:{fillColor:[79,70,229],textColor:255},
    alternateRowStyles:{fillColor:[238,242,255]}
  });
  doc.save(`UstazPro_Natijalar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.pdf`);
  showToast('📄','PDF yuklab olindi!','success');
}

async function clearAllResults() {
  const ok = await askTypeConfirm('Barcha natijalarni o\'chirish', 'BARCHA o\'quvchilarning BARCHA test natijalari butunlay o\'chadi.', 'OCHIRISH');
  if (!ok) return;
  const { error } = await supabaseClient.from('results').delete().neq('id','00000000-0000-0000-0000-000000000000');
  if (error) { showToast('❌','O\'chirishda xatolik','error'); return; }
  supabaseClient.rpc('admin_log_event', { p_action: 'clear_all_results' });
  adminResults = [];
  renderResultsTable(); renderRatingPanel(); updateDashboardStats(); renderRecentResults();
  showToast('🗑️','Barcha natijalar o\'chirildi','info');
}

/* ═══════════════════════════════════════════════
   SESSION PERSISTENCE (resume an unfinished test)
   O'quvchi loginiga bog'lab saqlanadi — bitta qurilmada ketma-ket
   turli o'quvchilar test topshirsa, bir-birining sessiyasi aralashmasin.
═══════════════════════════════════════════════ */
function sessionStorageKey() { return `ustoz_pro_session_v5__${studentInfo?.login || 'anon'}`; }
function saveSession() {
  const answers = {};
  for (let i=0;i<testState.questions.length;i++) {
    const sel = document.querySelector(`input[name="q${i}"]:checked`);
    if (sel) answers[i] = sel.value;
  }
  localStorage.setItem(sessionStorageKey(), JSON.stringify({
    sessionId:testState.sessionId,
    questions:testState.questions, bookmarks:[...testState.bookmarks],
    cheats:testState.cheats, startTime:testState.startTime?.toISOString(),
    totalSecs:testState.totalSecs, remainingSecs:testState.remainingSecs,
    studentName:testState.studentName, className:testState.className, subjectName:testState.subjectName,
    answers
  }));
}
function clearSession() { localStorage.removeItem(sessionStorageKey()); }
function checkForResumeSession() {
  const raw = localStorage.getItem(sessionStorageKey());
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
  const hs = document.getElementById('studentPanelContent');
  document.getElementById('resumeBanner')?.remove();
  const b = document.createElement('div');
  b.id='resumeBanner'; b.className='resume-banner';
  b.innerHTML=`<div class="resume-banner-icon">⏸️</div>
    <div class="resume-banner-info">
      <div class="resume-banner-title">Tugallanmagan test topildi!</div>
      <div class="resume-banner-sub">${session.subjectName} · Qolgan: ${m}:${s<10?'0'+s:s}</div>
    </div>
    <div class="resume-banner-actions">
      <button class="btn btn-primary btn-sm" onclick="resumeSession()">▶ Davom etish</button>
      <button class="btn btn-danger btn-xs" onclick="discardSession()" style="height:36px">✕</button>
    </div>`;
  hs.insertBefore(b, hs.firstChild);
}
function resumeSession() {
  const raw = localStorage.getItem(sessionStorageKey()); if (!raw) return;
  const session = JSON.parse(raw);
  const elapsed = Math.floor((Date.now()-new Date(session.startTime).getTime())/1000);
  const remaining = session.totalSecs - elapsed;
  if (remaining<=0) { clearSession(); showToast('⏰','Sessiya muddati tugagan!','error'); document.getElementById('resumeBanner')?.remove(); return; }
  testState.sessionId=session.sessionId||null;
  testState.questions=session.questions; testState.bookmarks=new Set(session.bookmarks||[]);
  testState.cheats=session.cheats||0; testState.startTime=new Date(session.startTime);
  testState.totalSecs=session.totalSecs; testState.remainingSecs=remaining;
  testState.studentName=session.studentName; testState.className=session.className; testState.subjectName=session.subjectName;
  testState.lastAnswers = {};
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
   CSV PARSER (RFC-4180 compliant) — Google Sheets import
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
function expandClassNames(raw) {
  return raw.split(',').map(t=>t.trim()).filter(Boolean).flatMap(token=>{
    if (/^\d+-\d+$/.test(token)) {
      const [from,to] = token.split('-').map(Number);
      const out=[]; for(let n=from;n<=to;n++) out.push(`${n}-sinf`);
      return out;
    }
    if (/^\d+$/.test(token)) return [`${token}-sinf`];
    return [token];
  });
}
async function getOrCreateClass(name) {
  let cls = classesCache.find(c=>c.name===name);
  if (cls) return cls.id;
  const { data, error } = await supabaseClient.from('classes').insert({ name }).select().single();
  if (error) {
    const { data: existing } = await supabaseClient.from('classes').select('*').eq('name',name).single();
    if (existing) { classesCache.push(existing); return existing.id; }
    throw error;
  }
  classesCache.push(data);
  return data.id;
}
async function getOrCreateSubject(classId, name) {
  let subj = allSubjects.find(s=>s.class_id===classId && s.name===name);
  if (subj) return subj.id;
  const { data, error } = await supabaseClient.from('subjects').insert({ class_id: classId, name }).select().single();
  if (error) {
    const { data: existing } = await supabaseClient.from('subjects').select('*').eq('class_id',classId).eq('name',name).single();
    if (existing) { allSubjects.push(existing); return existing.id; }
    throw error;
  }
  allSubjects.push(data);
  return data.id;
}

let syncInProgress=false;
async function syncData() {
  if (syncInProgress) return;
  const url = document.getElementById('sheetCsvUrl').value.trim();
  if (!url) { showToast('⚠️','CSV havolasini kiriting!','warning'); return; }
  syncInProgress=true;
  const setLoading=loading=>{
    const icon=document.getElementById('syncMainIcon'); if(icon) icon.innerText=loading?'⌛':'🔄';
    const txt=document.getElementById('syncMainText'); if(txt) txt.innerText=loading?'Import qilinmoqda...':'Import qilish';
    const btn=document.getElementById('syncMainBtn'); if(btn) btn.disabled=loading;
  };
  setLoading(true);
  try {
    const res=await fetch(url);
    const csv=await res.text();
    const rows=csv.split('\n').slice(1);

    // 1) Qatorlarni tahlil qilib normalizatsiya qilamiz (bir nechta sinfli qatorlar kengaytiriladi)
    const parsed = [];
    for (const row of rows) {
      if (!row.trim()) continue;
      const cols=parseCSVLine(row);
      if (cols.length<8) continue;
      const [sinf,fan,q,a,b,c,d,cr,hint]=cols;
      if (!sinf||!fan||!q) continue;
      for (const clsName of expandClassNames(sinf)) {
        parsed.push({ clsName, fan, q, a:a||'', b:b||'', c:c||'', d:d||'', cr:(cr||'').toLowerCase().trim()||'a', hint:hint||'' });
      }
    }

    // 2) Har bir sinf/fan faqat bir marta yaratiladi (avval N marta takroriy so'rov bo'lardi)
    const classIdCache = {};
    for (const clsName of [...new Set(parsed.map(p=>p.clsName))]) {
      try { classIdCache[clsName] = await getOrCreateClass(clsName); } catch(e) { /* qatorlar keyin xato hisoblanadi */ }
    }
    const subjectIdCache = {};
    for (const p of parsed) {
      const clsId = classIdCache[p.clsName];
      if (!clsId) continue;
      const key = `${clsId}__${p.fan}`;
      if (!(key in subjectIdCache)) {
        try { subjectIdCache[key] = await getOrCreateSubject(clsId, p.fan); } catch(e) { subjectIdCache[key] = null; }
      }
    }

    // 3) Savollarni guruh (batch) holida qo'shamiz — bitta-bitta insert o'rniga
    const questionRows = [];
    let errCount = 0;
    for (const p of parsed) {
      const clsId = classIdCache[p.clsName];
      const subjId = clsId ? subjectIdCache[`${clsId}__${p.fan}`] : null;
      if (!subjId) { errCount++; continue; }
      questionRows.push({ subject_id: subjId, question_text:p.q, option_a:p.a, option_b:p.b, option_c:p.c, option_d:p.d, correct_option:p.cr, hint:p.hint });
    }
    let count=0;
    const CHUNK=500;
    for (let i=0;i<questionRows.length;i+=CHUNK) {
      const chunk = questionRows.slice(i,i+CHUNK);
      const { error } = await supabaseClient.from('questions').insert(chunk);
      if (error) errCount+=chunk.length; else count+=chunk.length;
    }

    await Promise.all([refreshClasses(), refreshAllStudents(), refreshAllSubjects()]);
    populateClassSelects();
    const box=document.getElementById('syncStatusBox');
    if (box) { box.style.display='block'; box.innerHTML=`<div style="padding:13px;background:var(--success-pale);border:1px solid rgba(5,150,105,0.2);border-radius:var(--r-sm);font-size:12px;color:#065f46">✅ <b>${count}</b> ta savol import qilindi${errCount?`, ${errCount} tasi xato bo'ldi`:''}.</div>`; }
    showToast('✅','Import tugadi!','success',`${count} ta savol qo'shildi`);
  } catch(e) { showToast('❌','Xatolik yuz berdi!','error','Havolani va internetni tekshiring'); }
  setLoading(false); syncInProgress=false;
}

/* ═══════════════════════════════════════════════
   CLASS MANAGEMENT (admin)
═══════════════════════════════════════════════ */
function populateClassSelects() {
  ['manageClass','manageClassSub','qClass','tQClass'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML='<option value="">— Sinfni tanlang —</option>';
    classesCache.forEach(c=>sel.innerHTML+=`<option value="${esc(c.name)}">${esc(c.name)}</option>`);
    if (cur&&classesCache.some(c=>c.name===cur)) sel.value=cur;
  });
}
async function syncManageSelects() {
  await Promise.all([refreshClasses(), refreshAllStudents(), refreshAllSubjects()]);
  populateClassSelects(); renderClassList();
}
// O'quvchi paneli — faqat o'z sinfi bo'yicha fan tanlanadi (sinf/ism allaqachon hisobdan ma'lum)
function populateStudentTestSubjectSelect() {
  const sel = document.getElementById('stuTestSubject'); if (!sel) return;
  sel.innerHTML = '<option value="">— Fanni tanlang —</option>';
  const cls = classesCache.find(c=>c.name===studentInfo?.class_name);
  if (cls) subjectsForClass(cls.id).forEach(s=>sel.innerHTML+=`<option value="${esc(s.name)}">${esc(s.name)}</option>`);
}
async function addClass() {
  if (classAddBusy) return;
  const name=document.getElementById('newClassName').value.trim();
  if (!name){showToast('⚠️','Sinf nomini kiriting!','warning');return;}
  classAddBusy = true;
  const btn = document.getElementById('addClassBtn'); if (btn) btn.disabled = true;
  const { data, error } = await supabaseClient.from('classes').insert({ name }).select().single();
  if (error) {
    showToast('⚠️', error.code==='23505'?'Bu sinf allaqachon mavjud!':'Xatolik yuz berdi','warning');
    classAddBusy = false; if (btn) btn.disabled = false;
    return;
  }
  await supabaseClient.from('subjects').insert(DEFAULT_SUBJECTS.map(s=>({class_id:data.id,name:s})));
  await Promise.all([refreshClasses(), refreshAllSubjects()]);
  populateClassSelects(); renderClassList();
  document.getElementById('newClassName').value='';
  showToast('✅',`"${name}" sinfi qo'shildi!`,'success'); updateDashboardStats();
  classAddBusy = false; if (btn) btn.disabled = false;
}
async function removeClass(id,name) {
  const ok = await askTypeConfirm(`"${name}" sinfini o'chirish`, `Bu sinfning barcha o'quvchi, fan va savollari ham o'chadi.`, name);
  if (!ok) return;
  const { error } = await supabaseClient.from('classes').delete().eq('id', id);
  if (error) { showToast('❌','O\'chirishda xatolik','error'); return; }
  supabaseClient.rpc('admin_log_event', { p_action: 'delete_class', p_target_info: { class_id: id, name } });
  await Promise.all([refreshClasses(), refreshAllStudents(), refreshAllSubjects()]);
  populateClassSelects(); renderClassList();
  showToast('🗑️',`"${name}" o'chirildi.`,'info'); updateDashboardStats();
}
function renderClassList() {
  document.getElementById('classCount').innerText=classesCache.length;
  const term=(document.getElementById('classSearchInput')?.value||'').trim().toLowerCase();
  const list = term ? classesCache.filter(c=>c.name.toLowerCase().includes(term)) : classesCache;
  document.getElementById('classList').innerHTML=list.length===0
    ?`<div class="empty-state">${term?'Qidiruv bo\'yicha sinf topilmadi.':'Sinflar yo\'q. Yangi sinf qo\'shing.'}</div>`
    :list.map(c=>`<div class="list-item"><div class="li-icon">🏫</div><span class="li-text"><b>${esc(c.name)}</b> — ${studentsForClass(c.id).length} o'quvchi</span><button class="li-del" onclick="removeClass('${c.id}','${c.name.replace(/'/g,"\\'")}')">🗑️</button></div>`).join('');
}

/* ═══════════════════════════════════════════════
   STUDENT MANAGEMENT (admin)
═══════════════════════════════════════════════ */
async function addStudent() {
  if (studentAddBusy) return;
  const clsName=document.getElementById('manageClass').value;
  const name=document.getElementById('newStudentName').value.trim();
  if (!clsName){showToast('⚠️','Avval sinfni tanlang!','warning');return;}
  if (!name){showToast('⚠️','O\'quvchi ismini kiriting!','warning');return;}
  studentAddBusy = true;
  const btn = document.getElementById('addStudentBtn'); if (btn) btn.disabled = true;
  const cls = classesCache.find(c=>c.name===clsName);
  const { error } = await supabaseClient.from('students').insert({ class_id: cls.id, full_name: name });
  studentAddBusy = false; if (btn) btn.disabled = false;
  if (error) { showToast('⚠️', error.code==='23505'?'Bu o\'quvchi allaqachon mavjud!':'Xatolik yuz berdi','warning'); return; }
  await refreshAllStudents();
  renderStudentList(); renderClassList();
  document.getElementById('newStudentName').value='';
  showToast('✅',`"${name}" qo'shildi!`,'success'); updateDashboardStats();
}
async function removeStudent(id,name) {
  const { error } = await supabaseClient.from('students').delete().eq('id', id);
  if (error) { showToast('❌','Xatolik','error'); return; }
  supabaseClient.rpc('admin_log_event', { p_action: 'delete_student', p_target_info: { student_id: id, name } });
  await refreshAllStudents();
  renderStudentList(); renderClassList();
  showToast('🗑️',`"${name}" o'chirildi.`,'info'); updateDashboardStats();
}
let studentLoginsCache = {}; // student_id -> login (admin_list_student_logins RPC orqali)
async function refreshStudentLoginsCache() {
  const { data } = await supabaseClient.rpc('admin_list_student_logins');
  studentLoginsCache = {};
  (data||[]).forEach(r=>{ studentLoginsCache[r.student_id] = r.login; });
}
function renderStudentList() {
  const clsName=document.getElementById('manageClass')?.value;
  const cls = classesCache.find(c=>c.name===clsName);
  const students = cls ? studentsForClass(cls.id) : [];
  document.getElementById('studentCount').innerText=students.length;
  const term=(document.getElementById('studentSearchInput')?.value||'').trim().toLowerCase();
  const list = term ? students.filter(s=>s.full_name.toLowerCase().includes(term)) : students;
  document.getElementById('studentList').innerHTML=list.length===0
    ?`<div class="empty-state">${term?'Qidiruv bo\'yicha o\'quvchi topilmadi.':(cls?'O\'quvchilar yo\'q.':'Sinfni tanlang.')}</div>`
    :list.map(s=>{
      const login = studentLoginsCache[s.id];
      const nameEsc = s.full_name.replace(/'/g,"\\'");
      const credBtn = login
        ? `<button class="li-del" style="color:var(--primary)" onclick="resetOneStudentPassword('${s.id}','${nameEsc}')" title="Parolni tiklash">🔄</button>`
        : `<button class="li-del" style="color:var(--primary)" onclick="createOneStudentLogin('${s.id}','${nameEsc}')" title="Login yaratish">🔑</button>`;
      return `<div class="list-item"><div class="li-icon">👤</div><span class="li-text">${esc(s.full_name)}${login?` <span style="color:var(--text-dim);font-size:11px">(${esc(login)})</span>`:''}</span><div style="display:flex;gap:4px">${credBtn}<button class="li-del" onclick="removeStudent('${s.id}','${nameEsc}')">🗑️</button></div></div>`;
    }).join('');
}
async function createOneStudentLogin(id, name) {
  const { data, error } = await supabaseClient.rpc('admin_create_student_login', { p_student_id: id });
  if (error) { showToast('❌','Login yaratishda xatolik','error'); return; }
  const row = data && data[0];
  document.getElementById('credResultTitle').innerText = 'Yangi login yaratildi';
  document.getElementById('credResultDesc').innerText = `"${name}" uchun:`;
  document.getElementById('credResultLogin').innerText = row.login;
  document.getElementById('credResultPassword').innerText = row.password;
  document.getElementById('credResultOverlay').classList.remove('hidden');
  await refreshStudentLoginsCache();
  renderStudentList();
}
function closeCredResultModal() { document.getElementById('credResultOverlay').classList.add('hidden'); }
async function resetOneStudentPassword(id, name) {
  const newPass = prompt(`"${name}" uchun yangi parol kiriting (kamida 6 belgi):`);
  if (!newPass) return;
  if (newPass.length < 6) { showToast('⚠️','Parol kamida 6 belgidan iborat bo\'lsin!','warning'); return; }
  const { error } = await supabaseClient.rpc('admin_reset_student_password', { p_student_id: id, p_new_password: newPass });
  if (error) { showToast('❌','Xatolik yuz berdi','error'); return; }
  showToast('✅',`"${name}" paroli yangilandi`,'success');
}
async function bulkCreateStudentLogins() {
  const { data, error } = await supabaseClient.rpc('admin_bulk_create_student_logins');
  if (error) { showToast('❌','Xatolik yuz berdi','error'); return; }
  const rows = data || [];
  if (rows.length === 0) { showToast('ℹ️','Barcha o\'quvchilarda login allaqachon bor','info'); return; }
  document.getElementById('bulkCredDesc').innerText = `${rows.length} ta o'quvchi uchun yaratildi. Bu ro'yxat faqat hozir ko'rinadi — nusxalab yoki chop etib saqlang.`;
  document.getElementById('bulkCredList').innerHTML = rows.map(r=>`<div style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${esc(r.full_name)}</b> (${esc(r.class_name)})<br>login: <b>${esc(r.login)}</b> · parol: <b>${esc(r.password)}</b></div>`).join('');
  window.__lastBulkCred = rows;
  document.getElementById('bulkCredOverlay').classList.remove('hidden');
  await refreshStudentLoginsCache();
  renderStudentList();
}
function closeBulkCredModal() { document.getElementById('bulkCredOverlay').classList.add('hidden'); }
function copyBulkCredList() {
  const rows = window.__lastBulkCred || [];
  const text = rows.map(r=>`${r.full_name} (${r.class_name}) — login: ${r.login}, parol: ${r.password}`).join('\n');
  navigator.clipboard.writeText(text).then(()=>showToast('📋','Nusxalandi!','success')).catch(()=>showToast('❌','Nusxalashda xatolik','error'));
}
function exportBulkCredExcel() {
  if (typeof XLSX==='undefined') { showToast('❌','XLSX kutubxonasi yuklanmadi','error'); return; }
  const rows = window.__lastBulkCred || [];
  if (rows.length===0) return;
  const wsData = [['Ism','Sinf','Login','Parol'], ...rows.map(r=>[r.full_name, r.class_name, r.login, r.password])];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Login-parollar');
  XLSX.writeFile(wb, `UstazPro_Login_Parollar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.xlsx`);
  showToast('📥','Excel fayl yuklab olindi!','success');
}
function exportBulkCredPDF() {
  if (typeof window.jspdf==='undefined') { showToast('❌','jsPDF kutubxonasi yuklanmadi','error'); return; }
  const rows = window.__lastBulkCred || [];
  if (rows.length===0) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Ustoz Pro - O\'quvchilar login-parollari', 14, 16);
  doc.setFontSize(10);
  doc.text(`Sanasi: ${new Date().toLocaleDateString('uz-UZ')}`, 14, 23);
  doc.autoTable({
    startY:28,
    head:[['Ism','Sinf','Login','Parol']],
    body: rows.map(r=>[r.full_name, r.class_name, r.login, r.password]),
    styles:{fontSize:9,cellPadding:3},
    headStyles:{fillColor:[79,70,229],textColor:255},
    alternateRowStyles:{fillColor:[238,242,255]}
  });
  doc.save(`UstazPro_Login_Parollar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.pdf`);
  showToast('📄','PDF yuklab olindi!','success');
}

/* ═══════════════════════════════════════════════
   TEACHER MANAGEMENT (admin) — fan bo'yicha cheklangan o'qituvchi hisoblari
═══════════════════════════════════════════════ */
let teacherAddBusy = false;
function renderTeacherSubjectCheckboxes() {
  const box = document.getElementById('newTeacherSubjectsBox'); if (!box) return;
  const names = [...new Set(allSubjects.map(s=>s.name))].sort();
  box.innerHTML = names.map((n,i)=>`
    <label class="checkbox-pill" id="teacherSubPill-${i}">
      <input type="checkbox" value="${esc(n)}" onchange="document.getElementById('teacherSubPill-${i}').classList.toggle('checked',this.checked)">
      ${esc(n)}
    </label>`).join('');
}
async function addTeacher() {
  if (teacherAddBusy) return;
  const full_name = document.getElementById('newTeacherName').value.trim();
  const email = document.getElementById('newTeacherEmail').value.trim();
  const password = document.getElementById('newTeacherPassword').value;
  const subject_names = [...document.querySelectorAll('#newTeacherSubjectsBox input:checked')].map(el=>el.value);
  if (!full_name) { showToast('⚠️','To\'liq ismni kiriting!','warning'); return; }
  if (!email || !email.includes('@')) { showToast('⚠️','To\'g\'ri email kiriting!','warning'); return; }
  if (!password || password.length < 6) { showToast('⚠️','Parol kamida 6 belgidan iborat bo\'lsin!','warning'); return; }
  if (subject_names.length===0) { showToast('⚠️','Kamida bitta fan tanlang!','warning'); return; }

  teacherAddBusy = true;
  const { error } = await supabaseClient.rpc('admin_create_teacher', { p_full_name: full_name, p_email: email, p_password: password, p_subject_names: subject_names });
  teacherAddBusy = false;
  if (error) {
    const msg = error.message?.includes('duplicate') || error.code==='23505' ? 'Bu email allaqachon band!' : 'Xatolik yuz berdi';
    showToast('❌', msg, 'error');
    return;
  }
  document.getElementById('newTeacherName').value='';
  document.getElementById('newTeacherEmail').value='';
  document.getElementById('newTeacherPassword').value='';
  renderTeacherSubjectCheckboxes();
  await renderTeacherList();
  showToast('✅',`"${full_name}" o'qituvchi sifatida qo'shildi!`,'success');
}
async function renderTeacherList() {
  const list = document.getElementById('teacherList'); if (!list) return;
  const { data, error } = await supabaseClient.rpc('admin_list_teachers');
  if (error) { list.innerHTML = `<div class="empty-state">Xatolik: ${esc(error.message)}</div>`; return; }
  const teachers = data || [];
  document.getElementById('teacherCount').innerText = teachers.length;
  list.innerHTML = teachers.length===0
    ? '<div class="empty-state">O\'qituvchilar yo\'q.</div>'
    : teachers.map(t=>`<div class="list-item"><div class="li-icon">👨‍🏫</div><span class="li-text"><b>${esc(t.full_name)}</b> — ${esc(t.email)}<br><span style="color:var(--text-dim);font-size:11px">${(t.subject_names||[]).map(esc).join(', ')||'Fan biriktirilmagan'}</span></span><div style="display:flex;gap:4px"><button class="li-del" style="color:var(--primary)" onclick="resetTeacherPassword('${t.id}','${t.full_name.replace(/'/g,"\\'")}')" title="Parolni tiklash">🔑</button><button class="li-del" onclick="removeTeacher('${t.id}','${t.full_name.replace(/'/g,"\\'")}')" title="O'chirish">🗑️</button></div></div>`).join('');
}
async function resetTeacherPassword(id, name) {
  const newPass = prompt(`"${name}" uchun yangi parol kiriting (kamida 6 belgi):`);
  if (!newPass) return;
  if (newPass.length < 6) { showToast('⚠️','Parol kamida 6 belgidan iborat bo\'lsin!','warning'); return; }
  const { error } = await supabaseClient.rpc('admin_reset_teacher_password', { p_teacher_id: id, p_new_password: newPass });
  if (error) { showToast('❌','Xatolik yuz berdi','error'); return; }
  showToast('✅',`"${name}" paroli yangilandi`,'success');
}
async function removeTeacher(id, name) {
  const ok = await askTypeConfirm(`"${name}" o'qituvchini o'chirish`, `Uning hisobi butunlay o'chadi, login endi ishlamaydi.`, name);
  if (!ok) return;
  const { error } = await supabaseClient.rpc('admin_delete_teacher', { p_teacher_id: id });
  if (error) { showToast('❌','Xatolik yuz berdi','error'); return; }
  await renderTeacherList();
  showToast('🗑️',`"${name}" o'chirildi.`,'info');
}

/* ═══════════════════════════════════════════════
   ADMIN ACCOUNT MANAGEMENT — ko'p-adminlik + audit jurnali
═══════════════════════════════════════════════ */
let adminAddBusy = false;
async function addAdmin() {
  if (adminAddBusy) return;
  const full_name = document.getElementById('newAdminName').value.trim();
  const email = document.getElementById('newAdminEmail').value.trim();
  const password = document.getElementById('newAdminPassword').value;
  if (!full_name) { showToast('⚠️','To\'liq ismni kiriting!','warning'); return; }
  if (!email || !email.includes('@')) { showToast('⚠️','To\'g\'ri email kiriting!','warning'); return; }
  if (!password || password.length < 6) { showToast('⚠️','Parol kamida 6 belgidan iborat bo\'lsin!','warning'); return; }

  adminAddBusy = true;
  const { error } = await supabaseClient.rpc('admin_create_admin', { p_full_name: full_name, p_email: email, p_password: password });
  adminAddBusy = false;
  if (error) {
    const msg = error.message?.includes('duplicate') || error.code==='23505' ? 'Bu email allaqachon band!' : 'Xatolik yuz berdi';
    showToast('❌', msg, 'error');
    return;
  }
  document.getElementById('newAdminName').value='';
  document.getElementById('newAdminEmail').value='';
  document.getElementById('newAdminPassword').value='';
  await renderAdminAccList();
  showToast('✅',`"${full_name}" admin sifatida qo'shildi!`,'success');
}
async function renderAdminAccList() {
  const list = document.getElementById('adminAccList'); if (!list) return;
  const { data, error } = await supabaseClient.rpc('admin_list_admins');
  if (error) { list.innerHTML = `<div class="empty-state">Xatolik: ${esc(error.message)}</div>`; return; }
  const admins = data || [];
  const myId = (await supabaseClient.auth.getUser()).data.user?.id;
  document.getElementById('adminAccCount').innerText = admins.length;
  list.innerHTML = admins.length===0
    ? '<div class="empty-state">Adminlar yo\'q.</div>'
    : admins.map(a=>`<div class="list-item"><div class="li-icon">🛡️</div><span class="li-text"><b>${esc(a.full_name)}</b>${a.id===myId?' <span style="color:var(--text-dim);font-size:11px">(siz)</span>':''} — ${esc(a.email)}</span>${a.id===myId?'':`<button class="li-del" onclick="removeAdmin('${a.id}','${a.full_name.replace(/'/g,"\\'")}')" title="O'chirish">🗑️</button>`}</div>`).join('');
}
async function removeAdmin(id, name) {
  const ok = await askTypeConfirm(`"${name}" adminni o'chirish`, `Uning hisobi butunlay o'chadi, login endi ishlamaydi.`, name);
  if (!ok) return;
  const { error } = await supabaseClient.rpc('admin_delete_admin', { p_admin_id: id });
  if (error) {
    const msg = error.message?.includes('cannot_delete_last_admin') ? 'Oxirgi adminni o\'chirib bo\'lmaydi!' : 'Xatolik yuz berdi';
    showToast('❌', msg, 'error');
    return;
  }
  await renderAdminAccList();
  showToast('🗑️',`"${name}" o'chirildi.`,'info');
}
async function renderAuditLog() {
  const body = document.getElementById('auditLogBody'); if (!body) return;
  const { data, error } = await supabaseClient.rpc('admin_list_audit_log', { p_limit: 200 });
  if (error) { body.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:22px;color:var(--text-dim)">Xatolik: ${esc(error.message)}</td></tr>`; return; }
  const rows = data || [];
  body.innerHTML = rows.length===0
    ? '<tr><td colspan="4" style="text-align:center;padding:22px;color:var(--text-dim)">Hali harakat yo\'q</td></tr>'
    : rows.map(r=>`<tr>
        <td style="font-size:11px;color:var(--text-dim)">${fmtDate(r.created_at)}</td>
        <td>${esc(r.actor_role||'—')}</td>
        <td>${esc(r.action)}</td>
        <td style="font-size:11px;color:var(--text-dim)">${esc(JSON.stringify(r.target_info||{}))}</td>
      </tr>`).join('');
}

/* ═══════════════════════════════════════════════
   SUBJECT MANAGEMENT (admin)
═══════════════════════════════════════════════ */
async function addSubject() {
  if (subjectAddBusy) return;
  const clsName=document.getElementById('manageClassSub')?.value;
  const name=document.getElementById('newSubName').value.trim();
  if (!clsName){showToast('⚠️','Avval sinfni tanlang!','warning');return;}
  if (!name){showToast('⚠️','Fan nomini kiriting!','warning');return;}
  subjectAddBusy = true;
  const btn = document.getElementById('addSubjectBtn'); if (btn) btn.disabled = true;
  const cls = classesCache.find(c=>c.name===clsName);
  const { error } = await supabaseClient.from('subjects').insert({ class_id: cls.id, name });
  subjectAddBusy = false; if (btn) btn.disabled = false;
  if (error) { showToast('⚠️', error.code==='23505'?'Bu fan allaqachon mavjud!':'Xatolik yuz berdi','warning'); return; }
  await refreshAllSubjects();
  renderSubjectList();
  document.getElementById('newSubName').value='';
  showToast('✅',`"${name}" fani qo'shildi!`,'success');
}
async function removeSubject(id,name) {
  const { error } = await supabaseClient.from('subjects').delete().eq('id', id);
  if (error) { showToast('❌','Xatolik','error'); return; }
  supabaseClient.rpc('admin_log_event', { p_action: 'delete_subject', p_target_info: { subject_id: id, name } });
  await refreshAllSubjects();
  renderSubjectList();
  showToast('🗑️',`"${name}" fani o'chirildi.`,'info');
}
function renderSubjectList() {
  const clsName=document.getElementById('manageClassSub')?.value||document.getElementById('manageClass')?.value;
  const cls = classesCache.find(c=>c.name===clsName);
  const subs = cls ? subjectsForClass(cls.id) : [];
  const el=document.getElementById('subjectList'); if (!el) return;
  document.getElementById('subjectCount').innerText=subs.length;
  const term=(document.getElementById('subjectSearchInput')?.value||'').trim().toLowerCase();
  const list = term ? subs.filter(s=>s.name.toLowerCase().includes(term)) : subs;
  el.innerHTML=list.length===0
    ?`<div class="empty-state">${term?'Qidiruv bo\'yicha fan topilmadi.':(cls?'Fanlar yo\'q.':'Sinfni tanlang.')}</div>`
    :list.map(s=>`<div class="list-item"><div class="li-icon">📖</div><span class="li-text">${esc(s.name)}</span><button class="li-del" onclick="removeSubject('${s.id}','${s.name.replace(/'/g,"\\'")}')">🗑️</button></div>`).join('');
}

/* ═══════════════════════════════════════════════
   QUESTION MANAGEMENT — admin va o'qituvchi bir xil mantiqni ishlatadi
   (DOM id prefiksi va fan-filtri orqali cheklangan), Sheets'siz.
   Format (ommaviy qo'shish): Savol | A | B | C | D | to'g'ri(a/b/c/d) | Izoh
═══════════════════════════════════════════════ */
const questionCtx = {
  admin: {
    ids: { class:'qClass', subject:'qSubject', listArea:'questionListArea', count:'questionCount',
           text:'newQText', a:'newQA', b:'newQB', c:'newQC', d:'newQD', correct:'newQCorrect', hint:'newQHint',
           saveBtn:'qSaveBtn', cancelBtn:'qCancelEditBtn', formTitle:'qFormTitle', search:'qSearchInput',
           bulkText:'bulkQText', bulkBtn:'bulkQBtn', bulkStatus:'bulkQStatusBox' },
    state: { items:[], editingId:null, visibleCount:50, saveBusy:false, bulkBusy:false },
    subjectFilter: (subs) => subs,
    editFnName:'editQuestion', removeFnName:'removeQuestion', showMoreFnName:'showMoreQuestions',
  },
  teacher: {
    ids: { class:'tQClass', subject:'tQSubject', listArea:'tQuestionListArea', count:'tQuestionCount',
           text:'tNewQText', a:'tNewQA', b:'tNewQB', c:'tNewQC', d:'tNewQD', correct:'tNewQCorrect', hint:'tNewQHint',
           saveBtn:'tQSaveBtn', cancelBtn:'tQCancelEditBtn', formTitle:'tQFormTitle', search:'tQSearchInput',
           bulkText:'tBulkQText', bulkBtn:'tBulkQBtn', bulkStatus:'tBulkQStatusBox' },
    state: { items:[], editingId:null, visibleCount:50, saveBusy:false, bulkBusy:false },
    subjectFilter: (subs) => subs.filter(s=>teacherSubjects.includes(s.name)),
    editFnName:'teacherEditQuestion', removeFnName:'teacherRemoveQuestion', showMoreFnName:'showMoreTeacherQuestions',
  },
};
function qOnClassChange(ctx) {
  const ids = ctx.ids;
  const clsName = document.getElementById(ids.class).value;
  const qs = document.getElementById(ids.subject);
  qs.innerHTML = '<option value="">— Avval sinfni tanlang —</option>';
  document.getElementById(ids.listArea).innerHTML = '';
  document.getElementById(ids.count).innerText = '0';
  qCancelEditQuestion(ctx);
  const cls = classesCache.find(c=>c.name===clsName);
  if (!cls) return;
  const opts = ctx.subjectFilter(subjectsForClass(cls.id));
  qs.innerHTML = '<option value="">— Fanni tanlang —</option>'+opts.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
}
async function qRenderQuestionList(ctx) {
  const ids = ctx.ids;
  const subjectId = document.getElementById(ids.subject)?.value;
  const area = document.getElementById(ids.listArea);
  qCancelEditQuestion(ctx);
  const searchEl = document.getElementById(ids.search); if (searchEl) searchEl.value='';
  if (!subjectId) { area.innerHTML=''; document.getElementById(ids.count).innerText='0'; ctx.state.items=[]; return; }
  const { data, error } = await supabaseClient.from('questions').select('*').eq('subject_id', subjectId).order('created_at');
  if (error) { area.innerHTML=`<div class="empty-state">Xatolik: ${esc(error.message)}</div>`; return; }
  ctx.state.items = data||[];
  qRenderFilteredQuestions(ctx);
}
function qRenderFilteredQuestions(ctx, resetPage=true) {
  if (resetPage) ctx.state.visibleCount = 50;
  const ids = ctx.ids;
  const area = document.getElementById(ids.listArea);
  const term = (document.getElementById(ids.search)?.value||'').trim().toLowerCase();
  document.getElementById(ids.count).innerText = ctx.state.items.length;
  const list = term ? ctx.state.items.filter(q=>q.question_text.toLowerCase().includes(term)) : ctx.state.items;
  if (list.length===0) { area.innerHTML = `<div class="empty-state">${term?'Qidiruv bo\'yicha savol topilmadi.':'Bu fan uchun savollar yo\'q.'}</div>`; return; }
  const visible = list.slice(0, ctx.state.visibleCount);
  area.innerHTML = visible.map(q=>`<div class="list-item ${ctx.state.editingId===q.id?'bookmarked-card':''}"><div class="li-icon">❓</div><span class="li-text">${esc(q.question_text)} <b style="color:var(--success)">[${q.correct_option.toUpperCase()}]</b></span><div style="display:flex;gap:4px"><button class="li-del" style="color:var(--primary)" onclick="${ctx.editFnName}('${q.id}')" title="Tahrirlash">✏️</button><button class="li-del" onclick="${ctx.removeFnName}('${q.id}')" title="O'chirish">🗑️</button></div></div>`).join('') + loadMoreDivHtml(list.length, ctx.state.visibleCount, ctx.showMoreFnName);
}
function qEditQuestion(ctx, id) {
  const q = ctx.state.items.find(x=>x.id===id);
  if (!q) return;
  ctx.state.editingId = id;
  document.getElementById(ctx.ids.text).value = q.question_text||'';
  document.getElementById(ctx.ids.a).value = q.option_a||'';
  document.getElementById(ctx.ids.b).value = q.option_b||'';
  document.getElementById(ctx.ids.c).value = q.option_c||'';
  document.getElementById(ctx.ids.d).value = q.option_d||'';
  document.getElementById(ctx.ids.correct).value = q.correct_option||'a';
  document.getElementById(ctx.ids.hint).value = q.hint||'';
  qUpdateFormMode(ctx);
  document.getElementById(ctx.ids.text).scrollIntoView({behavior:'smooth',block:'center'});
  qRenderFilteredQuestions(ctx, false);
}
function qCancelEditQuestion(ctx) {
  if (!ctx.state.editingId) return;
  ctx.state.editingId = null;
  [ctx.ids.text,ctx.ids.a,ctx.ids.b,ctx.ids.c,ctx.ids.d,ctx.ids.hint].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  const correctEl=document.getElementById(ctx.ids.correct); if (correctEl) correctEl.value='a';
  qUpdateFormMode(ctx);
}
function qUpdateFormMode(ctx) {
  const btn=document.getElementById(ctx.ids.saveBtn), cancelBtn=document.getElementById(ctx.ids.cancelBtn), title=document.getElementById(ctx.ids.formTitle);
  if (ctx.state.editingId) {
    if (btn) btn.innerText='💾 Yangilash';
    if (cancelBtn) cancelBtn.style.display='';
    if (title) title.innerText='Savolni tahrirlash';
  } else {
    if (btn) btn.innerText="+ Savol qo'shish";
    if (cancelBtn) cancelBtn.style.display='none';
    if (title) title.innerText="Savol qo'shish";
  }
}
async function qSaveQuestion(ctx) {
  if (ctx.state.saveBusy) return;
  const subjectId=document.getElementById(ctx.ids.subject)?.value;
  const text=document.getElementById(ctx.ids.text).value.trim();
  const a=document.getElementById(ctx.ids.a).value.trim();
  const b=document.getElementById(ctx.ids.b).value.trim();
  const c=document.getElementById(ctx.ids.c).value.trim();
  const d=document.getElementById(ctx.ids.d).value.trim();
  const correct=document.getElementById(ctx.ids.correct).value;
  const hint=document.getElementById(ctx.ids.hint).value.trim();
  if (!subjectId) { showToast('⚠️','Avval sinf va fanni tanlang!','warning'); return; }
  if (!text||!a||!b) { showToast('⚠️','Savol matni va kamida A/B variantlarini kiriting!','warning'); return; }
  ctx.state.saveBusy = true;
  const btn=document.getElementById(ctx.ids.saveBtn); if (btn) btn.disabled=true;
  const payload = { subject_id: subjectId, question_text: text, option_a:a, option_b:b, option_c:c, option_d:d, correct_option: correct, hint };
  const wasEdit = !!ctx.state.editingId;
  const { error } = wasEdit
    ? await supabaseClient.from('questions').update(payload).eq('id', ctx.state.editingId)
    : await supabaseClient.from('questions').insert(payload);
  ctx.state.saveBusy = false; if (btn) btn.disabled=false;
  if (error) { showToast('❌','Saqlashda xatolik','error'); return; }
  ctx.state.editingId = null;
  [ctx.ids.text,ctx.ids.a,ctx.ids.b,ctx.ids.c,ctx.ids.d,ctx.ids.hint].forEach(id=>document.getElementById(id).value='');
  document.getElementById(ctx.ids.correct).value='a';
  qUpdateFormMode(ctx);
  await qRenderQuestionList(ctx);
  showToast('✅', wasEdit?'Savol yangilandi!':'Savol qo\'shildi!','success');
}
async function qRemoveQuestion(ctx, id) {
  const q = ctx.state.items.find(x=>x.id===id);
  const preview = q ? (q.question_text.length>50 ? q.question_text.slice(0,50)+'…' : q.question_text) : '';
  const ok = await askTypeConfirm('Savolni o\'chirish', `"${preview}" savoli butunlay o'chadi.`, 'OCHIRISH');
  if (!ok) return;
  const { error } = await supabaseClient.from('questions').delete().eq('id', id);
  if (error) { showToast('❌','Xatolik','error'); return; }
  if (ctx.state.editingId===id) qCancelEditQuestion(ctx);
  await qRenderQuestionList(ctx);
  showToast('🗑️','Savol o\'chirildi.','info');
}
async function qBulkAddQuestions(ctx) {
  if (ctx.state.bulkBusy) return;
  const subjectId=document.getElementById(ctx.ids.subject)?.value;
  const raw = document.getElementById(ctx.ids.bulkText).value;
  if (!subjectId) { showToast('⚠️','Avval sinf va fanni tanlang!','warning'); return; }
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  if (lines.length===0) { showToast('⚠️','Matn bo\'sh!','warning'); return; }

  const rows = [];
  const badLines = [];
  lines.forEach((line,idx)=>{
    const parts = line.split('|').map(p=>p.trim());
    if (parts.length<6) { badLines.push(idx+1); return; }
    const [q,a,b,c,d,cr,...hintParts] = parts;
    const correct = (cr||'').toLowerCase();
    if (!q||!a||!b||!['a','b','c','d'].includes(correct)) { badLines.push(idx+1); return; }
    rows.push({
      subject_id: subjectId, question_text:q, option_a:a, option_b:b, option_c:c||'', option_d:d||'',
      correct_option:correct, hint:hintParts.join('|').trim()
    });
  });

  const box=document.getElementById(ctx.ids.bulkStatus);
  if (rows.length===0) {
    if (box) { box.style.display='block'; box.innerHTML=`<div style="padding:13px;background:var(--danger-pale);border:1px solid rgba(220,38,38,0.2);border-radius:var(--r-sm);font-size:12px;color:#991b1b">❌ To'g'ri formatdagi qator topilmadi. Format: Savol | A | B | C | D | to'g'ri(a/b/c/d) | Izoh</div>`; }
    return;
  }

  ctx.state.bulkBusy = true;
  const btn=document.getElementById(ctx.ids.bulkBtn); if (btn) btn.disabled=true;
  const { error } = await supabaseClient.from('questions').insert(rows);
  ctx.state.bulkBusy = false; if (btn) btn.disabled=false;

  if (error) { showToast('❌','Saqlashda xatolik yuz berdi','error'); return; }
  document.getElementById(ctx.ids.bulkText).value='';
  if (box) {
    box.style.display='block';
    box.innerHTML=`<div style="padding:13px;background:var(--success-pale);border:1px solid rgba(5,150,105,0.2);border-radius:var(--r-sm);font-size:12px;color:#065f46">✅ <b>${rows.length}</b> ta savol qo'shildi${badLines.length?`, ${badLines.length} ta qator (${badLines.join(', ')}-qator) noto'g'ri formatda bo'lgani uchun o'tkazib yuborildi`:''}.</div>`;
  }
  await qRenderQuestionList(ctx);
  showToast('✅','Ommaviy qo\'shish tugadi!','success',`${rows.length} ta savol qo'shildi`);
}

// Ingichka global qobiqlar — HTML onclick="..." atributlari ularni nomi bo'yicha chaqiradi
function onQClassChange() { qOnClassChange(questionCtx.admin); }
function teacherOnQClassChange() { qOnClassChange(questionCtx.teacher); }
async function renderQuestionList() { await qRenderQuestionList(questionCtx.admin); }
async function teacherRenderQuestionList() { await qRenderQuestionList(questionCtx.teacher); }
function renderFilteredQuestions(resetPage=true) { qRenderFilteredQuestions(questionCtx.admin, resetPage); }
function teacherRenderFilteredQuestions(resetPage=true) { qRenderFilteredQuestions(questionCtx.teacher, resetPage); }
function showMoreQuestions() { questionCtx.admin.state.visibleCount += 50; qRenderFilteredQuestions(questionCtx.admin, false); }
function showMoreTeacherQuestions() { questionCtx.teacher.state.visibleCount += 50; qRenderFilteredQuestions(questionCtx.teacher, false); }
function editQuestion(id) { qEditQuestion(questionCtx.admin, id); }
function teacherEditQuestion(id) { qEditQuestion(questionCtx.teacher, id); }
function cancelEditQuestion() { qCancelEditQuestion(questionCtx.admin); }
function teacherCancelEditQuestion() { qCancelEditQuestion(questionCtx.teacher); }
function updateQuestionFormMode() { qUpdateFormMode(questionCtx.admin); }
function teacherUpdateQuestionFormMode() { qUpdateFormMode(questionCtx.teacher); }
async function saveQuestion() { await qSaveQuestion(questionCtx.admin); }
async function teacherSaveQuestion() { await qSaveQuestion(questionCtx.teacher); }
async function removeQuestion(id) { await qRemoveQuestion(questionCtx.admin, id); }
async function teacherRemoveQuestion(id) { await qRemoveQuestion(questionCtx.teacher, id); }
async function bulkAddQuestions() { await qBulkAddQuestions(questionCtx.admin); }
async function teacherBulkAddQuestions() { await qBulkAddQuestions(questionCtx.teacher); }

/* ═══════════════════════════════════════════════
   RESULTS TABLE (teacher) — RLS orqali faqat o'z faniga cheklangan
═══════════════════════════════════════════════ */
let teacherResultsVisibleCount = 50;
function teacherRenderResultsTable(resetPage=true) {
  if (resetPage) teacherResultsVisibleCount = 50;
  const fcls = document.getElementById('tFilterClass')?.value||'';
  const fsub = document.getElementById('tFilterSubject')?.value||'';
  let rows = teacherResults||[];
  if (fcls) rows = rows.filter(r=>r.class_name===fcls);
  if (fsub) rows = rows.filter(r=>r.subject_name===fsub);
  const tbody = document.getElementById('tResultsTableBody');
  if (!tbody) return;
  if (rows.length===0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text-dim)">Ma\'lumot yo\'q</td></tr>';
    return;
  }
  const visible = rows.slice(0, teacherResultsVisibleCount);
  tbody.innerHTML = visible.map((r,i)=>{
    const pct = r.percent||0;
    const cls = pct>=70?'high':pct>=50?'mid':'low';
    return `<tr>
      <td class="rank-cell">${i+1}</td>
      <td><b>${esc(r.student_name)}</b></td>
      <td>${esc(r.class_name)}</td>
      <td>${esc(r.subject_name)}</td>
      <td>${r.score}/${r.total}</td>
      <td><span class="score-chip ${cls}">${pct}%</span></td>
      <td style="font-size:11px;color:var(--text-dim)">${fmtDate(r.created_at)}</td>
      <td><button class="li-del" onclick="teacherDeleteResult('${r.id}')" title="O'chirish">🗑️</button></td>
    </tr>`;
  }).join('') + loadMoreRowHtml(rows.length, teacherResultsVisibleCount, 8, 'showMoreTeacherResults');
}
function showMoreTeacherResults() { teacherResultsVisibleCount += 50; teacherRenderResultsTable(false); }
async function teacherDeleteResult(id) {
  if (!confirm('Bu natijani o\'chirasizmi?')) return;
  const { error } = await supabaseClient.from('results').delete().eq('id', id);
  if (error) { showToast('❌','Xatolik (bu fan sizga tegishli emas bo\'lishi mumkin)','error'); return; }
  teacherResults = teacherResults.filter(r=>r.id!==id);
  teacherRenderResultsTable();
  showToast('🗑️','Natija o\'chirildi.','info');
}
function teacherFilteredResults() {
  const fcls = document.getElementById('tFilterClass')?.value||'';
  const fsub = document.getElementById('tFilterSubject')?.value||'';
  let rows = teacherResults||[];
  if (fcls) rows = rows.filter(r=>r.class_name===fcls);
  if (fsub) rows = rows.filter(r=>r.subject_name===fsub);
  return rows;
}
function teacherExportToExcel() {
  if (typeof XLSX==='undefined') { showToast('❌','XLSX kutubxonasi yuklanmadi','error'); return; }
  const rows = teacherFilteredResults();
  if (rows.length===0) { showToast('⚠️','Chiqarish uchun ma\'lumot yo\'q','warning'); return; }
  const wsData = [
    ['#','Ism','Sinf','Fan','To\'g\'ri','Jami','Foiz (%)','Sana'],
    ...rows.map((r,i)=>[i+1,r.student_name,r.class_name,r.subject_name,r.score,r.total,r.percent,fmtDate(r.created_at)])
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Natijalar');
  XLSX.writeFile(wb, `UstazPro_Natijalar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.xlsx`);
  showToast('📥','Excel fayl yuklab olindi!','success');
}
function teacherExportToPDF() {
  if (typeof window.jspdf==='undefined') { showToast('❌','jsPDF kutubxonasi yuklanmadi','error'); return; }
  const rows = teacherFilteredResults();
  if (rows.length===0) { showToast('⚠️','Chiqarish uchun ma\'lumot yo\'q','warning'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'landscape'});
  doc.setFontSize(14);
  doc.text('Ustoz Pro - Test Natijalari', 14, 16);
  doc.setFontSize(10);
  doc.text(`Sanasi: ${new Date().toLocaleDateString('uz-UZ')}`, 14, 23);
  doc.autoTable({
    startY:28,
    head:[['#','Ism','Sinf','Fan','To\'g\'ri','Jami','%','Sana']],
    body: rows.map((r,i)=>[i+1,r.student_name,r.class_name,r.subject_name,r.score,r.total,r.percent+'%',fmtDate(r.created_at)]),
    styles:{fontSize:8,cellPadding:3},
    headStyles:{fillColor:[79,70,229],textColor:255},
    alternateRowStyles:{fillColor:[238,242,255]}
  });
  doc.save(`UstazPro_Natijalar_${new Date().toLocaleDateString('uz-UZ').replace(/\//g,'-')}.pdf`);
  showToast('📄','PDF yuklab olindi!','success');
}

/* ═══════════════════════════════════════════════
   MANAGE TABS
═══════════════════════════════════════════════ */
function switchMTab(tab) {
  ['classes','students','subjects','questions','teachers','admins'].forEach(t=>{
    document.getElementById(`mtab-${t}`)?.classList.toggle('active',t===tab);
    document.getElementById(`mpanel-${t}`)?.classList.toggle('active',t===tab);
  });
  if (tab==='students') renderStudentList();
  if (tab==='subjects') renderSubjectList();
  if (tab==='teachers') { renderTeacherSubjectCheckboxes(); renderTeacherList(); }
  if (tab==='admins') { renderAdminAccList(); renderAuditLog(); }
}

/* ═══════════════════════════════════════════════
   DASHBOARD STATS
═══════════════════════════════════════════════ */
async function updateDashboardStats() {
  document.getElementById('statStudentsCount').innerText = allStudents.length;
  document.getElementById('statSubjectsCount').innerText = new Set(allSubjects.map(s=>s.name)).size;

  const { data } = await supabaseClient.rpc('get_public_stats');
  const stats = (data && data[0]) || { total_tests:0, avg_percent:0 };
  document.getElementById('statTotalTests').innerText = stats.total_tests;
  const tEl=document.getElementById('statAvgTrend');
  if (stats.total_tests>0) {
    document.getElementById('statAvgScore').innerText = stats.avg_percent+'%';
    if (stats.avg_percent>=70){tEl.className='stat-trend trend-up';tEl.innerText='↑ Yaxshi daraja';}
    else{tEl.className='stat-trend trend-down';tEl.innerText='↓ Yaxshilash kerak';}
  } else {
    document.getElementById('statAvgScore').innerText='0%';
    tEl.className='stat-trend'; tEl.innerText='— ma\'lumot yo\'q';
  }
}
function renderRecentResults() {
  const list=document.getElementById('recentResultsList');
  if (!adminLoggedIn) { list.innerHTML='<div class="empty-state">🔒 Natijalarni ko\'rish uchun admin sifatida kiring.</div>'; return; }
  if (!adminResults||adminResults.length===0){list.innerHTML='<div class="empty-state">📭 Hali test natijasi yo\'q.</div>';return;}
  const recent=adminResults.slice(0,5);
  list.innerHTML=recent.map(r=>{
    const key=r.percent>=90?'success':r.percent>=70?'primary':r.percent>=50?'warning':'danger';
    const emoji=r.percent>=90?'🥇':r.percent>=70?'🥈':r.percent>=50?'🥉':'📉';
    const grade=r.percent>=90?'A':r.percent>=70?'B':r.percent>=50?'C':'D';
    return `<div class="result-item"><div class="ri-icon" style="background:var(--${key}-pale)">${emoji}</div><div class="ri-info"><div class="ri-name">${esc(r.student_name)}</div><div class="ri-meta">${esc(r.class_name)} · ${esc(r.subject_name)} · ${fmtDate(r.created_at)}</div></div><div class="ri-score"><div class="ri-pct" style="color:var(--${key})">${r.percent}%</div><div class="ri-grade" style="color:var(--${key})">${grade} daraja</div></div></div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   START TEST — via the get-test Edge Function
   (correct answers are never sent to the client before submission)
═══════════════════════════════════════════════ */
async function startTest() {
  if (!studentLoggedIn || !studentInfo) { showToast('❌','Avval o\'quvchi sifatida kiring','error'); return; }
  const sub = document.getElementById('stuTestSubject').value;
  if (!sub) { showToast('⚠️','Fanni tanlang!','warning'); return; }

  const eff = studentEffectiveSettings || settings;
  const count = eff.allow_custom ? (parseInt(document.getElementById('stuCount').value)||15) : eff.question_count;
  const mins  = eff.allow_custom ? (parseInt(document.getElementById('stuTime').value)||20)  : eff.time_limit_minutes;

  let resp;
  try { resp = await callEdgeFunction('get-test', { subject_name:sub, count }); }
  catch(e) { showToast('❌','Server bilan bog\'lanishda xatolik','error'); return; }

  if (resp.error==='unauthorized'||resp.error==='not_a_student') { showToast('❌','Sessiya muddati tugagan, qayta kiring','error'); doLogout(); return; }
  if (resp.error==='attempt_limit_reached') { showToast('🚫','Urinishlar soni tugadi!','error',`${sub} fani uchun ${resp.max_attempts} ta urinish haddi`); return; }
  if (resp.error==='no_questions'||resp.error==='subject_not_found') { showToast('📚','Savollar topilmadi!','error',`${sub} uchun hali savol yo'q`); return; }
  if (resp.error) { showToast('❌','Xatolik yuz berdi','error'); return; }

  clearSession();
  testState.sessionId = resp.session_id;
  testState.questions = resp.questions.map(q=>({id:q.id, q:q.question_text, a:q.option_a, b:q.option_b, c:q.option_c, d:q.option_d, hint:q.hint}));
  testState.bookmarks = new Set();
  testState.cheats = 0;
  testState.startTime = new Date();
  testState.totalSecs = mins*60;
  testState.remainingSecs = mins*60;
  testState.studentName = resp.student.full_name;
  testState.className = resp.student.class_name;
  testState.subjectName = sub;
  testState.lastAnswers = {};
  testState.lastWrongReview = [];

  document.getElementById('timerStudentChip').innerText=`👤 ${testState.studentName}`;
  document.getElementById('timerSubChip').innerText=`📚 ${sub}`;

  renderQuestions();
  navigateTo('test');
  startTimer(mins*60);

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
  const sel=document.querySelector(`input[name="q${i}"]:checked`);
  if (sel) testState.lastAnswers[testState.questions[i].id]=sel.value;
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
   CONFIRM & FINISH — grading happens server-side (submit-result)
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

  testState.questions.forEach((q,i)=>{
    const sel=document.querySelector(`input[name="q${i}"]:checked`)?.value;
    if (sel) testState.lastAnswers[q.id]=sel; else delete testState.lastAnswers[q.id];
  });

  const elapsed=Math.round((new Date()-testState.startTime)/1000);
  let resp;
  try {
    resp = await callEdgeFunction('submit-result', {
      session_id: testState.sessionId,
      answers: testState.lastAnswers,
      cheat_count: testState.cheats,
      elapsed_seconds: elapsed
    });
  } catch(e) { showToast('❌','Natijani yuborishda xatolik','error'); return; }
  if (resp.error==='unauthorized'||resp.error==='not_a_student') { showToast('❌','Sessiya muddati tugagan, qayta kiring','error'); doLogout(); return; }
  if (resp.error==='session_expired') { showToast('⏰','Test vaqti tugagan, yangi test boshlang','error'); navigateTo('student'); return; }
  if (resp.error==='session_already_used'||resp.error==='invalid_session') { showToast('❌','Bu test allaqachon topshirilgan','error'); navigateTo('student'); return; }
  if (resp.error==='attempt_limit_reached') { showToast('🚫','Urinishlar soni tugadi!','error'); navigateTo('student'); return; }
  if (resp.error) { showToast('❌','Xatolik: '+resp.error,'error'); return; }

  testState.lastWrongReview = resp.wrong_review||[];
  buildResultScreen(resp.result);
  navigateTo('result');
  if(resp.result.percent>=70) launchConfetti(resp.result.percent);
}

/* ═══════════════════════════════════════════════
   BUILD RESULT SCREEN
═══════════════════════════════════════════════ */
function buildResultScreen(result){
  const {student_name:name, class_name:cls, subject_name:sub, score, total, percent, cheat_count:cheat, elapsed_seconds:elapsedSec}=result;
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

  const elMin=Math.floor((elapsedSec||0)/60),elSec=(elapsedSec||0)%60;
  document.getElementById('resMetaTags').innerHTML=`<span class="meta-pill">🏫 ${esc(cls)}</span><span class="meta-pill">📚 ${esc(sub)}</span><span class="meta-pill">⏱ ${elMin}m ${elSec}s</span><span class="meta-pill">📅 ${new Date().toLocaleDateString('uz-UZ')}</span>`;
  document.getElementById('resScore').innerText=`${score}/${total}`;
  document.getElementById('resPercent').innerText=`${percent}%`;
  document.getElementById('resCheat').innerText=cheat;
  document.getElementById('resMsgText').innerText=msg;

  const wrongs=testState.lastWrongReview;
  document.getElementById('reviewBadge').innerText=`${wrongs.length} ta xato`;
  document.getElementById('reviewList').innerHTML= wrongs.length===0
    ?`<div style="text-align:center;padding:22px;color:var(--success);font-weight:700">🎉 Barcha savollar to'g'ri javoblandi!</div>`
    :wrongs.map((r,i)=>`
      <div class="review-item review-wrong" style="animation-delay:${i*0.02}s">
        <p class="review-q"><b>${i+1}.</b> ${esc(r.question_text)}</p>
        <div class="review-answer-row"><span class="review-dot dot-wrong"></span><span class="ans-lbl">Sizning javobingiz:&nbsp;</span><span class="ans-wrong">${esc(r.selected_text)}</span></div>
      </div>`).join('');

  document.getElementById('correctAnswersSection')?.classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   ANSWER REVEAL — password-gated via reveal-answers Edge Function.
   Correct answers are fetched only at this point, never earlier.
═══════════════════════════════════════════════ */
function showAnswerLockModal(){
  const overlay=document.getElementById('answerLockOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('answerPasswordInput').value='';
  document.getElementById('answerPasswordInput').classList.remove('error');
  setTimeout(()=>document.getElementById('answerPasswordInput').focus(),100);
}
function closeAnswerLockModal(){document.getElementById('answerLockOverlay').classList.add('hidden');}
async function checkAnswerPassword(){
  const inp=document.getElementById('answerPasswordInput');
  let resp;
  try { resp = await callEdgeFunction('reveal-answers', { session_id: testState.sessionId, password: inp.value }); }
  catch(e) { showToast('❌','Xatolik','error'); return; }
  if (resp.error==='wrong_password') {
    inp.classList.add('error'); setTimeout(()=>inp.classList.remove('error'),600);
    showToast('❌','Parol noto\'g\'ri!','error');
    return;
  }
  if (resp.error) { showToast('❌','Xatolik','error'); return; }
  closeAnswerLockModal();
  showCorrectAnswers(resp.answers);
}
function showCorrectAnswers(answersArr){
  const section=document.getElementById('correctAnswersSection');
  const list=document.getElementById('correctAnswersList');
  section.classList.remove('hidden');

  const correctMap={}; (answersArr||[]).forEach(a=>correctMap[a.id]=a.correct_option);
  list.innerHTML=testState.questions.map((q,i)=>{
    const correctLetter=correctMap[q.id];
    const correctText=q[correctLetter];
    const selLetter=testState.lastAnswers[q.id];
    const isRight=selLetter===correctLetter;
    return `<div class="review-item ${isRight?'review-correct':'review-wrong'}" style="animation-delay:${i*0.02}s">
      <p class="review-q"><b>${i+1}.</b> ${esc(q.q)}</p>
      <div class="review-answer-row">
        <span class="review-dot dot-correct"></span>
        <span class="ans-lbl">To'g'ri javob:&nbsp;</span>
        <span class="ans-right">${esc(correctText)} ${correctLetter?'('+correctLetter.toUpperCase()+')':''}</span>
      </div>
      ${!isRight?`<div class="review-answer-row"><span class="review-dot dot-wrong"></span><span class="ans-lbl">Sizning javobingiz:&nbsp;</span><span class="ans-wrong">${esc(selLetter?q[selLetter]:'Belgilanmagan')}</span></div>`:''}
    </div>`;
  }).join('');

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
   STUDENT CABINET — haqiqiy Supabase Auth (login+parol) orqali kirish.
   Ma'lumotlar endi to'g'ridan-to'g'ri RLS orqali (get_my_rating RPC +
   results jadvalidan o'z qatorlari) olinadi, alohida Edge Function shart emas.
═══════════════════════════════════════════════ */
async function loadStudentPanel() {
  if (!studentLoggedIn || !studentInfo) return;
  const { data: history, error: hErr } = await supabaseClient
    .from('results')
    .select('id, subject_name, score, total, percent, cheat_count, elapsed_seconds, created_at')
    .eq('student_name', studentInfo.full_name)
    .eq('class_name', studentInfo.class_name)
    .order('created_at', { ascending: false });
  if (hErr) { showToast('❌','Ma\'lumotlarni yuklashda xatolik','error'); return; }

  const { data: ratingRows, error: rErr } = await supabaseClient.rpc('get_my_rating');
  const rating = (!rErr && ratingRows && ratingRows[0]) || null;

  renderStudentRatingCards(rating);
  renderStudentHistory(history||[]);
  renderStudentProgressCharts(history||[]);
}
function renderStudentRatingCards(rating) {
  const el = document.getElementById('stuRatingCards');
  const cards = [];
  if (rating?.monthly_rank) {
    cards.push(`<div class="stat-card blue"><div class="stat-icon">🏆</div><div class="stat-num">#${rating.monthly_rank}</div><div class="stat-lbl">1200 ballik reyting (${rating.monthly_total} o'quvchidan)</div><div class="stat-trend trend-up">${rating.monthly_score} ball</div></div>`);
  }
  if (rating?.mutolaa_rank) {
    cards.push(`<div class="stat-card purple"><div class="stat-icon">📖</div><div class="stat-num">#${rating.mutolaa_rank}</div><div class="stat-lbl">Mutolaa reytingi (${rating.mutolaa_total} o'quvchidan)</div><div class="stat-trend trend-up">${rating.mutolaa_score} ball</div></div>`);
  }
  el.innerHTML = cards.length ? cards.join('') : '<div class="empty-state">Reytingga tushish uchun kamida bitta test topshiring.</div>';
}
function renderStudentHistory(history) {
  const body = document.getElementById('stuHistoryBody');
  body.innerHTML = history.length===0
    ? '<tr><td colspan="4" style="text-align:center;padding:22px;color:var(--text-dim)">Hali test topshirilmagan</td></tr>'
    : history.map(r=>{
        const cls = r.percent>=70?'high':r.percent>=50?'mid':'low';
        return `<tr><td>${esc(r.subject_name)}</td><td>${r.score}/${r.total}</td><td><span class="score-chip ${cls}">${r.percent}%</span></td><td style="font-size:11px;color:var(--text-dim)">${fmtDate(r.created_at)}</td></tr>`;
      }).join('');
}
function renderStudentProgressCharts(history) {
  const el = document.getElementById('stuProgressCharts');
  const bySubject = {};
  [...history].reverse().forEach(r=>{ (bySubject[r.subject_name] ||= []).push(r); });
  const subjects = Object.keys(bySubject).filter(s=>bySubject[s].length>=1);
  if (subjects.length===0) { el.innerHTML = '<div class="empty-state">Hali test natijasi yo\'q.</div>'; return; }

  el.innerHTML = subjects.map(sub=>{
    const points = bySubject[sub];
    const w=260, h=54, pad=6;
    const stepX = points.length>1 ? (w-2*pad)/(points.length-1) : 0;
    const coords = points.map((p,i)=>{
      const x = pad + i*stepX;
      const y = h - pad - ((p.percent||0)/100)*(h-2*pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = points[points.length-1];
    const lastColor = last.percent>=70?'#059669':last.percent>=50?'#d97706':'#dc2626';
    return `<div class="list-item" style="align-items:center">
      <div class="li-icon">📈</div>
      <span class="li-text"><b>${esc(sub)}</b> — ${points.length} ta test</span>
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="flex-shrink:0">
        ${points.length>1?`<polyline points="${coords}" fill="none" stroke="${lastColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`:''}
        ${points.map((p,i)=>`<circle cx="${(pad+i*stepX).toFixed(1)}" cy="${(h-pad-((p.percent||0)/100)*(h-2*pad)).toFixed(1)}" r="2.5" fill="${lastColor}"/>`).join('')}
      </svg>
      <span class="score-chip ${last.percent>=70?'high':last.percent>=50?'mid':'low'}" style="flex-shrink:0">${last.percent}%</span>
    </div>`;
  }).join('');
}
// Umumiy "parolni almashtirish" — admin/o'qituvchi/o'quvchi barchasi uchun bir xil,
// Supabase Auth'ning tayyor metodi orqali (maxsus RPC/Edge Function shart emas).
let passwordChangeBusy = false;
async function changeMyPassword() {
  if (passwordChangeBusy) return;
  const idPrefix = teacherLoggedIn ? 't' : 'stu';
  const p1 = document.getElementById(`${idPrefix}NewPassword`)?.value || '';
  const p2 = document.getElementById(`${idPrefix}NewPasswordConfirm`)?.value || '';
  if (p1.length < 6) { showToast('⚠️','Parol kamida 6 belgidan iborat bo\'lsin!','warning'); return; }
  if (p1 !== p2) { showToast('⚠️','Parollar mos kelmadi!','warning'); return; }

  passwordChangeBusy = true;
  const { error } = await supabaseClient.auth.updateUser({ password: p1 });
  passwordChangeBusy = false;
  if (error) { showToast('❌','Xatolik yuz berdi','error'); return; }

  document.getElementById(`${idPrefix}NewPassword`).value = '';
  document.getElementById(`${idPrefix}NewPasswordConfirm`).value = '';
  showToast('✅','Parol yangilandi!','success');

  if (mustChangePassword) {
    await supabaseClient.rpc('mark_password_changed');
    mustChangePassword = false;
    applyForcedPasswordGate();
  }
}
