const API_BASE = 'http://localhost:5000/api';
const AUTO_REFRESH_MS = 60000;
const FLAG_BASE = 'https://flagcdn.com/w80';
const FLAG_FALLBACK = 'https://placehold.co/80x60/0e2c44/e7f1f7?text=TEAM';

const START = new Date(2026, 5, 11);
let cur = new Date(START);
let currentSelection = null;
let selectedPredictionCode = null;
let currentResultData = null;
let lastFetchedMatchesHash = '';
let probabilityChart = null;
let squadsJsonCache = null;
let autoSimRunning = false;

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const TEAM_NAME_MAP = {
  // Master Name Mapping (External/Old -> Canonical)
  'USA': 'United States',
  'South Korea': 'Korea Republic',
  'Ivory Coast': "Cote d'Ivoire",
  'Congo': 'Congo DR',
  'DR Congo': 'Congo DR',
  'Czechia': 'Czech Republic',
  'Bosnia and Herzegovina': 'Bosnia&Herz',
  'Cape Verde': 'Cabo Verde',
  'Curaçao': 'Curacao',
  'Türkiye': 'Turkey',
  'IR Iran': 'Iran',
};

const TEAMS_LINEUP_JSON = 'teams_lineup.json';

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function getLineupQueryFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const team = (q.get('team') || '').trim();
  const id = (q.get('id') || '').trim();
  if (team) return { mode: 'team', display: team, csv: team };
  if (id) return { mode: 'id', display: id, csv: id };
  return { mode: '', display: '', csv: '' };
}

function setLineupTeamInUrl(displayName) {
  const u = new URL(window.location.href);
  u.searchParams.delete('id');
  if (displayName) u.searchParams.set('team', displayName);
  else u.searchParams.delete('team');
  window.history.replaceState({}, '', `${u.pathname}${u.search}${u.hash}`);
}

function highlightLineupRowInGroups(displayName) {
  document.querySelectorAll('.gc-team.tlu-lineup-active').forEach(el => el.classList.remove('tlu-lineup-active'));
  if (!displayName) return;
  document.querySelectorAll('.gc-team[data-team-name]').forEach(el => {
    if (el.dataset.teamName === displayName) el.classList.add('tlu-lineup-active');
  });
}

function positionBadgeClass(pos) {
  const p = (pos || '').toUpperCase();
  if (p === 'GK') return 'tlu-pos tlu-pos-gk';
  if (['CB', 'RB', 'LB', 'RWB', 'LWB'].includes(p)) return 'tlu-pos tlu-pos-def';
  if (['ST', 'CF', 'RW', 'LW', 'SS'].includes(p)) return 'tlu-pos tlu-pos-fwd';
  return 'tlu-pos tlu-pos-mid';
}

async function fetchSquadPlayersForCsvTeam(csvTeamName) {
  if (!csvTeamName) return [];
  const inline = typeof window !== 'undefined' && window.TEAMS_LINEUP_DATA;
  if (inline && Array.isArray(inline[csvTeamName])) return inline[csvTeamName];
  try {
    const r = await fetch(`${API_BASE}/squad?team=${encodeURIComponent(csvTeamName)}`);
    if (r.ok) {
      const d = await r.json();
      return Array.isArray(d.players) ? d.players : [];
    }
  } catch (_) { /* offline or CORS */ }
  if (!squadsJsonCache) {
    try {
      const r2 = await fetch(TEAMS_LINEUP_JSON);
      if (r2.ok) squadsJsonCache = await r2.json();
    } catch (_) { /* no static file */ }
  }
  if (squadsJsonCache && squadsJsonCache[csvTeamName]) return squadsJsonCache[csvTeamName];
  return [];
}

async function refreshTeamLineupPanel() {
  const root = document.getElementById('teamLineupRoot');
  const sub = document.getElementById('teamLineupSelectedName');
  const section = document.getElementById('teamLineupSection');
  if (!root || !sub) return;
  if (section) section.style.display = '';
  const q = getEffectiveLineupQuery();
  highlightLineupRowInGroups(q.display);
  if (q.fromUrl) {
    sub.textContent = '';
  } else {
    sub.textContent = '';
  }
  root.innerHTML = '<div class="tlu-loading">جاري تحميل التشكيلة…</div>';
  const players = await fetchSquadPlayersForCsvTeam(q.csv);
  if (!players.length) {
    root.innerHTML = `<div class="tlu-empty">لا توجد بيانات للاعبين لهذا المنتخب.</div>`;
    return;
  }
  const rows = players.map(p => `
    <tr>
      <td class="tlu-ppos"><span class="${positionBadgeClass(p.position)}">${escHtml(p.position || '—')}</span></td>
      <td class="tlu-pname">${escHtml(p.name)}</td>
      <td class="tlu-povr">${p.ovr != null ? escHtml(String(p.ovr)) : '—'}</td>
    </tr>
  `).join('');
  root.innerHTML = `

    <div class="tlu-table-wrap">
      <table class="tlu-table">
        <thead><tr><th>المركز</th><th>اللاعب</th><th>OVR</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function attachTeamLineupInteractions() {
  const host = document.getElementById('groupsView');
  if (!host || host.dataset.lineupBound === '1') return;
  host.dataset.lineupBound = '1';
  host.addEventListener('click', ev => {
    const row = ev.target.closest('.gc-team-selectable');
    if (!row || !row.dataset.teamName) return;
    setLineupTeamInUrl(row.dataset.teamName);
    refreshTeamLineupPanel();
  });
  window.addEventListener('popstate', () => refreshTeamLineupPanel());
  renderUserHeader();
}

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

function saveScroll() {
  localStorage.setItem('wc_scroll_pos', window.scrollY.toString());
  localStorage.setItem('wc_came_from_dash', '1');
}

const FLAG_CODE_MAP = {
  'xx': null
};

const GROUPS = [
  {
    n: 'A', t: [
      { flag: 'mx', n: 'Mexico', rank: 15 },
      { flag: 'za', n: 'South Africa', rank: 59 },
      { flag: 'kr', n: 'Korea Republic', rank: 23 },
      { flag: 'cz', n: 'Czech Republic', rank: 36 }
    ]
  },
  {
    n: 'B', t: [
      { flag: 'ca', n: 'Canada', rank: 49 },
      { flag: 'qa', n: 'Qatar', rank: 34 },
      { flag: 'ch', n: 'Switzerland', rank: 19 },
      { flag: 'ba', n: 'Bosnia&Herz', rank: 74 }
    ]
  },
  {
    n: 'C', t: [
      { flag: 'br', n: 'Brazil', rank: 5 },
      { flag: 'ma', n: 'Morocco', rank: 13 },
      { flag: 'ht', n: 'Haiti', rank: 86 },
      { flag: 'gb-sct', n: 'Scotland', rank: 39 }
    ]
  },
  {
    n: 'D', t: [
      { flag: 'us', n: 'United States', rank: 11 },
      { flag: 'py', n: 'Paraguay', rank: 56 },
      { flag: 'au', n: 'Australia', rank: 24 },
      { flag: 'tr', n: 'Turkey', rank: 40 }
    ]
  },
  {
    n: 'E', t: [
      { flag: 'de', n: 'Germany', rank: 16 },
      { flag: 'ec', n: 'Ecuador', rank: 31 },
      { flag: 'cw', n: 'Curacao', rank: 91 },
      { flag: 'ci', n: "Cote d'Ivoire", rank: 38 }
    ]
  },
  {
    n: 'F', t: [
      { flag: 'nl', n: 'Netherlands', rank: 7 },
      { flag: 'jp', n: 'Japan', rank: 18 },
      { flag: 'tn', n: 'Tunisia', rank: 41 },
      { flag: 'se', n: 'Sweden', rank: 27 }
    ]
  },
  {
    n: 'G', t: [
      { flag: 'be', n: 'Belgium', rank: 3 },
      { flag: 'ir', n: 'Iran', rank: 20 },
      { flag: 'eg', n: 'Egypt', rank: 36 },
      { flag: 'nz', n: 'New Zealand', rank: 107 }
    ]
  },
  {
    n: 'H', t: [
      { flag: 'es', n: 'Spain', rank: 8 },
      { flag: 'uy', n: 'Uruguay', rank: 11 },
      { flag: 'sa', n: 'Saudi Arabia', rank: 53 },
      { flag: 'cv', n: 'Cabo Verde', rank: 65 }
    ]
  },
  {
    n: 'I', t: [
      { flag: 'fr', n: 'France', rank: 2 },
      { flag: 'sn', n: 'Senegal', rank: 17 },
      { flag: 'no', n: 'Norway', rank: 47 },
      { flag: 'iq', n: 'Iraq', rank: 58 }
    ]
  },
  {
    n: 'J', t: [
      { flag: 'ar', n: 'Argentina', rank: 1 },
      { flag: 'dz', n: 'Algeria', rank: 43 },
      { flag: 'at', n: 'Austria', rank: 25 },
      { flag: 'jo', n: 'Jordan', rank: 71 }
    ]
  },
  {
    n: 'K', t: [
      { flag: 'pt', n: 'Portugal', rank: 6 },
      { flag: 'co', n: 'Colombia', rank: 12 },
      { flag: 'uz', n: 'Uzbekistan', rank: 64 },
      { flag: 'cd', n: 'Congo DR', rank: 63 }
    ]
  },
  {
    n: 'L', t: [
      { flag: 'gb-eng', n: 'England', rank: 4 },
      { flag: 'hr', n: 'Croatia', rank: 10 },
      { flag: 'gh', n: 'Ghana', rank: 68 },
      { flag: 'pa', n: 'Panama', rank: 45 }
    ]
  }
];

function getDefaultLineupTeamDisplay() {
  try {
    return GROUPS[0].t[0].n;
  } catch (_) {
    return 'Mexico';
  }
}

function getEffectiveLineupQuery() {
  const q = getLineupQueryFromUrl();
  if (q.display) return { ...q, fromUrl: true };
  const display = getDefaultLineupTeamDisplay();
  return { mode: 'default', display, csv: display, fromUrl: false };
}

let STANDINGS = {
  A: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  B: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  C: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  D: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  E: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  F: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  G: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  H: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  I: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  J: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  K: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
  L: [{ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, { pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }],
};

const REAL_MATCHES = {
  0: [
    { group: 'A', status: 'upcoming', time: '22:00', venue: 'إستاديو مكسيكو سيتي', t1: { flag: 'mx', n: 'Mexico', rank: '—' }, t2: { flag: 'za', n: 'South Africa', rank: '—' } }
  ],
  1: [
    { group: 'A', status: 'upcoming', time: '05:00', venue: 'إستاديو غوادالاخارا', t1: { flag: 'kr', n: 'Korea Republic', rank: '—' }, t2: { flag: 'cz', n: 'Czech Republic', rank: '—' } },
    { group: 'B', status: 'upcoming', time: '22:00', venue: 'تورونتو ستيديوم', t1: { flag: 'ca', n: 'Canada', rank: '—' }, t2: { flag: 'ba', n: 'Bosnia&Herz', rank: '—' } }
  ],
  2: [
    { group: 'D', status: 'upcoming', time: '04:00', venue: 'لوس أنجلوس ستيديوم', t1: { flag: 'us', n: 'United States', rank: '—' }, t2: { flag: 'py', n: 'Paraguay', rank: '—' } },
    { group: 'B', status: 'upcoming', time: '22:00', venue: 'سان فرانسيسكو بي إيريا ستيديوم', t1: { flag: 'qa', n: 'Qatar', rank: '—' }, t2: { flag: 'ch', n: 'Switzerland', rank: '—' } }
  ],
  3: [
    { group: 'C', status: 'upcoming', time: '01:00', venue: 'نيويورك/نيو جيرسي ستيديوم', t1: { flag: 'br', n: 'Brazil', rank: '—' }, t2: { flag: 'ma', n: 'Morocco', rank: '—' } },
    { group: 'C', status: 'upcoming', time: '04:00', venue: 'ملعب بوسطن', t1: { flag: 'ht', n: 'Haiti', rank: '—' }, t2: { flag: 'gb-sct', n: 'Scotland', rank: '—' } },
    { group: 'D', status: 'upcoming', time: '07:00', venue: 'بي سي بليس فانكوفر', t1: { flag: 'au', n: 'Australia', rank: '—' }, t2: { flag: 'tr', n: 'Turkey', rank: '—' } },
    { group: 'E', status: 'upcoming', time: '20:00', venue: 'هيوستن ستيديوم', t1: { flag: 'de', n: 'Germany', rank: '—' }, t2: { flag: 'cw', n: 'Curacao', rank: '—' } },
    { group: 'F', status: 'upcoming', time: '23:00', venue: 'دالاس ستيديوم', t1: { flag: 'nl', n: 'Netherlands', rank: '—' }, t2: { flag: 'jp', n: 'Japan', rank: '—' } }
  ],

  4: [
    { group: 'E', status: 'upcoming', time: '02:00', venue: 'فيلاديلفيا ستيديوم', t1: { flag: 'ci', n: "Cote d'Ivoire", rank: '—' }, t2: { flag: 'ec', n: 'Ecuador', rank: '—' } },
    { group: 'F', status: 'upcoming', time: '05:00', venue: 'إستاديو مونتيري', t1: { flag: 'se', n: 'Sweden', rank: '—' }, t2: { flag: 'tn', n: 'Tunisia', rank: '—' } },
    { group: 'H', status: 'upcoming', time: '19:00', venue: 'أتلانتا ستيديوم', t1: { flag: 'es', n: 'Spain', rank: '—' }, t2: { flag: 'cv', n: 'Cabo Verde', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '22:00', venue: 'سياتل ستيديوم', t1: { flag: 'be', n: 'Belgium', rank: '—' }, t2: { flag: 'eg', n: 'Egypt', rank: '—' } }
  ],

  5: [
    { group: 'H', status: 'upcoming', time: '01:00', venue: 'ميامي ستيديوم', t1: { flag: 'sa', n: 'Saudi Arabia', rank: '—' }, t2: { flag: 'uy', n: 'Uruguay', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '04:00', venue: 'لوس أنجلوس ستيديوم', t1: { flag: 'ir', n: 'Iran', rank: '—' }, t2: { flag: 'nz', n: 'New Zealand', rank: '—' } },
    { group: 'I', status: 'upcoming', time: '22:00', venue: 'نيويورك/نيو جيرسي ستيديوم', t1: { flag: 'fr', n: 'France', rank: '—' }, t2: { flag: 'sn', n: 'Senegal', rank: '—' } }
  ],
  6: [
    { group: 'I', status: 'upcoming', time: '01:00', venue: 'بوسطن ستيديوم', t1: { flag: 'iq', n: 'Iraq', rank: '—' }, t2: { flag: 'no', n: 'Norway', rank: '—' } },
    { group: 'J', status: 'upcoming', time: '04:00', venue: 'كانساس سيتي ستيديوم', t1: { flag: 'ar', n: 'Argentina', rank: '—' }, t2: { flag: 'dz', n: 'Algeria', rank: '—' } },
    { group: 'J', status: 'upcoming', time: '07:00', venue: 'سان فرانسيسكو بي إيريا ستيديوم', t1: { flag: 'at', n: 'Austria', rank: '—' }, t2: { flag: 'jo', n: 'Jordan', rank: '—' } },
    { group: 'K', status: 'upcoming', time: '20:00', venue: 'هيوستن ستيديوم', t1: { flag: 'pt', n: 'Portugal', rank: '—' }, t2: { flag: 'cd', n: 'Congo DR', rank: '—' } },
    { group: 'L', status: 'upcoming', time: '23:00', venue: 'دالاس ستيديوم', t1: { flag: 'gb-eng', n: 'England', rank: '—' }, t2: { flag: 'hr', n: 'Croatia', rank: '—' } }
  ],
  7: [
    { group: 'L', status: 'upcoming', time: '02:00', venue: 'تورونتو ستيديوم', t1: { flag: 'gh', n: 'Ghana', rank: '—' }, t2: { flag: 'pa', n: 'Panama', rank: '—' } },
    { group: 'K', status: 'upcoming', time: '05:00', venue: 'إستاديو مكسيكو سيتي', t1: { flag: 'uz', n: 'Uzbekistan', rank: '—' }, t2: { flag: 'co', n: 'Colombia', rank: '—' } },
    { group: 'A', status: 'upcoming', time: '19:00', venue: 'أتلانتا ستيديوم', t1: { flag: 'cz', n: 'Czech Republic', rank: '—' }, t2: { flag: 'za', n: 'South Africa', rank: '—' } },
    { group: 'B', status: 'upcoming', time: '22:00', venue: 'لوس أنجلوس ستيديوم', t1: { flag: 'ch', n: 'Switzerland', rank: '—' }, t2: { flag: 'ba', n: 'Bosnia&Herz', rank: '—' } }
  ],
  8: [
    { group: 'B', status: 'upcoming', time: '01:00', venue: 'بي سي بليس فانكوفر', t1: { flag: 'ca', n: 'Canada', rank: '—' }, t2: { flag: 'qa', n: 'Qatar', rank: '—' } },
    { group: 'A', status: 'upcoming', time: '04:00', venue: 'إستاديو غوادالاخارا', t1: { flag: 'mx', n: 'Mexico', rank: '—' }, t2: { flag: 'kr', n: 'Korea Republic', rank: '—' } },
    { group: 'D', status: 'upcoming', time: '22:00', venue: 'سياتل ستيديوم', t1: { flag: 'us', n: 'United States', rank: '—' }, t2: { flag: 'au', n: 'Australia', rank: '—' } }
  ],
  9: [
    { group: 'C', status: 'upcoming', time: '01:00', venue: 'بوسطن ستيديوم', t1: { flag: 'gb-sct', n: 'Scotland', rank: '—' }, t2: { flag: 'ma', n: 'Morocco', rank: '—' } },
    { group: 'C', status: 'upcoming', time: '04:00', venue: 'فيلاديلفيا ستيديوم', t1: { flag: 'br', n: 'Brazil', rank: '—' }, t2: { flag: 'ht', n: 'Haiti', rank: '—' } },
    { group: 'D', status: 'upcoming', time: '07:00', venue: 'سان فرانسيسكو بي إيريا ستيديوم', t1: { flag: 'tr', n: 'Turkey', rank: '—' }, t2: { flag: 'py', n: 'Paraguay', rank: '—' } },
    { group: 'E', status: 'upcoming', time: '20:00', venue: 'تورونتو ستيديوم', t1: { flag: 'de', n: 'Germany', rank: '—' }, t2: { flag: 'ci', n: "Cote d'Ivoire", rank: '—' } },
    { group: 'F', status: 'upcoming', time: '23:00', venue: 'هيوستن ستيديوم', t1: { flag: 'nl', n: 'Netherlands', rank: '—' }, t2: { flag: 'se', n: 'Sweden', rank: '—' } }
  ],
  10: [
    { group: 'E', status: 'upcoming', time: '03:00', venue: 'كانساس سيتي ستيديوم', t1: { flag: 'ec', n: 'Ecuador', rank: '—' }, t2: { flag: 'cw', n: 'Curacao', rank: '—' } },
    { group: 'F', status: 'upcoming', time: '07:00', venue: 'إستاديو مونتيري', t1: { flag: 'tn', n: 'Tunisia', rank: '—' }, t2: { flag: 'jp', n: 'Japan', rank: '—' } },
    { group: 'H', status: 'upcoming', time: '19:00', venue: 'أتلانتا ستيديوم', t1: { flag: 'es', n: 'Spain', rank: '—' }, t2: { flag: 'sa', n: 'Saudi Arabia', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '22:00', venue: 'لوس أنجلوس ستيديوم', t1: { flag: 'be', n: 'Belgium', rank: '—' }, t2: { flag: 'ir', n: 'Iran', rank: '—' } }
  ],
  11: [
    { group: 'H', status: 'upcoming', time: '01:00', venue: 'ميامي ستيديوم', t1: { flag: 'uy', n: 'Uruguay', rank: '—' }, t2: { flag: 'cv', n: 'Cabo Verde', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '04:00', venue: 'بي سي بليس فانكوفر', t1: { flag: 'nz', n: 'New Zealand', rank: '—' }, t2: { flag: 'eg', n: 'Egypt', rank: '—' } },
    { group: 'J', status: 'upcoming', time: '20:00', venue: 'دالاس ستيديوم', t1: { flag: 'ar', n: 'Argentina', rank: '—' }, t2: { flag: 'at', n: 'Austria', rank: '—' } }
  ],
  12: [
    { group: 'I', status: 'upcoming', time: '00:00', venue: 'فيلاديلفيا ستيديوم', t1: { flag: 'fr', n: 'France', rank: '—' }, t2: { flag: 'iq', n: 'Iraq', rank: '—' } },
    { group: 'I', status: 'upcoming', time: '03:00', venue: 'نيويورك/نيو جيرسي ستيديوم', t1: { flag: 'no', n: 'Norway', rank: '—' }, t2: { flag: 'sn', n: 'Senegal', rank: '—' } },
    { group: 'J', status: 'upcoming', time: '06:00', venue: 'سان فرانسيسكو بي إيريا ستيديوم', t1: { flag: 'jo', n: 'Jordan', rank: '—' }, t2: { flag: 'dz', n: 'Algeria', rank: '—' } },
    { group: 'K', status: 'upcoming', time: '20:00', venue: 'هيوستن ستيديوم', t1: { flag: 'pt', n: 'Portugal', rank: '—' }, t2: { flag: 'uz', n: 'Uzbekistan', rank: '—' } },
    { group: 'L', status: 'upcoming', time: '23:00', venue: 'بوسطن ستيديوم', t1: { flag: 'gb-eng', n: 'England', rank: '—' }, t2: { flag: 'gh', n: 'Ghana', rank: '—' } }
  ],
  13: [
    { group: 'L', status: 'upcoming', time: '02:00', venue: 'تورونتو ستيديوم', t1: { flag: 'pa', n: 'Panama', rank: '—' }, t2: { flag: 'hr', n: 'Croatia', rank: '—' } },
    { group: 'K', status: 'upcoming', time: '05:00', venue: 'إستاديو غوادالاخارا', t1: { flag: 'co', n: 'Colombia', rank: '—' }, t2: { flag: 'cd', n: 'Congo DR', rank: '—' } },
    { group: 'B', status: 'upcoming', time: '22:00', venue: 'بي سي بليس فانكوفر', t1: { flag: 'ch', n: 'Switzerland', rank: '—' }, t2: { flag: 'ca', n: 'Canada', rank: '—' } },
    { group: 'B', status: 'upcoming', time: '22:00', venue: 'سياتل ستيديوم', t1: { flag: 'ba', n: 'Bosnia&Herz', rank: '—' }, t2: { flag: 'qa', n: 'Qatar', rank: '—' } }
  ],
  14: [
    { group: 'C', status: 'upcoming', time: '01:00', venue: 'ميامي ستيديوم', t1: { flag: 'gb-sct', n: 'Scotland', rank: '—' }, t2: { flag: 'br', n: 'Brazil', rank: '—' } },
    { group: 'C', status: 'upcoming', time: '01:00', venue: 'أتلانتا ستيديوم', t1: { flag: 'ma', n: 'Morocco', rank: '—' }, t2: { flag: 'ht', n: 'Haiti', rank: '—' } },
    { group: 'A', status: 'upcoming', time: '04:00', venue: 'إستاديو مكسيكو سيتي', t1: { flag: 'cz', n: 'Czech Republic', rank: '—' }, t2: { flag: 'mx', n: 'Mexico', rank: '—' } },
    { group: 'A', status: 'upcoming', time: '04:00', venue: 'إستاديو مونتيري', t1: { flag: 'za', n: 'South Africa', rank: '—' }, t2: { flag: 'kr', n: 'Korea Republic', rank: '—' } },
    { group: 'E', status: 'upcoming', time: '23:00', venue: 'فيلاديلفيا ستيديوم', t1: { flag: 'cw', n: 'Curacao', rank: '—' }, t2: { flag: 'ci', n: "Cote d'Ivoire", rank: '—' } },
    { group: 'E', status: 'upcoming', time: '23:00', venue: 'نيويورك/نيو جيرسي ستيديوم', t1: { flag: 'ec', n: 'Ecuador', rank: '—' }, t2: { flag: 'de', n: 'Germany', rank: '—' } }
  ],
  15: [
    { group: 'F', status: 'upcoming', time: '02:00', venue: 'دالاس ستيديوم', t1: { flag: 'jp', n: 'Japan', rank: '—' }, t2: { flag: 'se', n: 'Sweden', rank: '—' } },
    { group: 'F', status: 'upcoming', time: '02:00', venue: 'كانساس سيتي ستيديوم', t1: { flag: 'tn', n: 'Tunisia', rank: '—' }, t2: { flag: 'nl', n: 'Netherlands', rank: '—' } },
    { group: 'D', status: 'upcoming', time: '05:00', venue: 'لوس أنجلوس ستيديوم', t1: { flag: 'tr', n: 'Turkey', rank: '—' }, t2: { flag: 'us', n: 'United States', rank: '—' } },
    { group: 'D', status: 'upcoming', time: '05:00', venue: 'سان فرانسيسكو بي إيريا ستيديوم', t1: { flag: 'py', n: 'Paraguay', rank: '—' }, t2: { flag: 'au', n: 'Australia', rank: '—' } },
    { group: 'I', status: 'upcoming', time: '22:00', venue: 'بوسطن ستيديوم', t1: { flag: 'no', n: 'Norway', rank: '—' }, t2: { flag: 'fr', n: 'France', rank: '—' } },
    { group: 'I', status: 'upcoming', time: '22:00', venue: 'تورونتو ستيديوم', t1: { flag: 'sn', n: 'Senegal', rank: '—' }, t2: { flag: 'iq', n: 'Iraq', rank: '—' } }
  ],
  16: [
    { group: 'H', status: 'upcoming', time: '03:00', venue: 'إستاديو غوادالاخارا', t1: { flag: 'uy', n: 'Uruguay', rank: '—' }, t2: { flag: 'es', n: 'Spain', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '03:00', venue: 'هيوستن ستيديوم', t1: { flag: 'cv', n: 'Cabo Verde', rank: '—' }, t2: { flag: 'sa', n: 'Saudi Arabia', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '06:00', venue: 'سياتل ستيديوم', t1: { flag: 'eg', n: 'Egypt', rank: '—' }, t2: { flag: 'ir', n: 'Iran', rank: '—' } },
    { group: 'G', status: 'upcoming', time: '06:00', venue: 'بي سي بليس فانكوفر', t1: { flag: 'nz', n: 'New Zealand', rank: '—' }, t2: { flag: 'be', n: 'Belgium', rank: '—' } }
  ],
  17: [
    { group: 'L', status: 'upcoming', time: '00:00', venue: 'نيويورك/نيو جيرسي ستيديوم', t1: { flag: 'pa', n: 'Panama', rank: '—' }, t2: { flag: 'gb-eng', n: 'England', rank: '—' } },
    { group: 'L', status: 'upcoming', time: '00:00', venue: 'فيلاديلفيا ستيديوم', t1: { flag: 'hr', n: 'Croatia', rank: '—' }, t2: { flag: 'gh', n: 'Ghana', rank: '—' } },
    { group: 'J', status: 'upcoming', time: '02:30', venue: 'كانساس سيتي ستيديوم', t1: { flag: 'dz', n: 'Algeria', rank: '—' }, t2: { flag: 'at', n: 'Austria', rank: '—' } },
    { group: 'J', status: 'upcoming', time: '02:30', venue: 'دالاس ستيديوم', t1: { flag: 'jo', n: 'Jordan', rank: '—' }, t2: { flag: 'ar', n: 'Argentina', rank: '—' } },
    { group: 'K', status: 'upcoming', time: '05:00', venue: 'ميامي ستيديوم', t1: { flag: 'co', n: 'Colombia', rank: '—' }, t2: { flag: 'pt', n: 'Portugal', rank: '—' } },
    { group: 'K', status: 'upcoming', time: '05:00', venue: 'أتلانتا ستيديوم', t1: { flag: 'cd', n: 'Congo DR', rank: '—' }, t2: { flag: 'uz', n: 'Uzbekistan', rank: '—' } }
  ]
};

const fallbackMatches = REAL_MATCHES;

const analysisFallback = [
  { i: '', t: (a, b) => `${a} تمتلك مؤشرات هجومية أفضل في آخر سلسلة مباريات مقارنة بـ ${b}.` },
  { i: '', t: (a, b) => `${b} أكثر تماسكاً دفاعياً، لكن جودة الفرص قد تميل لصالح ${a}.` },
  { i: '', t: (a, b) => `يعتمد النموذج على الأداء السابق، الفعالية التهديفية، جودة الخصم، وأثر المدرب.` },
  { i: '', t: (a, b) => `عامل الملعب المحايد يجعل المباراة أقرب، لكن التفاصيل الفردية قد تحسمها.` },
  { i: '', t: (a, b) => `إذا حافظ ${a} على الفاعلية داخل الصندوق فاحتمال الفوز يرتفع بوضوح.` },
  { i: '', t: (a, b) => `الفوارق التكتيكية بين ${a} و ${b} تعطي المباراة طابعاً متوازناً حتى الدقائق الأخيرة.` }
];

const appState = {
  predictions: {},
  processedMatches: {},
  aiResults: {},
  matchesByDay: REAL_MATCHES
};

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function dayOffset() { return Math.round((cur - START) / 86400000); }
function isKnockoutPhase() { return dayOffset() >= 18; }

function fmt12(time) {
  const [hh, mm] = time.split(':').map(Number);
  const h = hh % 12 || 12;
  const suffix = hh >= 12 ? 'م' : 'ص';
  return `${h}:${String(mm).padStart(2, '0')} ${suffix}`;
}

function mapFlagCode(code) {
  if (code in FLAG_CODE_MAP) return FLAG_CODE_MAP[code];
  return code;
}

function flagUrl(code) {
  if (!code) return FLAG_FALLBACK;
  if (code.startsWith('gb-')) return `${FLAG_BASE}/${code}.png`;
  const mapped = mapFlagCode(code);
  return mapped ? `${FLAG_BASE}/${mapped}.png` : FLAG_FALLBACK;
}

function nowStamp() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function updateLastSyncText(message) {
  document.getElementById('lastSyncText').textContent = message || `آخر تحديث: ${nowStamp()}`;
}

function setSyncStatus(text, isError = false) {
  const el = document.getElementById('syncStatus');
  el.textContent = text;
  el.style.color = '';
}

function getMatchesForCurrentDay() {
  const offset = dayOffset();
  return appState.matchesByDay[offset] || [];
}

function statusText(status) {
  if (status === 'live') return { cls: 'st-live', label: 'مباشر' };
  if (status === 'done') return { cls: 'st-done', label: 'انتهت' };
  return { cls: 'st-upcoming', label: 'قادمة' };
}

function renderFlag(code, name, className = 'team-flag-sm') {
  const src = flagUrl(code);
  return `<img class="${className}" src="${src}" alt="${name}" onerror="this.onerror=null;this.src='${FLAG_FALLBACK}'">`;
}

function renderCompactTeam(team) {
  return `
    <div class="mc-team">
      ${renderFlag(team.flag, team.n)}
      <div class="mc-name">${team.n}</div>
    </div>
  `;
}

function createInitialStandings() {
  const standings = {};
  GROUPS.forEach(group => {
    standings[group.n] = group.t.map(() => ({ pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));
  });
  return standings;
}

function sortGroupTable(groupLetter) {
  const group = GROUPS.find(g => g.n === groupLetter);
  const stats = STANDINGS[groupLetter] || [];
  return group.t.map((team, idx) => ({ ...team, ...stats[idx], group: groupLetter, gd: (stats[idx].gf - stats[idx].ga) }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const rankA = parseInt(a.rank) || 999;
      const rankB = parseInt(b.rank) || 999;
      return rankA - rankB || a.n.localeCompare(b.n);
    });
}

function getQualifiedTeams() {
  const first = [], second = [], third = [];
  GROUPS.forEach(group => {
    const table = sortGroupTable(group.n);
    if (table[0]) first.push({ ...table[0], finish: 1 });
    if (table[1]) second.push({ ...table[1], finish: 2 });
    if (table[2]) third.push({ ...table[2], finish: 3 });
  });
  third.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const rankA = parseInt(a.rank) || 999;
    const rankB = parseInt(b.rank) || 999;
    return rankA - rankB || a.n.localeCompare(b.n);
  });
  const bestThird = third.slice(0, 8).map(item => ({ ...item, bestThird: true }));
  return { first, second, third, bestThird };
}

function makeKnockoutBracket() {
  const qualified = getQualifiedTeams();
  const round32Teams = [...qualified.first, ...qualified.second, ...qualified.bestThird];
  const matches = [];
  for (let i = 0; i < round32Teams.length; i += 2) {
    matches.push({
      t1: round32Teams[i] || { flag: 'xx', n: 'TBD' },
      t2: round32Teams[i + 1] || { flag: 'xx', n: 'TBD' },
      s1: null, s2: null
    });
  }
  return { qualified, round32Matches: matches };
}

function renderGroups() {
  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = GROUPS.map(group => {
    const combined = sortGroupTable(group.n);
    return `
      <div class="group-card">
        <div class="gc-header">
          <span class="gc-name" style="color:#F0F0F0">Group ${group.n}</span>
          <div class="gc-cols"><span>W</span><span>D</span><span>L</span><span>PTS</span></div>
        </div>
        ${combined.map((team, i) => `
          <div class="gc-team gc-team-selectable" data-team-name="${escAttr(team.n)}">
            <div class="gc-pos ${i === 0 ? 'q1' : i === 1 ? 'q2' : ''}">${i + 1}</div>
            ${renderFlag(team.flag, team.n)}
            <div class="gc-tname">${team.n}</div>
            <div class="gc-stats">
              <span>${team.w}</span>
              <span>${team.d}</span>
              <span>${team.l}</span>
              <span class="gc-pts">${team.pts}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function renderKnockout() {
  const bracket = makeKnockoutBracket();
  const rounds = [
    { label: 'Round of 32', matches: bracket.round32Matches },
    { label: 'Round of 16', matches: Array.from({ length: 8 }, () => ({ t1: { flag: 'xx', n: 'Winner' }, t2: { flag: 'xx', n: 'Winner' }, s1: null, s2: null })) },
    { label: 'Quarter-finals', matches: Array.from({ length: 4 }, () => ({ t1: { flag: 'xx', n: 'Winner' }, t2: { flag: 'xx', n: 'Winner' }, s1: null, s2: null })) },
    { label: 'Semi-finals', matches: Array.from({ length: 2 }, () => ({ t1: { flag: 'xx', n: 'Winner' }, t2: { flag: 'xx', n: 'Winner' }, s1: null, s2: null })) },
    { label: 'Final', matches: [{ t1: { flag: 'xx', n: 'Winner SF1' }, t2: { flag: 'xx', n: 'Winner SF2' }, s1: null, s2: null }] }
  ];
  document.getElementById('koContent').innerHTML = rounds.map(round => `
    <div class="ko-section">
      <div class="ko-round">${round.label}</div>
      <div class="ko-grid">
        ${round.matches.map(match => `
          <div class="ko-card">
            <div class="ko-team-row ${match.s1 !== null && match.s1 > match.s2 ? 'winner' : ''}">
              ${match.t1.flag !== 'xx' ? renderFlag(match.t1.flag, match.t1.n) : `<div class="team-flag-sm" style="display:grid;place-items:center;background:rgba(201,168,76,.12);color:var(--gold-2);font-size:.65rem;"></div>`}
              <span class="ko-tname">${match.t1.n}</span>
              <span class="ko-tscore ${match.s1 !== null && match.s1 > match.s2 ? 'w' : ''}">${match.s1 !== null ? match.s1 : '—'}</span>
            </div>
            <div class="ko-divider"></div>
            <div class="ko-team-row ${match.s2 !== null && match.s2 > match.s1 ? 'winner' : ''}">
              ${match.t2.flag !== 'xx' ? renderFlag(match.t2.flag, match.t2.n) : `<div class="team-flag-sm" style="display:grid;place-items:center;background:rgba(201,168,76,.12);color:var(--gold-2);font-size:.65rem;"></div>`}
              <span class="ko-tname">${match.t2.n}</span>
              <span class="ko-tscore ${match.s2 !== null && match.s2 > match.s1 ? 'w' : ''}">${match.s2 !== null ? match.s2 : '—'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderMatches() {
  const list = document.getElementById('matchesList');
  const matches = getMatchesForCurrentDay();
  if (!matches.length) {
    list.innerHTML = `<div class="no-matches"><div><div class="nm-icon"></div><p>لا توجد مباريات مجدولة في هذا اليوم</p></div></div>`;
    return;
  }
  const offset = dayOffset();
  list.innerHTML = matches.map((match, index) => {
    const id = `${offset}_${index}`;
    const prediction = appState.predictions[id];
    const aiResult = appState.aiResults[id];
    const predClass = !prediction ? ''
      : (!aiResult || prediction === aiResult) ? 'predicted predicted-correct'
        : 'predicted predicted-wrong';
    const status = statusText(match.status || 'upcoming');
    const metaLabel = match.ko ? match.group : `Group ${match.group}`;
    const venueLabel = match.venue ? `<span class="mc-venue"> ${match.venue}</span>` : '';
    return `
      <div class="match-card" style="animation-delay:${index * .05}s" data-id="${id}" data-match-id="${id}" data-team-id="${match.t1.n}-${match.t2.n}">
        <div class="mc-top">
          <span class="mc-time"> ${fmt12(match.time)} (بتوقيت الأردن)</span>
          <span class="mc-group">${metaLabel}</span>
          <span class="mc-status ${status.cls}">${status.label}</span>
        </div>
        ${venueLabel}
        <div class="mc-body">
          <div class="mc-teams-row">
            ${renderCompactTeam(match.t1)}
            <div class="mc-score"><div class="mc-vs">VS</div></div>
            ${renderCompactTeam(match.t2)}
          </div>
          <div class="mc-extra">
            <span>ترتيب ${match.t1.rank || '—'} ضد ${match.t2.rank || '—'}</span>
            <span>${prediction ? 'تم حفظ توقعك' : 'اختر توقعك الآن'}</span>
          </div>
        </div>
        <button class="mc-predict-btn ${predClass}" type="button" data-open="${id}">
          ${prediction ? ' تم التوقع — تعديل' : ' توقع نتيجة المباراة'}
        </button>
      </div>
    `;
  }).join('');
  // event delegation بدل forEach عشان ما تتراكم الـ listeners كل ما يتعيد الرسم
  const newList = list.cloneNode(false);
  newList.innerHTML = list.innerHTML;
  list.parentNode.replaceChild(newList, list);
  newList.addEventListener('click', event => {
    const btn = event.target.closest('[data-open]');
    const card = event.target.closest('.match-card');
    if (btn) {
      event.stopPropagation();
      const id = btn.dataset.open;
      const [offStr, idxStr] = id.split('_');
      openModal(id, Number(offStr), Number(idxStr));
    } else if (card) {
      const [offStr, idxStr] = card.dataset.id.split('_');
      openModal(card.dataset.id, Number(offStr), Number(idxStr));
    }
  });
}

function assignThirds(bestThirds) {
  const slotRules = [
    { id: 'M74', opponent: 'E', allowed: ['A', 'B', 'C', 'D', 'F'] },
    { id: 'M81', opponent: 'D', allowed: ['B', 'E', 'F', 'I', 'J'] },
    { id: 'M82', opponent: 'G', allowed: ['A', 'E', 'H', 'I', 'J'] },
    { id: 'M77', opponent: 'I', allowed: ['C', 'D', 'F', 'G', 'H'] },
    { id: 'M79', opponent: 'A', allowed: ['C', 'E', 'F', 'H', 'I'] },
    { id: 'M80', opponent: 'L', allowed: ['E', 'H', 'I', 'J', 'K'] },
    { id: 'M85', opponent: 'B', allowed: ['E', 'F', 'G', 'I', 'J'] },
    { id: 'M87', opponent: 'K', allowed: ['D', 'E', 'I', 'J', 'L'] }
  ];

  let assigned = null;
  function solve(index, currentAssignment) {
    if (index === 8) {
      assigned = [...currentAssignment];
      return true;
    }
    const rule = slotRules[index];
    for (let i = 0; i < bestThirds.length; i++) {
      const team = bestThirds[i];
      if (!currentAssignment.includes(team)) {
        if (rule.allowed.includes(team.group) && team.group !== rule.opponent) {
          currentAssignment.push(team);
          if (solve(index + 1, currentAssignment)) return true;
          currentAssignment.pop();
        }
      }
    }
    return false;
  }

  if (!solve(0, [])) {
    console.warn("Backtracking failed to find a perfect allowed-group match. Falling back to simple no-rematch rule.");
    assigned = [];
    let unassigned = [...bestThirds];
    for (let i = 0; i < 8; i++) {
      const opp = slotRules[i].opponent;
      const validIdx = unassigned.findIndex(t => t.group !== opp);
      if (validIdx !== -1) {
        assigned.push(unassigned.splice(validIdx, 1)[0]);
      } else {
        assigned.push(unassigned.splice(0, 1)[0]);
      }
    }
  }
  return assigned;
}

function renderMainView() {
  const knockout = isKnockoutPhase();
  if (knockout) {
    const qualified = getQualifiedTeams();

    // Create maps for quick lookup of 1st and 2nd placed teams by group
    const w = {};
    const r = {};
    qualified.first.forEach(t => w[t.group] = t);
    qualified.second.forEach(t => r[t.group] = t);

    // Assign 3rd placed teams to their 8 slots using backtracking
    const thirds = assignThirds(qualified.bestThird);

    // Map exactly to FIFA Match 73-88 schedule AND bracket paths (Left vs Right)
    const matchesLog = [
      { id: 73, home: r['A'], away: r['B'], type: 'Runner-up vs Runner-up' },
      { id: 75, home: w['F'], away: r['C'], type: 'Winner vs Runner-up' },
      { id: 74, home: w['E'], away: thirds[0], type: 'Winner vs 3rd', allowed: 'A,B,C,D,F' },
      { id: 76, home: w['C'], away: r['F'], type: 'Winner vs Runner-up' },
      { id: 81, home: w['D'], away: thirds[1], type: 'Winner vs 3rd', allowed: 'B,E,F,I,J' },
      { id: 83, home: r['K'], away: r['L'], type: 'Runner-up vs Runner-up' },
      { id: 82, home: w['G'], away: thirds[2], type: 'Winner vs 3rd', allowed: 'A,E,H,I,J' },
      { id: 84, home: w['H'], away: r['J'], type: 'Winner vs Runner-up' },
      { id: 77, home: w['I'], away: thirds[3], type: 'Winner vs 3rd', allowed: 'C,D,F,G,H' },
      { id: 79, home: w['A'], away: thirds[4], type: 'Winner vs 3rd', allowed: 'C,E,F,H,I' },
      { id: 78, home: r['E'], away: r['I'], type: 'Runner-up vs Runner-up' },
      { id: 80, home: w['L'], away: thirds[5], type: 'Winner vs 3rd', allowed: 'E,H,I,J,K' },
      { id: 85, home: w['B'], away: thirds[6], type: 'Winner vs 3rd', allowed: 'E,F,G,I,J' },
      { id: 87, home: w['K'], away: thirds[7], type: 'Winner vs 3rd', allowed: 'D,E,I,J,L' },
      { id: 86, home: w['J'], away: r['H'], type: 'Winner vs Runner-up' },
      { id: 88, home: r['D'], away: r['G'], type: 'Runner-up vs Runner-up' }
    ];

    console.log("=== FIFA 2026 ROUND OF 32 OFFICIAL SCHEDULE ===");
    let ww = 0, w3 = 0, wr = 0, rr = 0;
    const sortedLog = [...matchesLog].sort((a, b) => a.id - b.id);
    sortedLog.forEach(m => {
      const allowedText = m.allowed ? ` | Slot allowed: {${m.allowed}} ` + (m.allowed.split(',').includes(m.away.group) ? 'OK' : 'WARN') : '';
      console.log(`Match ${m.id}: ${m.home.n} (Group ${m.home.group}) vs ${m.away.n} (Group ${m.away.group}) | Type: ${m.type}${allowedText}`);
      if (m.type === 'Winner vs 3rd') w3++;
      if (m.type === 'Winner vs Runner-up') wr++;
      if (m.type === 'Runner-up vs Runner-up') rr++;
    });
    console.log(`\nValidation:`);
    console.log(`Winner vs Winner: ${ww} (Must be 0)`);
    console.log(`Winner vs 3rd: ${w3} (Must be 8)`);
    console.log(`Winner vs Runner-up: ${wr} (Must be 4)`);
    console.log(`Runner-up vs Runner-up: ${rr} (Must be 4)`);
    console.log("===============================================");

    const round32 = [];
    matchesLog.forEach(m => {
      round32.push(m.home);
      round32.push(m.away);
    });

    localStorage.setItem('wc2026_qualified', JSON.stringify(round32));
    window.location.href = 'Qualification .html';
    return;
  }
  const pill = document.getElementById('phasePill');
  document.getElementById('dayName').textContent = DAYS_AR[cur.getDay()];
  document.getElementById('dateFullText').textContent = `${cur.getDate()} ${MONTHS_AR[cur.getMonth()]} ${cur.getFullYear()}`;
  pill.textContent = ' دور المجموعات';
  pill.className = 'phase-pill pill-group';
  document.getElementById('groupsView').style.display = 'block';
  document.getElementById('knockoutView').style.display = 'none';
  renderGroups();
  renderMatches();
  attachTeamLineupInteractions();
  refreshTeamLineupPanel();
}

function changeDay(step) {
  if (step > 0) {
    const offset = dayOffset();
    const matches = appState.matchesByDay[offset] || [];
    if (matches.length > 0) {
      const allPredicted = matches.every((_, index) => {
        const id = `${offset}_${index}`;
        return !!appState.predictions[id];
      });
      if (!allPredicted) {
        alert('You must predict all matches of today using the AI model before moving to the next day!');
        return;
      }
    }
  }
  cur.setDate(cur.getDate() + step);
  localStorage.setItem('wc_cur_date', cur.toISOString());
  renderMainView();
}


function setImageById(id, code, name) {
  const img = document.getElementById(id);
  img.src = flagUrl(code);
  img.alt = name;
  img.onerror = () => { img.onerror = null; img.src = FLAG_FALLBACK; };
}

function openModal(id, offset, index) {
  if (autoSimRunning) return;
  const match = (appState.matchesByDay[offset] || [])[index];
  if (!match) return;
  // أغلق أي result page مفتوحة وامسح بياناتها قبل ما نفتح الـ modal الجديد
  document.getElementById('resultPage').classList.remove('open');
  if (probabilityChart) { probabilityChart.destroy(); probabilityChart = null; }
  currentResultData = null;
  currentSelection = null;          // ← امسح القديم أولاً
  selectedPredictionCode = null;    // ← امسح التوقع القديم أولاً
  currentSelection = { id, offset, index, match };
  selectedPredictionCode = appState.predictions[id] || null;
  setImageById('mf1', match.t1.flag, match.t1.n);
  document.getElementById('mn1').textContent = match.t1.n;
  document.getElementById('mr1').textContent = `الترتيب FIFA: #${match.t1.rank || '—'}`;
  setImageById('mf2', match.t2.flag, match.t2.n);
  document.getElementById('mn2').textContent = match.t2.n;
  document.getElementById('mr2').textContent = `الترتيب FIFA: #${match.t2.rank || '—'}`;
  document.getElementById('modalMeta').textContent = `${match.ko ? match.group : `Group ${match.group}`} · ${fmt12(match.time)} بتوقيت الأردن${match.venue ? ' · ' + match.venue : ''}`;
  document.getElementById('po1').innerHTML = `فوز<br>${match.t1.n}`;
  document.getElementById('po3').innerHTML = `فوز<br>${match.t2.n}`;
  document.querySelectorAll('.pred-opt').forEach(button => button.classList.remove('sel'));
  if (selectedPredictionCode) {
    const map = { '1': 'po1', 'X': 'po2', '2': 'po3' };
    const active = document.getElementById(map[selectedPredictionCode]);
    if (active) active.classList.add('sel');
  }
  document.getElementById('modalCta').disabled = !selectedPredictionCode;
  document.getElementById('modalOverlay').classList.add('open');


}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function pickPrediction(value) {
  selectedPredictionCode = value;
  document.querySelectorAll('.pred-opt').forEach(button => button.classList.remove('sel'));
  const id = value === '1' ? 'po1' : value === 'X' ? 'po2' : 'po3';
  document.getElementById(id).classList.add('sel');
  document.getElementById('modalCta').disabled = false;
}

async function fetchPredictionPayload(match) {
  const payload = {
    team1: TEAM_NAME_MAP[match.t1.n] || match.t1.n,
    team2: TEAM_NAME_MAP[match.t2.n] || match.t2.n,
    team1_rank: match.t1.rank || null, team2_rank: match.t2.rank || null,
    kickoff_time: match.time, stage: match.group,
    match_date: cur.toISOString().split('T')[0],
    user_pick: selectedPredictionCode === '1' ? match.t1.n : selectedPredictionCode === '2' ? match.t2.n : 'تعادل'
  };
  const response = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Predict API failed with ${response.status}`);
  return response.json();
}

function parseFifaRank(value) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolvedFifaRank(matchTeamRank, apiRank) {
  const fromApi = parseFifaRank(apiRank);
  if (fromApi !== null) return fromApi;
  return parseFifaRank(matchTeamRank);
}

function normalizePercentages(win, draw, loss) {
  let w = Number.isFinite(win) ? Math.max(0, win) : 0;
  let d = Number.isFinite(draw) ? Math.max(0, draw) : 0;
  let l = Number.isFinite(loss) ? Math.max(0, loss) : 0;
  let total = w + d + l;
  if (total <= 0) return { win: 34, draw: 33, loss: 33 };
  if (total !== 100) { const s = 100 / total; w = Math.round(w * s); d = Math.round(d * s); l = 100 - w - d; }
  if (l < 0) { l = 0; const s = 100 / (w + d); w = Math.round(w * s); d = 100 - w; }
  return { win: w, draw: d, loss: l };
}

function pickTeamAvgOvrFromApi(data, teamNum) {
  const keys1 = ['team1_rating', 'team1_avg_ovr', 'teamRating1', 'rating_team1', 'home_team_rating'];
  const keys2 = ['team2_rating', 'team2_avg_ovr', 'teamRating2', 'rating_team2', 'away_team_rating'];
  const keys = teamNum === 1 ? keys1 : keys2;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = data[k];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizePredictionData(match, data) {
  const normalizedPct = normalizePercentages(
    Number(data.win ?? data.home_win ?? data.team1_win ?? 0),
    Number(data.draw ?? data.draw_prob ?? 0),
    Number(data.loss ?? data.away_win ?? data.team2_win ?? 0)
  );
  const winner = data.winner || data.predicted_winner || (normalizedPct.win >= normalizedPct.loss ? match.t1.n : match.t2.n);
  const confidenceValue = Number(data.confidence ?? Math.max(normalizedPct.win, normalizedPct.draw, normalizedPct.loss));
  const confidenceLabel = data.confidence_label || (confidenceValue >= 65 ? 'ثقة عالية' : confidenceValue >= 50 ? 'ثقة متوسطة' : 'ثقة متوازنة');
  const analysis = Array.isArray(data.analysis_points || data.analysis) && (data.analysis_points || data.analysis).length
    ? (data.analysis_points || data.analysis).map(item => ({ i: item.icon || item.i || '', text: item.text || item }))
    : analysisFallback.slice(0, 4).map(entry => ({ i: entry.i, text: entry.t(match.t1.n, match.t2.n) }));
  const lineup1 = (data.lineup1 || data.team1_lineup || []).map(p => typeof p === 'string' ? { name: p, role: 'لاعب', position: '' } : { name: p.name || 'لاعب', role: p.role || p.position || 'لاعب', position: p.position || p.role || '' });
  const lineup2 = (data.lineup2 || data.team2_lineup || []).map(p => typeof p === 'string' ? { name: p, role: 'لاعب', position: '' } : { name: p.name || 'لاعب', role: p.role || p.position || 'لاعب', position: p.position || p.role || '' });
  const team1Rank = resolvedFifaRank(match.t1.rank, data.team1_rank);
  const team2Rank = resolvedFifaRank(match.t2.rank, data.team2_rank);
  const team1AvgOvr = pickTeamAvgOvrFromApi(data, 1);
  const team2AvgOvr = pickTeamAvgOvrFromApi(data, 2);

  return {
    score1: data.score1 ?? null,
    score2: data.score2 ?? null,
    win: normalizedPct.win, draw: normalizedPct.draw, loss: normalizedPct.loss,
    winner, confidenceValue, confidenceLabel, analysis, lineup1, lineup2,
    formation1: data.formation1 || '4-3-3',
    formation2: data.formation2 || '4-3-3',
    modelName: data.model_name || 'AI Predictor',
    explanation: data.explanation || 'تم توليد هذه النتيجة اعتماداً على بيانات الفرق السابقة، ترتيب الفرق، الأداء الأخير، والمتغيرات التكتيكية.',
    team1Rank,
    team2Rank,
    team1AvgOvr,
    team2AvgOvr
  };
}

function createLoadingHTML() {
  return `<div class="loading-state"><div class="loading-block"><div class="spinner"></div><div>جاري التحميل...</div></div></div>`;
}



function teamMetaLine(fifaRank, avgOvr) {
  const rankPart = fifaRank != null ? `ترتيب FIFA #${fifaRank}` : 'ترتيب FIFA #—';
  const ovrPart = avgOvr != null ? ` · متوسط التقييم ${avgOvr}` : '';
  return rankPart + ovrPart;
}

function teamFifaLineOnly(fifaRank) {
  return fifaRank != null ? `ترتيب FIFA #${fifaRank}` : 'ترتيب FIFA #—';
}

function formatTeamRatingLabel(ovr) {
  if (ovr == null || !Number.isFinite(Number(ovr))) return 'تقييم المنتخب (OVR): —';
  return `تقييم المنتخب (OVR): ${Number(ovr)}`;
}

function renderLineupField(team, lineup, formation, fifaRank = null, avgOvr = null) {
  const roleColor = (pos) => {
    if (!pos) return '#c9a84c';
    const p = pos.toUpperCase();
    if (p === 'GK') return '#19a0cd';
    if (['CB', 'RB', 'LB', 'RWB', 'LWB'].includes(p)) return '#1a6e3c';
    if (['ST', 'CF', 'RW', 'LW', 'FWD'].includes(p)) return '#e85a4f';
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
      ${renderFlag(team.flag, team.n, 'rp-flag')}
      <div class="rp-tname">${team.n}</div>
      <div class="rp-team-meta">${teamMetaLine(fifaRank != null ? fifaRank : resolvedFifaRank(team.rank, null), avgOvr)}</div>
      <div style="font-size:10px;color:var(--gold-2);margin:4px 0 8px;">${formation}</div>
      <div style="position:relative;background:#2d7a3a;border-radius:8px;border:1.5px solid #3a9e4a;padding:8px;">
       <div style="position:absolute;top:50%;left:8%;right:8%;height:1px;background:rgba(255,255,255,.2);transform:translateY(-50%);"></div>
        <div style="display:flex;flex-direction:column;justify-content:space-around;min-height:200px;gap:4px;">
          ${playersHTML}
        </div>
      </div>
    </div>
  `;
}


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

function renderResultPage(match, predictionData, errorMessage = '') {
  setImageById('rpF1', match.t1.flag, match.t1.n);
  document.getElementById('rpN1').textContent = match.t1.n;
  document.getElementById('rpMeta1').textContent = teamFifaLineOnly(
    predictionData ? predictionData.team1Rank : resolvedFifaRank(match.t1.rank, null)
  );
  const rt1 = document.getElementById('rpTeamRating1');
  if (rt1) rt1.textContent = formatTeamRatingLabel(predictionData ? predictionData.team1AvgOvr : null);
  setImageById('rpF2', match.t2.flag, match.t2.n);
  document.getElementById('rpN2').textContent = match.t2.n;
  document.getElementById('rpMeta2').textContent = teamFifaLineOnly(
    predictionData ? predictionData.team2Rank : resolvedFifaRank(match.t2.rank, null)
  );
  const rt2 = document.getElementById('rpTeamRating2');
  if (rt2) rt2.textContent = formatTeamRatingLabel(predictionData ? predictionData.team2AvgOvr : null);
  document.getElementById('rpInfo').textContent = `${match.ko ? match.group : `Group ${match.group}`} · ${fmt12(match.time)}${match.venue ? ' · ' + match.venue : ''}`;
  const content = document.getElementById('resultContent');
  const lineupSection = document.getElementById('lineupSection');
  const lineupContent = document.getElementById('lineupContent');
  if (lineupSection && lineupContent && predictionData) {
    lineupSection.style.display = 'block';
    lineupContent.innerHTML = `
      ${renderLineupField(match.t1, predictionData.lineup1, predictionData.formation1 || '4-3-3', predictionData.team1Rank, predictionData.team1AvgOvr)}
      ${renderLineupField(match.t2, predictionData.lineup2, predictionData.formation2 || '4-3-3', predictionData.team2Rank, predictionData.team2AvgOvr)}
    `;
  }

  const userChoiceLabel = selectedPredictionCode === '1' ? `فوز ${match.t1.n}` : selectedPredictionCode === '2' ? `فوز ${match.t2.n}` : 'تعادل';
  const aiChoiceCode = predictionData.winner === match.t1.n ? '1' : predictionData.winner === match.t2.n ? '2' : 'X';
  const aiLabel = predictionData.winner === 'تعادل' ? 'تعادل' : `فوز ${predictionData.winner}`;
  const matchWithAI = aiChoiceCode === selectedPredictionCode;
  const comparisonMessage = matchWithAI ? 'توقعك صحيح ' : 'توقعك خاطئ ';

  content.innerHTML = `
    <div class="result-grid">
      <div class="panel result-card">
        <div class="rc-label">توقع الذكاء الاصطناعي</div>
        <div class="rc-result">${aiLabel}</div>
      </div>
      <div class="panel prob-section">
        <div class="block-title"> نسب الاحتمالات</div>
        <div class="prob-row"><div class="prob-row-head"><span class="prob-name">${match.t1.n}</span><span class="prob-pct">${predictionData.win}%</span></div><div class="prob-bar-bg"><div class="prob-bar-fill pf-win" style="width:${predictionData.win}%"></div></div></div>
        <div class="prob-row"><div class="prob-row-head"><span class="prob-name">تعادل</span><span class="prob-pct">${predictionData.draw}%</span></div><div class="prob-bar-bg"><div class="prob-bar-fill pf-draw" style="width:${predictionData.draw}%"></div></div></div>
        <div class="prob-row"><div class="prob-row-head"><span class="prob-name">${match.t2.n}</span><span class="prob-pct">${predictionData.loss}%</span></div><div class="prob-bar-bg"><div class="prob-bar-fill pf-loss" style="width:${predictionData.loss}%"></div></div></div>
      </div>
    </div>
    <div id="matchAnalysis"></div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="analysis-title">تحليل المباراة</div>
      ${predictionData.analysis.map(item => `<div class="analysis-point"><span class="ap-icon">${item.i}</span><span>${item.text}</span></div>`).join('')}
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="small-title" style="margin-bottom:14px;"> مقارنة توقعك مع الذكاء الاصطناعي</div>
      <div class="compare-row">
        <div class="compare-card"><div class="cc-label">توقعك</div><div class="cc-val">${userChoiceLabel}</div><div class="cc-sub">تم حفظه عند فتح هذا التحليل</div></div>
        <div class="compare-card"><div class="cc-label">توقع الذكاء الاصطناعي</div><div class="cc-val">${aiLabel}</div><div class="cc-sub">${comparisonMessage}</div></div>
      </div>
    </div>
    </div>
  `;
}

async function goToResult() {
  if (!currentSelection || !selectedPredictionCode) return;
  appState.predictions[currentSelection.id] = selectedPredictionCode;
  saveStateToServer(currentSelection.id);
  const matchSnapshot = currentSelection.match;
  const selectionSnapshot = currentSelection;
  const lineupSection = document.getElementById('lineupSection');
  const lineupContent = document.getElementById('lineupContent');
  if (lineupSection) lineupSection.style.display = 'none';
  if (lineupContent) lineupContent.innerHTML = '';
  closeModal();
  document.getElementById('resultPage').classList.add('open');
  document.getElementById('resultContent').innerHTML = createLoadingHTML();
  try {
    const raw = await fetchPredictionPayload(matchSnapshot);
    if (currentSelection !== selectionSnapshot) return;
    const normalized = normalizePredictionData(matchSnapshot, raw);
    const matchId = selectionSnapshot.id;
    const aiCode = normalized.winner === matchSnapshot.t1.n ? '1'
      : normalized.winner === matchSnapshot.t2.n ? '2' : 'X';
    appState.aiResults[matchId] = aiCode;
    currentResultData = normalized;
    renderMatches();
    renderResultPage(matchSnapshot, normalized);
    renderMatchAnalysis(matchSnapshot.t1.n, matchSnapshot.t2.n, 'matchAnalysis');
  } catch (error) {
    console.error(error);
    if (currentSelection !== selectionSnapshot) return;
    renderResultPage(currentSelection.match, null, 'تعذر جلب التوقع. يرجى المحاولة مرة أخرى.');
  }
}

function updateStandings(match, predictionData, overrideMatchId) {
  const matchId = overrideMatchId || (currentSelection ? currentSelection.id : null);
  if (matchId && appState.processedMatches[matchId]) return;
  const groupLetter = match.group;
  const group = GROUPS.find(g => g.n === groupLetter);
  if (!group || !STANDINGS[groupLetter]) return;
  const idx1 = group.t.findIndex(t => t.n === match.t1.n);
  const idx2 = group.t.findIndex(t => t.n === match.t2.n);
  if (idx1 === -1 || idx2 === -1) return;
  const s = STANDINGS[groupLetter];
  const winner = predictionData.winner;
  if (winner === match.t1.n) {
    s[idx1].pts += 3; s[idx1].w++; s[idx2].l++;
    s[idx1].gf += 1; s[idx1].ga += 0; s[idx2].gf += 0; s[idx2].ga += 1;
  } else if (winner === match.t2.n) {
    s[idx2].pts += 3; s[idx2].w++; s[idx1].l++;
    s[idx2].gf += 1; s[idx2].ga += 0; s[idx1].gf += 0; s[idx1].ga += 1;
  } else {
    s[idx1].pts += 1; s[idx1].d++; s[idx2].pts += 1; s[idx2].d++;
    s[idx1].gf += 1; s[idx1].ga += 1; s[idx2].gf += 1; s[idx2].ga += 1;
  }
  if (matchId) appState.processedMatches[matchId] = true;
  renderGroups();
  saveStateToServer(matchId);
}

async function saveStateToServer(matchId) {
  const token = localStorage.getItem('wc_token');
  if (!token) return;
  try {
    await fetch('http://localhost:5000/api/save_last_match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        match_id: matchId,
        standings: STANDINGS,
        processed: appState.processedMatches,
        predictions: appState.predictions
      })
    });
  } catch (e) { }
}
function checkDayComplete() {
  const offset = dayOffset();
  const matches = appState.matchesByDay[offset] || [];
  if (!matches.length) return;
  const allPredicted = matches.every((_, index) => {
    const id = `${offset}_${index}`;
    return !!appState.predictions[id];
  });
  if (allPredicted) {
    setTimeout(() => { changeDay(1); }, 1000);
  }
}

function closeResult() {
  document.getElementById('resultPage').classList.remove('open');
  if (probabilityChart) { probabilityChart.destroy(); probabilityChart = null; }
  const lineupSection = document.getElementById('lineupSection');
  const lineupContent = document.getElementById('lineupContent');
  if (lineupSection) lineupSection.style.display = 'none';
  if (lineupContent) lineupContent.innerHTML = '';
  if (currentSelection && currentResultData) {
    updateStandings(currentSelection.match, currentResultData);
  }
  renderMatches();
  checkDayComplete();
  currentSelection = null;
  currentResultData = null;
  selectedPredictionCode = null;
}

function hashData(data) { return JSON.stringify(data); }

async function fetchMatchesFromApi() {
  try {
    const response = await fetch(`${API_BASE}/matches`);
    if (!response.ok) throw new Error(`matches api ${response.status}`);
    const data = await response.json();
    if (data && typeof data === 'object') {
      const incomingMatches = data.days || data.matches_by_day || data;
      const incomingHash = hashData(incomingMatches);
      if (incomingHash !== lastFetchedMatchesHash) {
        appState.matchesByDay = incomingMatches;
        lastFetchedMatchesHash = incomingHash;
        renderMainView();
      }
      setSyncStatus('مربوط بواجهة التوقعات');
      updateLastSyncText();
    }
  } catch (error) {
    console.warn('Using fallback matches', error);
    if (!lastFetchedMatchesHash) lastFetchedMatchesHash = hashData(appState.matchesByDay);
    setSyncStatus('', true);
    updateLastSyncText('MATCH DAY');
  }
}

function attachEvents() {
  document.getElementById('nextBtn').addEventListener('click', () => changeDay(1));
  document.getElementById('prevBtn').addEventListener('click', () => changeDay(-1));
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('po1').addEventListener('click', () => pickPrediction('1'));
  document.getElementById('po2').addEventListener('click', () => pickPrediction('X'));
  document.getElementById('po3').addEventListener('click', () => pickPrediction('2'));
  document.getElementById('modalCta').addEventListener('click', goToResult);
  document.getElementById('backToMatchesBtn').addEventListener('click', closeResult);
  document.getElementById('datePicker').addEventListener('change', function () {
    cur = new Date(this.value);
    renderMainView();
  });
  document.getElementById('modalOverlay').addEventListener('click', event => {
    if (event.target.id === 'modalOverlay') closeModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeModal(); closeResult(); }
  });
  document.querySelector('a[href="dashboard.html"]')?.addEventListener('click', () => {
    localStorage.setItem('wc_scroll_pos', window.scrollY.toString());
    localStorage.setItem('wc_came_from_dash', '1');
  });

  // ── Auto-Predict All Group Matches ──
  const autoSimBtn = document.getElementById('autoSimBtn');
  if (autoSimBtn) {
    autoSimBtn.addEventListener('click', async function () {
      if (autoSimRunning) return;
      const btn = this;
      btn.disabled = true;
      autoSimRunning = true;
      btn.textContent = 'جاري التوقع...';

      // Show overlay when auto-sim starts
      const overlay = document.createElement('div');
      overlay.id = 'autoSimOverlay';
      overlay.style = `
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,.6);z-index:998;
        display:flex;align-items:center;justify-content:center;
        flex-direction:column;gap:12px;
      `;
      overlay.innerHTML = `
        <div style="color:#C9A84C;font-size:18px;font-weight:700;">
          جاري التوقع التلقائي...
        </div>
        <div style="color:#888;font-size:13px;">
          لا يمكن التفاعل مع المباريات الآن
        </div>
      `;
      document.body.appendChild(overlay);

      for (const [offsetStr, matches] of Object.entries(REAL_MATCHES)) {
        for (let index = 0; index < matches.length; index++) {
          const match = matches[index];
          if (!match.group || match.ko) continue;
          const matchId = `${offsetStr}_${index}`;
          if (appState.processedMatches[matchId]) continue;

          try {
            const res = await fetch('http://localhost:5000/api/predict', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ team1: match.t1.n, team2: match.t2.n })
            });
            const data = await res.json();
            const normalized = normalizePredictionData(match, data);
            updateStandings(match, normalized, matchId);
            appState.processedMatches[matchId] = true;
            appState.predictions[matchId] = normalized.winner === match.t1.n ? '1'
              : normalized.winner === match.t2.n ? '2' : 'X';
            appState.aiResults[matchId] = appState.predictions[matchId];
          } catch (e) {
            console.error('Auto-predict error for', match.t1.n, 'vs', match.t2.n, e);
          }

          await new Promise(r => setTimeout(r, 100));
        }
      }

      renderGroups();
      autoSimRunning = false;
      document.getElementById('autoSimOverlay')?.remove();
      btn.textContent = 'تم — جاري الانتقال...';

      const qualified = getQualifiedTeams();
      const round32 = [
        ...qualified.first,
        ...qualified.second,
        ...qualified.bestThird
      ];
      localStorage.setItem('wc2026_qualified', JSON.stringify(round32));

      setTimeout(() => {
        window.location.href = 'Qualification .html';
      }, 1500);
    });
  }
}

async function init() {
  attachEvents();
  STANDINGS = createInitialStandings();
  appState.matchesByDay = REAL_MATCHES;

  // 1. Render content FIRST
  renderMainView();

  // 2. Wrap restoration in try/catch to prevent blocking
  // cameFromDash must be declared outside try{} so checkResume() can read it
  let cameFromDash = false;
  try {
    // Fix 3: Return to last match when coming back from dashboard
    if (localStorage.getItem('wc_came_from_dash') === '1') {
      cameFromDash = true;
      localStorage.removeItem('wc_came_from_dash');
      const pos = parseInt(localStorage.getItem('wc_scroll_pos') || '0');
      localStorage.removeItem('wc_scroll_pos');
      setTimeout(() => window.scrollTo({ top: pos, behavior: 'instant' }), 400);
    }

    // Fix 2: Redirect to last match after login
    const restoreMatch = localStorage.getItem('wc_restore_match');
    if (restoreMatch) {
      localStorage.removeItem('wc_restore_match');
      setTimeout(() => {
        const el = document.querySelector(`[data-match-id="${restoreMatch}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid #D4AF37';
          setTimeout(() => el.style.outline = '', 3000);
        }
      }, 500);
    }
  } catch (e) {
    console.error('Restore error:', e);
  }

  updateLastSyncText('آخر تحديث');
  await fetchMatchesFromApi();
  setInterval(fetchMatchesFromApi, AUTO_REFRESH_MS);
  checkResume(cameFromDash);
}

async function checkResume(cameFromDash) {
  const token = localStorage.getItem('wc_token');
  const justLoggedIn = localStorage.getItem('wc_just_logged_in') === '1';
  localStorage.removeItem('wc_just_logged_in');
  if (!token) return;
  if (cameFromDash && !justLoggedIn) return;
  try {
    const res = await fetch('http://localhost:5000/api/last_match', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.match_id) return;

    const dialog = document.createElement('div');
    dialog.style = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,.85);z-index:9999;
      display:flex;align-items:center;justify-content:center;
    `;
    dialog.innerHTML = `
      <div style="background:#1a1a1a;border:1px solid rgba(201,168,76,.3);
                  border-radius:16px;padding:32px;text-align:center;
                  max-width:360px;width:90%;">
        <div style="color:#C9A84C;font-size:18px;font-weight:700;
                    margin-bottom:12px;">مرحباً بعودتك</div>
        <div style="color:#F0F0F0;font-size:14px;margin-bottom:24px;">
          لديك جلسة سابقة محفوظة.<br>هل تريد المتابعة من حيث توقفت؟
        </div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="resumeBtn"
            style="background:#C9A84C;color:#000;border:none;
                   border-radius:8px;padding:10px 20px;
                   font-weight:700;cursor:pointer;">
            متابعة
          </button>
          <button id="restartBtn"
            style="background:transparent;color:#C9A84C;
                   border:1px solid #C9A84C;border-radius:8px;
                   padding:10px 20px;cursor:pointer;">
            البدء من جديد
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    document.getElementById('resumeBtn').onclick = () => {
      STANDINGS = data.standings || createInitialStandings();
      appState.predictions = data.predictions || {};
      const savedDate = localStorage.getItem('wc_cur_date');
      if (savedDate) cur = new Date(savedDate);
      const rawProcessed = data.processed || {};
      const migratedProcessed = {};
      for (const [offsetStr, matches] of Object.entries(REAL_MATCHES)) {
        matches.forEach((match, index) => {
          const newKey = `${offsetStr}_${index}`;
          const oldKey = `${match.t1.n}-${match.t2.n}`;
          if (rawProcessed[newKey] || rawProcessed[oldKey]) {
            migratedProcessed[newKey] = true;
          }
        });
      }
      appState.processedMatches = migratedProcessed;
      dialog.remove();
      renderMainView();
      setTimeout(() => {
        const matchId = data.match_id;
        let el = document.querySelector(`[data-match-id="${matchId}"]`) ||
          document.querySelector(`[data-team-id="${matchId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid #C9A84C';
          setTimeout(() => el.style.outline = '', 3000);
          localStorage.setItem('wc_scroll_pos', window.scrollY.toString());
        }
      }, 400);
    };

    document.getElementById('restartBtn').onclick = () => {
      dialog.remove();
      appState.predictions = {};
      appState.processedMatches = {};
      STANDINGS = createInitialStandings();
      localStorage.removeItem('wc_cur_date');
      cur = new Date(START);
      renderGroups();
      renderMatches();
      fetch('http://localhost:5000/api/save_last_match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ match_id: null, standings: null, processed: null, predictions: null })
      }).catch(() => { });
    };

  } catch (e) { }
}

document.addEventListener('DOMContentLoaded', init);
// init will be called on DOMContentLoaded

function updateCountdown() {
  const target = new Date('2026-06-11T00:00:00');
  const now = new Date();
  const diff = target - now;
  if (diff <= 0) return;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('days1').textContent = pad(days);
  document.getElementById('hours1').textContent = pad(hours);
  document.getElementById('mins1').textContent = pad(mins);
  document.getElementById('secs1').textContent = pad(secs);
}
updateCountdown();
setInterval(updateCountdown, 1000);


// Video intro logic (guarded – may be absent after moving video to login page)
const introVideo = document.getElementById('introVideo');
const goProjectBtn = document.getElementById('goProjectBtn');
const unmuteBtn = document.getElementById('unmuteBtn');
const skipBtn = document.getElementById('skipBtn');
if (introVideo) {
  // Unmute button handler
  if (unmuteBtn) {
    unmuteBtn.onclick = function () {
      introVideo.muted = false;
      introVideo.volume = 1;
      unmuteBtn.style.display = 'none';
    };
  }
  // When video ends, show project button
  introVideo.onended = function () {
    if (goProjectBtn) goProjectBtn.style.display = 'block';
    if (unmuteBtn) unmuteBtn.style.display = 'none';
  };
  // Skip button handler
  if (skipBtn) {
    skipBtn.addEventListener('click', function () {
      introVideo.pause();
      goToProject();
    });
  }
}
function goToProject() {
  const videoPage = document.getElementById('videoPage');
  if (videoPage) videoPage.style.display = 'none';
  const appGrid = document.querySelector('.app');
  if (appGrid) appGrid.style.display = 'grid';
  requestAnimationFrame(() => { refreshTeamLineupPanel(); });
}