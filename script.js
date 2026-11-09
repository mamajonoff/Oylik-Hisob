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

document.getElementById('attendance-date').valueAsDate = new Date();

// Real vaqtda Firebase'dan ma'lumotlarni olish
db.collection("appData").doc("mainData").onSnapshot((doc) => {
  if (doc.exists) {
    const data = doc.data();
    employees = data.employees || [];
    historyList = data.historyList || [];
    attendanceRecords = data.attendanceRecords || {};
    renderAll();
  } else {
    saveDataToFirebase();
  }
});

function saveDataToFirebase() {
  db.collection("appData").doc("mainData").set({
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
  
  document.getElementById(`tab-${tabId}`).classList.add('active');
  btnElement.classList.add('active');

  const titles = {
    'employees': '<i class="fa-solid fa-users"></i> Xodimlar',
    'attendance': '<i class="fa-solid fa-calendar-check"></i> Keldi-ketdi',
    'money': '<i class="fa-solid fa-hand-holding-dollar"></i> Pul berish',
    'history': '<i class="fa-solid fa-clock-rotate-left"></i> Tarix'
  };
  document.getElementById('header-title').innerHTML = titles[tabId];

  if(tabId === 'money') {
    populateMoneySelect();
  } else if(tabId === 'attendance') {
    populateAttendanceFilter();
    renderAttendance();
  } else if(tabId === 'history') {
    populateHistoryFilter();
    renderHistory();
  }
}

function openEmpModal(id = null) {
  document.getElementById('emp-modal').classList.add('active');
  if (id) {
    document.getElementById('emp-modal-title').innerText = "Xodimni Tahrirlash";
    const emp = employees.find(e => e.id === id);
    document.getElementById('edit-emp-id').value = emp.id;
    document.getElementById('emp-name').value = emp.name;
    document.getElementById('emp-type').value = emp.type;
    document.getElementById('emp-rate').value = emp.rate;
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
  const rate = parseFloat(document.getElementById('emp-rate').value);

  if (id) {
    const emp = employees.find(e => e.id == id);
    if(emp) {
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
      lastSalaryDate: null // Oxirgi oylik yopilgan sana
    });
  }
  closeEmpModal();
  saveDataToFirebase();
}

function deleteEmployee(id) {
  if (!verifyPassword()) return;

  if (confirm("Haqiqatan ham bu xodimni o'chirmoqchimisiz?")) {
    employees = employees.filter(e => e.id !== id);
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
  const emp = employees.find(e => e.id === activeCalendarEmpId);
  if (!emp) return;

  document.getElementById('cal-emp-title').innerText = `${emp.name} — Davomati`;

  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();

  const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
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

    grid.appendChild(cell);
  }
}

function populateAttendanceFilter() {
  const select = document.getElementById('attendance-filter-emp');
  const currentVal = select.value;
  select.innerHTML = '<option value="all">Barcha xodimlar</option>';
  employees.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
  });
  select.value = currentVal || 'all';
}

function populateHistoryFilter() {
  const select = document.getElementById('history-filter-emp');
  if(!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">Barcha xodimlar tarixi</option>';
  employees.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
  });
  select.value = currentVal || 'all';
}

function setAttendanceStatus(empId, status) {
  const selectedDate = document.getElementById('attendance-date').value;
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

// Oylik yopilgandan keyingi yangi ishlagan kunlarni hisoblash
function calculateDaysWorked(empId) {
  let totalDays = 0;
  const emp = employees.find(e => e.id === empId);
  const lastSalaryDateStr = emp && emp.lastSalaryDate ? emp.lastSalaryDate : "2000-01-01";
  const lastSalaryDate = new Date(lastSalaryDateStr);

  for (let dateStr in attendanceRecords) {
    const recordDate = new Date(dateStr);
    // Faqat oxirgi oylik yopilgan sanadan keyingi kunlarni hisoblaymiz
    if (recordDate > lastSalaryDate) {
      if (attendanceRecords[dateStr][empId] !== undefined) {
        totalDays += attendanceRecords[dateStr][empId];
      }
    }
  }
  return totalDays;
}

function populateMoneySelect() {
  const select = document.getElementById('money-emp-id');
  select.innerHTML = '<option value="">-- Xodimni tanlang --</option>';
  employees.forEach(emp => {
    select.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.type === 'daily' ? 'Kunlik' : 'Oylik'})</option>`;
  });
  toggleMoneyInputs();
}

function toggleMoneyInputs() {
  const type = document.getElementById('money-type').value;
  const advanceGroup = document.getElementById('advance-input-group');
  const preview = document.getElementById('salary-calc-preview');

  if (type === 'advance') {
    advanceGroup.style.display = 'block';
    preview.style.display = 'none';
  } else {
    advanceGroup.style.display = 'none';
    preview.style.display = 'block';
    updateMoneyCalcPreview();
  }
}

function updateMoneyCalcPreview() {
  const empId = document.getElementById('money-emp-id').value;
  const type = document.getElementById('money-type').value;
  const preview = document.getElementById('salary-calc-preview');

  if (!empId || type !== 'salary') return;

  const emp = employees.find(e => e.id == empId);
  if (!emp) return;

  const daysWorked = calculateDaysWorked(emp.id);
  let calculatedSalary = 0;
  let detailsText = '';

  if (emp.type === 'daily') {
    let gross = daysWorked * emp.rate;
    calculatedSalary = gross - emp.takenMoney;
    detailsText = `Hisob-kitobdagi ishlagan kunlari: <strong>${daysWorked} kun</strong><br>
                   Hisoblangan: ${gross.toLocaleString()} so'm (${daysWorked} × ${emp.rate.toLocaleString()})<br>
                   Oldindan olingan summa (Avans): <strong style="color:red;">${emp.takenMoney.toLocaleString()} so'm</strong>`;
  } else {
    let dailyRate = emp.rate / 26;
    let missingDays = Math.max(0, 26 - daysWorked);
    let deduction = missingDays * dailyRate;
    let gross = Math.max(0, emp.rate - deduction);
    calculatedSalary = gross - emp.takenMoney;

    detailsText = `Oylik stavka: ${emp.rate.toLocaleString()} so'm<br>
                   1 kunlik qiymat: ${Math.round(dailyRate).toLocaleString()} so'm (26 ga bo'lingan)<br>
                   Ishlagan kunlari: ${daysWorked} | Kelmagan: ${missingDays} kun (${Math.round(deduction).toLocaleString()} so'm chegirildi)<br>
                   Oldindan olingan summa (Avans): <strong style="color:red;">${emp.takenMoney.toLocaleString()} so'm</strong>`;
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
  const note = document.getElementById('money-note').value;

  const emp = employees.find(e => e.id == empId);
  if (!emp) return alert("Xodimni tanlang!");

  let amountToAdd = 0;
  let historyTitle = '';

  if (type === 'advance') {
    amountToAdd = parseFloat(document.getElementById('adv-amount').value);
    if (!amountToAdd || amountToAdd <= 0) return alert("Summani kiriting!");
    
    emp.takenMoney += amountToAdd;
    historyTitle = `Avans berildi: ${emp.name}`;
  } else {
    const daysWorked = calculateDaysWorked(emp.id);
    let dailyRate = emp.type === 'daily' ? emp.rate : (emp.rate / 26);
    let gross = emp.type === 'daily' ? (daysWorked * emp.rate) : emp.rate;
    
    if(emp.type === 'monthly') {
      let missingDays = Math.max(0, 26 - daysWorked);
      gross = Math.max(0, emp.rate - (missingDays * dailyRate));
    }
    
    amountToAdd = Math.max(0, gross - emp.takenMoney);
    historyTitle = `Oylik yopildi: ${emp.name}`;
    
    emp.takenMoney = 0;
    // Oylik yopilgan sanani bugungi kunga qo'shamiz, shunda keyingi safar faqat shu sanadan keyingi kunlar hisoblanadi
    emp.lastSalaryDate = new Date().toISOString().split('T')[0];
  }

  historyList.unshift({
    id: Date.now(),
    empId: emp.id,
    title: historyTitle,
    amount: Math.round(amountToAdd),
    note: note || (type === 'advance' ? 'Avans' : 'Oylik yakuni'),
    date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
  });

  document.getElementById('money-form').reset();
  document.getElementById('salary-calc-preview').style.display = 'none';
  saveDataToFirebase();
  switchTab('history', document.querySelectorAll('.nav-item')[3]);
}

function openHistoryEditModal(histId) {
  const item = historyList.find(h => h.id === histId);
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
  const id = parseInt(document.getElementById('edit-hist-id').value);
  const amount = parseFloat(document.getElementById('edit-hist-amount').value);
  const note = document.getElementById('edit-hist-note').value;

  const item = historyList.find(h => h.id === id);
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
    const item = historyList.find(h => h.id === id);
    if (item && item.empId) {
      const emp = employees.find(e => e.id === item.empId);
      if (emp && item.title.includes("Avans berildi")) {
        emp.takenMoney = Math.max(0, emp.takenMoney - item.amount);
      }
    }

    historyList = historyList.filter(h => h.id !== id);
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
  renderEmployees();
  renderAttendance();
  renderHistory();
  if(document.getElementById('calendar-modal').classList.contains('active')) {
    renderCalendarModal();
  }
}

function renderEmployees() {
  const list = document.getElementById('employee-list');
  list.innerHTML = '';

  if (employees.length === 0) {
    list.innerHTML = `<p class="section-desc" style="text-align:center; padding: 20px;">Hali xodimlar qo'shilmagan.</p>`;
    return;
  }

  employees.forEach(emp => {
    const daysWorked = calculateDaysWorked(emp.id);
    list.innerHTML += `
      <div class="employee-card" onclick="openEmployeeCalendar(${emp.id})">
        <div class="emp-top">
          <span class="emp-name">${emp.name}</span>
          <span class="emp-rate-badge">${emp.rate.toLocaleString()} so'm (${emp.type === 'daily' ? 'kunlik' : 'oylik'})</span>
        </div>
        <div class="emp-details">
          <span>Ishlagan kun: <strong>${daysWorked} kun</strong></span>
          <span>Olingan avans: <strong style="color:var(--danger);">${emp.takenMoney.toLocaleString()} so'm</strong></span>
        </div>
        <div class="emp-actions" onclick="event.stopPropagation()">
          <button class="btn-sm warning" onclick="openEmpModal(${emp.id})"><i class="fa-solid fa-pen"></i> Izmenit</button>
          <button class="btn-sm danger" onclick="deleteEmployee(${emp.id})"><i class="fa-solid fa-trash"></i> O'chirish</button>
        </div>
      </div>
    `;
  });
}

function renderAttendance() {
  const list = document.getElementById('attendance-list');
  const selectedDate = document.getElementById('attendance-date').value;
  const filterEmpId = document.getElementById('attendance-filter-emp').value;
  list.innerHTML = '';

  let filteredEmps = employees;
  if (filterEmpId !== 'all') {
    filteredEmps = employees.filter(e => e.id == filterEmpId);
  }

  if (filteredEmps.length === 0) {
    list.innerHTML = `<p class="section-desc" style="text-align:center; padding: 20px;">Xodimlar topilmadi.</p>`;
    return;
  }

  const dateRecords = attendanceRecords[selectedDate] || {};

  filteredEmps.forEach(emp => {
    const status = dateRecords[emp.id];
    let statusText = 'Belgilanmagan';
    if (status === 1) statusText = 'To\'liq kun';
    else if (status === 0.5) statusText = 'Yarim kun';
    else if (status === 0) statusText = 'Kelmagan';

    list.innerHTML += `
      <div class="employee-card">
        <div class="emp-top">
          <span class="emp-name">${emp.name}</span>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${emp.type === 'daily' ? 'Kunlik' : 'Oylik'}</span>
        </div>
        <p class="section-desc" style="margin-bottom:8px;">
          Sana: <strong>${selectedDate}</strong> | Holati: <strong>${statusText}</strong>
        </p>
        <div class="attendance-actions">
          <button class="${status === 1 ? 'active-full' : ''}" onclick="setAttendanceStatus(${emp.id}, 1)">
            <i class="fa-solid fa-check"></i> To'liq (1)
          </button>
          <button class="${status === 0.5 ? 'active-half' : ''}" onclick="setAttendanceStatus(${emp.id}, 0.5)">
            <i class="fa-solid fa-star-half-stroke"></i> Yarim (0.5)
          </button>
          <button class="${status === 0 ? 'active-absent' : ''}" onclick="setAttendanceStatus(${emp.id}, 0)">
            <i class="fa-solid fa-xmark"></i> Kelmadi (0)
          </button>
        </div>
      </div>
    `;
  });
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const filterEmpId = document.getElementById('history-filter-emp') ? document.getElementById('history-filter-emp').value : 'all';
  list.innerHTML = '';

  let filteredHistory = historyList;
  if (filterEmpId !== 'all') {
    filteredHistory = historyList.filter(item => item.empId == filterEmpId);
  }

  if (filteredHistory.length === 0) {
    list.innerHTML = `<p class="section-desc" style="text-align:center; padding: 20px;">Tarix yozuvlari topilmadi.</p>`;
    return;
  }

  filteredHistory.forEach(item => {
    list.innerHTML += `
      <div class="history-card">
        <div class="history-info">
          <h4>${item.title}</h4>
          <p>${item.note} • ${item.date}</p>
          <div class="history-actions">
            <button class="btn-sm warning" onclick="openHistoryEditModal(${item.id})"><i class="fa-solid fa-pen"></i> Izmenit</button>
            <button class="btn-sm danger" onclick="deleteHistoryItem(${item.id})"><i class="fa-solid fa-trash"></i> O'chirish</button>
          </div>
        </div>
        <div class="history-amount">
          +${item.amount.toLocaleString()} so'm
        </div>
      </div>
    `;
  });
}
