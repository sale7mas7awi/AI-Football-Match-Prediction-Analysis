const FLAG_BASE = 'https://flagcdn.com/w80';
const FLAG_BASE_SM = 'https://flagcdn.com/w40';
const FLAG_FALLBACK = 'https://placehold.co/40x28/0e2c44/e7f1f7?text=?';
const FLAG_MAP = { 'xx': null };
const API_BASE = 'http://localhost:5000/api';

let currentMatch = null;
let selectedPredictionCode = null;
let probabilityChart = null;
let currentBracketSide = null;
let currentBracketIndex = null;

const bracketResults = {
  LEFT_R32:  Array(8).fill(null),
  RIGHT_R32: Array(8).fill(null),
  LEFT_R16:  Array(4).fill(null),
  RIGHT_R16: Array(4).fill(null),
  LEFT_QF:   Array(2).fill(null),
  RIGHT_QF:  Array(2).fill(null),
  LEFT_SF:   Array(1).fill(null),
  RIGHT_SF:  Array(1).fill(null),
};

let THIRD_PLACE = { t1:{flag:'xx',n:'TBD'}, t2:{flag:'xx',n:'TBD'}, stage:'مباراة المركز الثالث' };

const analysisFallback = [
  { i: '', t: (a, b) => `${a} تمتلك مؤشرات هجومية أفضل في آخر سلسلة مباريات مقارنة بـ ${b}.` },
  { i: '', t: (a, b) => `${b} أكثر تماسكاً دفاعياً، لكن جودة الفرص قد تميل لصالح ${a}.` },
  { i: '', t: () => `يعتمد النموذج على الأداء السابق، الفعالية التهديفية، جودة الخصم، وأثر المدرب.` },
  { i: '', t: (a) => `إذا حافظ ${a} على الفاعلية داخل الصندوق فاحتمال الفوز يرتفع بوضوح.` },
];

async function renderMatchAnalysis(team1Name, team2Name, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res = await fetch(
      `http://localhost:5000/api/team_ratings?team1=${encodeURIComponent(team1Name)}&team2=${encodeURIComponent(team2Name)}`
    );
    if (!res.ok) return;
    const data = await res.json();
    const t1 = data.team1;
    const t2 = data.team2;

    const categories = [
      { key: 'avg_sho', label: 'الهجوم' },
      { key: 'avg_def', label: 'الدفاع' },
      { key: 'avg_pas', label: 'الوسط' },
      { key: 'avg_phy', label: 'اللياقة' },
    ];

    const rows = categories.map(cat => {
      const v1 = t1[cat.key];
      const v2 = t2[cat.key];
      const winner = v1 > v2 ? team1Name : v2 > v1 ? team2Name : 'تعادل';
      const bar1 = Math.round(v1);
      const bar2 = Math.round(v2);
      return `
        <div style="margin-bottom:12px;">
          <div style="font-size:11px;color:#c9a84c;font-weight:700;
                      margin-bottom:4px;">${cat.label}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:#e7f1f7;min-width:30px;
                         text-align:right;">${v1}</span>
            <div style="flex:1;background:rgba(255,255,255,.1);
                        border-radius:4px;height:8px;overflow:hidden;">
              <div style="width:${bar1}%;height:100%;
                          background:#D4AF37;border-radius:4px;"></div>
            </div>
            <span style="font-size:9px;color:rgba(255,255,255,.4);
                         min-width:60px;text-align:center;">vs</span>
            <div style="flex:1;background:rgba(255,255,255,.1);
                        border-radius:4px;height:8px;overflow:hidden;">
              <div style="width:${bar2}%;height:100%;
                          background:#19a0cd;border-radius:4px;"></div>
            </div>
            <span style="font-size:10px;color:#e7f1f7;
                         min-width:30px;">${v2}</span>
          </div>
          <div style="font-size:9px;color:rgba(255,255,255,.5);
                      margin-top:2px;text-align:center;">
            ${winner !== 'تعادل' ? `${winner} أقوى` : 'متكافئان'}
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div style="margin:16px 0;padding:12px;
                  background:rgba(0,0,0,.25);border-radius:8px;">
        <div style="font-size:12px;font-weight:700;color:#D4AF37;
                    margin-bottom:12px;text-align:center;">
          مقارنة المنتخبين
        </div>
        <div style="display:flex;justify-content:space-between;
                    margin-bottom:8px;">
          <span style="font-size:11px;color:#D4AF37;
                       font-weight:700;">${team1Name}</span>
          <span style="font-size:11px;color:#19a0cd;
                       font-weight:700;">${team2Name}</span>
        </div>
        ${rows.join('')}
      </div>
    `;
  } catch (e) {
    console.error("Analysis Error", e);
  }
}

function mapFlag(code) {
  return FLAG_MAP[code] !== undefined ? FLAG_MAP[code] : code;
}

function flagUrl(code, size = 'sm') {
  if (!code) return FLAG_FALLBACK;
  if (code.startsWith('gb-')) return `${size === 'lg' ? FLAG_BASE : FLAG_BASE_SM}/${code}.png`;
  const mapped = mapFlag(code);
  const base = size === 'lg' ? FLAG_BASE : FLAG_BASE_SM;
  return mapped ? `${base}/${mapped}.png` : FLAG_FALLBACK;
}

function flag(code, name) {
  if (!code) return `<div class="match-flag placeholder">🏅</div>`;
  const src = flagUrl(code, 'sm');
  return `<img class="match-flag" src="${src}" alt="${name}" onerror="this.onerror=null;this.src='${FLAG_FALLBACK}'">`;
}

// ── DATA ──
const LEFT_R32 = Array(8);
const RIGHT_R32 = Array(8);

function buildOfficialBracket(teams) {
  // Build lookup map: 'A1', 'A2', 'B1' etc.
  const map = {};
  teams.forEach(t => {
    if (t.finish === 1 || t.finish === 2) {
      map[`${t.group}${t.finish}`] = t;
    }
  });

  // Best 8 third-place teams sorted by pts DESC then FIFA rank ASC
  const best3 = teams
    .filter(t => t.bestThird)
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      return (parseInt(a.rank)||999) - (parseInt(b.rank)||999);
    });

  const g = (key) => map[key] || { flag:'xx', n:'TBD' };
  const t = (i)   => best3[i]  || { flag:'xx', n:'TBD' };

  // Official FIFA 2026 Round of 32 matchups
  LEFT_R32[0] = { t1: g('A2'), t2: g('B2'), stage:'Round of 32' };  // M73
  LEFT_R32[1] = { t1: g('E1'), t2: t(0),    stage:'Round of 32' };  // M74
  LEFT_R32[2] = { t1: g('F1'), t2: g('C2'), stage:'Round of 32' };  // M75
  LEFT_R32[3] = { t1: g('C1'), t2: g('F2'), stage:'Round of 32' };  // M76
  LEFT_R32[4] = { t1: g('I1'), t2: t(1),    stage:'Round of 32' };  // M77
  LEFT_R32[5] = { t1: g('E2'), t2: g('I2'), stage:'Round of 32' };  // M78
  LEFT_R32[6] = { t1: g('A1'), t2: t(2),    stage:'Round of 32' };  // M79
  LEFT_R32[7] = { t1: g('L1'), t2: t(3),    stage:'Round of 32' };  // M80

  RIGHT_R32[0] = { t1: g('D1'), t2: t(4),    stage:'Round of 32' }; // M81
  RIGHT_R32[1] = { t1: g('G1'), t2: t(5),    stage:'Round of 32' }; // M82
  RIGHT_R32[2] = { t1: g('K2'), t2: g('L2'), stage:'Round of 32' }; // M83
  RIGHT_R32[3] = { t1: g('H1'), t2: g('J2'), stage:'Round of 32' }; // M84
  RIGHT_R32[4] = { t1: g('B1'), t2: t(6),    stage:'Round of 32' }; // M85
  RIGHT_R32[5] = { t1: g('J1'), t2: g('H2'), stage:'Round of 32' }; // M86
  RIGHT_R32[6] = { t1: g('K1'), t2: t(7),    stage:'Round of 32' }; // M87
  RIGHT_R32[7] = { t1: g('D2'), t2: g('G2'), stage:'Round of 32' }; // M88
}

const TBD = { flag: 'xx', n: 'TBD' };
const tbd = (stage = 'TBD') => ({ t1: TBD, t2: TBD, stage });

const LEFT_R16 = Array.from({ length: 4 }, () => tbd('Round of 16'));
const LEFT_QF = Array.from({ length: 2 }, () => tbd('Quarter-Final'));
const LEFT_SF = [tbd('Semi-Final')];
const RIGHT_R16 = Array.from({ length: 4 }, () => tbd('Round of 16'));
const RIGHT_QF = Array.from({ length: 2 }, () => tbd('Quarter-Final'));
const RIGHT_SF = [tbd('Semi-Final')];
const FINAL = tbd('Final');

// ── RENDER MATCH (clickable) ──
function renderMatch(m, size = 'normal', arrayName = '', idx = 0) {
  const cls = size === 'final' ? 'final-match' : 'match';
  const isPlayable = m.t1 && m.t2 && m.t1.flag !== 'xx' && m.t2.flag !== 'xx' && m.t1.n !== 'TBD' && m.t2.n !== 'TBD';
  const clickable = isPlayable ? `style="cursor:pointer;" onclick="openModal(${JSON.stringify(m).replace(/"/g, '&quot;')}, '${arrayName}', ${idx})"` : '';
  const hoverNote = isPlayable ? `title="اضغط للتوقع"` : '';

  return `
    <div class="${cls}" ${clickable} ${hoverNote}>
      <div class="match-team">
        ${flag(m.t1.flag, m.t1.n)}
        <span class="match-name">${m.t1.n}</span>
        <span class="match-score">—</span>
      </div>
      <div class="match-team">
        ${flag(m.t2.flag, m.t2.n)}
        <span class="match-name">${m.t2.n}</span>
        <span class="match-score">—</span>
      </div>
    </div>`;
}

function renderRound(matches, extraStyle = '', arrayName = '') {
  return `<div class="round" style="${extraStyle}">${matches.map((m, idx) => renderMatch(m, 'normal', arrayName, idx)).join('')}</div>`;
}
function renderConnector(pairCount, flip = false) {
  const flipCls = flip ? 'flip' : '';
  // ارتفاع الخط العمودي لكل دور
  const heightMap = {
    4: 'calc(var(--match-h) + var(--gap))',
    2: 'calc(var(--match-h) * 2 + var(--gap) * 3)',
    1: 'calc(var(--match-h) * 6 + var(--gap) * 11)'
  };
  // المسافة بين الـ pairs
  const gapMap = {
    4: 'calc(var(--match-h) + var(--gap))',
    2: 'calc(var(--match-h) * 3 + var(--gap) * 5)',
    1: '0px'
  };
  const h = heightMap[pairCount] || 'calc(var(--match-h) + var(--gap))';
  const g = gapMap[pairCount] || '0px';
  let pairs = '';
  for (let i = 0; i < pairCount; i++) {
    pairs += `<div class="connector-pair ${flipCls}">
      <div class="conn-h"></div>
      <div class="conn-v" style="height:${h}"></div>
      <div class="conn-h2"></div>
    </div>`;
  }
  return `<div class="connector" style="gap:${g};padding:calc(var(--match-h)/2) 0;justify-content:flex-start;">${pairs}</div>`;
}



function renderBracket() {
  const bracket = document.getElementById('bracket');
  if (!bracket) return;

  const r32Style = `gap: var(--gap);`;
  const r16Style = `gap: calc(var(--match-h) + var(--gap)*3);`;
  const qfStyle = `gap: calc(var(--match-h)*3 + var(--gap)*7);`;
  const sfStyle = `gap: calc(var(--match-h)*7 + var(--gap)*15);`;

  const leftSide = `
    <div class="side">
      ${renderRound(LEFT_R32, r32Style, 'LEFT_R32')}
      ${renderConnector(4)}
      ${renderRound(LEFT_R16, r16Style, 'LEFT_R16')}
      ${renderConnector(2)}
      ${renderRound(LEFT_QF, qfStyle, 'LEFT_QF')}
      ${renderConnector(1)}
      ${renderRound(LEFT_SF, sfStyle, 'LEFT_SF')}
    </div>`;

  const rightSide = `
    <div class="side right-side">
      ${renderRound(RIGHT_R32, r32Style, 'RIGHT_R32')}
      ${renderConnector(4, true)}
      ${renderRound(RIGHT_R16, r16Style, 'RIGHT_R16')}
      ${renderConnector(2, true)}
      ${renderRound(RIGHT_QF, qfStyle, 'RIGHT_QF')}
      ${renderConnector(1, true)}
      ${renderRound(RIGHT_SF, sfStyle, 'RIGHT_SF')}
    </div>`;

  const centerCol = `
    <div class="center-col">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:2rem;letter-spacing:6px;color:#fff;text-align:center;text-shadow:0 0 30px rgba(201,168,76,.5);margin-bottom:10px;">WORLD CHAMPIONS</div>
      <div style="margin-bottom:10px;">
        <div class="final-label" style="color:#7a9db5;font-size:.72rem;">BRONZE WINNER</div>
        ${renderMatch(THIRD_PLACE, 'final', 'THIRD_PLACE', 0)}
      </div>
      <div class="trophy-container">
        <img class="trophy-img" style="height:240px;"
             src="pngegg.png"
             alt="World Cup Trophy"
             onerror="this.outerHTML='<div style=\\'font-size:4rem;filter:drop-shadow(0 0 20px rgba(201,168,76,.5))\\'>🏆</div>'">
      </div>
      <div style="margin-top:10px;">
        <div class="final-label">FINAL</div>
        ${renderMatch(FINAL, 'final', 'FINAL', 0)}
        <div style="margin-top:14px;text-align:center;">
        <img src="theme.jpg" style="height:100px;object-fit:contain;opacity:1;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:.85rem;letter-spacing:3px;color:#c9a84c;margin-top:4px;">FIFA WORLD CUP 2026™</div>
        
      </div>
      </div>
    </div>`;
  bracket.innerHTML = leftSide + centerCol + rightSide;

  // Round labels
  const labelsRow = document.createElement('div');
  labelsRow.className = 'rounds-row';
  labelsRow.style.cssText = 'display:flex;justify-content:center;gap:0;padding:8px 32px 0;';
  ['R32', 'R16', 'QF', 'SF'].forEach(l => {
    const d = document.createElement('div');
    d.className = 'rl';
    d.style.cssText = `width:calc(var(--match-w) + var(--col-gap));`;
    d.textContent = l;
    labelsRow.appendChild(d);
  });
  const fc = document.createElement('div');
  fc.className = 'rl';
  fc.style.cssText = `width:180px;color:var(--gold-2);font-size:.7rem;`;
  fc.textContent = 'FINAL';
  labelsRow.appendChild(fc);
  ['SF', 'QF', 'R16', 'R32'].forEach(l => {
    const d = document.createElement('div');
    d.className = 'rl';
    d.style.cssText = `width:calc(var(--match-w) + var(--col-gap));`;
    d.textContent = l;
    labelsRow.appendChild(d);
  });
  document.querySelector('.bracket-page').after(labelsRow);
}

const raw = localStorage.getItem('wc2026_qualified');
if (raw) {
  try {
    const teams = JSON.parse(raw);
    buildOfficialBracket(teams);
  } catch(e) {
    console.error('Failed to build bracket:', e);
  }
}
renderBracket();

// ── MODAL ──
function openModal(match, bracketSide, bracketIndex) {
  currentMatch = match;
  currentBracketSide = bracketSide;
  currentBracketIndex = bracketIndex;
  selectedPredictionCode = null;

  const setImg = (id, code, name) => {
    const img = document.getElementById(id);
    img.src = flagUrl(code, 'lg');
    img.alt = name;
    img.onerror = () => { img.onerror = null; img.src = FLAG_FALLBACK; };
  };

  setImg('mf1', match.t1.flag, match.t1.n);
  document.getElementById('mn1').textContent = match.t1.n;
  document.getElementById('mr1').textContent = 'الأدوار الإقصائية';

  setImg('mf2', match.t2.flag, match.t2.n);
  document.getElementById('mn2').textContent = match.t2.n;
  document.getElementById('mr2').textContent = 'الأدوار الإقصائية';

  document.getElementById('modalMeta').textContent = match.stage || 'Knockout Stage';
  document.getElementById('po1').innerHTML = `فوز<br>${match.t1.n}`;
  document.getElementById('po3').innerHTML = `فوز<br>${match.t2.n}`;

  document.querySelectorAll('.pred-opt').forEach(b => b.classList.remove('sel'));
  document.getElementById('modalCta').disabled = true;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function pickPrediction(value) {
  selectedPredictionCode = value;
  document.querySelectorAll('.pred-opt').forEach(b => b.classList.remove('sel'));
  const id = value === '1' ? 'po1' : value === 'X' ? 'po2' : 'po3';
  document.getElementById(id).classList.add('sel');
  document.getElementById('modalCta').disabled = false;
}

// ── RESULT ──
function nowStamp() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function normalizePercentages(w, d, l) {
  let win = Math.max(0, Number(w) || 0);
  let loss = Math.max(0, Number(l) || 0);
  const total = win + loss;
  if (total <= 0) return { win: 50, draw: 0, loss: 50 };
  const scale = 100 / total;
  win = Math.round(win * scale);
  loss = 100 - win;
  return { win, draw: 0, loss: Math.max(0, loss) };
}

function normalizePredictionData(match, data) {
  const pct = normalizePercentages(
    data.win ?? data.home_win ?? data.team1_win ?? 0,
    0, // ignore draw probability completely
    data.loss ?? data.away_win ?? data.team2_win ?? 0
  );
  
  // Force winner based purely on win/loss percentage
  const winner = pct.win >= pct.loss ? match.t1.n : match.t2.n;
  const conf = Math.max(pct.win, pct.loss);
  const confLabel = data.confidence_label || (conf >= 65 ? 'ثقة عالية' : conf >= 50 ? 'ثقة متوسطة' : 'ثقة متوازنة');
  
  let rawAnalysis = Array.isArray(data.analysis_points) && data.analysis_points.length
    ? data.analysis_points.map(i => ({ i: i.icon || '', text: i.text || i }))
    : analysisFallback.map(e => ({ i: e.i, text: e.t(match.t1.n, match.t2.n) }));

  if (data.analysis) {
    rawAnalysis = data.analysis;
  }
  
  // Filter out any analysis point mentioning "تعادل"
  const analysis = rawAnalysis.filter(a => !a.text.includes('تعادل'));

  return {
    ...pct, winner, conf, confLabel, analysis,
    explanation: data.explanation || 'تم توليد هذه النتيجة بناءً على نموذج الفوز/الخسارة فقط للأدوار الإقصائية وتم توزيع احتمالية التعادل.',
    formation1: data.formation1 || '4-3-3',
    formation2: data.formation2 || '4-3-3',
    lineup1: (data.lineup1 || []).map(p => typeof p === 'string' ? { name: p, position: 'CM' } : p),
    lineup2: (data.lineup2 || []).map(p => typeof p === 'string' ? { name: p, position: 'CM' } : p)
  };
}

function renderLineupField(team, lineup, formation) {
  const roleColor = (pos) => {
    if (!pos) return '#c9a84c';
    const p = pos.toUpperCase();
    if (p === 'GK') return '#19a0cd';
    if (['CB', 'RB', 'LB', 'RWB', 'LWB'].includes(p)) return '#1a6e3c';
    if (['ST', 'CF', 'RW', 'LW'].includes(p)) return '#e85a4f';
    return '#c9a84c';
  };
  const textColor = (pos) => {
    if (!pos) return '#000';
    const p = pos.toUpperCase();
    if (['CB', 'RB', 'LB', 'RWB', 'LWB', 'GK'].includes(p)) return '#fff';
    return '#000';
  };
  const rows = [];
  if (lineup && lineup.length) {
    const gk = lineup.filter(p => p.position === 'GK');
    const def = lineup.filter(p => ['CB', 'RB', 'LB', 'RWB', 'LWB'].includes(p.position));
    const mid = lineup.filter(p => ['CM', 'DM', 'AM', 'RM', 'LM', 'CAM', 'CDM'].includes(p.position));
    const att = lineup.filter(p => ['ST', 'CF', 'RW', 'LW', 'SS', 'FWD'].includes(p.position));
    if (gk.length) rows.push(gk);
    if (def.length) rows.push(def);
    if (mid.length) rows.push(mid);
    if (att.length) rows.push(att);
  }
  const playersHTML = rows.length ? rows.map(row => `
    <div style="display:flex;justify-content:space-around;align-items:center;">
      ${row.map(p => `
        <div style="text-align:center;">
          <div style="width:22px;height:22px;border-radius:50%;background:${roleColor(p.position)};border:1.5px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-size:6px;font-weight:900;color:${textColor(p.position)};margin:0 auto;">${p.position || '?'}</div>
          <div style="font-size:6px;color:#fff;margin-top:2px;max-width:44px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
        </div>
      `).join('')}
    </div>
  `).join('') : '<div style="color:rgba(255,255,255,.5);text-align:center;font-size:11px;padding:20px;">لا توجد تشكيلة</div>';

  return `
    <div style="text-align:center;">
      <img class="rp-flag" src="${flagUrl(team.flag, 'lg')}" alt="${team.n}" onerror="this.onerror=null;this.src='${FLAG_FALLBACK}'">
      <div class="rp-tname">${team.n}</div>
      <div class="rp-team-meta">${team.stage || 'Knockout'}</div>
      <div style="font-size:10px;color:#f2d580;margin:4px 0 8px;">${formation}</div>
      <div style="position:relative;background:#2d7a3a;border-radius:8px;border:1.5px solid #3a9e4a;padding:8px;">
        <div style="position:absolute;top:50%;left:8%;right:8%;height:1px;background:rgba(255,255,255,.2);transform:translateY(-50%);"></div>
        <div style="display:flex;flex-direction:column;justify-content:space-around;min-height:200px;gap:4px;">
          ${playersHTML}
        </div>
      </div>
    </div>
  `;
}


function renderResultPage(match, pd, errorMessage = '') {
  const setImg = (id, code, name) => {
    const img = document.getElementById(id);
    img.src = flagUrl(code, 'lg');
    img.alt = name;
    img.onerror = () => { img.onerror = null; img.src = FLAG_FALLBACK; };
  };

  if (pd) {
    document.querySelector('.rp-matchup').innerHTML = `
      ${renderLineupField(match.t1, pd.lineup1, pd.formation1 || '4-3-3')}
      <div class="rp-vs-block">
        <div class="rp-vs">VS</div>
        <div class="rp-match-info" id="rpInfo"></div>
      </div>
      ${renderLineupField(match.t2, pd.lineup2, pd.formation2 || '4-3-3')}
    `;
  }
  document.getElementById('rpInfo').textContent = `${match.stage || 'Knockout'}`;

  const content = document.getElementById('resultContent');

  if (errorMessage) {
    content.innerHTML = `<div class="error-box">${errorMessage}<div><button class="retry-btn" onclick="goToResult()">إعادة المحاولة</button></div></div>`;
    return;
  }

  const userLabel = selectedPredictionCode === '1' ? `فوز ${match.t1.n}` : `فوز ${match.t2.n}`;
  const aiCode = pd.win >= pd.loss ? '1' : '2';
  const aiLabel = `فوز ${pd.winner}`;
  const matched = aiCode === selectedPredictionCode;
  const comparisonMessage = matched ? ' توقعك مطابق للنموذج' : ' اختيارك مختلف عن النموذج';

  content.innerHTML = `
    <div class="result-grid">
      <div class="panel result-card">
        <div class="rc-label">توقع الذكاء الاصطناعي</div>
        <div class="rc-result">${aiLabel}</div>
      </div>
      <div class="panel">
        <div class="block-title"> نسب الاحتمالات</div>
        <div class="prob-row">
          <div class="prob-row-head"><span class="prob-name">${match.t1.n}</span><span class="prob-pct">${pd.win}%</span></div>
          <div class="prob-bar-bg"><div class="prob-bar-fill pf-win" style="width:${pd.win}%"></div></div>
        </div>
        <div class="prob-row">
          <div class="prob-row-head"><span class="prob-name">${match.t2.n}</span><span class="prob-pct">${pd.loss}%</span></div>
          <div class="prob-bar-bg"><div class="prob-bar-fill pf-loss" style="width:${pd.loss}%"></div></div>
        </div>
      </div>
    </div>
    <div id="matchAnalysisKO"></div>

    <div class="panel">
      <div class="analysis-title">تحليل المباراة</div>
      ${pd.analysis.map(a => `<div class="analysis-point"><span class="ap-icon">${a.i}</span><span>${a.text}</span></div>`).join('')}
    </div>

    <div class="panel" style="margin-bottom:16px;">
      <div class="small-title" style="margin-bottom:14px;"> مقارنة توقعك مع الذكاء الاصطناعي</div>
      <div class="compare-row">
        <div class="compare-card">
          <div class="cc-label">توقعك</div>
          <div class="cc-val">${userLabel}</div>
          <div class="cc-sub">اختيارك الشخصي</div>
        </div>
        <div class="compare-card">
          <div class="cc-label">توقع الذكاء الاصطناعي</div>
          <div class="cc-val">${aiLabel}</div>
          <div class="cc-sub">${matched ? ' توقعك مطابق للنموذج' : ' اختيارك مختلف عن النموذج'}</div>
        </div>
      </div>
    </div>
  `;


}

function advanceWinner(winnerName, winnerFlag) {
  const winner = { flag: winnerFlag, n: winnerName };
  const side   = currentBracketSide;
  const idx    = currentBracketIndex;

  // Map: which array → which next array and slot index
  const map = {
    LEFT_R32:  { next: LEFT_R16,  nextIdx: () => Math.floor(idx / 2) },
    LEFT_R16:  { next: LEFT_QF,   nextIdx: () => Math.floor(idx / 2) },
    LEFT_QF:   { next: LEFT_SF,   nextIdx: () => Math.floor(idx / 2) },
    RIGHT_R32: { next: RIGHT_R16, nextIdx: () => Math.floor(idx / 2) },
    RIGHT_R16: { next: RIGHT_QF,  nextIdx: () => Math.floor(idx / 2) },
    RIGHT_QF:  { next: RIGHT_SF,  nextIdx: () => Math.floor(idx / 2) },
  };

  if (map[side]) {
    const nextIdx = map[side].nextIdx();
    const nextMatch = map[side].next[nextIdx];
    if (idx % 2 === 0) nextMatch.t1 = winner;
    else               nextMatch.t2 = winner;

  } else if (side === 'LEFT_SF') {
    // Winner → Final t1
    FINAL.t1 = winner;
    // Loser → Third Place t1
    const loser = (winnerName === currentMatch.t1.n)
      ? { flag: currentMatch.t2.flag, n: currentMatch.t2.n }
      : { flag: currentMatch.t1.flag, n: currentMatch.t1.n };
    THIRD_PLACE.t1 = loser;

  } else if (side === 'RIGHT_SF') {
    // Winner → Final t2
    FINAL.t2 = winner;
    // Loser → Third Place t2
    const loser = (winnerName === currentMatch.t1.n)
      ? { flag: currentMatch.t2.flag, n: currentMatch.t2.n }
      : { flag: currentMatch.t1.flag, n: currentMatch.t1.n };
    THIRD_PLACE.t2 = loser;

  } else if (side === 'FINAL') {
    showChampion(winnerName, winnerFlag);
    return; // no re-render needed
  }

  renderBracket();
}

function showChampion(winnerName, winnerFlag) {
  const overlay = document.createElement('div');
  overlay.style = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,.93);z-index:9999;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:20px;
  `;
  overlay.innerHTML = `
    <div style="font-size:72px;animation:none;color:#C9A84C;">★</div>
    <img src="https://flagcdn.com/w80/${winnerFlag}.png"
         style="width:90px;border-radius:6px;
                box-shadow:0 0 20px rgba(201,168,76,.6);">
    <div style="color:#C9A84C;font-size:32px;font-weight:900;
                text-align:center;">${winnerName}</div>
    <div style="color:#F0F0F0;font-size:18px;">
      بطل كأس العالم 2026
    </div>
    <div style="color:#888;font-size:13px;margin-top:8px;">
      اضغط في أي مكان للإغلاق
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
}

async function goToResult() {
  if (!currentMatch || !selectedPredictionCode) return;
  closeModal();
  document.getElementById('resultPage').classList.add('open');
  document.getElementById('resultContent').innerHTML = `
    <div class="loading-state">
      <div class="loading-block">
        <div class="spinner"></div>
        <div>جاري التحميل...</div>
      </div>
    </div>`;

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team1: currentMatch.t1.n,
        team2: currentMatch.t2.n,
        stage: currentMatch.stage,
      })
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const pd = normalizePredictionData(currentMatch, data);
    renderResultPage(currentMatch, pd);
    renderMatchAnalysis(currentMatch.t1.n, currentMatch.t2.n, 'matchAnalysisKO');
    
    // Find winner flag
    const winnerFlag = pd.winner === currentMatch.t1.n
      ? currentMatch.t1.flag
      : currentMatch.t2.flag;
    advanceWinner(pd.winner, winnerFlag);
  } catch (err) {
    console.error(err);
    renderResultPage(currentMatch, null, 'تعذر جلب التوقع. يرجى المحاولة مرة أخرى.');
  }
}

function closeResult() {
  document.getElementById('resultPage').classList.remove('open');
  if (probabilityChart) { probabilityChart.destroy(); probabilityChart = null; }
}

// ── EVENTS ──
document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('po1').addEventListener('click', () => pickPrediction('1'));
document.getElementById('po2').addEventListener('click', () => pickPrediction('X'));
document.getElementById('po3').addEventListener('click', () => pickPrediction('2'));
document.getElementById('modalCta').addEventListener('click', goToResult);
document.getElementById('backToMatchesBtn').addEventListener('click', closeResult);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeResult(); } });

function renderUserHeader() {
  const container = document.getElementById('userHeaderSection');
  if (!container) return;

  const token = localStorage.getItem('wc_token');
  const username = localStorage.getItem('wc_username');

  if (token && username) {
    container.innerHTML = `
      <span style="color: #fff; font-weight: 700;">مرحباً ${username}</span>
      <button onclick="handleLogout()" style="background: rgba(192, 57, 43, 0.15); border: 1px solid #C0392B; color: #ff8e8e; padding: 4px 12px; border-radius: 8px; cursor: pointer; font-size: 0.75rem; font-weight: 700;">خروج</button>
    `;
  } else {
    container.innerHTML = `
      <a href="login.html" style="background: linear-gradient(135deg, #D4AF37, #A97918); color: #000; padding: 5px 14px; border-radius: 10px; font-weight: 900; font-size: 0.8rem; text-decoration: none;">تسجيل دخول</a>
    `;
  }
}

async function handleLogout() {
  const token = localStorage.getItem('wc_token');
  if (token) {
    try {
      await fetch('http://localhost:5000/api/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) { console.error("Logout error", e); }
  }
  localStorage.removeItem('wc_token');
  localStorage.removeItem('wc_username');
  window.location.reload();
}

renderUserHeader();

// ── QUALIFICATION TABLES ──────────────────────────────────────────
const rawQual = localStorage.getItem('wc2026_qualified');
if (rawQual) {
  const teams = JSON.parse(rawQual);
  const direct = teams.filter(t => !t.bestThird);
  const best8  = teams.filter(t => t.bestThird);

  const panel = document.createElement('div');
  panel.style = `
    margin: 32px auto;
    max-width: 700px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 0 16px;
  `;
  panel.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,.08);
                border-radius:12px;padding:16px;">
      <div style="color:#C9A84C;font-weight:700;font-size:13px;
                  margin-bottom:12px;text-align:center;">
        المتأهلون مباشرة (${direct.length} فريق)
      </div>
      ${direct.map(t => `
        <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);
                    color:#F0F0F0;font-size:12px;text-align:center;">${t.n}</div>
      `).join('')}
    </div>
    <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,.08);
                border-radius:12px;padding:16px;">
      <div style="color:#C9A84C;font-weight:700;font-size:13px;
                  margin-bottom:12px;text-align:center;">
        أفضل 8 مراكز ثالثة
      </div>
      ${best8.map(t => `
        <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);
                    color:#F0F0F0;font-size:12px;text-align:center;">${t.n}</div>
      `).join('')}
    </div>
  `;
  document.querySelector('.bracket-page')?.appendChild(panel);
}
