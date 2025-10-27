/* script.js
   Tam izah: Bu faylda UI, validasiya, localStorage sessiya izləmə,
   weighted random seçici, canvas-based wheel render, animation və
   Google Apps Script ilə POST (check və log) funksiyaları var.
*/

/* ===========================
   CONFIG - dəyişdirin burada
   =========================== */
const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbyp4frCQQuMwmVIodWe8uTZSUMrXGt51j6Mc2QqCdsno4Z9afTvUZUFSBmvIgAKXtDGbg/exec"; // <<-- burada Apps Script URL yerləşdirin

/* ===========================
   Qlobal DOM referansları
   =========================== */
const form = document.getElementById('entryForm');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const submitBtn = document.getElementById('submitBtn');

const wheelWrap = document.getElementById('wheelWrap');
const wheelCanvas = document.getElementById('wheelCanvas');
const spinBtn = document.getElementById('spinBtn');

const historyList = document.getElementById('historyList');

const resultModal = document.getElementById('resultModal');
const resultGiftEl = document.getElementById('resultGift');
const resultTierEl = document.getElementById('resultTier');
const resultInstructions = document.getElementById('resultInstructions');
const closeModal = document.getElementById('closeModal');
const modalOk = document.getElementById('modalOk');
const shareCTA = document.getElementById('shareCTA');
const shareBtn = document.getElementById('shareBtn');
const resultTitle = document.getElementById('resultTitle');

/* ===========================
   Hədiyyə strukturu və ehtimallar
   =========================== */

/* Hər hədiyyə obyekti:
   { id, name, tier, weight } - weight faizlər əsasında ağırlıq üçün istifadə olunur.
   E bütövlükdə ilk spin üçün məhdudlaşdırılıb; sonrakı spinlərdə E daxil edilməyəcək.
*/

const GIFTS = [
  // A Tier (0.05%)
  { id: 'A1', name: 'Ödənişsiz Hədiyyə', tier: 'A', weight: 0.05 },

  // B Tier (total 4.95%, 10 items each 0.495%)
  { id: 'B1', name: '15 AZN Endirim', tier: 'B', weight: 0.495 },
  { id: 'B2', name: 'La Coste Qolbaq', tier: 'B', weight: 0.495 },
  { id: 'B3', name: 'La Coste Parfüm', tier: 'B', weight: 0.495 },
  { id: 'B4', name: 'Qalstuk Dəsti', tier: 'B', weight: 0.495 },
  { id: 'B5', name: 'Armani Parfüm', tier: 'B', weight: 0.495 },
  { id: 'B6', name: 'Hermes Qalstuk', tier: 'B', weight: 0.495 },
  { id: 'B7', name: 'Premium Kəmər', tier: 'B', weight: 0.495 },
  { id: 'B8', name: 'Premium Kaşelok', tier: 'B', weight: 0.495 },
  { id: 'B9', name: 'Təsbeh', tier: 'B', weight: 0.495 },
  { id: 'B10', name: 'Qələm', tier: 'B', weight: 0.495 },

  // C Tier (70% total, 5 items 14% each)
  { id: 'C1', name: '5 AZN Endirim', tier: 'C', weight: 14 },
  { id: 'C2', name: 'Kaşelok', tier: 'C', weight: 14 },
  { id: 'C3', name: 'Kəmər', tier: 'C', weight: 14 },
  { id: 'C4', name: 'Qolbaq', tier: 'C', weight: 14 },
  { id: 'C5', name: 'Saat', tier: 'C', weight: 14 },

  // D Tier (25% total, 4 items 6.25% each)
  { id: 'D1', name: '2 Məhsul Aldıqda 10 AZN Endirim', tier: 'D', weight: 6.25 },
  { id: 'D2', name: '10 AZN Endirim (30 Dəqiqə İçində)', tier: 'D', weight: 6.25 },
  { id: 'D3', name: 'Dostunla Al – Hər Biriniz üçün 5 AZN Endirim', tier: 'D', weight: 6.25 },
  { id: 'D4', name: 'Paylaş və 5 AZN Endirim Qazan', tier: 'D', weight: 6.25 },

];

/* ===========================
   Helper: sanitize phone (sadə)
   =========================== */
function sanitizePhone(raw) {
  // Sadə normalizasiya: yalnız rəqəmlər və prefiks + üçün saxla
  let s = (raw || '').trim();
  s = s.replace(/\s+/g, '');
  // replace leading 00 with +
  if (s.startsWith('00')) s = '+' + s.slice(2);
  // add + if local style without plus and length looks local (optional)
  if (!s.startsWith('+') && s.length === 9) s = '+994' + s; // Azərbaycanın yerli daxil edilməsinə yardımçı
  return s;
}

/* ===========================
   Local storage: user state
   - stored as "brendimo_state_<phone>"
   structure:
   { phone, name, spins: [{date, spinNumber, giftId, giftName, tier}], extraSpins: int }
   =========================== */
function stateKey(phone) { return `brendimo_state_${phone}`;}
function loadState(phone) {
  try {
    const raw = localStorage.getItem(stateKey(phone));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveState(phone, state) {
  localStorage.setItem(stateKey(phone), JSON.stringify(state));
}

/* ===========================
   Weighted random selector (exclude E unless firstSpin)
   - GIFTS array contains weights in percent
   - function returns selected gift object
   =========================== */
function weightedRandomPick(allowE = false) {
  // Build pool
  const pool = GIFTS.filter(g => allowE ? true : g.tier !== 'E');

  // Ensure total sums to 100 (or close)
  const totalWeight = pool.reduce((s, x) => s + Number(x.weight || 0), 0);
  // If totalWeight very small (shouldn't), fallback to uniform
  if (totalWeight <= 0) {
    // uniform selection
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const r = Math.random() * totalWeight;
  let acc = 0;
  for (let i = 0; i < pool.length; i++) {
    acc += Number(pool[i].weight);
    if (r <= acc) return pool[i];
  }
  return pool[pool.length - 1];
}

/* ===========================
   Wheel rendering and animation (Canvas)
   - Renders sectors according to GIFTS order excluding E unless allowed
   - Rotates and stops on winner
   =========================== */
const canvas = wheelCanvas;
const ctx = canvas.getContext('2d');
let canvasSize = Math.min(canvas.width, canvas.height);
let center = { x: canvas.width / 2, y: canvas.height / 2 };
let radius = canvasSize / 2 - 20;
let currentRotation = 0;
let isSpinning = false;
let lastRenderedPool = []; // last pool used to render (order)

function drawWheel(pool) {
  lastRenderedPool = pool.slice();
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // shadow circle for glossy look
  const g = ctx.createRadialGradient(center.x - 120, center.y - 120, radius * 0.1, center.x, center.y, radius);
  g.addColorStop(0, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius + 8, 0, Math.PI * 2);
  ctx.fill();

  const total = pool.length;
  const slice = (Math.PI * 2) / total;
  for (let i = 0; i < total; i++) {
    const start = i * slice;
    const end = start + slice;
    // color by tier
    const tier = pool[i].tier;
    let color;
    switch (tier) {
      case 'A': color = '#ffd700'; break; // gold
      case 'B': color = '#c59f78'; break; // light gold
      case 'C': color = '#8ccf9b'; break; // greenish
      case 'D': color = '#7fb0ff'; break; // blue
      case 'E': color = '#ff8fa3'; break; // pink
      default: color = '#ddd';
    }
    // alternate shade for stripe
    const alt = i % 2 === 0 ? color : shadeColor(color, -8);

    // draw sector
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, radius, start + currentRotation, end + currentRotation);
    ctx.closePath();
    ctx.fillStyle = alt;
    ctx.fill();

    // text
    ctx.translate(center.x, center.y);
    const angle = start + slice / 2 + currentRotation;
    ctx.rotate(angle);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(12, radius * 0.06)}px serif`;
    ctx.fillText(pool[i].name, radius - 10, 6);
    ctx.restore();
  }

  // center hub
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.arc(center.x, center.y, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.arc(center.x, center.y, 56, 0, Math.PI * 2);
  ctx.fill();
}

/* small color shade helper */
function shadeColor(hex, percent) {
  // hex like #rrggbb
  var f=parseInt(hex.slice(1),16),t=percent<0?0:255,p=percent<0?percent*-1:percent;
  var R=f>>16,G=f>>8&0x00FF,B=f&0x0000FF;
  return "#"+(0x1000000+(Math.round((t-R)*p/100)+R)*0x10000+(Math.round((t-G)*p/100)+G)*0x100+(Math.round((t-B)*p/100)+B)).toString(16).slice(1);
}

/* animate spinner to land on selected index */
function spinToIndex(selectedIndex, pool, cb) {
  if (isSpinning) return;
  isSpinning = true;
  spinBtn.classList.add('disabled');
  spinBtn.disabled = true;

  // compute target angle so that sector at selectedIndex aligns with pointer (top)
  const total = pool.length;
  const slice = (360 / total);
  // pointer at top (0 deg), but our canvas uses radians and rotation is added; compute degrees
  // Each sector center angle in degrees:
  const sectorCenterDeg = selectedIndex * slice + slice / 2;
  // We want the sectorCenterDeg to end up at 270deg (top) after rotation (because canvas 0 is right, 90 down). We'll adjust via testing: we used pointer visual at top, so aim for -90 degrees.
  let targetDeg = 360 * 6 + (270 - sectorCenterDeg); // multiple rotations (6 rounds) for dramatic effect
  const startDeg = radiansToDegrees(currentRotation);
  const duration = 5200 + Math.random()*800; // ms

  const start = performance.now();
  const initialRotation = currentRotation;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    // ease out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    const newDeg = startDeg + (targetDeg - startDeg) * eased;
    currentRotation = degreesToRadians(newDeg);
    drawWheel(pool);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      // finalize exact rotation value
      currentRotation = degreesToRadians(targetDeg % 360);
      drawWheel(pool);
      isSpinning = false;
      cb && cb();
    }
  }
  requestAnimationFrame(step);
}

/* helpers conversions */
function degreesToRadians(d) { return d * Math.PI / 180; }
function radiansToDegrees(r) { return r * 180 / Math.PI; }

/* ===========================
   UI and event wiring
   =========================== */

function enableWheelUI() {
  wheelWrap.classList.remove('inactive');
  spinBtn.classList.remove('disabled');
  spinBtn.disabled = false;
}
function disableWheelUI() {
  wheelWrap.classList.add('inactive');
  spinBtn.classList.add('disabled');
  spinBtn.disabled = true;
}

/* initialize default wheel (exclude E by default) */
function initWheel() {
  lastRenderedPool = GIFTS.slice();
  drawWheel(lastRenderedPool);
}
initWheel();



/* Validate name and phone */
function validateInputs(name, phone) {
  if (!name || name.trim().length < 2) return { ok: false, msg: 'Tam ad daxil edin' };
  const p = sanitizePhone(phone);
  const re = /^\+?[0-9]{8,15}$/;
  if (!re.test(p)) return { ok: false, msg: 'WhatsApp nömrəsini düzgün daxil edin' };
  return { ok: true, phone: p };
}

/* Form submit flow:
   1) validate
   2) call API check (action=check) to see if number registered today / spin allowed
   3) if allowed, activate wheel and set session info in localStorage
*/
form.addEventListener('submit', async function(e) {
  e.preventDefault();
  if (isSpinning) return;

  const name = fullNameInput.value.trim();
  const phoneRaw = phoneInput.value.trim();
  const v = validateInputs(name, phoneRaw);
  if (!v.ok) { alert(v.msg); return; }
  const phone = v.phone;

  submitBtn.disabled = true;
  submitBtn.classList.add('disabled');
  submitBtn.innerText = 'Yoxlanılır...';

  try {
    // Call server to check phone and today's spins
    const payload = { action: 'check', name, phone };
    const resp = await postToApi(payload);
    // Expected response: { allowed: true/false, reason?: '', spinNumber: int, firstSpin: bool, existingSpins: [...], message: '', lastGiftId?: '' }
    if (!resp || !resp.allowed) {
      alert(resp && resp.message ? resp.message : 'Bu nömrə üçün bu gün spin icazəsi yoxdur');
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
      submitBtn.innerText = 'Qatıl və Spin Aktivləşdir';
      return;
    }

    // Save session local state
    let state = loadState(phone) || { phone, name, spins: [], extraSpins: 0 };
    // Merge name
    state.name = name;

    // store firstSpin flag in temporary session object
   // AFTER server check response (resp) -> saxla session üçün
// resp.expected sahələri: { allowed: true, spinNumber: 1, firstSpin: true/false }
sessionStorage.setItem('brendimo_current', JSON.stringify({
  phone: phone,
  name: name,
  serverSpinNumber: resp.spinNumber || 1,
  firstSpin: !!resp.firstSpin  // true yalnız ilk‑ever istifadəçi üçün
}));

// Render wheel (always full wheel). But keep visual cue if firstSpin
if (resp.firstSpin) {
  // optional: highlight E slices visually by re-drawing same wheel (we keep full wheel)
  drawWheel(GIFTS.slice());
} else {
  drawWheel(GIFTS.slice());
}
enableWheelUI();

    // re-render wheel depending on allowed: if firstSpin -> render E tier pool (for visual)
    if (resp.firstSpin) {
      // for first spin, show E tier visually (only E items)
      const pool = GIFTS.filter(g => g.tier === 'E');
      drawWheel(pool);
    } else {
      drawWheel(GIFTS.filter(g => g.tier !== 'E'));
    }

    // Update UI text
    submitBtn.innerText = 'Spin hazırdır';
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');

    // show history from local state
    renderHistory(state);
  } catch (err) {
    console.error(err);
    alert('Server ilə əlaqə zamanı xəta baş verdi');
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
    submitBtn.innerText = 'Qatıl və Spin Aktivləşdir';
  }
});

// Spin handler (sadələşdirilmiş, əsas məntiq)
spinBtn.addEventListener('click', async function() {
  if (spinBtn.disabled || isSpinning) return;
  const sessRaw = sessionStorage.getItem('brendimo_current');
  if (!sessRaw) { alert('Əvvəlcə formu doldurun və serverə göndərin'); return; }
  const sess = JSON.parse(sessRaw);
  const phone = sess.phone;
  const name = sess.name;

  disableWheelUI();
  const pool = lastRenderedPool.length ? lastRenderedPool : GIFTS.slice();

  // Always weighted pick excluding E (E removed anyway)
  const selected = weightedRandomPick(/* allowE = */ false);

  const targetIndex = pool.findIndex(item => item.id === selected.id);
  const indexToUse = targetIndex >= 0 ? targetIndex : 0;

  spinToIndex(indexToUse, pool, async function() {
    // prepare log payload
    const payload = {
      action: 'log',
      name: name,
      phone: phone,
      spinNumber: (sess.serverSpinNumber || 1),
      giftId: selected.id,
      giftName: selected.name,
      tier: selected.tier
    };
    try {
      const resp = await postToApi(payload);
      // handle resp: update local history, modal, re-enable only if resp.allowedNextSpin true
      // update local state, e.g. saveState and renderHistory
      // example: showResultModal(selected, resp);
    } catch (err) {
      alert('Serverə yazılarkən xəta oldu');
      enableWheelUI();
    }
  });
});
     
/* Modal controls */
closeModal.addEventListener('click', () => { resultModal.classList.add('hidden'); });
modalOk.addEventListener('click', () => { resultModal.classList.add('hidden'); });

/* share CTA */
shareBtn.addEventListener('click', () => {
  // Simple share using Web Share API if available, fallback to copy text
  const text = 'Mən Brendimo-da endirim qazandım! Siz də yoxlayın.';
  if (navigator.share) {
    navigator.share({ title: 'Brendimo', text });
  } else {
    navigator.clipboard.writeText(text).then(()=> alert('Paylaşma mətni kopyalandı'));
  }
});

/* Show modal with result and tier-specific instructions */
function showResultModal(selected, resp) {
  resultGiftEl.innerText = selected.name;
  resultTierEl.innerText = `Kateqoriya: ${selected.tier}`;
  // Instructions examples - can be adjusted
  let instr = '';
  if (selected.tier === 'A') instr = 'Təbriklər! Bu ödənişsiz hədiyyəni əldə etmək üçün satınalma zamanı nömrənizi təqdim edin.';
  else if (selected.tier === 'B') instr = 'Orta dəyərli hədiyyə qazandınız. Hədiyyəni tələb etmək üçün satınalma zamanı bu mesajı göstərin.';
  else if (selected.tier === 'C') instr = 'Aşağı dəyərli hədiyyə qazandınız. Satınalma zamanı müraciət edin.';
  else if (selected.tier === 'D') instr = 'Bonus endirim qazandınız. Sosial paylaşma üçün aşağıdakı düyməni istifadə edin.';
  else if (selected.tier === 'E') instr = 'Xüsusi şans! Əlavə spin imkanları qazandınız. Nəticələri müqayisə edin.';

  resultInstructions.innerText = instr;

  // show share CTA only for D-tier "Paylaş və 5 AZN Endirim Qazan"
  if (selected.id === 'D4') {
    shareCTA.classList.remove('hidden');
  } else {
    shareCTA.classList.add('hidden');
  }

  resultTitle.innerText = selected.tier === 'A' ? 'Böyük Qazandınız!' : 'Nəticə';
  resultModal.classList.remove('hidden');
}

/* Render history list from localStorage state */
function renderHistory(state) {
  if (!state || !state.spins) { historyList.innerHTML = '<li>Hələ tarixçə yoxdur</li>'; return; }
  historyList.innerHTML = '';
  for (let s of state.spins.slice().reverse()) {
    const li = document.createElement('li');
    li.innerText = `${new Date(s.date).toLocaleString()} — ${s.giftName} [${s.tier}] (Spin #${s.spinNumber})`;
    historyList.appendChild(li);
  }
}

// API_ENDPOINT must be your deployed Apps Script web app URL (from Deploy)

async function postToApi(data) {
  // Try POST first
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    return json;
  } catch (err) {
    console.warn('POST failed, trying JSONP fallback due to CORS or network:', err);

    // Build query params for JSONP GET
    const params = Object.assign({}, data);
    const qs = Object.keys(params)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k] || '')))
      .join('&');
    const cbName = 'brendimo_cb_' + Math.random().toString(36).slice(2,9);
    const url = API_ENDPOINT + (qs ? ('?' + qs + '&') : '?') + 'callback=' + cbName;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, 11000);

      function cleanup() {
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) {}
        const s = document.getElementById(cbName + '_script');
        if (s && s.parentNode) s.parentNode.removeChild(s);
      }

      window[cbName] = function(resp) {
        cleanup();
        resolve(resp);
      };

      const script = document.createElement('script');
      script.id = cbName + '_script';
      script.src = url;
      script.onerror = function() { cleanup(); reject(new Error('JSONP script error')); };
      document.body.appendChild(script);
    });
  }
}


/* On load: try to render any existing history for last used phone */
(function tryLoadLast() {
  // try to find last phone from localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('brendimo_state_')) {
      const state = JSON.parse(localStorage.getItem(key));
      if (state && state.phone) {
        renderHistory(state);
        break;
      }
    }
  }
})();

function sanitizePhone(raw) {
  let s = (raw || '').trim();
  s = s.replace(/\s+/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  // Əgər istifadəçi yerli format yazıbsa (9 rəqəm) avtomatik +994 əlavə et
  if (!s.startsWith('+') && /^\d{9}$/.test(s)) s = '+994' + s;
  // Əgər başında 0 varsa və ümumi uzunluq 10-dursa (0XXXXXXXXX) +994 ilə dəyişdir
  if (/^0\d{9}$/.test(s)) s = '+994' + s.slice(1);
  return s;
}

spinBtn.addEventListener('click', async function() {
  if (spinBtn.disabled || isSpinning) return;

  const sessRaw = sessionStorage.getItem('brendimo_current');
  if (!sessRaw) { alert('Əvvəlcə formu doldurun və serverə göndərin'); return; }
  const sess = JSON.parse(sessRaw);
  const phone = sess.phone;
  const name = sess.name;

  // lock UI during spin
  disableWheelUI();

  // Ensure wheel pool is full GIFTS (A..E)
  const pool = lastRenderedPool.length ? lastRenderedPool : GIFTS.slice();

  // Choose selected gift
  let selected;
  if (sess.firstSpin) {
    // FORCE pick from E-tier uniformly for first spin
    const ePool = GIFTS.filter(g => g.tier === 'E');
    selected = ePool[Math.floor(Math.random() * ePool.length)];
  } else {
    // subsequent spins: weighted pick excluding E
    selected = weightedRandomPick(false);
  }

  // find index in the full rendered pool
  const targetIndex = pool.findIndex(item => item.id === selected.id);
  const indexToUse = targetIndex >= 0 ? targetIndex : 0;

  // animate and then log
  spinToIndex(indexToUse, pool, async function() {
    // AFTER spin animation completes

    // mark firstSpin used
    sessionStorage.setItem('brendimo_current', JSON.stringify({
      phone: phone,
      name: name,
      serverSpinNumber: (sess.serverSpinNumber || 1) + 1,
      firstSpin: false
    }));

    // Prepare payload to log on server
    const payload = {
      action: 'log',
      name: name,
      phone: phone,
      spinNumber: (sess.serverSpinNumber || 1),
      giftId: selected.id,
      giftName: selected.name,
      tier: selected.tier
    };

    try {
      const resp = await postToApi(payload);
      // update local state and UI per your existing logic (history, modal, re-enable if allowed)
      // --- keep your existing post‑log logic here ---
      // Example minimal:
      // showResultModal(selected, resp);
      // update localStorage state and renderHistory...
    } catch (err) {
      console.error('Log error', err);
      alert('Serverə yazılarkən xəta oldu');
    }

    // Re-enable wheel if server allowed next spin; else keep disabled
    // (Your existing logic that checks resp.allowedNextSpin should be used)
  });
});

function showResultModal(selected, resp) {
  try {
    console.log('showResultModal running for', selected, resp);
    resultGiftEl.innerText = selected.name || (resp && resp.gift) || 'Qazandınız';
    resultTierEl.innerText = 'Kateqoriya: ' + (selected.tier || (resp && resp.tier) || '');
    let instr = '';
    if (selected.tier === 'A') instr = 'Təbriklər! Ödənişsiz hədiyyəni tələb edin.';
    else if (selected.tier === 'B') instr = 'Orta dəyərli hədiyyə. Satınalma zamanı təqdim edin.';
    else if (selected.tier === 'C') instr = 'Aşağı dəyərli hədiyyə.';
    else if (selected.tier === 'D') instr = 'Bonus endirim. Paylaşın və istifadə edin.';
    resultInstructions.innerText = instr;

    // Ensure share CTA visibility logic
    if (selected.id === 'D4') shareCTA.classList.remove('hidden'); else shareCTA.classList.add('hidden');

    // Force modal visible and top layer
    resultModal.classList.remove('hidden');
    resultModal.style.display = 'flex';
    resultModal.style.zIndex = '99999';
    // Also ensure background not covering it
    document.body.style.overflow = 'hidden';

    console.log('Modal shown (styles applied)');
  } catch (err) {
    console.error('Error showing modal', err);
  }
}
closeModal.addEventListener('click', () => {
  resultModal.classList.add('hidden');
  resultModal.style.display = '';
  document.body.style.overflow = '';
});
modalOk.addEventListener('click', () => {
  resultModal.classList.add('hidden');
  resultModal.style.display = '';
  document.body.style.overflow = '';
});



/* Ensure responsive canvas resizing */
window.addEventListener('resize', () => {
  // keep canvas size synced to CSS size
  const rect = wheelCanvas.getBoundingClientRect();
  wheelCanvas.width = rect.width * devicePixelRatio;
  wheelCanvas.height = rect.height * devicePixelRatio;
  canvasSize = Math.min(wheelCanvas.width, wheelCanvas.height);
  center = { x: wheelCanvas.width/2, y: wheelCanvas.height/2 };
  radius = canvasSize / 2 - 20;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  drawWheel(lastRenderedPool.length ? lastRenderedPool : GIFTS.filter(g=>g.tier!=='E'));
});
window.dispatchEvent(new Event('resize'));

