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

// 🔒 O'chirish uchun xavfsizlik paroli
const DELETE_PASSWORD = "1234";

let employees = [];
let historyList = [];
let attendanceRecords = {};

let calCurrentDate = new Date();
let activeCalendarEmpId = null;
let erkinjonRestoredOnce = false;

function toList(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (val && typeof val === "object") return Object.values(val).filter(Boolean);
  return [];
}

function toMap(val) {
  if (val && typeof val === "object" && !Array.isArray(val)) return val;
  return {};
}

function getLocalDateStr(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ensureReturnMoneyOption() {
  const typeSelect = document.getElementById('money-type');
  if (typeSelect && !typeSelect.querySelector('option[value="return"]')) {
    const opt = document.createElement('option');
    opt.value = 'return';
    opt.textContent = 'Pul qaytarish (Avans qaytarish)';
    typeSelect.appendChild(opt);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ensureReturnMoneyOption();
  const attDateInput = document.getElementById('attendance-date');
  if (attDateInput && !attDateInput.value) attDateInput.value = getLocalDateStr();

  const moneyDateInput = document.getElementById('money-date');
  if (moneyDateInput && !moneyDateInput.value) moneyDateInput.value = getLocalDateStr();
});

const attDateInit = document.getElementById('attendance-date');
if (attDateInit && !attDateInit.value) attDateInit.value = getLocalDateStr();

const moneyDateInit = document.getElementById('money-date');
if (moneyDateInit && !moneyDateInit.value) moneyDateInit.value = getLocalDateStr();

(function injectCalendarStyles() {
  const oldStyle = document.getElementById('custom-calendar-settled-style');
  if (oldStyle) oldStyle.remove();

  const style = document.createElement('style');
  style.id = 'custom-calendar-settled-style';
  style.textContent = `
    .cal-day-cell {
      position: relative;
      transition: opacity 0.15s ease, transform 0.12s ease;
    }
    .cal-day-cell.dimmed-past-day {
      opacity: 0.34 !important;
      filter: grayscale(35%);
    }
    .cal-day-cell.active-period-day {
      opacity: 1 !important;
      font-weight: 600;
    }
    .cal-day-cell.closed-cutoff-day {
      opacity: 0.55 !important;
      outline: 2px dashed #4f46e5;
      outline-offset: -2px;
    }
    .cal-day-cell.closed-cutoff-day::after {
      content: "YOP";
      position: absolute;
      bottom: 1px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.52rem;
      font-weight: 800;
      letter-spacing: 0.3px;
      color: #312e81;
      line-height: 1;
    }
    .cal-summary-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #4f46e5;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 0.84rem;
      margin-bottom: 10px;
      line-height: 1.5;
      color: #0f172a;
    }
    .cal-badge-demo {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 4px;
      background: #e0e7ff;
      border: 1px solid #4f46e5;
      color: #1e1b4b;
      font-size: 0.72rem;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
})();

function normalizeErkinjonState() {
  if (erkinjonRestoredOnce) return false;
  const erkinjon = employees.find(e => e.name && String(e.name).toLowerCase().trim().includes("erkinjon"));
  if (!erkinjon) {
    erkinjonRestoredOnce = true;
    return false;
  }

  const hasErkinjonCloseInHistory = historyList.some(
    h => (String(h.empId) === String(erkinjon.id) || (h.title && String(h.title).toLowerCase().includes("erkinjon"))) &&
         h.title && String(h.title).toLowerCase().includes("oylik yopildi")
  );

  if (!hasErkinjonCloseInHistory && (!erkinjon.lastSalaryDateStr || erkinjon.lastSalaryDateStr !== "2026-11-19")) {
    erkinjon.lastSalaryDateStr = "2026-11-19";
    if (Array.isArray(erkinjon.closedDates)) {
      erkinjon.closedDates = erkinjon.closedDates.filter(d => d <= "2026-11-19");
      if (!erkinjon.closedDates.includes("2026-11-19")) {
        erkinjon.closedDates.push("2026-11-19");
      }
    } else {
      erkinjon.closedDates = ["2026-11-19"];
    }
    erkinjonRestoredOnce = true;
    return true;
  }

  erkinjonRestoredOnce = true;
  return false;
}

// Real vaqtda Firebase'dan ma'lumotlarni olish
db.collection("appData").doc("mainData").onSnapshot((doc) => {
  if (doc.exists) {
    const data = doc.data() || {};
    employees = toList(data.employees);
    historyList = toList(data.historyList);
    attendanceRecords = toMap(data.attendanceRecords);

    const changed = normalizeErkinjonState();
    renderAll();
    if (changed) {
      saveDataToFirebase();
    }
  } else {
    renderAll();
  }
}, (error) => {
  console.error("Firebase o'qishda xatolik:", error);
  renderAll();
});

function saveDataToFirebase() {
  return db.collection("appData").doc("mainData").set({
    employees: employees,
    historyList: historyList,
    attendanceRecords: attendanceRecords
  }).catch((error) => {
    console.error("Xatolik yuz berdi: ", error);
  });
}

function verifyPassword() {
  const enteredPassword = prompt("⚠️ O'chirish uchun parolni kiriting:");
  if (enteredPassword === null) return false;
  if (enteredPassword === DELETE_PASSWORD) return true;
  else {
    alert("❌ Parol noto'g'ri! O'chirish bekor qilindi.");
    return false;
  }
}

function switchTab(tabId, btnElement) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const pane = document.getElementById(`tab-${tabId}`);
  if (pane) pane.classList.add('active');
  if (btnElement) btnElement.classList.add('active');

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
    populateAttendanceFilter();
    renderAttendance();
  } else if (tabId === 'history') {
    populateHistoryFilter();
    renderHistory();
  }
}

function openEmpModal(id = null) {
  document.getElementById('emp-modal').classList.add('active');
  if (id !== null && id !== undefined && id !== '') {
    document.getElementById('emp-modal-title').innerText = "Xodimni Tahrirlash";
    const emp = employees.find(e => String(e.id) === String(id));
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
}

function closeEmpModal() {
  document.getElementById('emp-modal').classList.remove('active');
}

function saveEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('edit-emp-id').value;
  const name = document.getElementById('emp-name').value;
  const type = document.getElementById('emp-type').value;
  const rate = parseFloat(document.getElementById('emp-rate').value) || 0;

  if (id) {
    const emp = employees.find(e => String(e.id) === String(id));
    if (emp) {
      emp.name = name;
      emp.type = type;
      emp.rate = rate;
    }
  } else {
    employees.push({
      id: Date.now(),
      name,
      type,
      rate,
      takenMoney: 0,
      lastSalaryDateStr: "",
      closedDates: []
    });
  }
  closeEmpModal();
  saveDataToFirebase();
}

function deleteEmployee(id) {
  if (!verifyPassword()) return;

  if (confirm("Haqiqatan ham bu xodimni o'chirmoqchimisiz?")) {
    employees = employees.filter(e => String(e.id) !== String(id));
    saveDataToFirebase();
  }
}

function openEmployeeCalendar(empId) {
  activeCalendarEmpId = empId;
  calCurrentDate = new Date();
  renderCalendarModal();
  document.getElementById('calendar-modal').classList.add('active');
}

function closeCalendarModal() {
  document.getElementById('calendar-modal').classList.remove('active');
  activeCalendarEmpId = null;
}

function changeMonth(direction) {
  calCurrentDate.setMonth(calCurrentDate.getMonth() + direction);
  renderCalendarModal();
}

function renderCalendarModal() {
  try {
    const emp = employees.find(e => String(e.id) === String(activeCalendarEmpId));
    if (!emp) return;

    document.getElementById('cal-emp-title').innerText = `${emp.name} — Davomati`;

    const legendEl = document.querySelector('#calendar-modal .calendar-legend');
    let summaryBox = document.getElementById('cal-summary-info');
    if (!summaryBox && legendEl) {
      summaryBox = document.createElement('div');
      summaryBox.id = 'cal-summary-info';
      summaryBox.className = 'cal-summary-box';
      legendEl.insertAdjacentElement('beforebegin', summaryBox);
    }

    const allEmpDates = Object.keys(attendanceRecords)
      .filter(d => attendanceRecords[d] && attendanceRecords[d][emp.id] !== undefined)
      .sort();
    const firstWorkDate = allEmpDates.length > 0 ? allEmpDates[0] : "Belgilanmagan";
    const lastClosedDate = emp.lastSalaryDateStr || "Hali yopilmagan";
    const currentPeriodDays = calculateDaysWorked(emp.id);

    if (summaryBox) {
      summaryBox.innerHTML = `
        <div><strong>Ilk qayd etilgan sana:</strong> ${firstWorkDate}</div>
        <div><strong>Oxirgi oylik yopilgan sana:</strong> ${lastClosedDate}</div>
        <div><strong>Joriy (yorqin) davr ishlagan kunlari:</strong> ${currentPeriodDays} kun</div>
        <div style="margin-top:4px; font-size:0.78rem; color:#334155;">
          Yorqin kunlar — oxirgi yopilishdan keyingi davr; xira kunlar — avvalgi yopilgan davr; <span class="cal-badge-demo">YOP</span> — yopilgan sana.
        </div>
      `;
    }

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();

    const monthNames = [
      "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
      "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"
    ];
    document.getElementById('cal-month-year-label').innerText = `${monthNames[month]} ${year}`;

    const grid = document.getElementById('calendar-days-grid');
    grid.innerHTML = '';

    let firstDayIndex = new Date(year, month, 1).getDay();
    firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;

    const totalDays = new Date(year, month + 1, 0).getDate();

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

      const mm = String(month + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;

      const dateRecords = attendanceRecords[dateStr] || {};
      const status = dateRecords[emp.id];

      if (status === 1) {
        cell.classList.add('status-green');
      } else if (status === 0.5) {
        cell.classList.add('status-orange');
      } else if (status === 0) {
        cell.classList.add('status-red');
      }

      if (emp.lastSalaryDateStr) {
        if (dateStr < emp.lastSalaryDateStr) {
          cell.classList.add('dimmed-past-day');
        } else if (dateStr === emp.lastSalaryDateStr || closedDatesArr.includes(dateStr)) {
          cell.classList.add('closed-cutoff-day');
          cell.title = `Oylik yopilgan sana: ${dateStr}`;
        } else {
          cell.classList.add('active-period-day');
        }
      } else {
        cell.classList.add('active-period-day');
      }

      grid.appendChild(cell);
    }
  } catch (err) {
    console.error("Kalendarni chizishda xatolik:", err);
  }
}

function populateAttendanceFilter() {
  const select = document.getElementById('attendance-filter-emp');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">Barcha xodimlar</option>';
  employees.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
  });
  select.value = currentVal || 'all';
}

function populateHistoryFilter() {
  const select = document.getElementById('history-filter-emp');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">Barcha xodimlar tarixi</option>';
  employees.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
  });
  select.value = currentVal || 'all';
}

function setAttendanceStatus(empId, status) {
  const dateEl = document.getElementById('attendance-date');
  const selectedDate = (dateEl && dateEl.value) ? dateEl.value : getLocalDateStr();
  if (!selectedDate) return alert("Iltimos, sanani tanlang!");

  if (!attendanceRecords[selectedDate]) {
    attendanceRecords[selectedDate] = {};
  }

  if (attendanceRecords[selectedDate][empId] === status) {
    delete attendanceRecords[selectedDate][empId];
  } else {
    attendanceRecords[selectedDate][empId] = status;
  }

  saveDataToFirebase();
}

function calculateDaysWorked(empId, customEndDate = null) {
  let totalDays = 0;
  try {
    const emp = employees.find(e => String(e.id) === String(empId));
    const lastDateStr = (emp && typeof emp.lastSalaryDateStr === 'string') ? emp.lastSalaryDateStr : "";
    const endDateStr = customEndDate || getLocalDateStr();

    for (let dateStr in attendanceRecords) {
      if (typeof dateStr !== 'string') continue;
      const afterLastClosed = !lastDateStr || dateStr > lastDateStr;
      const withinEndDate = !endDateStr || dateStr <= endDateStr;

      if (afterLastClosed && withinEndDate) {
        const dayMap = attendanceRecords[dateStr];
        if (dayMap && dayMap[empId] !== undefined && dayMap[empId] !== null) {
          const val = Number(dayMap[empId]);
          if (!Number.isNaN(val)) {
            totalDays += val;
          }
        }
      }
    }
  } catch (err) {
    console.error("Kunlarni hisoblashda xatolik:", err);
  }
  return totalDays;
}

function populateMoneySelect() {
  ensureReturnMoneyOption();
  const select = document.getElementById('money-emp-id');
  if (!select) return;
  select.innerHTML = '<option value="">-- Xodimni tanlang --</option>';
  employees.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.type === 'daily' ? 'Kunlik' : 'Oylik'})</option>`;
  });
  toggleMoneyInputs();
}

function toggleMoneyInputs() {
  ensureReturnMoneyOption();
  const typeEl = document.getElementById('money-type');
  if (!typeEl) return;
  const type = typeEl.value;
  const advanceGroup = document.getElementById('advance-input-group');
  const preview = document.getElementById('salary-calc-preview');
  const advLabel = advanceGroup ? advanceGroup.querySelector('label') : null;
  const advInput = document.getElementById('adv-amount');

  if (type === 'advance') {
    if (advanceGroup) advanceGroup.style.display = 'block';
    if (advLabel) advLabel.textContent = "Avans summasi (so'm)";
    if (advInput) advInput.placeholder = "Masalan: 50000";
    if (preview) preview.style.display = 'none';
  } else if (type === 'return') {
    if (advanceGroup) advanceGroup.style.display = 'block';
    if (advLabel) advLabel.textContent = "Qaytariladigan summa (so'm)";
    if (advInput) advInput.placeholder = "Masalan: 100000";
    if (preview) preview.style.display = 'none';
  } else {
    if (advanceGroup) advanceGroup.style.display = 'none';
    if (preview) {
      preview.style.display = 'block';
      updateMoneyCalcPreview();
    }
  }
}

function updateMoneyCalcPreview() {
  const empId = document.getElementById('money-emp-id').value;
  const type = document.getElementById('money-type').value;
  const moneyDate = document.getElementById('money-date').value;
  const preview = document.getElementById('salary-calc-preview');

  if (!empId || type !== 'salary') return;

  const emp = employees.find(e => String(e.id) === String(empId));
  if (!emp) return;

  const daysWorked = calculateDaysWorked(emp.id, moneyDate);
  const rate = Number(emp.rate) || 0;
  const taken = Number(emp.takenMoney) || 0;
  let calculatedSalary = 0;
  let detailsText = '';

  if (emp.type === 'daily') {
    let gross = daysWorked * rate;
    calculatedSalary = gross - taken;
    detailsText = `Tanlangan sanagacha ishlagan kunlari: <strong>${daysWorked} kun</strong><br>
                   Hisoblangan: ${gross.toLocaleString()} so'm (${daysWorked} × ${rate.toLocaleString()})<br>
                   Oldindan olingan summa (Avans): <strong style="color:red;">${taken.toLocaleString()} so'm</strong>`;
  } else {
    let dailyRate = rate / 26;
    let missingDays = Math.max(0, 26 - daysWorked);
    let deduction = missingDays * dailyRate;
    let gross = Math.max(0, rate - deduction);
    calculatedSalary = gross - taken;

    detailsText = `Oylik stavka: ${rate.toLocaleString()} so'm<br>
                   1 kunlik qiymat: ${Math.round(dailyRate).toLocaleString()} so'm (26 ga bo'lingan)<br>
                   Ishlagan kunlari: ${daysWorked} | Kelmagan: ${missingDays} kun (${Math.round(deduction).toLocaleString()} so'm chegirildi)<br>
                   Oldindan olingan summa (Avans): <strong style="color:red;">${taken.toLocaleString()} so'm</strong>`;
  }

  preview.innerHTML = `
    <p><strong>Hisob-kitob tafsiloti:</strong></p>
    <p>${detailsText}</p>
    <hr style="margin:6px 0; border:0; border-top:1px solid #cbd5e1;">
    <p style="font-size:0.95rem; color: var(--success);"><strong>To'lanadigan yakuniy summa: ${Math.round(calculatedSalary).toLocaleString()} so'm</strong></p>
  `;
}

function handleMoneySubmit(e) {
  e.preventDefault();
  const empId = document.getElementById('money-emp-id').value;
  const type = document.getElementById('money-type').value;
  const moneyDate = document.getElementById('money-date').value || getLocalDateStr();
  const note = document.getElementById('money-note').value;

  const emp = employees.find(e => String(e.id) === String(empId));
  if (!emp) return alert("Xodimni tanlang!");

  let amountToAdd = 0;
  let historyTitle = '';
  const prevLastSalaryDateStr = emp.lastSalaryDateStr || "";
  const prevTakenMoney = Number(emp.takenMoney) || 0;
  const rate = Number(emp.rate) || 0;

  if (type === 'advance') {
    amountToAdd = parseFloat(document.getElementById('adv-amount').value);
    if (!amountToAdd || amountToAdd <= 0) return alert("Summani kiriting!");

    emp.takenMoney = prevTakenMoney + amountToAdd;
    historyTitle = `Avans berildi: ${emp.name}`;
  } else if (type === 'return') {
    amountToAdd = parseFloat(document.getElementById('adv-amount').value);
    if (!amountToAdd || amountToAdd <= 0) return alert("Qaytariladigan summani kiriting!");

    emp.takenMoney = Math.max(0, prevTakenMoney - amountToAdd);
    historyTitle = `Pul qaytarildi: ${emp.name}`;
  } else {
    const daysWorked = calculateDaysWorked(emp.id, moneyDate);
    let dailyRate = emp.type === 'daily' ? rate : (rate / 26);
    let gross = emp.type === 'daily' ? (daysWorked * rate) : rate;

    if (emp.type === 'monthly') {
      let missingDays = Math.max(0, 26 - daysWorked);
      gross = Math.max(0, rate - (missingDays * dailyRate));
    }

    amountToAdd = Math.max(0, gross - prevTakenMoney);
    historyTitle = `Oylik yopildi: ${emp.name}`;

    emp.takenMoney = 0;
    emp.lastSalaryDateStr = moneyDate;
    if (!Array.isArray(emp.closedDates)) emp.closedDates = [];
    if (moneyDate && !emp.closedDates.includes(moneyDate)) {
      emp.closedDates.push(moneyDate);
    }
  }

  const labelText = type === 'advance' ? 'Avans' : (type === 'return' ? 'Pul qaytarish' : 'Oylik');

  historyList.unshift({
    id: Date.now(),
    empId: emp.id,
    type: type,
    closedDate: type === 'salary' ? moneyDate : null,
    prevLastSalaryDateStr: type === 'salary' ? prevLastSalaryDateStr : null,
    prevTakenMoney: prevTakenMoney,
    title: historyTitle,
    amount: Math.round(amountToAdd),
    note: note || (type === 'advance' ? 'Avans' : (type === 'return' ? 'Xodimdan pul qaytarildi' : 'Oylik yakuni')),
    date: new Date(moneyDate).toLocaleDateString() + ' (' + labelText + ')'
  });

  document.getElementById('money-form').reset();
  document.getElementById('money-date').value = getLocalDateStr();
  document.getElementById('salary-calc-preview').style.display = 'none';
  toggleMoneyInputs();
  saveDataToFirebase();
  switchTab('history', document.querySelectorAll('.nav-item')[3]);
}

function openHistoryEditModal(histId) {
  const item = historyList.find(h => String(h.id) === String(histId));
  if (!item) return;

  document.getElementById('edit-hist-id').value = item.id;
  document.getElementById('edit-hist-amount').value = item.amount;
  document.getElementById('edit-hist-note').value = item.note;
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

  const item = historyList.find(h => String(h.id) === String(id));
  if (item) {
    item.amount = amount;
    item.note = note;
    saveDataToFirebase();
  }
  closeHistoryModal();
}

function deleteHistoryItem(id) {
  if (!verifyPassword()) return;

  if (confirm("Bu tarix yozuvini o'chirmoqchimisiz?")) {
    const item = historyList.find(h => String(h.id) === String(id));
    if (item) {
      const emp = employees.find(
        e => String(e.id) === String(item.empId) ||
             (item.title && e.name && String(item.title).toLowerCase().includes(String(e.name).toLowerCase()))
      );

      if (emp) {
        const titleLower = (item.title || "").toLowerCase();

        if (item.type === 'advance' || titleLower.includes("avans berildi")) {
          emp.takenMoney = Math.max(0, (Number(emp.takenMoney) || 0) - Number(item.amount || 0));
        } else if (item.type === 'return' || titleLower.includes("pul qaytarildi")) {
          emp.takenMoney = (Number(emp.takenMoney) || 0) + Number(item.amount || 0);
        } else if (item.type === 'salary' || titleLower.includes("oylik yopildi")) {
          if (Array.isArray(emp.closedDates) && item.closedDate) {
            emp.closedDates = emp.closedDates.filter(d => d !== item.closedDate);
          }

          const remainingCloses = historyList
            .filter(h => String(h.id) !== String(id) &&
                       (String(h.empId) === String(emp.id) || (h.title && String(h.title).toLowerCase().includes(String(emp.name).toLowerCase()))) &&
                       ((h.type === 'salary') || (h.title && String(h.title).toLowerCase().includes("oylik yopildi"))) &&
                       h.closedDate)
            .map(h => h.closedDate)
            .sort();

          if (typeof item.prevLastSalaryDateStr === "string" && item.prevLastSalaryDateStr !== "") {
            emp.lastSalaryDateStr = item.prevLastSalaryDateStr;
          } else if (remainingCloses.length > 0) {
            emp.lastSalaryDateStr = remainingCloses[remainingCloses.length - 1];
          } else {
            emp.lastSalaryDateStr = "";
          }

          if (typeof item.prevTakenMoney === "number") {
            emp.takenMoney = item.prevTakenMoney;
          }
        }
      }
    }

    historyList = historyList.filter(h => String(h.id) !== String(id));
    saveDataToFirebase();
  }
}

function clearAllHistory() {
  if (!verifyPassword()) return;

  if (confirm("Barcha tarix tozalanadimi?")) {
    historyList = [];
    saveDataToFirebase();
  }
}

function renderAll() {
  try {
    ensureReturnMoneyOption();
    renderEmployees();
    renderAttendance();
    renderHistory();
    const calModal = document.getElementById('calendar-modal');
    if (calModal && calModal.classList.contains('active')) {
      renderCalendarModal();
    }
  } catch (err) {
    console.error("Render xatoligi:", err);
  }
}

function renderEmployees() {
  const list = document.getElementById('employee-list');
  if (!list) return;

  try {
    if (!Array.isArray(employees) || employees.length === 0) {
      list.innerHTML = `<p class="section-desc" style="text-align:center; padding: 20px;">Hali xodimlar qo'shilmagan.</p>`;
      return;
    }

    let html = '';
    employees.forEach(emp => {
      if (!emp) return;
      const safeName = String(emp.name || 'Nomsiz xodim');
      const safeType = emp.type === 'monthly' ? 'oylik' : 'kunlik';
      const safeRate = Number(emp.rate) || 0;
      const safeTaken = Number(emp.takenMoney) || 0;
      const daysWorked = calculateDaysWorked(emp.id);
      const closedInfo = emp.lastSalaryDateStr ? ` • Yopilgan: ${emp.lastSalaryDateStr}` : '';

      html += `
        <div class="employee-card" onclick="openEmployeeCalendar('${emp.id}')">
          <div class="emp-top">
            <span class="emp-name">${safeName}</span>
            <span class="emp-rate-badge">${safeRate.toLocaleString()} so'm (${safeType})</span>
          </div>
          <div class="emp-details">
            <span>Ishlagan kun: <strong>${daysWorked} kun</strong>${closedInfo}</span>
            <span>Olingan avans: <strong style="color:var(--danger);">${safeTaken.toLocaleString()} so'm</strong></span>
          </div>
          <div class="emp-actions" onclick="event.stopPropagation()">
            <button class="btn-sm warning" onclick="openEmpModal('${emp.id}')"><i class="fa-solid fa-pen"></i> Izmenit</button>
            <button class="btn-sm danger" onclick="deleteEmployee('${emp.id}')"><i class="fa-solid fa-trash"></i> O'chirish</button>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  } catch (err) {
    console.error("Xodimlar ro'yxatini chiqarishda xatolik:", err);
  }
}

function renderAttendance() {
  const list = document.getElementById('attendance-list');
  if (!list) return;

  try {
    const dateEl = document.getElementById('attendance-date');
    const filterEl = document.getElementById('attendance-filter-emp');
    const selectedDate = (dateEl && dateEl.value) ? dateEl.value : getLocalDateStr();
    const filterEmpId = filterEl ? filterEl.value : 'all';

    let filteredEmps = employees;
    if (filterEmpId !== 'all') {
      filteredEmps = employees.filter(e => String(e.id) === String(filterEmpId));
    }

    if (filteredEmps.length === 0) {
      list.innerHTML = `<p class="section-desc" style="text-align:center; padding: 20px;">Xodimlar topilmadi.</p>`;
      return;
    }

    const dateRecords = attendanceRecords[selectedDate] || {};
    let html = '';

    filteredEmps.forEach(emp => {
      if (!emp) return;
      const status = dateRecords[emp.id];
      let statusText = 'Belgilanmagan';
      if (status === 1) statusText = "To'liq kun";
      else if (status === 0.5) statusText = 'Yarim kun';
      else if (status === 0) statusText = 'Kelmagan';

      html += `
        <div class="employee-card">
          <div class="emp-top">
            <span class="emp-name">${emp.name || 'Nomsiz'}</span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${emp.type === 'monthly' ? 'Oylik' : 'Kunlik'}</span>
          </div>
          <p class="section-desc" style="margin-bottom:8px;">
            Sana: <strong>${selectedDate}</strong> | Holati: <strong>${statusText}</strong>
          </p>
          <div class="attendance-actions">
            <button class="${status === 1 ? 'active-full' : ''}" onclick="setAttendanceStatus('${emp.id}', 1)">
              <i class="fa-solid fa-check"></i> To'liq (1)
            </button>
            <button class="${status === 0.5 ? 'active-half' : ''}" onclick="setAttendanceStatus('${emp.id}', 0.5)">
              <i class="fa-solid fa-star-half-stroke"></i> Yarim (0.5)
            </button>
            <button class="${status === 0 ? 'active-absent' : ''}" onclick="setAttendanceStatus('${emp.id}', 0)">
              <i class="fa-solid fa-xmark"></i> Kelmadi (0)
            </button>
          </div>
        </div>
      `;
    });

    list.innerHTML = html;
  } catch (err) {
    console.error("Davomatni chiqarishda xatolik:", err);
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  try {
    const filterEl = document.getElementById('history-filter-emp');
    const filterEmpId = filterEl ? filterEl.value : 'all';

    let filteredHistory = historyList;
    if (filterEmpId !== 'all') {
      filteredHistory = historyList.filter(item => String(item.empId) === String(filterEmpId));
    }

    if (filteredHistory.length === 0) {
      list.innerHTML = `<p class="section-desc" style="text-align:center; padding: 20px;">Tarix yozuvlari topilmadi.</p>`;
      return;
    }

    let html = '';
    filteredHistory.forEach(item => {
      if (!item) return;
      const isReturn = item.type === 'return' || (item.title && String(item.title).toLowerCase().includes("pul qaytarildi"));
      const signPrefix = isReturn ? '-' : '+';
      const amountColor = isReturn ? 'color: var(--danger);' : '';

      html += `
        <div class="history-card">
          <div class="history-info">
            <h4>${item.title || 'Amaliyot'}</h4>
            <p>${item.note || ''} • ${item.date || ''}</p>
            <div class="history-actions">
              <button class="btn-sm warning" onclick="openHistoryEditModal('${item.id}')"><i class="fa-solid fa-pen"></i> Izmenit</button>
              <button class="btn-sm danger" onclick="deleteHistoryItem('${item.id}')"><i class="fa-solid fa-trash"></i> O'chirish</button>
            </div>
          </div>
          <div class="history-amount" style="${amountColor}">
            ${signPrefix}${Number(item.amount || 0).toLocaleString()} so'm
          </div>
        </div>
      `;
    });

    list.innerHTML = html;
  } catch (err) {
    console.error("Tarixni chiqarishda xatolik:", err);
  }
}