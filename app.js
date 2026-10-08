// ============ KONFIGURASI ============
const API_URL = 'https://script.google.com/macros/s/AKfycbyuRZrJdryJhx-aD_W7Pyix8bIGyNMJyy3hbj9eau2C6kbkHlpy9Iluaf6AYZ4M-uUQ/exec';
let currentUser = null;
let currentLocation = null;
let selectedLocations = [];
let cameraCallback = null;
let currentPhotoBase64 = null;
let confirmCallback = null;
let pendingCount = 0;

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

// ============ HAPTIC FEEDBACK ============
function haptic(type = 'light') {
  if (navigator.vibrate) {
    const patterns = { light: 10, medium: 30, heavy: 50, success: [50, 50, 50], error: [100, 50, 100] };
    navigator.vibrate(patterns[type] || 10);
  }
}

// ============ TOAST ============
function showToast(message, type = 'success') {
  haptic(type === 'error' ? 'error' : 'light');
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
  $('loader-text').innerText = msg;
  $('global-loader').classList.add('active');
}
function hideLoading() { $('global-loader').classList.remove('active'); }

// ============ CONFIRM MODAL ============
function showConfirm(title, message, callback) {
  $('confirm-title').innerText = title;
  $('confirm-message').innerText = message;
  confirmCallback = callback;
  show('modal-confirm');
}
function closeConfirm() { hide('modal-confirm'); confirmCallback = null; }
$('confirm-yes').addEventListener('click', function() {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// ============ IMAGE ZOOM ============
function openZoom(src) {
  $('zoom-img').src = src;
  $('modal-zoom').classList.add('active');
}
function closeZoom() { $('modal-zoom').classList.remove('active'); }
$('modal-zoom').addEventListener('click', function(e) {
  if (e.target === this) closeZoom();
});

// ============ CONFETTI ============
function showConfetti() {
  const colors = ['#0d47a1', '#2e7d32', '#ffc107', '#c62828', '#00bcd4'];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 4000);
  }
}

// ============ CONNECTION STATUS ============
function updateConnectionStatus() {
  const status = $('connection-status');
  if (navigator.onLine) {
    status.className = 'online show';
    status.innerText = ' Online';
    setTimeout(() => status.classList.remove('show'), 2000);
  } else {
    status.className = 'offline show';
    status.innerText = '⚠️ Offline - Beberapa fitur tidak tersedia';
  }
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

// ============ GPS ============
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject('GPS tidak didukung perangkat ini');
    if (!navigator.onLine) return reject('Tidak ada koneksi internet');
    showToast('📡 Mengambil lokasi GPS...', 'info');
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
    haptic('success');
    showToast('Selamat datang, ' + currentUser.NamaLengkap, 'success');
    loadLocations();
  } else {
    showToast(res.message || 'Login gagal', 'error');
  }
}

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
      <div class="loc-icon">📍</div>
      <div style="flex:1;">
        <div class="name">${loc.NamaLokasi}</div>
        <div class="meta">Radius: ${loc.RadiusMeter}m</div>
      </div>
      <div style="font-size:20px;color:var(--muted);">›</div>
    `;
    item.onclick = function() {
      document.querySelectorAll('.location-item').forEach(c => c.classList.remove('selected'));
      item.classList.add('selected');
      currentLocation = loc;
      $('loc-status').innerText = '✓ Dipilih: ' + loc.NamaLokasi;
      $('loc-status').style.color = 'var(--success)';
      haptic('light');
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
      haptic('error');
      return;
    }
    $('loc-status').innerText = `✓ Valid (${Math.round(dist)}m dari lokasi)`;
    $('loc-status').style.color = 'var(--success)';
    showToast('✓ Lokasi terverifikasi', 'success');
    haptic('success');
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
  const initial = currentUser.NamaLengkap ? currentUser.NamaLengkap.charAt(0).toUpperCase() : '👤';
  $('dash-avatar').innerText = initial;
  updateTime();
  hide('page-location');
  show('page-dashboard');
  renderAbsen();
  renderPatroli();
  renderKejadian();
  renderRekap();
  renderInfo();
  renderProfil();
  loadPendingCount();
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
  if (page === 'info') { loadInfo(); loadPendingCount(); }
  window.scrollTo(0, 0);
  haptic('light');
}

// ============ LOAD PENDING COUNT ============
async function loadPendingCount() {
  if (!currentUser) return;
  try {
    const res = await api('getRequests', { UserID: currentUser.UserID });
    if (res.ok && res.data) {
      const pending = res.data.filter(r => r.Status === 'Pending').length;
      pendingCount = pending;
      const badge = $('info-badge');
      if (pending > 0) {
        badge.innerText = pending;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch(e) {}
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
            ${absenState.jamMasuk ? (absenState.jamMasuk.split(' ')[1] || absenState.jamMasuk) : 'Belum'}
          </div>
        </div>
        <div style="background:${absenState.pulang ? 'var(--success-light)' : '#f5f5f5'};padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);">PULANG</div>
          <div style="font-size:16px;font-weight:700;color:${absenState.pulang ? 'var(--success)' : 'var(--muted)'};">
            ${absenState.jamPulang ? (absenState.jamPulang.split(' ')[1] || absenState.jamPulang) : 'Belum'}
          </div>
        </div>
      </div>
      ${selesai ? `
        <div style="background:var(--success-light);padding:16px;border-radius:8px;text-align:center;color:var(--success);">
          <div style="font-size:32px;margin-bottom:8px;">✅</div>
          <div style="font-weight:700;font-size:16px;">Absensi hari ini selesai!</div>
          <div style="font-size:12px;margin-top:4px;">Terima kasih atas kerja keras Anda 🙏</div>
        </div>
      ` : `
        <button class="btn btn-success" ${canMasuk ? '' : 'disabled'} onclick="bukaKamera('masuk')">
           ABSEN MASUK (Selfie)
        </button>
        <div style="height:10px;"></div>
        <button class="btn btn-danger" ${canPulang ? '' : 'disabled'} onclick="bukaKamera('pulang')">
          🤳 ABSEN PULANG (Selfie)
        </button>
      `}
    </div>
  `;
}

// ============ KAMERA (SELFIE MODE) ============
function bukaKamera(tipe) {
  $('camera-title').innerText = tipe === 'masuk' ? '🤳 Foto Selfie - Absen Masuk' : '🤳 Foto Selfie - Absen Pulang';
  $('camera-preview').innerHTML = '<div><div class="camera-icon"></div><div class="camera-text">Tap "Ambil Selfie" untuk mulai</div></div>';
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
      haptic('success');
      showConfetti();
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

// ============ PROSES FOTO DENGAN TIMESTAMP LENGKAP ============
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
      
      // Format tanggal & waktu lengkap
      const now = new Date();
      const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
      const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
      
      const tanggalLengkap = `${hari[now.getDay()]}, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;
      const waktuLengkap = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' });
      
      const stamp = [
        '👤 ' + currentUser.NamaLengkap,
        '📅 ' + tanggalLengkap,
        '⏰ ' + waktuLengkap + ' WIB',
        ' ' + currentLocation.NamaLokasi,
        '🌐 Lat: ' + currentUser.gps.lat.toFixed(6) + ', Lng: ' + currentUser.gps.lng.toFixed(6),
        '📡 Akurasi: ' + currentUser.gps.acc + 'm'
      ];
      
      // Hitung tinggi box timestamp
      const boxHeight = 160;
      const fontSize = Math.max(18, Math.min(24, canvas.width / 30));
      
      // Background gradient hitam transparan
      const gradient = ctx.createLinearGradient(0, canvas.height - boxHeight, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.7)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - boxHeight, canvas.width, boxHeight);
      
      // Garis aksen biru di atas
      ctx.fillStyle = '#0d47a1';
      ctx.fillRect(0, canvas.height - boxHeight, canvas.width, 4);
      
      // Teks putih dengan shadow
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      const startY = canvas.height - boxHeight + 15;
      const lineHeight = fontSize + 6;
      
      stamp.forEach((line, i) => {
        ctx.fillText(line, 15, startY + (i * lineHeight));
      });
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      
      currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.85);
      $('camera-preview').innerHTML = `<img src="${currentPhotoBase64}" onclick="openZoom('${currentPhotoBase64}')" style="cursor:zoom-in;">`;
      $('btn-confirm-photo').disabled = false;
      hideLoading();
      showToast('✓ Foto selfie siap dikirim', 'success');
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
      <div class="card-title"><span class="icon"></span> Laporan Patroli</div>
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
        <div><div class="camera-icon"></div><div class="camera-text">Tap untuk foto</div></div>
      </div>
      <button class="btn btn-primary" onclick="submitPatroli()">📤 KIRIM LAPORAN PATROLI</button>
    </div>
    <div class="card">
      <div class="card-title"><span class="icon"></span> Riwayat Patroli Saya</div>
      <div id="patroli-history">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
    </div>
  `;
  loadPatroliHistory();
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
    <div class="card">
      <div class="card-title"><span class="icon">📜</span> Riwayat Kejadian</div>
      <div id="kejadian-history">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
    </div>
  `;
  loadKejadianHistory();
}

let fotoOperasional = { patroli: [null, null], kejadian: [null, null] };

function bukaKameraOperasional(jenis, idx) {
  $('camera-title').innerText = `📷 Foto Bukti ${idx} - ${jenis}`;
  $('camera-preview').innerHTML = '<div><div class="camera-icon">📷</div><div class="camera-text">Tap "Ambil Foto" untuk mulai</div></div>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = (base64) => {
    fotoOperasional[jenis][idx-1] = base64;
    const boxId = jenis === 'patroli' ? `pat-foto${idx}-box` : `kej-foto${idx}-box`;
    $(boxId).innerHTML = `<img src="${base64}" onclick="openZoom('${base64}')" style="cursor:zoom-in;">`;
    showToast('✓ Foto ' + idx + ' tersimpan', 'success');
    haptic('light');
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
    if (res.ok) {
      haptic('success');
      showToast('✓ Laporan patroli terkirim', 'success');
      renderPatroli();
      fotoOperasional.patroli = [null,null];
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
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
    if (res.ok) {
      haptic('success');
      showToast('✓ Kejadian dilaporkan', 'success');
      renderKejadian();
      fotoOperasional.kejadian = [null,null];
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
  });
}

// ============ HISTORY PATROLI & KEJADIAN ============
async function loadPatroliHistory() {
  const res = await api('adminGetAll', { type: 'patrols' });
  if (!res.ok || !res.data) {
    $('patroli-history').innerHTML = '<div class="empty-state"><div class="text">Tidak ada data</div></div>';
    return;
  }
  const myPatrols = res.data.filter(p => p.UserID === currentUser.UserID).slice(-10).reverse();
  if (myPatrols.length === 0) {
    $('patroli-history').innerHTML = '<div class="empty-state"><div class="icon">🚶</div><div class="text">Belum ada patroli</div></div>';
    return;
  }
  let html = '';
  myPatrols.forEach(p => {
    const waktu = p.Waktu ? (String(p.Waktu).split(' ')[1] || p.Waktu) : '';
    html += `
      <div class="history-item">
        <div class="header">
          <div class="title"> ${p.LokasiPatroli || '-'}</div>
          <div class="time">${p.Tanggal || ''} ${waktu}</div>
        </div>
        <div class="desc">${p.Keterangan || '-'}</div>
        <div class="photos">
          ${p.Foto1URL ? `<img src="${p.Foto1URL}" onclick="openZoom('${p.Foto1URL}')">` : ''}
          ${p.Foto2URL ? `<img src="${p.Foto2URL}" onclick="openZoom('${p.Foto2URL}')">` : ''}
        </div>
      </div>
    `;
  });
  $('patroli-history').innerHTML = html;
}

async function loadKejadianHistory() {
  const res = await api('adminGetAll', { type: 'incidents' });
  if (!res.ok || !res.data) {
    $('kejadian-history').innerHTML = '<div class="empty-state"><div class="text">Tidak ada data</div></div>';
    return;
  }
  const myKejadian = res.data.filter(i => i.UserID === currentUser.UserID).slice(-10).reverse();
  if (myKejadian.length === 0) {
    $('kejadian-history').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div class="text">Belum ada kejadian</div></div>';
    return;
  }
  let html = '';
  myKejadian.forEach(k => {
    const waktu = k.Waktu ? (String(k.Waktu).split(' ')[1] || k.Waktu) : '';
    html += `
      <div class="history-item" style="border-left-color:var(--danger);">
        <div class="header">
          <div class="title">⚠️ ${k.JenisKejadian || '-'}</div>
          <div class="time">${k.Tanggal || ''} ${waktu}</div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">📍 ${k.LokasiKejadian || '-'}</div>
        <div class="desc">${k.Kronologi || '-'}</div>
        <div class="photos">
          ${k.Foto1URL ? `<img src="${k.Foto1URL}" onclick="openZoom('${k.Foto1URL}')">` : ''}
          ${k.Foto2URL ? `<img src="${k.Foto2URL}" onclick="openZoom('${k.Foto2URL}')">` : ''}
        </div>
      </div>
    `;
  });
  $('kejadian-history').innerHTML = html;
}

// ============ REKAP ============
function renderRekap() {
  const now = new Date();
  const bulan = now.toLocaleString('id-ID', { month: 'long' });
  const tahun = now.getFullYear();
  $('content-rekap').innerHTML = `
    <div class="card">
      <div class="card-title"><span class="icon">📊</span> Rekap Absensi Bulanan</div>
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
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
    </div>
  `;
  setTimeout(() => loadRekap(), 100);
}

async function loadRekap() {
  const bulan = parseInt($('rekap-bulan').value);
  const tahun = parseInt($('rekap-tahun').value);
  $('rekap-result').innerHTML = '<div style="text-align:center;padding:20px;"><div class="loader" style="margin:0 auto;"></div></div>';
  
  const res = await api('getRekap', { UserID: currentUser.UserID, Bulan: bulan, Tahun: tahun });
  
  if (!res.ok) { 
    $('rekap-result').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div class="text">' + res.message + '</div></div>'; 
    return; 
  }
  
  if (!res.data || res.data.length === 0) {
    $('rekap-result').innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="text">Belum ada data absensi</div></div>';
    return;
  }
  
  // Hitung statistik
  let totalHadir = 0, totalIzin = 0, totalSakit = 0, totalAlpha = 0;
  res.data.forEach(r => {
    if (r.Status === 'Hadir') totalHadir++;
    else if (r.Status === 'Izin') totalIzin++;
    else if (r.Status === 'Sakit') totalSakit++;
    else if (r.Status === 'Alpha') totalAlpha++;
  });
  
  // Build calendar
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  const firstDay = new Date(tahun, bulan - 1, 1).getDay();
  const dayNames = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];
  const statusMap = {};
  res.data.forEach(r => {
    const day = new Date(r.Tanggal).getDate();
    statusMap[day] = r.Status || 'Hadir';
  });
  
  let calendarHtml = '<div class="calendar-grid">';
  dayNames.forEach(d => { calendarHtml += `<div class="calendar-day-header">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) { calendarHtml += '<div class="calendar-day empty"></div>'; }
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const status = statusMap[day];
    const isToday = (today.getDate() === day && today.getMonth() + 1 === bulan && today.getFullYear() === tahun);
    let cls = 'calendar-day';
    if (status === 'Hadir') cls += ' hadir';
    else if (status === 'Izin') cls += ' izin';
    else if (status === 'Sakit') cls += ' sakit';
    else if (status === 'Alpha') cls += ' alpha';
    if (isToday) cls += ' today';
    calendarHtml += `<div class="${cls}">${day}</div>`;
  }
  calendarHtml += '</div>';
  
  // Build table
  let html = `
    <div class="mini-stats">
      <div class="mini-stat green"><div class="label">Hadir</div><div class="value">${totalHadir}</div></div>
      <div class="mini-stat orange"><div class="label">Izin</div><div class="value">${totalIzin}</div></div>
      <div class="mini-stat"><div class="label">Sakit</div><div class="value">${totalSakit}</div></div>
      <div class="mini-stat red"><div class="label">Alpha</div><div class="value">${totalAlpha}</div></div>
    </div>
    <div style="margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:8px;">📅 Kalender Absensi</div>
      ${calendarHtml}
    </div>
    <div style="margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:8px;">📋 Detail Harian</div>
      <table>
        <tr>
          <th>Tgl</th>
          <th>Masuk</th>
          <th>Pulang</th>
          <th>Status</th>
        </tr>
  `;
  
  res.data.forEach(r => {
    html += `<tr>
      <td>${r.Tanggal}</td>
      <td>${r.JamMasuk || '-'}</td>
      <td>${r.JamPulang || '-'}</td>
      <td><span class="badge badge-approved">${r.Status || 'Hadir'}</span></td>
    </tr>`;
  });
  
  html += '</table></div>';
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
  haptic('light');
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
        <div class="total"> Total: Rp ${(data.total||0).toLocaleString()}</div>
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
    <div class="form-group"><label> Nama Pengganti</label><input type="text" id="sh-nama" placeholder="Nama rekan pengganti"></div>
    <div class="form-group"><label>📝 Keterangan</label><textarea id="sh-ket" placeholder="Alasan tukar shift..."></textarea></div>
    <button class="btn btn-primary" onclick="submitShift()">📤 AJUKAN TUKAR SHIFT</button>
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
    if (res.ok) {
      haptic('success');
      showToast('✓ Pengajuan terkirim, menunggu approval', 'success');
      renderShiftForm();
      loadPendingCount();
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
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
        <span style="font-size:12px;">📅 ${r.Tanggal}</span>
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
      <div><div class="camera-icon"></div><div class="camera-text">Tap untuk foto</div></div>
    </div>
    <button class="btn btn-primary" onclick="submitIzin()">📤 KIRIM PENGAJUAN</button>
  `;
}

let fotoIzin = null;
function bukaKameraIzin() {
  $('camera-title').innerText = '📷 Foto Bukti';
  $('camera-preview').innerHTML = '<div><div class="camera-icon">📷</div><div class="camera-text">Tap "Ambil Foto" untuk mulai</div></div>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = (base64) => {
    fotoIzin = base64;
    $('iz-foto-box').innerHTML = `<img src="${base64}" onclick="openZoom('${base64}')" style="cursor:zoom-in;">`;
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
    if (res.ok) {
      haptic('success');
      showToast('✓ Pengajuan terkirim', 'success');
      renderIzinForm();
      fotoIzin = null;
      loadPendingCount();
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
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
      <button class="btn btn-danger" onclick="logout()">🚪 LOGOUT</button>
    </div>
    <div style="text-align:center;padding:20px;color:var(--muted);font-size:11px;">
      PT Sentra Bhakti Utama<br>
      © 2026 - v1.2.0
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

// ============ EMERGENCY ACTION ============
function emergencyAction() {
  haptic('heavy');
  show('modal-emergency');
}
function closeEmergency() { hide('modal-emergency'); }
async function sendEmergency(jenis) {
  closeEmergency();
  showConfirm('⚠️ Konfirmasi Darurat', `Kirim laporan darurat "${jenis}" ke admin?`, async () => {
    showLoading('Mengirim laporan darurat...');
    const res = await api('submitKejadian', {
      UserID: currentUser.UserID,
      Jenis: 'DARURAT: ' + jenis,
      Lokasi: currentLocation.NamaLokasi,
      Kronologi: 'LAPORAN DARURAT - Mohon segera ditindaklanjuti! Waktu: ' + nowString(),
      Foto1: '', Foto2: '',
      GPS: currentUser.gps
    });
    hideLoading();
    if (res.ok) {
      haptic('success');
      showToast(' Laporan darurat terkirim ke admin!', 'error');
    } else {
      showToast(res.message || 'Gagal', 'error');
    }
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
