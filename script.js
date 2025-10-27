/* script.js
   Tam izah: Bu faylda UI, validasiya, localStorage sessiya izləmə,
   weighted random seçici, canvas-based wheel render, animation və
   Google Apps Script ilə POST (check və log) funksiyaları var.
*/

/* ===========================
   CONFIG - dəyişdirin burada
   =========================== */
const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbyLkP2gzZ38WsYg_-g-luPswxRT9l4e4Zp8QodPkmk764M_tTRaAsfEFw1B4OA64bCXog/exec"; // <<-- burada Apps Script URL yerləşdirin

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

  // E Tier (first spin only) - weight set but we will force E for first spin
  { id: 'E1', name: '2x Çevirmə (İstədiyi Hədiyyəni Seçə Bilir)', tier: 'E', weight: 0 },
  { id: 'E2', name: 'Bir Daha Yoxla (Bir Çevrim Şansı Daha)', tier: 'E', weight: 0 },
  { id: 'E3', name: '“Almost There” Spin (Ödənişsiz Hədiyyə Önünə)', tier: 'E', weight: 0 }
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
  const pool = GIFTS.filter(g => g.tier !== 'E'); // default visual
  drawWheel(pool);
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
    sessionStorage.setItem('brendimo_current', JSON.stringify({ phone, name, serverSpinNumber: resp.spinNumber, firstSpin: resp.firstSpin }));

    // Activate wheel
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

/* Spin button click */
spinBtn.addEventListener('click', async function() {
  if (spinBtn.disabled || isSpinning) return;

  // load session
  const sessRaw = sessionStorage.getItem('brendimo_current');
  if (!sessRaw) { alert('Əvvəlcə formu doldurun və serverə göndərin'); return; }
  const sess = JSON.parse(sessRaw);
  const phone = sess.phone;
  const name = sess.name;

  // Prevent double spin before submit/log
  disableWheelUI();

  // Decide pool: if firstSpin -> E only; else exclude E
  const allowE = !!sess.firstSpin;
  const pool = GIFTS.filter(g => allowE ? g.tier === 'E' : g.tier !== 'E');

  // For first spin, requirement: the first spin for each unique user always results in E tier.
  // We will pick uniformly among E-tier items for first spin (since E weights are 0).
  // For later spins, use weightedRandomPick to respect probabilities.
  let selected;
  if (allowE) {
    // uniform among E-tier
    const ePool = pool;
    selected = ePool[Math.floor(Math.random() * ePool.length)];
  } else {
    selected = weightedRandomPick(false);
  }

  // find index of selected in rendered pool (lastRenderedPool)
  const index = lastRenderedPool.findIndex(item => item.id === selected.id);
  // If not found (shouldn't), fallback to random index
  const targetIndex = index >= 0 ? index : 0;

  // Start spin animation then after completion log to server
  spinToIndex(targetIndex, lastRenderedPool, async function() {
    // Prepare spin data
    const spinNumber = sess.serverSpinNumber || 1;
    const payload = {
      action: 'log',
      name,
      phone,
      spinNumber,
      giftId: selected.id,
      giftName: selected.name,
      tier: selected.tier
    };

    try {
      const resp = await postToApi(payload);
      // resp expected: { success:true, gift: '...', tier:'...', spinNumber:n, allowedNextSpin: bool, message: '' }
      // update local state
      let state = loadState(phone) || { phone, name, spins: [], extraSpins: 0 };
      const nowIso = new Date().toISOString();
      state.spins.push({
        date: nowIso,
        spinNumber: resp.spinNumber || spinNumber,
        giftId: selected.id,
        giftName: selected.name,
        tier: selected.tier
      });

      // Handle extra spins rules for E-tier outcomes:
      if (selected.tier === 'E') {
        // E tier special rules:
        if (selected.id === 'E1') {
          // 2x Çevirmə => grant 2 more spins
          state.extraSpins = (state.extraSpins || 0) + 2;
        } else if (selected.id === 'E2' || selected.id === 'E3') {
          // Bir Daha Yoxla or Almost There => grant 1 more spin
          state.extraSpins = (state.extraSpins || 0) + 1;
        }
      } else {
        // For non-E Tier winning, if earlier E had extraSpins, consume one extra spin when spinNumber>1?
        // We will rely on server for per-day limit; local extraSpins used to allow extra client-side second spin display
      }

      saveState(phone, state);
      renderHistory(state);

      // Modal display
      showResultModal(selected, resp);

      // update session to reflect that next spin is not firstSpin
      sessionStorage.setItem('brendimo_current', JSON.stringify({ phone, name, serverSpinNumber: resp.nextSpinNumber || (spinNumber + 1), firstSpin: false }));

      // If server says next spin allowed, re-enable wheel accordingly
      if (resp.allowedNextSpin) {
        enableWheelUI();
        drawWheel(GIFTS.filter(g => g.tier !== 'E'));
      } else {
        disableWheelUI();
      }

    } catch (err) {
      console.error(err);
      alert('Spin qeydiyyatı zamanı problem yarandı');
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

/// postToApi - tries POST, on CORS failure falls back to JSONP GET
async function postToApi(data) {
  // attempt POST
  try {
    const r = await fetch(API_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    // if response not ok, still try to parse JSON for error
    const j = await r.json();
    return j;
  } catch (err) {
    console.warn('POST failed, trying JSONP fallback due to CORS or network:', err);
    // Build JSONP URL with query params (simple serialization)
    const params = Object.assign({}, data);
    // Ensure values are strings and safe
    const qp = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]))).join('&');
    // create unique callback name
    const cbName = 'brendimo_cb_' + Math.random().toString(36).slice(2, 9);
    const url = API_ENDPOINT + '?' + qp + '&callback=' + cbName;

    return new Promise((resolve, reject) => {
      // timeout in case script doesn't respond
      const to = setTimeout(() => {
        cleanup();
        reject(new Error('JSONP timeout'));
      }, 11000);

      function cleanup() {
        clearTimeout(to);
        try { window[cbName] = undefined; delete window[cbName]; } catch (e) {}
        const s = document.getElementById(cbName + '_script');
        if (s) s.parentNode.removeChild(s);
      }

      window[cbName] = function(resp) {
        cleanup();
        resolve(resp);
      };

      const script = document.createElement('script');
      script.id = cbName + '_script';
      script.src = url;
      script.onerror = function(e) {
        cleanup();
        reject(new Error('JSONP script error'));
      };
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

