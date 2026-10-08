// ============ KONFIGURASI ============
const API_URL = 'https://script.google.com/macros/s/AKfycbyuRZrJdryJhx-aD_W7Pyix8bIGyNMJyy3hbj9eau2C6kbkHlpy9Iluaf6AYZ4M-uUQ/exec';
let currentUser = null;
let currentLocation = null;
let selectedLocations = [];
let cameraCallback = null;
let currentPhotoBase64 = null;
let confirmCallback = null;

// ============ UTIL ============
function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

async function api(action, data = {}) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data, token: localStorage.getItem('sbu_token') })
    });
    return await res.json();
  } catch(e) {
    showToast('Koneksi gagal: ' + e.message, 'error');
    return { ok: false, message: e.message };
  }
}

// ============ TOAST ============
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || '✓'}</span><span>${message}</span>`;
  $('toast-container').appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============ LOADER ============
function showLoading(msg = 'Memproses...') {
  const loader = $('global-loader');
  loader.querySelector('p').innerText = msg;
  loader.classList.add('active');
}
function hideLoading() { $('global-loader').classList.remove('active'); }

// ============ CONFIRM MODAL ============
function showConfirm(title, message, callback) {
  $('confirm-title').innerText = title;
  $('confirm-message').innerText = message;
  confirmCallback = callback;
  show('modal-confirm');
}
function closeConfirm() {
  hide('modal-confirm');
  confirmCallback = null;
}
$('confirm-yes').addEventListener('click', function() {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// ============ GPS ============
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject('GPS tidak didukung perangkat ini');
    showToast('Mengambil lokasi GPS...', 'info');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const acc = pos.coords.accuracy;
        if (acc > 100) return reject('Akurasi GPS terlalu rendah (' + Math.round(acc) + 'm). Pastikan GPS aktif di outdoor.');
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(acc) });
      },
      err => reject('Gagal ambil GPS: ' + err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function haversine(lat1, lon1, lat2, lon2, R = 6371000) {
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nowString() {
  const d = new Date();
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function updateTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const el = $('dash-time');
  if (el) el.innerText = timeStr + ' • ' + dateStr;
}
setInterval(updateTime, 1000);

// ============ LOGIN ============
async function doLogin() {
  const u = $('login-user').value.trim();
  const p = $('login-pass').value.trim();
  if (!u || !p) { showToast('Username & password wajib diisi', 'warning'); return; }
  showLoading('Memverifikasi...');
  const res = await api('login', { username: u, password: p });
  hideLoading();
  if (res.ok) {
    currentUser = res.user;
    localStorage.setItem('sbu_token', res.token);
    localStorage.setItem('sbu_user', JSON.stringify(currentUser));
    showToast('Selamat datang, ' + currentUser.NamaLengkap, 'success');
    loadLocations();
  } else {
    showToast(res.message || 'Login gagal', 'error');
  }
}

// Enter key untuk login
document.addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && !$('page-login').classList.contains('hidden')) {
    doLogin();
  }
});

// ============ PILIH LOKASI ============
async function loadLocations() {
  showLoading('Memuat lokasi...');
  const res = await api('getLocations');
  hideLoading();
  if (!res.ok) { showToast(res.message, 'error'); return; }
  selectedLocations = res.data;
  const list = $('location-list');
  list.innerHTML = '';
  if (res.data.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon">📍</div><div class="text">Belum ada lokasi terdaftar</div></div>';
    return;
  }
  res.data.forEach(loc => {
    const item = document.createElement('div');
    item.className = 'location-item';
    item.innerHTML = `
      <div class="name"> ${loc.NamaLokasi}</div>
      <div class="meta">Radius: ${loc.RadiusMeter}m</div>
    `;
    item.onclick = function() {
      document.querySelectorAll('.location-item').forEach(c => c.classList.remove('selected'));
      item.classList.add('selected');
      currentLocation = loc;
      $('loc-status').innerText = '✓ Dipilih: ' + loc.NamaLokasi;
      $('loc-status').style.color = 'var(--success)';
    };
    list.appendChild(item);
  });
  hide('page-login');
  show('page-location');
}

async function validateLocation() {
  if (!currentLocation) { showToast('Pilih lokasi terlebih dahulu', 'warning'); return; }
  $('loc-status').innerText = '📡 Memvalidasi GPS...';
  $('loc-status').style.color = 'var(--primary)';
  try {
    const gps = await getGPS();
    const dist = haversine(gps.lat, gps.lng, currentLocation.Latitude, currentLocation.Longitude);
    if (dist > currentLocation.RadiusMeter) {
      $('loc-status').innerText = `❌ Terlalu jauh (${Math.round(dist)}m). Max ${currentLocation.RadiusMeter}m`;
      $('loc-status').style.color = 'var(--danger)';
      showToast('Anda berada di luar radius lokasi', 'error');
      return;
    }
    $('loc-status').innerText = `✓ Valid (${Math.round(dist)}m dari lokasi)`;
    $('loc-status').style.color = 'var(--success)';
    showToast('Lokasi terverifikasi', 'success');
    setTimeout(() => enterDashboard(gps), 500);
  } catch (e) {
    $('loc-status').innerText = '❌ ' + e;
    $('loc-status').style.color = 'var(--danger)';
    showToast(e, 'error');
  }
}

function enterDashboard(gps) {
  currentUser.gps = gps;
  $('dash-greeting').innerText = 'Halo, ' + currentUser.NamaLengkap.split(' ')[0] + '! 👋';
  $('dash-loc').innerText = '📍 ' + currentLocation.NamaLokasi;
  $('dash-user').innerText = currentUser.NamaLengkap;
  updateTime();
  hide('page-location');
  show('page-dashboard');
  renderAbsen();
  renderPatroli();
  renderKejadian();
  renderRekap();
  renderInfo();
  renderProfil();
}

// ============ NAVIGASI ============
function switchPage(page) {
  ['absen','patroli','kejadian','rekap','info','profil'].forEach(p => {
    hide('content-' + p);
    document.querySelector(`.nav-item[data-page="${p}"]`).classList.remove('active');
  });
  show('content-' + page);
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  if (page === 'rekap') loadRekap();
  if (page === 'info') loadInfo();
  window.scrollTo(0, 0);
}

// ============ ABSEN ============
let absenState = { masuk: false, pulang: false, jamMasuk: null, jamPulang: null };

async function renderAbsen() {
  showLoading('Memuat status absen...');
  const res = await api('getAbsenHariIni', { UserID: currentUser.UserID });
  hideLoading();
  if (res.ok && res.data) absenState = res.data;
  drawAbsen();
}

function drawAbsen() {
  const canMasuk = !absenState.masuk;
  const canPulang = absenState.masuk && !absenState.pulang;
  const selesai = !canMasuk && !canPulang;
  
  $('content-absen').innerHTML = `
    <div class="stat-card">
      <div class="label">Waktu Sekarang</div>
      <div class="value">${new Date().toLocaleTimeString('id-ID')}</div>
      <div class="sub">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="icon">📋</span> Status Hari Ini</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:${absenState.masuk ? 'var(--success-light)' : '#f5f5f5'};padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);">MASUK</div>
          <div style="font-size:16px;font-weight:700;color:${absenState.masuk ? 'var(--success)' : 'var(--muted)'};">
            ${absenState.jamMasuk ? absenState.jamMasuk.split(' ')[1] || absenState.jamMasuk : 'Belum'}
          </div>
        </div>
        <div style="background:${absenState.pulang ? 'var(--success-light)' : '#f5f5f5'};padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);">PULANG</div>
          <div style="font-size:16px;font-weight:700;color:${absenState.pulang ? 'var(--success)' : 'var(--muted)'};">
            ${absenState.jamPulang ? absenState.jamPulang.split(' ')[1] || absenState.jamPulang : 'Belum'}
          </div>
        </div>
      </div>
      ${selesai ? `
        <div style="background:var(--success-light);padding:16px;border-radius:8px;text-align:center;color:var(--success);">
          <div style="font-size:24px;margin-bottom:8px;">✅</div>
          <div style="font-weight:600;">Absensi hari ini selesai</div>
          <div style="font-size:12px;margin-top:4px;">Terima kasih atas kerja keras Anda!</div>
        </div>
      ` : `
        <button class="btn btn-success" ${canMasuk ? '' : 'disabled'} onclick="bukaKamera('masuk')">
          ✅ ABSEN MASUK
        </button>
        <div style="height:10px;"></div>
        <button class="btn btn-danger" ${canPulang ? '' : 'disabled'} onclick="bukaKamera('pulang')">
          🏠 ABSEN PULANG
        </button>
      `}
    </div>
  `;
}

// ============ KAMERA ============
function bukaKamera(tipe) {
  $('camera-title').innerText = tipe === 'masuk' ? '📷 Foto Selfie - Absen Masuk' : '📷 Foto Selfie - Absen Pulang';
  $('camera-preview').innerHTML = '<div><div class="camera-icon"></div><div class="camera-text">Tap "Ambil Foto" untuk mulai</div></div>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = async (base64) => {
    showLoading('Mengirim absensi...');
    const gps = currentUser.gps;
    const res = await api('submitAbsensi', {
      UserID: currentUser.UserID,
      LocationID: currentLocation.LocationID,
      Tipe: tipe,
      FotoBase64: base64,
      GPS: gps
    });
    hideLoading();
    if (res.ok) {
      showToast('✓ Absen ' + tipe + ' berhasil!', 'success');
      if (tipe === 'masuk') { absenState.masuk = true; absenState.jamMasuk = nowString(); }
      else { absenState.pulang = true; absenState.jamPulang = nowString(); }
      drawAbsen();
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
  };
  show('modal-camera');
}

$('camera-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showLoading('Memproses foto...');
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const stamp = `${currentUser.NamaLengkap}\n${nowString()}\n📍 ${currentLocation.NamaLokasi}\nLat: ${currentUser.gps.lat.toFixed(5)}, Lng: ${currentUser.gps.lng.toFixed(5)}`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, canvas.height - 110, canvas.width, 110);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px Arial';
      stamp.split('\n').forEach((line, i) => ctx.fillText(line, 12, canvas.height - 85 + i*26));
      currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
      $('camera-preview').innerHTML = `<img src="${currentPhotoBase64}">`;
      $('btn-confirm-photo').disabled = false;
      hideLoading();
      showToast('Foto siap dikirim', 'success');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function confirmPhoto() {
  if (cameraCallback && currentPhotoBase64) cameraCallback(currentPhotoBase64);
  closeCamera();
}
function closeCamera() { hide('modal-camera'); $('camera-input').value = ''; }

// ============ PATROLI ============
function renderPatroli() {
  $('content-patroli').innerHTML = `
    <div class="card">
      <div class="card-title"><span class="icon">🚶</span> Laporan Patroli</div>
      <div class="form-group">
        <label>📍 Lokasi Patroli</label>
        <input type="text" id="pat-lokasi" placeholder="Contoh: Area parkir belakang">
      </div>
      <div class="form-group">
        <label>📝 Keterangan Patroli</label>
        <textarea id="pat-ket" placeholder="Kondisi area, temuan, dll"></textarea>
      </div>
      <label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block;">📷 Foto Bukti 1</label>
      <div class="camera-box" id="pat-foto1-box" onclick="bukaKameraOperasional('patroli', 1)">
        <div><div class="camera-icon">📷</div><div class="camera-text">Tap untuk foto</div></div>
      </div>
      <label style="font-weight:600;font-size:13px;margin:12px 0 8px;display:block;">📷 Foto Bukti 2</label>
      <div class="camera-box" id="pat-foto2-box" onclick="bukaKameraOperasional('patroli', 2)">
        <div><div class="camera-icon">📷</div><div class="camera-text">Tap untuk foto</div></div>
      </div>
      <button class="btn btn-primary" onclick="submitPatroli()">📤 KIRIM LAPORAN PATROLI</button>
    </div>
  `;
}

// ============ KEJADIAN ============
function renderKejadian() {
  $('content-kejadian').innerHTML = `
    <div class="card">
      <div class="card-title"><span class="icon">⚠️</span> Laporan Kejadian</div>
      <div class="form-group">
        <label>🏷️ Jenis Kejadian</label>
        <select id="kej-jenis">
          <option value="">-- Pilih Jenis --</option>
          <option>Tamu Mencurigakan</option>
          <option>Kecelakaan</option>
          <option>Kerusakan Fasilitas</option>
          <option>Pencurian</option>
          <option>Bahaya Kebakaran</option>
          <option>Pertengkaran</option>
          <option>Lainnya</option>
        </select>
      </div>
      <div class="form-group">
        <label>📍 Lokasi Kejadian</label>
        <input type="text" id="kej-lokasi" placeholder="Lokasi spesifik">
      </div>
      <div class="form-group">
        <label>📝 Kronologi Kejadian</label>
        <textarea id="kej-kronologi" placeholder="Jelaskan kronologi kejadian secara detail..."></textarea>
      </div>
      <label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block;">📷 Foto Bukti 1</label>
      <div class="camera-box" id="kej-foto1-box" onclick="bukaKameraOperasional('kejadian', 1)">
        <div><div class="camera-icon">📷</div><div class="camera-text">Tap untuk foto</div></div>
      </div>
      <label style="font-weight:600;font-size:13px;margin:12px 0 8px;display:block;">📷 Foto Bukti 2</label>
      <div class="camera-box" id="kej-foto2-box" onclick="bukaKameraOperasional('kejadian', 2)">
        <div><div class="camera-icon"></div><div class="camera-text">Tap untuk foto</div></div>
      </div>
      <button class="btn btn-danger" onclick="submitKejadian()">🚨 LAPORKAN KEJADIAN</button>
    </div>
  `;
}

let fotoOperasional = { patroli: [null, null], kejadian: [null, null] };

function bukaKameraOperasional(jenis, idx) {
  $('camera-title').innerText = `📷 Foto Bukti ${idx} - ${jenis}`;
  $('camera-preview').innerHTML = '<div><div class="camera-icon"></div><div class="camera-text">Tap "Ambil Foto" untuk mulai</div></div>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = (base64) => {
    fotoOperasional[jenis][idx-1] = base64;
    const boxId = jenis === 'patroli' ? `pat-foto${idx}-box` : `kej-foto${idx}-box`;
    $(boxId).innerHTML = `<img src="${base64}">`;
    showToast('✓ Foto ' + idx + ' tersimpan', 'success');
  };
  show('modal-camera');
}

async function submitPatroli() {
  const lokasi = $('pat-lokasi').value.trim();
  const ket = $('pat-ket').value.trim();
  if (!lokasi || !ket) { showToast('Lokasi & keterangan wajib diisi', 'warning'); return; }
  if (!fotoOperasional.patroli[0] || !fotoOperasional.patroli[1]) { showToast('2 foto bukti wajib diisi', 'warning'); return; }
  showConfirm('Kirim Laporan', 'Kirim laporan patroli ini?', async () => {
    showLoading('Mengirim laporan patroli...');
    const res = await api('submitPatroli', {
      UserID: currentUser.UserID, Lokasi: lokasi, Keterangan: ket,
      Foto1: fotoOperasional.patroli[0], Foto2: fotoOperasional.patroli[1], GPS: currentUser.gps
    });
    hideLoading();
    if (res.ok) { showToast('✓ Laporan patroli terkirim', 'success'); renderPatroli(); fotoOperasional.patroli = [null,null]; }
    else showToast(res.message || 'Gagal', 'error');
  });
}

async function submitKejadian() {
  const jenis = $('kej-jenis').value;
  const lokasi = $('kej-lokasi').value.trim();
  const krono = $('kej-kronologi').value.trim();
  if (!jenis || !lokasi || !krono) { showToast('Lengkapi semua field', 'warning'); return; }
  if (!fotoOperasional.kejadian[0] || !fotoOperasional.kejadian[1]) { showToast('2 foto bukti wajib diisi', 'warning'); return; }
  showConfirm('Laporkan Kejadian', 'Laporkan kejadian ini ke admin?', async () => {
    showLoading('Melaporkan kejadian...');
    const res = await api('submitKejadian', {
      UserID: currentUser.UserID, Jenis: jenis, Lokasi: lokasi, Kronologi: krono,
      Foto1: fotoOperasional.kejadian[0], Foto2: fotoOperasional.kejadian[1], GPS: currentUser.gps
    });
    hideLoading();
    if (res.ok) { showToast('✓ Kejadian dilaporkan', 'success'); renderKejadian(); fotoOperasional.kejadian = [null,null]; }
    else showToast(res.message || 'Gagal', 'error');
  });
}

// ============ REKAP ============
function renderRekap() {
  const now = new Date();
  const bulan = now.toLocaleString('id-ID', { month: 'long' });
  const tahun = now.getFullYear();
  $('content-rekap').innerHTML = `
    <div class="card">
      <div class="card-title"><span class="icon"></span> Rekap Absensi Bulanan</div>
      <div class="form-group">
        <label>Pilih Bulan</label>
        <select id="rekap-bulan" onchange="loadRekap()">
          ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
            .map((b,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Tahun</label>
        <input type="number" id="rekap-tahun" value="${tahun}" onchange="loadRekap()">
      </div>
      <div id="rekap-result">
        <div class="empty-state"><div class="icon">📊</div><div class="text">Pilih bulan untuk melihat rekap</div></div>
      </div>
    </div>
  `;
  setTimeout(() => loadRekap(), 100);
}

async function loadRekap() {
  const bulan = $('rekap-bulan').value;
  const tahun = $('rekap-tahun').value;
  $('rekap-result').innerHTML = '<div style="text-align:center;padding:20px;"><div class="loader" style="margin:0 auto;"></div></div>';
  const res = await api('getRekap', { UserID: currentUser.UserID, Bulan: bulan, Tahun: tahun });
  if (!res.ok) { $('rekap-result').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div class="text">' + res.message + '</div></div>'; return; }
  if (!res.data || res.data.length === 0) {
    $('rekap-result').innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="text">Belum ada data absensi</div></div>';
    return;
  }
  let totalHadir = 0;
  let html = '<table><tr><th>Tgl</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr>';
  res.data.forEach(r => {
    if (r.Status === 'Hadir') totalHadir++;
    html += `<tr><td>${r.Tanggal}</td><td>${r.JamMasuk||'-'}</td><td>${r.JamPulang||'-'}</td><td><span class="badge badge-approved">${r.Status||'Hadir'}</span></td></tr>`;
  });
  html += '</table>';
  html += `<div style="margin-top:12px;padding:12px;background:var(--primary-light);border-radius:8px;text-align:center;">
    <div style="font-size:12px;color:var(--muted);">Total Hari Kerja</div>
    <div style="font-size:24px;font-weight:700;color:var(--primary);">${totalHadir} hari</div>
  </div>`;
  $('rekap-result').innerHTML = html;
}

// ============ INFO ============
function renderInfo() {
  $('content-info').innerHTML = `
    <div class="card">
      <div class="card-title"><span class="icon">ℹ️</span> Informasi</div>
      <div class="tab-buttons">
        <button class="tab-btn active" onclick="showInfoTab('slip', this)">💰 Slip Gaji</button>
        <button class="tab-btn" onclick="showInfoTab('shift', this)">🔄 Tukar Shift</button>
        <button class="tab-btn" onclick="showInfoTab('izin', this)">📝 Izin/Sakit</button>
      </div>
      <div id="info-tab-slip"></div>
      <div id="info-tab-shift" class="hidden"></div>
      <div id="info-tab-izin" class="hidden"></div>
    </div>
  `;
  showInfoTab('slip', document.querySelector('.tab-btn'));
}

function showInfoTab(tab, btn) {
  ['slip','shift','izin'].forEach(t => hide('info-tab-' + t));
  show('info-tab-' + tab);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'slip') loadSlipGaji();
  if (tab === 'shift') renderShiftForm();
  if (tab === 'izin') renderIzinForm();
}

async function loadSlipGaji() {
  $('info-tab-slip').innerHTML = '<div style="text-align:center;padding:20px;"><div class="loader" style="margin:0 auto;"></div></div>';
  const res = await api('getSlipGaji', { UserID: currentUser.UserID });
  if (!res.ok || !res.data || res.data.length === 0) {
    $('info-tab-slip').innerHTML = '<div class="empty-state"><div class="icon">💰</div><div class="text">Belum ada slip gaji</div></div>';
    return;
  }
  let html = '';
  res.data.forEach(s => {
    let data = {};
    try { data = JSON.parse(s.DataGaji); } catch(e) {}
    html += `
      <div class="slip-item">
        <div class="header">
          <b>📅 ${s.Bulan} ${s.Tahun}</b>
          <span class="badge badge-approved">${s.Status}</span>
        </div>
        <div style="font-size:13px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Gaji Pokok</span><span>Rp ${(data.gaji_pokok||0).toLocaleString()}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Tunjangan</span><span style="color:var(--success);">+Rp ${(data.tunjangan||0).toLocaleString()}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Potongan</span><span style="color:var(--danger);">-Rp ${(data.potongan||0).toLocaleString()}</span></div>
        </div>
        <div class="total">Total: Rp ${(data.total||0).toLocaleString()}</div>
      </div>
    `;
  });
  $('info-tab-slip').innerHTML = html;
}

function renderShiftForm() {
  $('info-tab-shift').innerHTML = `
    <h3 style="margin-bottom:10px;color:var(--primary);">🔄 Tukar Shift</h3>
    <div class="form-group"><label>📅 Tanggal Shift Asli</label><input type="date" id="sh-tgl1"></div>
    <div class="form-group"><label>📅 Tanggal Pengganti</label><input type="date" id="sh-tgl2"></div>
    <div class="form-group"><label>👤 Nama Pengganti</label><input type="text" id="sh-nama" placeholder="Nama rekan pengganti"></div>
    <div class="form-group"><label>📝 Keterangan</label><textarea id="sh-ket" placeholder="Alasan tukar shift..."></textarea></div>
    <button class="btn btn-primary" onclick="submitShift()"> AJUKAN TUKAR SHIFT</button>
    <div id="shift-history" style="margin-top:16px;"></div>
  `;
  loadShiftHistory();
}

async function submitShift() {
  const tgl1 = $('sh-tgl1').value, tgl2 = $('sh-tgl2').value, nama = $('sh-nama').value, ket = $('sh-ket').value;
  if (!tgl1 || !tgl2 || !nama) { showToast('Lengkapi data wajib', 'warning'); return; }
  showConfirm('Ajukan Tukar Shift', 'Kirim pengajuan tukar shift ini?', async () => {
    showLoading('Mengajukan...');
    const res = await api('submitRequest', {
      UserID: currentUser.UserID, Jenis: 'TukarShift',
      Keterangan: `${ket} | Tgl Asli: ${tgl1} | Tgl Pengganti: ${tgl2} | Pengganti: ${nama}`,
      TanggalShift: tgl1, NamaPengganti: nama
    });
    hideLoading();
    if (res.ok) { showToast('✓ Pengajuan terkirim, menunggu approval', 'success'); renderShiftForm(); }
    else showToast(res.message || 'Gagal', 'error');
  });
}

async function loadShiftHistory() {
  const res = await api('getRequests', { UserID: currentUser.UserID, Jenis: 'TukarShift' });
  if (!res.ok || !res.data || res.data.length === 0) {
    $('shift-history').innerHTML = '<div class="empty-state" style="padding:20px;"><div class="text">Belum ada pengajuan</div></div>';
    return;
  }
  let html = '<h4 style="margin:10px 0;color:var(--primary);"> Riwayat Pengajuan</h4>';
  res.data.forEach(r => {
    html += `<div class="slip-item">
      <div class="header">
        <span style="font-size:12px;">${r.Tanggal}</span>
        <span class="badge badge-${r.Status.toLowerCase()}">${r.Status}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);">${r.Keterangan}</div>
    </div>`;
  });
  $('shift-history').innerHTML = html;
}

function renderIzinForm() {
  $('info-tab-izin').innerHTML = `
    <h3 style="margin-bottom:10px;color:var(--primary);">📝 Izin / Sakit</h3>
    <div class="form-group">
      <label>🏷️ Jenis</label>
      <select id="iz-jenis"><option value="Izin">Izin</option><option value="Sakit">Sakit</option></select>
    </div>
    <div class="form-group"><label>📅 Tanggal</label><input type="date" id="iz-tgl"></div>
    <div class="form-group"><label>📝 Keterangan</label><textarea id="iz-ket" placeholder="Misal: Menikah / Demam / dll"></textarea></div>
    <label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block;">📷 Foto Bukti (Surat Dokter / Undangan)</label>
    <div class="camera-box" id="iz-foto-box" onclick="bukaKameraIzin()">
      <div><div class="camera-icon">📷</div><div class="camera-text">Tap untuk foto</div></div>
    </div>
    <button class="btn btn-primary" onclick="submitIzin()">📤 KIRIM PENGAJUAN</button>
  `;
}

let fotoIzin = null;
function bukaKameraIzin() {
  $('camera-title').innerText = ' Foto Bukti';
  $('camera-preview').innerHTML = '<div><div class="camera-icon"></div><div class="camera-text">Tap "Ambil Foto" untuk mulai</div></div>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = (base64) => {
    fotoIzin = base64;
    $('iz-foto-box').innerHTML = `<img src="${base64}">`;
    showToast('✓ Foto bukti tersimpan', 'success');
  };
  show('modal-camera');
}

async function submitIzin() {
  const jenis = $('iz-jenis').value, tgl = $('iz-tgl').value, ket = $('iz-ket').value;
  if (!tgl || !ket) { showToast('Lengkapi data', 'warning'); return; }
  if (!fotoIzin) { showToast('Foto bukti wajib diisi', 'warning'); return; }
  showConfirm('Kirim Pengajuan', 'Kirim pengajuan ' + jenis + ' ini?', async () => {
    showLoading('Mengirim...');
    const res = await api('submitRequest', {
      UserID: currentUser.UserID, Jenis: jenis,
      Keterangan: ket, FotoBukti: fotoIzin, TanggalShift: tgl
    });
    hideLoading();
    if (res.ok) { showToast('✓ Pengajuan terkirim', 'success'); renderIzinForm(); fotoIzin = null; }
    else showToast(res.message || 'Gagal', 'error');
  });
}

// ============ PROFIL ============
function renderProfil() {
  const initial = currentUser.NamaLengkap ? currentUser.NamaLengkap.charAt(0).toUpperCase() : '👤';
  $('content-profil').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${initial}</div>
      <div class="profile-name">${currentUser.NamaLengkap}</div>
      <div class="profile-username">@${currentUser.Username}</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="icon">📍</span> Informasi Pribadi</div>
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:11px;color:var(--muted);">ALAMAT</div>
        <div style="font-size:14px;">${currentUser.Alamat || '-'}</div>
      </div>
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:11px;color:var(--muted);">NO. TELEPON</div>
        <div style="font-size:14px;">${currentUser.NoTelp || '-'}</div>
      </div>
      <div style="padding:8px 0;">
        <div style="font-size:11px;color:var(--muted);">EMAIL</div>
        <div style="font-size:14px;">${currentUser.Email || '-'}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span class="icon">ℹ️</span> Informasi Akun</div>
      <div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:11px;color:var(--muted);">USER ID</div>
        <div style="font-size:14px;font-family:monospace;">${currentUser.UserID}</div>
      </div>
      <div style="padding:8px 0;">
        <div style="font-size:11px;color:var(--muted);">ROLE</div>
        <div style="font-size:14px;"><span class="badge badge-info">${currentUser.Role}</span></div>
      </div>
    </div>
    <div class="card">
      <button class="btn btn-danger" onclick="logout()"> LOGOUT</button>
    </div>
    <div style="text-align:center;padding:20px;color:var(--muted);font-size:11px;">
      PT Sentra Bhakti Utama<br>
      © 2026 - v1.0.0
    </div>
  `;
}

function logout() {
  showConfirm('Logout', 'Yakin ingin keluar dari aplikasi?', () => {
    localStorage.clear();
    showToast('Berhasil logout', 'info');
    setTimeout(() => location.reload(), 500);
  });
}

// ============ INIT ============
window.addEventListener('load', () => {
  const saved = localStorage.getItem('sbu_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      loadLocations();
    } catch(e) {
      localStorage.clear();
    }
  }
});
