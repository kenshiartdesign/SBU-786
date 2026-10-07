// ============ KONFIGURASI ============
const API_URL = 'https://script.google.com/macros/s/AKfycbyuRZrJdryJhx-aD_W7Pyix8bIGyNMJyy3hbj9eau2C6kbkHlpy9Iluaf6AYZ4M-uUQ/exec';
let currentUser = null;
let currentLocation = null;
let selectedLocations = [];
let cameraCallback = null;
let currentPhotoBase64 = null;

// ============ UTIL ============
function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...data, token: localStorage.getItem('sbu_token') })
  });
  return await res.json();
}

function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject('GPS tidak didukung');
    navigator.geolocation.getCurrentPosition(
      pos => {
        // Anti GPS Fake: cek akurasi
        const acc = pos.coords.accuracy;
        if (acc > 100) return reject('Akurasi GPS terlalu rendah (' + Math.round(acc) + 'm). Pastikan GPS aktif di outdoor.');
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(acc)
        });
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

// ============ LOGIN ============
async function doLogin() {
  const u = $('login-user').value.trim();
  const p = $('login-pass').value.trim();
  if (!u || !p) { $('login-error').innerText = 'Username & password wajib diisi'; return; }
  $('login-error').innerText = 'Memproses...';
  const res = await api('login', { username: u, password: p });
  if (res.ok) {
    currentUser = res.user;
    localStorage.setItem('sbu_token', res.token);
    localStorage.setItem('sbu_user', JSON.stringify(currentUser));
    loadLocations();
  } else {
    $('login-error').innerText = res.message || 'Login gagal';
  }
}

// ============ PILIH LOKASI ============
async function loadLocations() {
  const res = await api('getLocations');
  if (!res.ok) return alert(res.message);
  selectedLocations = res.data;
  const list = $('location-list');
  list.innerHTML = '';
  res.data.forEach(loc => {
    list.innerHTML += `
      <div class="card" style="cursor:pointer;" onclick="selectLocation('${loc.LocationID}')">
        <b>${loc.NamaLokasi}</b><br>
        <small style="color:var(--muted);">Radius: ${loc.RadiusMeter}m</small>
      </div>`;
  });
  hide('page-login');
  show('page-location');
}

function selectLocation(id) {
  currentLocation = selectedLocations.find(l => l.LocationID === id);
  document.querySelectorAll('#location-list .card').forEach(c => c.style.border = '2px solid transparent');
  event.currentTarget.style.border = '2px solid var(--primary)';
  $('loc-status').innerText = 'Dipilih: ' + currentLocation.NamaLokasi;
}

async function validateLocation() {
  if (!currentLocation) return alert('Pilih lokasi dulu');
  $('loc-status').innerText = 'Memvalidasi GPS...';
  try {
    const gps = await getGPS();
    const dist = haversine(gps.lat, gps.lng, currentLocation.Latitude, currentLocation.Longitude);
    if (dist > currentLocation.RadiusMeter) {
      $('loc-status').innerText = `❌ Terlalu jauh (${Math.round(dist)}m). Max ${currentLocation.RadiusMeter}m`;
      $('loc-status').style.color = 'var(--danger)';
      return;
    }
    $('loc-status').innerText = `✓ Valid (${Math.round(dist)}m dari lokasi)`;
    $('loc-status').style.color = 'var(--success)';
    setTimeout(() => enterDashboard(gps), 800);
  } catch (e) {
    $('loc-status').innerText = '❌ ' + e;
    $('loc-status').style.color = 'var(--danger)';
  }
}

function enterDashboard(gps) {
  currentUser.gps = gps;
  $('dash-greeting').innerText = 'Halo, ' + currentUser.NamaLengkap;
  $('dash-loc').innerText = 'Lokasi: ' + currentLocation.NamaLokasi;
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
}

// ============ ABSEN ============
let absenState = { masuk: false, pulang: false, jamMasuk: null, jamPulang: null };

async function renderAbsen() {
  const res = await api('getAbsenHariIni', { UserID: currentUser.UserID });
  if (res.ok && res.data) {
    absenState = res.data;
  }
  drawAbsen();
}

function drawAbsen() {
  const canMasuk = !absenState.masuk;
  const canPulang = absenState.masuk && !absenState.pulang;
  $('content-absen').innerHTML = `
    <div class="card" style="text-align:center;">
      <h2 style="font-size:32px; color:var(--primary);">${new Date().toLocaleTimeString('id-ID')}</h2>
      <p style="color:var(--muted);">${new Date().toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</p>
    </div>
    <div class="card">
      <div style="margin-bottom:16px;">
        <b>Status Hari Ini:</b><br>
        <small>Masuk: ${absenState.jamMasuk || 'Belum'}</small><br>
        <small>Pulang: ${absenState.jamPulang || 'Belum'}</small>
      </div>
      <button class="btn btn-success" ${canMasuk?'':'disabled'} onclick="bukaKamera('masuk')">✅ ABSEN MASUK</button>
      <div style="height:10px;"></div>
      <button class="btn btn-danger" ${canPulang?'':'disabled'} onclick="bukaKamera('pulang')">🏠 ABSEN PULANG</button>
      ${!canMasuk && !canPulang ? '<p style="text-align:center; margin-top:12px; color:var(--muted); font-size:12px;">Absensi hari ini selesai ✓</p>' : ''}
    </div>`;
}

// ============ KAMERA ============
function bukaKamera(tipe) {
  $('camera-title').innerText = tipe === 'masuk' ? 'Foto Selfie - Absen Masuk' : 'Foto Selfie - Absen Pulang';
  $('camera-preview').innerHTML = '<span>Preview foto akan muncul di sini</span>';
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
      alert('✓ Absen ' + tipe + ' berhasil!');
      if (tipe === 'masuk') { absenState.masuk = true; absenState.jamMasuk = nowString(); }
      else { absenState.pulang = true; absenState.jamPulang = nowString(); }
      drawAbsen();
    } else {
      alert('❌ ' + res.message);
    }
  };
  show('modal-camera');
}

$('camera-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // Watermark
      const stamp = `${currentUser.NamaLengkap}\n${nowString()}\nLat: ${currentUser.gps.lat.toFixed(5)}, Lng: ${currentUser.gps.lng.toFixed(5)}`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, canvas.height - 90, canvas.width, 90);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px Arial';
      stamp.split('\n').forEach((line, i) => ctx.fillText(line, 10, canvas.height - 70 + i*25));
      currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
      $('camera-preview').innerHTML = `<img src="${currentPhotoBase64}">`;
      $('btn-confirm-photo').disabled = false;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function confirmPhoto() {
  if (cameraCallback && currentPhotoBase64) cameraCallback(currentPhotoBase64);
  closeCamera();
}
function closeCamera() {
  hide('modal-camera');
  $('camera-input').value = '';
}

// ============ PATROLI ============
function renderPatroli() {
  $('content-patroli').innerHTML = `
    <div class="card">
      <div class="form-group">
        <label>Lokasi Patroli</label>
        <input type="text" id="pat-lokasi" placeholder="Contoh: Area parkir belakang">
      </div>
      <div class="form-group">
        <label>Keterangan Patroli</label>
        <textarea id="pat-ket" placeholder="Kondisi area, temuan, dll"></textarea>
      </div>
      <label style="font-weight:600; font-size:13px;">Foto Bukti 1</label>
      <div class="camera-box" id="pat-foto1-box" onclick="bukaKameraOperasional('patroli', 1)"><span>Tap untuk foto</span></div>
      <label style="font-weight:600; font-size:13px;">Foto Bukti 2</label>
      <div class="camera-box" id="pat-foto2-box" onclick="bukaKameraOperasional('patroli', 2)"><span>Tap untuk foto</span></div>
      <button class="btn btn-primary" onclick="submitPatroli()">KIRIM LAPORAN PATROLI</button>
    </div>`;
}

// ============ KEJADIAN ============
function renderKejadian() {
  $('content-kejadian').innerHTML = `
    <div class="card">
      <div class="form-group">
        <label>Jenis Kejadian</label>
        <select id="kej-jenis">
          <option value="">-- Pilih --</option>
          <option>Tamu Mencurigakan</option>
          <option>Kecelakaan</option>
          <option>Kerusakan Fasilitas</option>
          <option>Pencurian</option>
          <option>Bahaya Kebakaran</option>
          <option>Lainnya</option>
        </select>
      </div>
      <div class="form-group">
        <label>Lokasi Kejadian</label>
        <input type="text" id="kej-lokasi" placeholder="Lokasi spesifik">
      </div>
      <div class="form-group">
        <label>Kronologi Kejadian</label>
        <textarea id="kej-kronologi" placeholder="Jelaskan kronologi kejadian..."></textarea>
      </div>
      <label style="font-weight:600; font-size:13px;">Foto Bukti 1</label>
      <div class="camera-box" id="kej-foto1-box" onclick="bukaKameraOperasional('kejadian', 1)"><span>Tap untuk foto</span></div>
      <label style="font-weight:600; font-size:13px;">Foto Bukti 2</label>
      <div class="camera-box" id="kej-foto2-box" onclick="bukaKameraOperasional('kejadian', 2)"><span>Tap untuk foto</span></div>
      <button class="btn btn-danger" onclick="submitKejadian()">LAPORKAN KEJADIAN</button>
    </div>`;
}

let fotoOperasional = { patroli: [null, null], kejadian: [null, null] };

function bukaKameraOperasional(jenis, idx) {
  $('camera-title').innerText = `Foto Bukti ${idx} - ${jenis}`;
  $('camera-preview').innerHTML = '<span>Preview foto akan muncul di sini</span>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = (base64) => {
    fotoOperasional[jenis][idx-1] = base64;
    const boxId = jenis === 'patroli' ? `pat-foto${idx}-box` : `kej-foto${idx}-box`;
    $(boxId).innerHTML = `<img src="${base64}">`;
  };
  show('modal-camera');
}

async function submitPatroli() {
  const lokasi = $('pat-lokasi').value.trim();
  const ket = $('pat-ket').value.trim();
  if (!lokasi || !ket || !fotoOperasional.patroli[0] || !fotoOperasional.patroli[1])
    return alert('Semua field & 2 foto wajib diisi');
  showLoading('Mengirim laporan patroli...');
  const res = await api('submitPatroli', {
    UserID: currentUser.UserID,
    Lokasi: lokasi, Keterangan: ket,
    Foto1: fotoOperasional.patroli[0], Foto2: fotoOperasional.patroli[1],
    GPS: currentUser.gps
  });
  hideLoading();
  if (res.ok) { alert('✓ Laporan patroli terkirim'); renderPatroli(); fotoOperasional.patroli = [null,null]; }
  else alert('❌ ' + res.message);
}

async function submitKejadian() {
  const jenis = $('kej-jenis').value;
  const lokasi = $('kej-lokasi').value.trim();
  const krono = $('kej-kronologi').value.trim();
  if (!jenis || !lokasi || !krono || !fotoOperasional.kejadian[0] || !fotoOperasional.kejadian[1])
    return alert('Semua field & 2 foto wajib diisi');
  showLoading('Melaporkan kejadian...');
  const res = await api('submitKejadian', {
    UserID: currentUser.UserID,
    Jenis: jenis, Lokasi: lokasi, Kronologi: krono,
    Foto1: fotoOperasional.kejadian[0], Foto2: fotoOperasional.kejadian[1],
    GPS: currentUser.gps
  });
  hideLoading();
  if (res.ok) { alert('✓ Kejadian dilaporkan'); renderKejadian(); fotoOperasional.kejadian = [null,null]; }
  else alert('❌ ' + res.message);
}

// ============ REKAP ============
function renderRekap() {
  const now = new Date();
  const bulan = now.toLocaleString('id-ID', { month: 'long' });
  const tahun = now.getFullYear();
  $('content-rekap').innerHTML = `
    <div class="card">
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
      <div id="rekap-result">Memuat...</div>
    </div>`;
}

async function loadRekap() {
  const bulan = $('rekap-bulan').value;
  const tahun = $('rekap-tahun').value;
  const res = await api('getRekap', { UserID: currentUser.UserID, Bulan: bulan, Tahun: tahun });
  if (!res.ok) return $('rekap-result').innerText = res.message;
  let html = '<table><tr><th>Tgl</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr>';
  res.data.forEach(r => {
    html += `<tr><td>${r.Tanggal}</td><td>${r.JamMasuk||'-'}</td><td>${r.JamPulang||'-'}</td><td>${r.Status||'Hadir'}</td></tr>`;
  });
  html += '</table>';
  $('rekap-result').innerHTML = html;
}

// ============ INFO ============
function renderInfo() {
  $('content-info').innerHTML = `
    <div class="card">
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button class="btn btn-primary" style="flex:1;" onclick="showInfoTab('slip')">💰 Slip Gaji</button>
        <button class="btn" style="flex:1; background:#eee;" onclick="showInfoTab('shift')">🔄 Tukar Shift</button>
        <button class="btn" style="flex:1; background:#eee;" onclick="showInfoTab('izin')">📝 Izin/Sakit</button>
      </div>
      <div id="info-tab-slip"></div>
      <div id="info-tab-shift" class="hidden"></div>
      <div id="info-tab-izin" class="hidden"></div>
    </div>`;
  showInfoTab('slip');
}

function showInfoTab(tab) {
  ['slip','shift','izin'].forEach(t => hide('info-tab-' + t));
  show('info-tab-' + tab);
  if (tab === 'slip') loadSlipGaji();
  if (tab === 'shift') renderShiftForm();
  if (tab === 'izin') renderIzinForm();
}

async function loadSlipGaji() {
  const res = await api('getSlipGaji', { UserID: currentUser.UserID });
  if (!res.ok || !res.data.length) return $('info-tab-slip').innerHTML = '<p style="color:var(--muted);">Belum ada slip gaji.</p>';
  let html = '<h3 style="margin-bottom:10px;">Slip Gaji</h3>';
  res.data.forEach(s => {
    const data = JSON.parse(s.DataGaji);
    html += `
      <div style="border:1px solid #eee; padding:10px; border-radius:8px; margin-bottom:8px;">
        <b>${s.Bulan} ${s.Tahun}</b> <span class="badge badge-approved">${s.Status}</span><br>
        <small>Gaji Pokok: Rp ${data.gaji_pokok?.toLocaleString()||0}</small><br>
        <small>Tunjangan: Rp ${data.tunjangan?.toLocaleString()||0}</small><br>
        <small>Potongan: Rp ${data.potongan?.toLocaleString()||0}</small><br>
        <b>Total: Rp ${data.total?.toLocaleString()||0}</b>
      </div>`;
  });
  $('info-tab-slip').innerHTML = html;
}

function renderShiftForm() {
  $('info-tab-shift').innerHTML = `
    <h3 style="margin-bottom:10px;">Tukar Shift</h3>
    <div class="form-group"><label>Tanggal Shift Asli</label><input type="date" id="sh-tgl1"></div>
    <div class="form-group"><label>Tanggal Pengganti</label><input type="date" id="sh-tgl2"></div>
    <div class="form-group"><label>Nama Pengganti</label><input type="text" id="sh-nama" placeholder="Nama rekan pengganti"></div>
    <div class="form-group"><label>Keterangan</label><textarea id="sh-ket"></textarea></div>
    <button class="btn btn-primary" onclick="submitShift()">AJUKAN TUKAR SHIFT</button>
    <div id="shift-history" style="margin-top:16px;"></div>`;
  loadShiftHistory();
}

async function submitShift() {
  const tgl1 = $('sh-tgl1').value, tgl2 = $('sh-tgl2').value, nama = $('sh-nama').value, ket = $('sh-ket').value;
  if (!tgl1 || !tgl2 || !nama) return alert('Lengkapi data');
  showLoading('Mengajukan...');
  const res = await api('submitRequest', {
    UserID: currentUser.UserID, Jenis: 'TukarShift',
    Keterangan: `${ket} | Tgl Asli: ${tgl1} | Tgl Pengganti: ${tgl2} | Pengganti: ${nama}`,
    TanggalShift: tgl1, NamaPengganti: nama
  });
  hideLoading();
  if (res.ok) { alert('✓ Pengajuan terkirim, menunggu approval admin'); renderShiftForm(); }
  else alert('❌ ' + res.message);
}

async function loadShiftHistory() {
  const res = await api('getRequests', { UserID: currentUser.UserID, Jenis: 'TukarShift' });
  if (!res.ok || !res.data.length) return;
  let html = '<h4 style="margin:10px 0;">Riwayat Pengajuan</h4>';
  res.data.forEach(r => {
    html += `<div style="padding:8px; border-bottom:1px solid #eee;">
      ${r.Keterangan} <span class="badge badge-${r.Status.toLowerCase()}">${r.Status}</span>
    </div>`;
  });
  $('shift-history').innerHTML = html;
}

function renderIzinForm() {
  $('info-tab-izin').innerHTML = `
    <h3 style="margin-bottom:10px;">Izin / Sakit</h3>
    <div class="form-group">
      <label>Jenis</label>
      <select id="iz-jenis"><option value="Izin">Izin</option><option value="Sakit">Sakit</option></select>
    </div>
    <div class="form-group"><label>Tanggal</label><input type="date" id="iz-tgl"></div>
    <div class="form-group"><label>Keterangan</label><textarea id="iz-ket" placeholder="Misal: Menikah / Demam / dll"></textarea></div>
    <label style="font-weight:600; font-size:13px;">Foto Bukti (Surat Dokter / Undangan)</label>
    <div class="camera-box" id="iz-foto-box" onclick="bukaKameraIzin()"><span>Tap untuk foto</span></div>
    <button class="btn btn-primary" onclick="submitIzin()">KIRAM PENGAJUAN</button>`;
}

let fotoIzin = null;
function bukaKameraIzin() {
  $('camera-title').innerText = 'Foto Bukti';
  $('camera-preview').innerHTML = '<span>Preview foto akan muncul di sini</span>';
  $('btn-confirm-photo').disabled = true;
  currentPhotoBase64 = null;
  cameraCallback = (base64) => {
    fotoIzin = base64;
    $('iz-foto-box').innerHTML = `<img src="${base64}">`;
  };
  show('modal-camera');
}

async function submitIzin() {
  const jenis = $('iz-jenis').value, tgl = $('iz-tgl').value, ket = $('iz-ket').value;
  if (!tgl || !ket || !fotoIzin) return alert('Lengkapi data & foto bukti');
  showLoading('Mengirim...');
  const res = await api('submitRequest', {
    UserID: currentUser.UserID, Jenis: jenis,
    Keterangan: ket, FotoBukti: fotoIzin, TanggalShift: tgl
  });
  hideLoading();
  if (res.ok) { alert('✓ Pengajuan terkirim'); renderIzinForm(); fotoIzin = null; }
  else alert('❌ ' + res.message);
}

// ============ PROFIL ============
function renderProfil() {
  $('content-profil').innerHTML = `
    <div class="card" style="text-align:center;">
      <img src="${currentUser.FotoURL || 'https://via.placeholder.com/100'}" style="width:100px; height:100px; border-radius:50%; object-fit:cover;">
      <h2 style="margin-top:12px;">${currentUser.NamaLengkap}</h2>
      <p style="color:var(--muted);">${currentUser.Username}</p>
    </div>
    <div class="card">
      <p><b>📍 Alamat:</b><br>${currentUser.Alamat}</p>
      <hr style="margin:10px 0;">
      <p><b>📞 No. Telp:</b> ${currentUser.NoTelp}</p>
      <hr style="margin:10px 0;">
      <p><b>📧 Email:</b> ${currentUser.Email}</p>
    </div>
    <div class="card">
      <button class="btn btn-danger" onclick="logout()">🚪 LOGOUT</button>
    </div>`;
}

function logout() {
  if (!confirm('Yakin logout?')) return;
  localStorage.clear();
  location.reload();
}

// ============ LOADER ============
let loaderEl = null;
function showLoading(msg) {
  loaderEl = document.createElement('div');
  loaderEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2000;display:flex;align-items:center;justify-content:center;color:#fff;flex-direction:column;';
  loaderEl.innerHTML = `<div class="loader"></div><p style="margin-top:10px;">${msg}</p>`;
  document.body.appendChild(loaderEl);
}
function hideLoading() { if (loaderEl) loaderEl.remove(); }

// ============ INIT ============
window.addEventListener('load', () => {
  const saved = localStorage.getItem('sbu_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    loadLocations();
  }
});
