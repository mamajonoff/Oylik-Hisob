// Firebase sozlamalari
const firebaseConfig = {
  apiKey: "AIzaSyCqEWxMnmpE9AQ3s1b1IxYbRDrzJN5Vi2A",
  authDomain: "oylik-hisob-9bbb7.firebaseapp.com",
  projectId: "oylik-hisob-9bbb7",
  storageBucket: "oylik-hisob-9bbb7.firebasestorage.app",
  messagingSenderId: "1044164936185",
  appId: "1:1044164936185:web:e1bf968eaae60099127d28",
  measurementId: "G-XS4SNG1C3W"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;
const mainDocRef = db.collection("appData").doc("mainData");

// Internet bo'lmaganda ham ishlash (offline kesh). Xatolik bo'lsa e'tiborsiz qoldiriladi.
try {
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
} catch (e) { /* eski brauzerlar */ }

// 🔒 O'chirish uchun parol.
// DIQQAT: bu faqat tasodifiy o'chirishdan himoya. Haqiqiy himoya uchun
// Firebase Authentication + Firestore Security Rules kerak (README ga qarang).
const DELETE_PASSWORD = "1234";

// Oylik maoshli xodim uchun oydagi ish kunlari soni
const MONTHLY_WORK_DAYS = 26;

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"
];

let employees = [];
let historyList = [];
let attendanceRecords = {};
// Ishbay xodimlar bajargan ishlar: { [id]: {id, empId, date, item, price, qty} }
let workRecords = {};
let workPriceManual = false;

let calCurrentDate = new Date();
let activeCalendarEmpId = null;

// ---------------------------------------------------------------------------
// Yordamchi funksiyalar
// ---------------------------------------------------------------------------

function toList(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (val && typeof val === "object") return Object.values(val).filter(Boolean);
  return [];
}

function toMap(val) {
  if (val && typeof val === "object" && !Array.isArray(val)) return val;
  return {};
}

// HTML ichiga xavfsiz qo'yish (XSS himoyasi): ism/izohdagi <, >, " belgilarini zararsizlantiradi
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(n) {
  return Math.round(Number(n) || 0).toLocaleString('ru-RU');
}

function getLocalDateStr(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "2026-11-25" -> "25.11.2026" (vaqt mintaqasidan qat'i nazar to'g'ri sana)
function formatDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}

function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function findEmp(id) {
  return employees.find(e => String(e.id) === String(id));
}

function showToast(message, type = 'success') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const map = {
    loading: { text: 'Yuklanmoqda…', cls: 'loading' },
    online: { text: 'Saqlangan', cls: 'online' },
    pending: { text: 'Saqlanmoqda…', cls: 'loading' },
    error: { text: 'Aloqa xatosi', cls: 'error' }
  };
  const s = map[state] || map.online;
  el.textContent = s.text;
  el.className = `sync-status ${s.cls}`;
}

// ---------------------------------------------------------------------------
// Boshlang'ich sozlash
// ---------------------------------------------------------------------------

function initDateInputs() {
  const today = getLocalDateStr();
  ['attendance-date', 'money-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDateInputs);
} else {
  initDateInputs();
}

setSyncStatus('loading');

// Real vaqtda Firebase'dan ma'lumotlarni olish
mainDocRef.onSnapshot({ includeMetadataChanges: true }, (doc) => {
  if (doc.exists) {
    const data = doc.data() || {};
    employees = toList(data.employees);
    historyList = toList(data.historyList);
    attendanceRecords = toMap(data.attendanceRecords);
    workRecords = toMap(data.workRecords);
  }
  setSyncStatus(doc.metadata && doc.metadata.hasPendingWrites ? 'pending' : 'online');
  renderAll();
}, (error) => {
  console.error("Firebase o'qishda xatolik:", error);
  setSyncStatus('error');
  renderAll();
});

// Xodimlar va tarixni saqlaydi. Davomat alohida (faqat o'zgargan katakcha) saqlanadi,
// shuning uchun ikki qurilmadan bir vaqtda davomat belgilansa bir-birini o'chirmaydi.
function saveDataToFirebase() {
  return mainDocRef.set({
    employees: employees,
    historyList: historyList
  }, { merge: true }).catch((error) => {
    console.error("Saqlashda xatolik:", error);
    setSyncStatus('error');
    showToast("Saqlashda xatolik yuz berdi!", 'error');
  });
}

function saveAttendanceCells(cells) {
  // cells: [{ date, empId, value }] ; value === null -> o'chirish
  const patch = {};
  cells.forEach(({ date, empId, value }) => {
    if (!patch[date]) patch[date] = {};
    patch[date][String(empId)] = value === null ? FieldValue.delete() : value;
  });
  return mainDocRef.set({ attendanceRecords: patch }, { merge: true }).catch((error) => {
    console.error("Davomatni saqlashda xatolik:", error);
    setSyncStatus('error');
    showToast("Davomatni saqlashda xatolik!", 'error');
  });
}

// Ishbay xodim ishlari ham alohida (bitta yozuv bilan) saqlanadi
function saveWorkRecord(rec) {
  return mainDocRef.set({ workRecords: { [String(rec.id)]: rec } }, { merge: true }).catch((error) => {
    console.error("Ishni saqlashda xatolik:", error);
    setSyncStatus('error');
    showToast("Ishni saqlashda xatolik!", 'error');
  });
}

function removeWorkRecord(id) {
  return mainDocRef.set({ workRecords: { [String(id)]: FieldValue.delete() } }, { merge: true }).catch((error) => {
    console.error("Ishni o'chirishda xatolik:", error);
    setSyncStatus('error');
    showToast("O'chirishda xatolik!", 'error');
  });
}

function verifyPassword() {
  const enteredPassword = prompt("⚠️ O'chirish uchun parolni kiriting:");
  if (enteredPassword === null) return false;
  if (enteredPassword === DELETE_PASSWORD) return true;
  alert("❌ Parol noto'g'ri! O'chirish bekor qilindi.");
  return false;
}

// ---------------------------------------------------------------------------
// Tablar
// ---------------------------------------------------------------------------

function switchTab(tabId, btnElement) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const pane = document.getElementById(`tab-${tabId}`);
  if (pane) pane.classList.add('active');
  const btn = btnElement || document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');

  const titles = {
    'employees': '<i class="fa-solid fa-users"></i> Xodimlar',
    'attendance': '<i class="fa-solid fa-calendar-check"></i> Keldi-ketdi',
    'money': '<i class="fa-solid fa-hand-holding-dollar"></i> Pul berish',
    'history': '<i class="fa-solid fa-clock-rotate-left"></i> Tarix'
  };
  const headerTitle = document.getElementById('header-title');
  if (headerTitle && titles[tabId]) headerTitle.innerHTML = titles[tabId];

  if (tabId === 'money') {
    populateMoneySelect();
  } else if (tabId === 'attendance') {
    renderAttendance();
  } else if (tabId === 'history') {
    renderHistory();
  }
}

// ---------------------------------------------------------------------------
// Xodimlar
// ---------------------------------------------------------------------------

function openEmpModal(id = null) {
  document.getElementById('emp-modal').classList.add('active');
  if (id !== null && id !== undefined && id !== '') {
    document.getElementById('emp-modal-title').innerText = "Xodimni Tahrirlash";
    const emp = findEmp(id);
    if (emp) {
      document.getElementById('edit-emp-id').value = emp.id;
      document.getElementById('emp-name').value = emp.name || '';
      document.getElementById('emp-type').value = emp.type || 'daily';
      document.getElementById('emp-rate').value = emp.rate || 0;
    }
  } else {
    document.getElementById('emp-modal-title').innerText = "Yangi Xodim Qo'shish";
    document.getElementById('emp-form').reset();
    document.getElementById('edit-emp-id').value = '';
  }
  toggleEmpRate();
}

// Ishbay xodim uchun doimiy summa kerak emas (narx har bir ish uchun alohida kiritiladi)
function toggleEmpRate() {
  const isPiece = document.getElementById('emp-type').value === 'piece';
  document.getElementById('emp-rate-group').style.display = isPiece ? 'none' : 'block';
  document.getElementById('emp-rate').required = !isPiece;
}

function typeLabel(emp) {
  if (emp.type === 'piece') return 'Ishbay';
  return emp.type === 'monthly' ? 'Oylik' : 'Kunlik';
}

function closeEmpModal() {
  document.getElementById('emp-modal').classList.remove('active');
}

function saveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('edit-emp-id').value;
  const name = document.getElementById('emp-name').value.trim();
  const type = document.getElementById('emp-type').value;
  const rate = type === 'piece' ? 0 : (parseFloat(document.getElementById('emp-rate').value) || 0);

  if (!name) return alert("Ismni kiriting!");
  if (type !== 'piece' && rate <= 0) return alert("Summa 0 dan katta bo'lishi kerak!");

  if (id) {
    const emp = findEmp(id);
    if (emp) {
      emp.name = name;
      emp.type = type;
      emp.rate = rate;
    }
  } else {
    const duplicate = employees.some(x => String(x.name || '').trim().toLowerCase() === name.toLowerCase());
    if (duplicate && !confirm(`"${name}" ismli xodim allaqachon bor. Baribir qo'shilsinmi?`)) return;
    employees.push({
      id: newId(),
      name,
      type,
      rate,
      takenMoney: 0,
      lastSalaryDateStr: "",
      closedDates: []
    });
  }
  closeEmpModal();
  renderAll();
  saveDataToFirebase();
  showToast(id ? "Xodim yangilandi" : "Xodim qo'shildi");
}

function deleteEmployee(id) {
  const emp = findEmp(id);
  if (!emp) return;
  if (!verifyPassword()) return;

  const taken = Number(emp.takenMoney) || 0;
  const warn = taken > 0 ? `\nDiqqat: unda ${formatMoney(taken)} so'm qaytarilmagan avans bor!` : '';
  if (confirm(`"${emp.name}" xodimini o'chirmoqchimisiz?${warn}`)) {
    employees = employees.filter(e => String(e.id) !== String(id));
    renderAll();
    saveDataToFirebase();
    showToast("Xodim o'chirildi");
  }
}

// ---------------------------------------------------------------------------
// Hisob-kitob (bitta joyda — ko'rsatish va saqlash bir xil natija beradi)
// ---------------------------------------------------------------------------

function calculateDaysWorked(empId, customEndDate = null) {
  let totalDays = 0;
  const emp = findEmp(empId);
  const lastDateStr = (emp && typeof emp.lastSalaryDateStr === 'string') ? emp.lastSalaryDateStr : "";
  const endDateStr = customEndDate || getLocalDateStr();
  const key = String(empId);

  for (const dateStr in attendanceRecords) {
    const afterLastClosed = !lastDateStr || dateStr > lastDateStr;
    const withinEndDate = !endDateStr || dateStr <= endDateStr;
    if (!afterLastClosed || !withinEndDate) continue;

    const dayMap = attendanceRecords[dateStr];
    if (dayMap && dayMap[key] !== undefined && dayMap[key] !== null) {
      const val = Number(dayMap[key]);
      if (!Number.isNaN(val)) totalDays += val;
    }
  }
  return totalDays;
}


function getWorkList() {
  return Object.values(workRecords).filter(w => w && w.empId !== undefined && w.date);
}

function computeSalary(emp, endDate) {
  const taken = Number(emp.takenMoney) || 0;
  const rate = Number(emp.rate) || 0;
  let daysWorked, gross, dailyRate = 0, missingDays = 0;
  let pieces = 0;
  const itemLines = [];

  if (emp.type === 'piece') {
    // Ishbay: oxirgi yopilgan sanadan keyingi va tanlangan sanagacha bajarilgan ishlar yig'indisi
    const lastDateStr = emp.lastSalaryDateStr || '';
    const endDateStr = endDate || getLocalDateStr();
    const days = new Set();
    const groups = {};
    gross = 0;
    getWorkList().forEach(w => {
      if (String(w.empId) !== String(emp.id)) return;
      if (lastDateStr && w.date <= lastDateStr) return;
      if (w.date > endDateStr) return;
      const q = Number(w.qty) || 0;
      const pr = Number(w.price) || 0;
      gross += q * pr;
      pieces += q;
      days.add(w.date);
      const name = String(w.item || '').trim() || 'Ish';
      const k = `${name}|${pr}`;
      if (!groups[k]) groups[k] = { name, price: pr, qty: 0, sum: 0 };
      groups[k].qty += q;
      groups[k].sum += q * pr;
    });
    Object.values(groups).forEach(g => itemLines.push(g));
    daysWorked = days.size;
  } else {
    daysWorked = calculateDaysWorked(emp.id, endDate);
    if (emp.type === 'daily') {
      dailyRate = rate;
      gross = daysWorked * rate;
    } else {
      dailyRate = rate / MONTHLY_WORK_DAYS;
      missingDays = Math.max(0, MONTHLY_WORK_DAYS - daysWorked);
      gross = Math.max(0, rate - missingDays * dailyRate);
    }
  }

  const net = gross - taken;
  return {
    isPiece: emp.type === 'piece',
    pieces,
    itemLines,
    daysWorked,
    rate,
    dailyRate,
    missingDays,
    taken,
    gross: Math.round(gross),
    payout: Math.max(0, Math.round(net)),
    // Avans ishlab topilgandan ko'p bo'lsa, farq yo'qolmaydi — keyingi davrga qarz bo'lib o'tadi
    carryDebt: Math.max(0, Math.round(-net))
  };
}

// ---------------------------------------------------------------------------
// Ishbay xodim: bajarilgan ishlarni kiritish
// ---------------------------------------------------------------------------

// Oldin kiritilgan ish nomlari va oxirgi narxlari (tezroq kiritish uchun)
function workItemSuggestions(empId) {
  const list = getWorkList().sort((a, b) => (a.date === b.date ? Number(a.id) - Number(b.id) : (a.date < b.date ? -1 : 1)));
  const map = {};
  list.forEach(w => { map[String(w.item).trim().toLowerCase()] = { name: String(w.item).trim(), price: w.price }; });
  // shu xodimning o'z narxlari ustunroq
  list.filter(w => String(w.empId) === String(empId)).forEach(w => {
    map[String(w.item).trim().toLowerCase()] = { name: String(w.item).trim(), price: w.price };
  });
  return map;
}

function openWorkModal(empId, dateStr) {
  const emp = findEmp(empId);
  if (!emp) return;
  document.getElementById('work-emp-id').value = emp.id;
  document.getElementById('work-modal-title').innerText = `${emp.name} — ish qo'shish`;
  document.getElementById('work-date').value = dateStr || getLocalDateStr();
  document.getElementById('work-item').value = '';
  document.getElementById('work-price').value = '';
  document.getElementById('work-qty').value = '1';
  workPriceManual = false;

  const sugg = workItemSuggestions(emp.id);
  document.getElementById('work-item-list').innerHTML = Object.values(sugg)
    .map(x => `<option value="${escapeHtml(x.name)}">${formatMoney(x.price)} so'm</option>`).join('');

  updateWorkTotal();
  document.getElementById('work-modal').classList.add('active');
}

function closeWorkModal() {
  document.getElementById('work-modal').classList.remove('active');
}

function onWorkItemInput() {
  const empId = document.getElementById('work-emp-id').value;
  const name = document.getElementById('work-item').value.trim().toLowerCase();
  const match = workItemSuggestions(empId)[name];
  const priceEl = document.getElementById('work-price');
  if (match && (!priceEl.value || !workPriceManual)) {
    priceEl.value = match.price;
    workPriceManual = false;
  }
  updateWorkTotal();
}

function onWorkPriceInput() {
  workPriceManual = true;
  updateWorkTotal();
}

function updateWorkTotal() {
  const price = parseFloat(document.getElementById('work-price').value) || 0;
  const qty = parseFloat(document.getElementById('work-qty').value) || 0;
  document.getElementById('work-total').innerHTML = `Jami: <strong>${formatMoney(price * qty)} so'm</strong>`;
}

function saveWork(e) {
  e.preventDefault();
  const emp = findEmp(document.getElementById('work-emp-id').value);
  if (!emp) return;
  const date = document.getElementById('work-date').value;
  let item = document.getElementById('work-item').value.trim();
  const price = parseFloat(document.getElementById('work-price').value);
  const qty = parseFloat(document.getElementById('work-qty').value);

  if (!date) return alert("Sanani tanlang!");
  if (!item) return alert("Ish nomini kiriting!");
  if (!price || price <= 0) return alert("Narxni kiriting!");
  if (!qty || qty <= 0) return alert("Sonini kiriting!");
  if (emp.lastSalaryDateStr && date <= emp.lastSalaryDateStr) {
    return alert(`Bu xodimning oyligi ${formatDateStr(emp.lastSalaryDateStr)} sanagacha yopilgan. Undan keyingi sanani tanlang.`);
  }

  // "stol" va "Stol" bir xil ish bo'lishi uchun oldingi yozilishini ishlatamiz
  const known = workItemSuggestions(emp.id)[item.toLowerCase()];
  if (known) item = known.name;

  const rec = { id: newId(), empId: emp.id, date, item, price, qty };
  workRecords[String(rec.id)] = rec;
  closeWorkModal();
  renderAll();
  saveWorkRecord(rec);
  showToast(`Qo'shildi: ${item} × ${qty} = ${formatMoney(price * qty)} so'm`);
}

function deleteWork(id) {
  const rec = workRecords[String(id)];
  if (!rec) return;
  const emp = findEmp(rec.empId);
  if (emp && emp.lastSalaryDateStr && rec.date <= emp.lastSalaryDateStr) {
    return alert("Bu ish uchun oylik allaqachon yopilgan, o'chirib bo'lmaydi.");
  }
  if (!confirm(`"${rec.item}" (${rec.qty} dona) yozuvi o'chirilsinmi?`)) return;
  delete workRecords[String(id)];
  renderAll();
  removeWorkRecord(id);
  showToast("O'chirildi");
}

// ---------------------------------------------------------------------------
// Kalendar
// ---------------------------------------------------------------------------

function openEmployeeCalendar(empId) {
  activeCalendarEmpId = empId;
  calCurrentDate = new Date();
  calCurrentDate.setDate(1);
  renderCalendarModal();
  document.getElementById('calendar-modal').classList.add('active');
}

function closeCalendarModal() {
  document.getElementById('calendar-modal').classList.remove('active');
  activeCalendarEmpId = null;
}

function changeMonth(direction) {
  // 1-sanaga o'rnatamiz, aks holda 31-yanvar + 1 oy = 3-mart bo'lib qoladi
  calCurrentDate.setDate(1);
  calCurrentDate.setMonth(calCurrentDate.getMonth() + direction);
  renderCalendarModal();
}


function renderCalendarModal() {
  const emp = findEmp(activeCalendarEmpId);
  if (!emp) return;
  const key = String(emp.id);
  const isPiece = emp.type === 'piece';

  document.getElementById('cal-emp-title').innerText = `${emp.name} — ${isPiece ? 'Ishlari' : 'Davomati'}`;
  const legend = document.querySelector('#calendar-modal .calendar-legend');
  if (legend) legend.style.display = isPiece ? 'none' : '';

  // Ishbay uchun: sana -> shu kungi ishlar
  const pieceByDate = {};
  if (isPiece) {
    getWorkList().filter(w => String(w.empId) === key).forEach(w => {
      (pieceByDate[w.date] = pieceByDate[w.date] || []).push(w);
    });
  }

  const allEmpDates = isPiece
    ? Object.keys(pieceByDate).sort()
    : Object.keys(attendanceRecords)
        .filter(d => attendanceRecords[d] && attendanceRecords[d][key] !== undefined)
        .sort();
  const firstWorkDate = allEmpDates.length > 0 ? formatDateStr(allEmpDates[0]) : "Belgilanmagan";
  const lastClosedDate = emp.lastSalaryDateStr ? formatDateStr(emp.lastSalaryDateStr) : "Hali yopilmagan";
  const calc = computeSalary(emp, getLocalDateStr());

  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  const mm = String(month + 1).padStart(2, '0');

  // Shu oydagi statistika
  let monthLine;
  if (isPiece) {
    let cnt = 0, sum = 0;
    Object.keys(pieceByDate).forEach(d => {
      if (!d.startsWith(`${year}-${mm}-`)) return;
      pieceByDate[d].forEach(w => { cnt += Number(w.qty) || 0; sum += (Number(w.qty) || 0) * (Number(w.price) || 0); });
    });
    monthLine = `${cnt} dona, ${formatMoney(sum)} so'm`;
  } else {
    let mFull = 0, mHalf = 0, mAbsent = 0;
    Object.keys(attendanceRecords).forEach(d => {
      if (!d.startsWith(`${year}-${mm}-`)) return;
      const v = attendanceRecords[d] ? attendanceRecords[d][key] : undefined;
      if (v === 1) mFull++;
      else if (v === 0.5) mHalf++;
      else if (v === 0) mAbsent++;
    });
    monthLine = `${mFull} to'liq, ${mHalf} yarim, ${mAbsent} kelmagan`;
  }

  document.getElementById('cal-summary-info').innerHTML = `
    <div><strong>Ilk qayd etilgan sana:</strong> ${firstWorkDate}</div>
    <div><strong>Oxirgi oylik yopilgan sana:</strong> ${lastClosedDate}</div>
    <div><strong>${isPiece ? 'Joriy davr bajarilgan ish' : 'Joriy davr ishlagan kunlari'}:</strong> ${isPiece ? `${calc.pieces} dona (${calc.daysWorked} kun)` : `${calc.daysWorked} kun`}</div>
    <div><strong>Joriy davr hisoblangan:</strong> ${formatMoney(calc.gross)} so'm,
      avans: <span style="color:var(--danger)">${formatMoney(calc.taken)} so'm</span></div>
    <div><strong>${MONTH_NAMES[month]}:</strong> ${monthLine}</div>
    <div class="cal-summary-hint">
      ${isPiece ? "Kunni bosib ish qo'shing. " : ''}Yorqin kunlar — joriy davr; xira kunlar — yopilgan davr; <span class="cal-badge-demo">YOP</span> — yopilgan sana.
    </div>
  `;

  document.getElementById('cal-month-year-label').innerText = `${MONTH_NAMES[month]} ${year}`;

  const grid = document.getElementById('calendar-days-grid');
  grid.innerHTML = '';

  let firstDayIndex = new Date(year, month, 1).getDay();
  firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = getLocalDateStr();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day-cell empty';
    grid.appendChild(emptyCell);
  }

  const closedDatesArr = Array.isArray(emp.closedDates) ? emp.closedDates : [];

  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    cell.innerText = day;

    const dateStr = `${year}-${mm}-${String(day).padStart(2, '0')}`;

    if (isPiece) {
      const works = pieceByDate[dateStr];
      if (works && works.length) {
        const sum = works.reduce((t, w) => t + (Number(w.qty) || 0) * (Number(w.price) || 0), 0);
        cell.classList.add('status-green');
        cell.title = `${formatMoney(sum)} so'm: ` + works.map(w => `${w.item} × ${w.qty}`).join(', ');
      }
      cell.classList.add('clickable');
      cell.onclick = () => openWorkModal(emp.id, dateStr);
    } else {
      const status = (attendanceRecords[dateStr] || {})[key];
      if (status === 1) cell.classList.add('status-green');
      else if (status === 0.5) cell.classList.add('status-orange');
      else if (status === 0) cell.classList.add('status-red');
    }

    if (dateStr === todayStr) cell.classList.add('today');

    if (emp.lastSalaryDateStr && dateStr < emp.lastSalaryDateStr && !closedDatesArr.includes(dateStr)) {
      cell.classList.add('dimmed-past-day');
    } else if (dateStr === emp.lastSalaryDateStr || closedDatesArr.includes(dateStr)) {
      cell.classList.add('closed-cutoff-day');
      cell.title = `Oylik yopilgan sana: ${formatDateStr(dateStr)}`;
    } else {
      cell.classList.add('active-period-day');
    }

    grid.appendChild(cell);
  }
}

// ---------------------------------------------------------------------------
// Davomat
// ---------------------------------------------------------------------------

function fillEmployeeSelect(select, firstOptionHtml, labelFn) {
  if (!select) return;
  const currentVal = select.value;
  let html = firstOptionHtml;
  employees.forEach(emp => {
    html += `<option value="${escapeHtml(emp.id)}">${escapeHtml(labelFn ? labelFn(emp) : emp.name)}</option>`;
  });
  select.innerHTML = html;
  // Tanlangan xodim o'chirilgan bo'lsa, birinchi variantga qaytadi
  select.value = currentVal;
  if (select.value !== currentVal) select.selectedIndex = 0;
}

function populateAttendanceFilter() {
  fillEmployeeSelect(document.getElementById('attendance-filter-emp'),
    '<option value="all">Barcha xodimlar</option>');
}

function populateHistoryFilter() {
  fillEmployeeSelect(document.getElementById('history-filter-emp'),
    '<option value="all">Barcha xodimlar tarixi</option>');
}

function getSelectedAttendanceDate() {
  const dateEl = document.getElementById('attendance-date');
  return (dateEl && dateEl.value) ? dateEl.value : getLocalDateStr();
}

function shiftAttendanceDate(deltaDays) {
  const dateEl = document.getElementById('attendance-date');
  const [y, m, d] = getSelectedAttendanceDate().split('-').map(Number);
  dateEl.value = getLocalDateStr(new Date(y, m - 1, d + deltaDays));
  renderAttendance();
}

function setAttendanceStatus(empId, status) {
  const selectedDate = getSelectedAttendanceDate();
  const key = String(empId);
  const emp = findEmp(empId);

  if (emp && emp.lastSalaryDateStr && selectedDate <= emp.lastSalaryDateStr) {
    if (!confirm(`Bu sana (${formatDateStr(selectedDate)}) uchun oylik allaqachon yopilgan. Baribir o'zgartirilsinmi?\n(Yopilgan oylik summasi o'zgarmaydi)`)) return;
  }

  if (!attendanceRecords[selectedDate]) attendanceRecords[selectedDate] = {};
  const dayMap = attendanceRecords[selectedDate];
  let newValue;
  if (dayMap[key] === status) {
    delete dayMap[key];
    newValue = null;
  } else {
    dayMap[key] = status;
    newValue = status;
  }

  renderAttendance();
  renderEmployees();
  saveAttendanceCells([{ date: selectedDate, empId: key, value: newValue }]);
}

// Belgilanmagan barcha (filtrdagi) xodimlarni "To'liq keldi" qilib belgilash
function markAllPresent() {
  const selectedDate = getSelectedAttendanceDate();
  const filterEl = document.getElementById('attendance-filter-emp');
  const filterEmpId = filterEl ? filterEl.value : 'all';
  const targetEmps = (filterEmpId === 'all' ? employees : employees.filter(e => String(e.id) === String(filterEmpId)))
    .filter(e => e.type !== 'piece');

  if (!attendanceRecords[selectedDate]) attendanceRecords[selectedDate] = {};
  const dayMap = attendanceRecords[selectedDate];
  const cells = [];
  targetEmps.forEach(emp => {
    const key = String(emp.id);
    if (dayMap[key] === undefined) {
      dayMap[key] = 1;
      cells.push({ date: selectedDate, empId: key, value: 1 });
    }
  });

  if (cells.length === 0) return showToast("Hamma xodim allaqachon belgilangan", 'info');
  renderAttendance();
  renderEmployees();
  saveAttendanceCells(cells);
  showToast(`${cells.length} ta xodim "keldi" deb belgilandi`);
}

// ---------------------------------------------------------------------------
// Pul berish
// ---------------------------------------------------------------------------

function populateMoneySelect() {
  fillEmployeeSelect(document.getElementById('money-emp-id'),
    '<option value="">-- Xodimni tanlang --</option>',
    emp => `${emp.name} (${typeLabel(emp)})`);
  toggleMoneyInputs();
}

function toggleMoneyInputs() {
  const typeEl = document.getElementById('money-type');
  if (!typeEl) return;
  const type = typeEl.value;
  const advanceGroup = document.getElementById('advance-input-group');
  const preview = document.getElementById('salary-calc-preview');
  const advLabel = advanceGroup.querySelector('label');
  const advInput = document.getElementById('adv-amount');

  if (type === 'advance' || type === 'return') {
    advanceGroup.style.display = 'block';
    advInput.required = true;
    advLabel.textContent = type === 'advance' ? "Avans summasi (so'm)" : "Qaytariladigan summa (so'm)";
    advInput.placeholder = type === 'advance' ? "Masalan: 50000" : "Masalan: 100000";
  } else {
    advanceGroup.style.display = 'none';
    advInput.required = false;
  }
  updateMoneyCalcPreview();
}

function updateMoneyCalcPreview() {
  const empId = document.getElementById('money-emp-id').value;
  const type = document.getElementById('money-type').value;
  const moneyDate = document.getElementById('money-date').value;
  const preview = document.getElementById('salary-calc-preview');
  const emp = empId ? findEmp(empId) : null;

  if (!emp) {
    preview.style.display = 'none';
    return;
  }

  if (type !== 'salary') {
    // Avans / qaytarishda ham joriy holatni ko'rsatamiz
    const c = computeSalary(emp, moneyDate);
    preview.style.display = 'block';
    preview.innerHTML = `
      <p>Joriy davr: <strong>${c.isPiece ? `${c.pieces} dona` : `${c.daysWorked} kun`}</strong>, hisoblangan: <strong>${formatMoney(c.gross)} so'm</strong></p>
      <p>Hozirgacha olingan avans: <strong style="color:var(--danger);">${formatMoney(c.taken)} so'm</strong></p>
    `;
    return;
  }

  const c = computeSalary(emp, moneyDate);
  let detailsText;
  if (c.isPiece) {
    const lines = c.itemLines.map(g => `${escapeHtml(g.name)}: ${g.qty} × ${formatMoney(g.price)} = <strong>${formatMoney(g.sum)}</strong>`);
    detailsText = `Bajarilgan ishlar (${c.pieces} dona, ${c.daysWorked} kun):<br>
                   ${lines.join('<br>') || "Ish kiritilmagan"}<br>
                   Hisoblangan: ${formatMoney(c.gross)} so'm<br>
                   Oldindan olingan summa (Avans): <strong style="color:var(--danger);">${formatMoney(c.taken)} so'm</strong>`;
  } else if (emp.type === 'daily') {
    detailsText = `Tanlangan sanagacha ishlagan kunlari: <strong>${c.daysWorked} kun</strong><br>
                   Hisoblangan: ${formatMoney(c.gross)} so'm (${c.daysWorked} × ${formatMoney(c.rate)})<br>
                   Oldindan olingan summa (Avans): <strong style="color:var(--danger);">${formatMoney(c.taken)} so'm</strong>`;
  } else {
    detailsText = `Oylik stavka: ${formatMoney(c.rate)} so'm<br>
                   1 kunlik qiymat: ${formatMoney(c.dailyRate)} so'm (${MONTHLY_WORK_DAYS} ga bo'lingan)<br>
                   Ishlagan kunlari: ${c.daysWorked} | Kelmagan: ${c.missingDays} kun (${formatMoney(c.missingDays * c.dailyRate)} so'm chegirildi)<br>
                   Hisoblangan: ${formatMoney(c.gross)} so'm<br>
                   Oldindan olingan summa (Avans): <strong style="color:var(--danger);">${formatMoney(c.taken)} so'm</strong>`;
  }

  const debtLine = c.carryDebt > 0
    ? `<p class="calc-debt"><i class="fa-solid fa-triangle-exclamation"></i> Avans ishlab topilgandan ko'p: <strong>${formatMoney(c.carryDebt)} so'm</strong> qarz keyingi davrga o'tadi.</p>`
    : '';

  preview.style.display = 'block';
  preview.innerHTML = `
    <p><strong>Hisob-kitob tafsiloti:</strong></p>
    <p>${detailsText}</p>
    <hr class="calc-hr">
    <p class="calc-total"><strong>To'lanadigan yakuniy summa: ${formatMoney(c.payout)} so'm</strong></p>
    ${debtLine}
  `;
}

function handleMoneySubmit(e) {
  e.preventDefault();
  const empId = document.getElementById('money-emp-id').value;
  const type = document.getElementById('money-type').value;
  const moneyDate = document.getElementById('money-date').value || getLocalDateStr();
  const note = document.getElementById('money-note').value.trim();

  const emp = findEmp(empId);
  if (!emp) return alert("Xodimni tanlang!");

  let amount = 0;
  let historyTitle = '';
  let autoNote = '';
  const prevLastSalaryDateStr = emp.lastSalaryDateStr || "";
  const prevTakenMoney = Number(emp.takenMoney) || 0;

  if (type === 'advance') {
    amount = parseFloat(document.getElementById('adv-amount').value);
    if (!amount || amount <= 0) return alert("Summani kiriting!");
    emp.takenMoney = prevTakenMoney + amount;
    historyTitle = `Avans berildi: ${emp.name}`;
    autoNote = 'Avans';
  } else if (type === 'return') {
    amount = parseFloat(document.getElementById('adv-amount').value);
    if (!amount || amount <= 0) return alert("Qaytariladigan summani kiriting!");
    if (amount > prevTakenMoney &&
        !confirm(`Qaytarilayotgan summa (${formatMoney(amount)}) olingan avansdan (${formatMoney(prevTakenMoney)}) ko'p. Davom etilsinmi?`)) return;
    emp.takenMoney = Math.max(0, prevTakenMoney - amount);
    historyTitle = `Pul qaytarildi: ${emp.name}`;
    autoNote = 'Xodimdan pul qaytarildi';
  } else {
    if (prevLastSalaryDateStr && moneyDate <= prevLastSalaryDateStr) {
      return alert(`Bu xodimning oyligi ${formatDateStr(prevLastSalaryDateStr)} sanada yopilgan. Undan keyingi sanani tanlang.`);
    }
    const c = computeSalary(emp, moneyDate);
    const msg = `${emp.name} oyligi ${formatDateStr(moneyDate)} sanagacha yopiladi.\n\n` +
      `${c.isPiece ? 'Bajarilgan ish: ' + c.pieces + ' dona' : 'Ishlagan kun: ' + c.daysWorked}\nHisoblangan: ${formatMoney(c.gross)} so'm\nAvans: ${formatMoney(c.taken)} so'm\n` +
      `To'lanadi: ${formatMoney(c.payout)} so'm` +
      (c.carryDebt > 0 ? `\nKeyingi davrga qarz: ${formatMoney(c.carryDebt)} so'm` : '') +
      `\n\nTasdiqlaysizmi?`;
    if (!confirm(msg)) return;

    amount = c.payout;
    historyTitle = `Oylik yopildi: ${emp.name}`;
    autoNote = c.carryDebt > 0 ? `Oylik yakuni (qarz qoldi: ${formatMoney(c.carryDebt)} so'm)` : 'Oylik yakuni';

    emp.takenMoney = c.carryDebt;
    emp.lastSalaryDateStr = moneyDate;
    if (!Array.isArray(emp.closedDates)) emp.closedDates = [];
    if (!emp.closedDates.includes(moneyDate)) emp.closedDates.push(moneyDate);
  }

  const labelText = type === 'advance' ? 'Avans' : (type === 'return' ? 'Pul qaytarish' : 'Oylik');

  historyList.unshift({
    id: newId(),
    empId: emp.id,
    type: type,
    dateISO: moneyDate,
    closedDate: type === 'salary' ? moneyDate : null,
    prevLastSalaryDateStr: type === 'salary' ? prevLastSalaryDateStr : null,
    prevTakenMoney: prevTakenMoney,
    title: historyTitle,
    amount: Math.round(amount),
    note: note || autoNote,
    date: `${formatDateStr(moneyDate)} (${labelText})`
  });

  document.getElementById('money-form').reset();
  document.getElementById('money-date').value = getLocalDateStr();
  toggleMoneyInputs();
  renderAll();
  saveDataToFirebase();
  showToast("Saqlandi");
  switchTab('history');
}

// ---------------------------------------------------------------------------
// Tarix
// ---------------------------------------------------------------------------

function historyType(item) {
  if (item.type) return item.type;
  const t = String(item.title || '').toLowerCase();
  if (t.includes('avans berildi')) return 'advance';
  if (t.includes('pul qaytarildi')) return 'return';
  if (t.includes('oylik yopildi')) return 'salary';
  return '';
}

// Eski yozuvlarda empId bo'lmasa, sarlavhadagi ism orqali topadi (aniq moslik)
function findEmpForHistory(item) {
  if (item.empId !== undefined && item.empId !== null && item.empId !== '') {
    return findEmp(item.empId);
  }
  const t = String(item.title || '').toLowerCase();
  return employees.find(e => e.name && t.endsWith(': ' + String(e.name).toLowerCase()));
}

function openHistoryEditModal(histId) {
  const item = historyList.find(h => String(h.id) === String(histId));
  if (!item) return;

  document.getElementById('edit-hist-id').value = item.id;
  document.getElementById('edit-hist-amount').value = item.amount;
  document.getElementById('edit-hist-note').value = item.note || '';
  document.getElementById('history-modal').classList.add('active');
}

function closeHistoryModal() {
  document.getElementById('history-modal').classList.remove('active');
}

function saveHistoryEdit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-hist-id').value;
  const amount = parseFloat(document.getElementById('edit-hist-amount').value);
  const note = document.getElementById('edit-hist-note').value;

  if (Number.isNaN(amount) || amount < 0) return alert("To'g'ri summa kiriting!");

  const item = historyList.find(h => String(h.id) === String(id));
  if (item) {
    // Avans/qaytarish summasi o'zgarsa, xodimning avans balansini ham tuzatamiz
    const delta = amount - (Number(item.amount) || 0);
    const emp = findEmpForHistory(item);
    const t = historyType(item);
    if (emp && delta !== 0) {
      const taken = Number(emp.takenMoney) || 0;
      if (t === 'advance') emp.takenMoney = Math.max(0, taken + delta);
      else if (t === 'return') emp.takenMoney = Math.max(0, taken - delta);
    }
    item.amount = amount;
    item.note = note;
    renderAll();
    saveDataToFirebase();
    showToast("Yangilandi");
  }
  closeHistoryModal();
}

function deleteHistoryItem(id) {
  const item = historyList.find(h => String(h.id) === String(id));
  if (!item) return;
  if (!verifyPassword()) return;
  if (!confirm("Bu tarix yozuvini o'chirmoqchimisiz?")) return;

  const emp = findEmpForHistory(item);
  const t = historyType(item);

  if (emp) {
    if (t === 'advance') {
      emp.takenMoney = Math.max(0, (Number(emp.takenMoney) || 0) - Number(item.amount || 0));
    } else if (t === 'return') {
      emp.takenMoney = (Number(emp.takenMoney) || 0) + Number(item.amount || 0);
    } else if (t === 'salary') {
      const isLatestClose = !item.closedDate || item.closedDate === emp.lastSalaryDateStr;
      if (!isLatestClose &&
          !confirm("Bu oxirgi oylik yopilishi emas. O'chirilsa faqat yozuv o'chadi, xodim balansi o'zgarmaydi. Davom etilsinmi?")) return;

      if (Array.isArray(emp.closedDates) && item.closedDate) {
        emp.closedDates = emp.closedDates.filter(d => d !== item.closedDate);
      }

      if (isLatestClose) {
        if (typeof item.prevLastSalaryDateStr === "string") {
          emp.lastSalaryDateStr = item.prevLastSalaryDateStr;
        } else {
          const remaining = historyList
            .filter(h => String(h.id) !== String(id) && findEmpForHistory(h) === emp &&
                         historyType(h) === 'salary' && h.closedDate)
            .map(h => h.closedDate)
            .sort();
          emp.lastSalaryDateStr = remaining.length ? remaining[remaining.length - 1] : "";
        }
        if (typeof item.prevTakenMoney === "number") {
          emp.takenMoney = item.prevTakenMoney;
        }
      }
    }
  }

  historyList = historyList.filter(h => String(h.id) !== String(id));
  renderAll();
  saveDataToFirebase();
  showToast("O'chirildi");
}

function clearAllHistory() {
  if (!verifyPassword()) return;
  if (confirm("Barcha tarix tozalanadimi? Bu amalni qaytarib bo'lmaydi.\n(Xodimlarning avans balansi o'zgarmaydi)")) {
    historyList = [];
    renderAll();
    saveDataToFirebase();
  }
}

// CSV (Excel'da ochiladi) ko'rinishida tarixni yuklab olish
function exportHistoryCsv() {
  const filterEl = document.getElementById('history-filter-emp');
  const filterEmpId = filterEl ? filterEl.value : 'all';
  const rows = getFilteredHistory(filterEmpId);
  if (rows.length === 0) return showToast("Yuklab olish uchun yozuv yo'q", 'info');

  const typeNames = { advance: 'Avans', return: 'Qaytarish', salary: 'Oylik' };
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Sana', 'Xodim', 'Turi', 'Summa', 'Izoh'].map(esc).join(';')];
  rows.forEach(item => {
    const emp = findEmpForHistory(item);
    const t = historyType(item);
    const amount = (t === 'return' ? -1 : 1) * (Number(item.amount) || 0);
    lines.push([
      item.dateISO ? formatDateStr(item.dateISO) : item.date,
      emp ? emp.name : String(item.title || '').split(': ').slice(1).join(': '),
      typeNames[t] || '',
      amount,
      item.note || ''
    ].map(esc).join(';'));
  });

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `oylik-tarix-${getLocalDateStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Chizish (render)
// ---------------------------------------------------------------------------

function renderAll() {
  try {
    populateAttendanceFilter();
    populateHistoryFilter();
    if (document.getElementById('tab-money').classList.contains('active')) {
      const sel = document.getElementById('money-emp-id');
      const prev = sel.value;
      fillEmployeeSelect(sel, '<option value="">-- Xodimni tanlang --</option>',
        emp => `${emp.name} (${typeLabel(emp)})`);
      if (sel.value === prev) updateMoneyCalcPreview();
    }
    renderEmployees();
    renderAttendance();
    renderHistory();
    const calModal = document.getElementById('calendar-modal');
    if (calModal && calModal.classList.contains('active')) renderCalendarModal();
  } catch (err) {
    console.error("Render xatoligi:", err);
  }
}

function renderEmployees() {
  const list = document.getElementById('employee-list');
  const summary = document.getElementById('employee-summary');
  if (!list) return;

  if (!Array.isArray(employees) || employees.length === 0) {
    if (summary) summary.innerHTML = '';
    list.innerHTML = `<p class="section-desc empty-state">Hali xodimlar qo'shilmagan.</p>`;
    return;
  }

  let html = '';
  let totalTaken = 0;
  let totalAccrued = 0;
  const today = getLocalDateStr();
  const todayRecords = attendanceRecords[today] || {};
  const worksToday = new Set(getWorkList().filter(w => w.date === today).map(w => String(w.empId)));
  let presentToday = 0;

  employees.forEach(emp => {
    if (!emp) return;
    const id = escapeHtml(emp.id);
    const c = computeSalary(emp, today);
    totalTaken += c.taken;
    totalAccrued += c.gross;
    if (emp.type === 'piece') {
      if (worksToday.has(String(emp.id))) presentToday++;
    } else {
      const todayVal = todayRecords[String(emp.id)];
      if (todayVal === 1 || todayVal === 0.5) presentToday++;
    }

    const closedInfo = emp.lastSalaryDateStr ? `<span>Yopilgan: ${formatDateStr(emp.lastSalaryDateStr)}</span>` : '';
    const badge = emp.type === 'piece' ? 'ishbay' : `${formatMoney(c.rate)} so'm (${emp.type === 'monthly' ? 'oylik' : 'kunlik'})`;
    const workedInfo = emp.type === 'piece'
      ? `Ish: <strong>${c.pieces} dona</strong> (${c.daysWorked} kun)`
      : `Ishlagan: <strong>${c.daysWorked} kun</strong>`;
    const addWorkBtn = emp.type === 'piece'
      ? `<button class="btn-sm primary" onclick="openWorkModal('${id}')"><i class="fa-solid fa-plus"></i> Ish qo'shish</button>`
      : '';

    html += `
      <div class="employee-card" onclick="openEmployeeCalendar('${id}')">
        <div class="emp-top">
          <span class="emp-name">${escapeHtml(emp.name || 'Nomsiz xodim')}</span>
          <span class="emp-rate-badge">${badge}</span>
        </div>
        <div class="emp-details">
          <span>${workedInfo}</span>
          <span>Hisoblangan: <strong>${formatMoney(c.gross)}</strong></span>
          <span>Avans: <strong class="text-danger">${formatMoney(c.taken)}</strong></span>
          ${closedInfo}
        </div>
        <div class="emp-actions" onclick="event.stopPropagation()">
          ${addWorkBtn}
          <button class="btn-sm warning" onclick="openEmpModal('${id}')"><i class="fa-solid fa-pen"></i> Izmenit</button>
          <button class="btn-sm danger" onclick="deleteEmployee('${id}')"><i class="fa-solid fa-trash"></i> O'chirish</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;

  if (summary) {
    summary.innerHTML = `
      <div class="stat"><span>Xodimlar</span><strong>${employees.length}</strong></div>
      <div class="stat"><span>Bugun ishda</span><strong>${presentToday}</strong></div>
      <div class="stat"><span>Hisoblangan</span><strong>${formatMoney(totalAccrued)}</strong></div>
      <div class="stat"><span>Avanslar</span><strong class="text-danger">${formatMoney(totalTaken)}</strong></div>
    `;
  }
}

// Ishbay xodim kartasi: tanlangan kundagi ishlar ro'yxati va "Ish qo'shish"
function renderPieceAttendanceCard(emp, dateStr) {
  const id = escapeHtml(emp.id);
  const key = String(emp.id);
  const works = getWorkList()
    .filter(w => String(w.empId) === key && w.date === dateStr)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const locked = emp.lastSalaryDateStr && dateStr <= emp.lastSalaryDateStr;
  let total = 0;

  const rows = works.map(w => {
    const sum = (Number(w.qty) || 0) * (Number(w.price) || 0);
    total += sum;
    return `
      <div class="work-row">
        <div>
          <strong>${escapeHtml(w.item)}</strong>
          <div class="muted-sm">${escapeHtml(w.qty)} × ${formatMoney(w.price)} so'm</div>
        </div>
        <div class="work-row-right">
          <strong>${formatMoney(sum)}</strong>
          ${locked ? '' : `<button class="btn-sm danger" onclick="deleteWork('${escapeHtml(w.id)}')" aria-label="O'chirish"><i class="fa-solid fa-trash"></i></button>`}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="employee-card${locked ? ' locked' : ''}">
      <div class="emp-top">
        <span class="emp-name">${escapeHtml(emp.name || 'Nomsiz')}</span>
        <span class="muted-sm">${locked ? '<i class="fa-solid fa-lock"></i> Yopilgan' : 'Ishbay'}</span>
      </div>
      <p class="section-desc mb-8">
        Sana: <strong>${formatDateStr(dateStr)}</strong> | Shu kungi ish: <strong>${formatMoney(total)} so'm</strong>
      </p>
      ${rows || '<p class="muted-sm mb-8">Bu kunga ish kiritilmagan</p>'}
      ${locked ? '' : `<button class="btn primary-gradient" onclick="openWorkModal('${id}', '${escapeHtml(dateStr)}')"><i class="fa-solid fa-plus"></i> Ish qo'shish</button>`}
    </div>
  `;
}

function renderAttendance() {
  const list = document.getElementById('attendance-list');
  if (!list) return;

  const selectedDate = getSelectedAttendanceDate();
  const filterEl = document.getElementById('attendance-filter-emp');
  const filterEmpId = filterEl ? filterEl.value : 'all';

  const filteredEmps = filterEmpId === 'all'
    ? employees
    : employees.filter(e => String(e.id) === String(filterEmpId));

  if (filteredEmps.length === 0) {
    list.innerHTML = `<p class="section-desc empty-state">Xodimlar topilmadi.</p>`;
    return;
  }

  const dateRecords = attendanceRecords[selectedDate] || {};
  let html = '';

  filteredEmps.forEach(emp => {
    if (!emp) return;
    if (emp.type === 'piece') {
      html += renderPieceAttendanceCard(emp, selectedDate);
      return;
    }
    const id = escapeHtml(emp.id);
    const status = dateRecords[String(emp.id)];
    let statusText = 'Belgilanmagan';
    if (status === 1) statusText = "To'liq kun";
    else if (status === 0.5) statusText = 'Yarim kun';
    else if (status === 0) statusText = 'Kelmagan';
    const locked = emp.lastSalaryDateStr && selectedDate <= emp.lastSalaryDateStr;

    html += `
      <div class="employee-card${locked ? ' locked' : ''}">
        <div class="emp-top">
          <span class="emp-name">${escapeHtml(emp.name || 'Nomsiz')}</span>
          <span class="muted-sm">${locked ? '<i class="fa-solid fa-lock"></i> Yopilgan' : (emp.type === 'monthly' ? 'Oylik' : 'Kunlik')}</span>
        </div>
        <p class="section-desc mb-8">
          Sana: <strong>${formatDateStr(selectedDate)}</strong> | Holati: <strong>${statusText}</strong>
        </p>
        <div class="attendance-actions">
          <button class="${status === 1 ? 'active-full' : ''}" onclick="setAttendanceStatus('${id}', 1)">
            <i class="fa-solid fa-check"></i> To'liq (1)
          </button>
          <button class="${status === 0.5 ? 'active-half' : ''}" onclick="setAttendanceStatus('${id}', 0.5)">
            <i class="fa-solid fa-star-half-stroke"></i> Yarim (0.5)
          </button>
          <button class="${status === 0 ? 'active-absent' : ''}" onclick="setAttendanceStatus('${id}', 0)">
            <i class="fa-solid fa-xmark"></i> Kelmadi (0)
          </button>
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
}

function getFilteredHistory(filterEmpId) {
  if (filterEmpId === 'all') return historyList;
  return historyList.filter(item => {
    const emp = findEmpForHistory(item);
    return emp && String(emp.id) === String(filterEmpId);
  });
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  const filterEl = document.getElementById('history-filter-emp');
  const filterEmpId = filterEl ? filterEl.value : 'all';
  const filteredHistory = getFilteredHistory(filterEmpId);

  const totalsEl = document.getElementById('history-totals');
  if (totalsEl) {
    let adv = 0, ret = 0, sal = 0;
    filteredHistory.forEach(item => {
      const a = Number(item.amount) || 0;
      const t = historyType(item);
      if (t === 'advance') adv += a;
      else if (t === 'return') ret += a;
      else if (t === 'salary') sal += a;
    });
    totalsEl.innerHTML = filteredHistory.length ? `
      <div class="stat"><span>Avans</span><strong>${formatMoney(adv)}</strong></div>
      <div class="stat"><span>Oylik</span><strong>${formatMoney(sal)}</strong></div>
      <div class="stat"><span>Qaytarilgan</span><strong class="text-danger">${formatMoney(ret)}</strong></div>
      <div class="stat"><span>Jami berilgan</span><strong>${formatMoney(adv + sal - ret)}</strong></div>
    ` : '';
  }

  if (filteredHistory.length === 0) {
    list.innerHTML = `<p class="section-desc empty-state">Tarix yozuvlari topilmadi.</p>`;
    return;
  }

  let html = '';
  filteredHistory.forEach(item => {
    if (!item) return;
    const id = escapeHtml(item.id);
    const isReturn = historyType(item) === 'return';

    html += `
      <div class="history-card">
        <div class="history-info">
          <h4>${escapeHtml(item.title || 'Amaliyot')}</h4>
          <p>${escapeHtml(item.note || '')} • ${escapeHtml(item.date || '')}</p>
          <div class="history-actions">
            <button class="btn-sm warning" onclick="openHistoryEditModal('${id}')"><i class="fa-solid fa-pen"></i> Izmenit</button>
            <button class="btn-sm danger" onclick="deleteHistoryItem('${id}')"><i class="fa-solid fa-trash"></i> O'chirish</button>
          </div>
        </div>
        <div class="history-amount${isReturn ? ' text-danger' : ''}">
          ${isReturn ? '-' : '+'}${formatMoney(item.amount)} so'm
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
}

// Modal tashqarisiga bosilganda yoki Esc bosilganda yopish
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal') && e.target.classList.contains('active')) {
    if (e.target.id === 'calendar-modal') closeCalendarModal();
    else e.target.classList.remove('active');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeCalendarModal();
  closeWorkModal();
  closeEmpModal();
  closeHistoryModal();
});
