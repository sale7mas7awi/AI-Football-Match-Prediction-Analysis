import pickle
import pandas as pd
import numpy as np
from db import get_conn

# ==============================
# تحميل الموديلين والـ features
# ==============================
with open('model_binary.pkl', 'rb') as f:
    model_binary = pickle.load(f)

with open('model_draw.pkl', 'rb') as f:
    model_draw = pickle.load(f)

with open('features.pkl', 'rb') as f:
    features_ea = pickle.load(f)

# تحميل البيانات
df          = pd.read_csv('data/clean/results_features.csv')
team_ratings = pd.read_csv('data/clean/team_ratings.csv')
squads_df   = pd.read_csv('data/clean/all_squads.csv')


# قاموس توحيد الأسماء (Canonical Name Map)
# يستخدم لتوحيد الأسماء القادمة من الـ API أو المصادر الخارجية مع الأسماء الموحدة في ملفات البيانات والواجهة
TEAM_NAME_MAP = {
    'Czechia': 'Czech Republic',
    'South Korea': 'Korea Republic',
    'Ivory Coast': "Cote d'Ivoire",
    'Congo': 'Congo DR',
    'DR Congo': 'Congo DR',
    'USA': 'United States',
    'Bosnia and Herzegovina': 'Bosnia&Herz',
    'Cape Verde': 'Cabo Verde',
    'Curaçao': 'Curacao',
    'Türkiye': 'Turkey',
    'IR Iran': 'Iran',
}

def canonical_team_for_rosters(name):
    """يطابق الأسماء مع الأسماء الموحدة في ملفات البيانات والواجهة."""
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return None
    s = str(name).strip()
    return TEAM_NAME_MAP.get(s, s)


# ترتيب FIFA الحالي من ملف التصنيف (للعرض وللـ API)
_FIFA_RANKING_CANDIDATES = (
    'data/raw/fifa_ranking.csv',
    'data/raw/fifa_Ranking.csv',
)

# أسماء الفرق في المشروع → كما تظهر في عمود Team داخل fifa_ranking.csv (إن وجد)
_FIFA_NAME_ALIASES = {
    # canonical name → name as it appears in fifa_ranking.csv
    'United States':   'USA',
    'Korea Republic':  'South Korea',
    'Iran':            'IR Iran',
    "Cote d'Ivoire":   'Ivory Coast',
    'Congo DR':        'DR Congo',
    'Bosnia&Herz':     'Bosnia and Herzegovina',
    'Cabo Verde':      'Cape Verde',
    'Curacao':         'Curaçao',
    'Turkey':          'Türkiye',
    'Czech Republic':  'Czechia',
}


def _load_fifa_ranking_index(path):
    """يقرأ fifa_ranking.csv ويعيد dict: اسم الفريق في الملف → رقم الترتيب."""
    try:
        tab = pd.read_csv(path, encoding='utf-8')
    except FileNotFoundError:
        return {}
    except UnicodeDecodeError:
        tab = pd.read_csv(path, encoding='latin-1')
    if 'Team' not in tab.columns or 'Rank' not in tab.columns:
        return {}
    tab = tab.dropna(subset=['Team'])
    tab['Team'] = tab['Team'].astype(str).str.strip()
    tab = tab[(tab['Team'] != '') & (tab['Team'].str.lower() != 'team')]
    tab['Rank'] = pd.to_numeric(tab['Rank'], errors='coerce')
    tab = tab.dropna(subset=['Rank'])
    tab['Rank'] = tab['Rank'].astype(int)
    tab = tab.drop_duplicates(subset=['Team'], keep='first')
    return dict(zip(tab['Team'], tab['Rank']))


def _load_first_fifa_ranking_index():
    for path in _FIFA_RANKING_CANDIDATES:
        idx = _load_fifa_ranking_index(path)
        if idx:
            return idx
    return {}


_FIFA_RANK_BY_TEAM = _load_first_fifa_ranking_index()


def get_fifa_rank_from_file(team_name):
    """ترتيب FIFA من ملف التصنيف الحقيقي (وليس من آخر مباراة في results_features)."""
    if not team_name or not _FIFA_RANK_BY_TEAM:
        return None
    candidates = [
        _FIFA_NAME_ALIASES.get(team_name, team_name),
        team_name,
    ]
    for name in candidates:
        if name in _FIFA_RANK_BY_TEAM:
            return int(_FIFA_RANK_BY_TEAM[name])
        key_ci = next((k for k in _FIFA_RANK_BY_TEAM if k.lower() == str(name).lower()), None)
        if key_ci is not None:
            return int(_FIFA_RANK_BY_TEAM[key_ci])
    return None

# ==============================
# دوال مساعدة
# ==============================
def get_team_stats(team_name):
    home = df[df['home_team'] == team_name].tail(10)
    away = df[df['away_team'] == team_name].tail(10)
    last = pd.concat([home, away]).sort_values('date').tail(10)

    if len(last) == 0:
        return None

    last_match = last.iloc[-1]
    if last_match['home_team'] == team_name:
        rank        = last_match['home_rank']
        form        = last_match['home_form']
        avg_scored  = last_match['home_avg_scored']
        avg_conceded= last_match['home_avg_conceded']
    else:
        rank        = last_match['away_rank']
        form        = last_match['away_form']
        avg_scored  = last_match['away_avg_scored']
        avg_conceded= last_match['away_avg_conceded']

    return {
        'rank':         rank,
        'form':         form,
        'avg_scored':   avg_scored,
        'avg_conceded': avg_conceded,
    }


def get_h2h(team1, team2):
    h2h_matches = df[
        ((df['home_team'] == team1) & (df['away_team'] == team2)) |
        ((df['home_team'] == team2) & (df['away_team'] == team1))
    ].tail(10)

    if len(h2h_matches) == 0:
        return 0.5

    team1_wins = len(h2h_matches[
        ((h2h_matches['home_team'] == team1) & (h2h_matches['result'] == 1)) |
        ((h2h_matches['away_team'] == team1) & (h2h_matches['result'] == -1))
    ])
    return team1_wins / len(h2h_matches)


def get_team_ratings(team_name):
    key = canonical_team_for_rosters(team_name)
    row = team_ratings[team_ratings['team'] == key]
    if len(row) == 0:
        return None
    r = row.iloc[0]
    return {
        'avg_ovr': round(float(r['avg_ovr']), 1),
        'avg_pac': round(float(r['avg_pac']), 1),
        'avg_sho': round(float(r['avg_sho']), 1),
        'avg_pas': round(float(r['avg_pas']), 1),
        'avg_dri': round(float(r['avg_dri']), 1),
        'avg_def': round(float(r['avg_def']), 1),
        'avg_phy': round(float(r['avg_phy']), 1),
    }


def get_team_form(team_name):
    """آخر 5 نتائج للمنتخب من results_features.csv."""
    home = df[df['home_team'] == team_name].tail(5)
    away = df[df['away_team'] == team_name].tail(5)
    last = pd.concat([home, away]).sort_values('date').tail(5)
    if len(last) == 0:
        return ''
    results = []
    for _, row in last.iterrows():
        if row['home_team'] == team_name:
            r = 'W' if row['result'] == 1 else ('D' if row['result'] == 0 else 'L')
        else:
            r = 'W' if row['result'] == -1 else ('D' if row['result'] == 0 else 'L')
        results.append(r)
    return ' '.join(results)



def get_ea_ratings(team_name):
    key = canonical_team_for_rosters(team_name)
    row = team_ratings[team_ratings['team'] == key]
    if len(row) == 0:
        return None
    return row.iloc[0].to_dict()


def get_squad_mean_ovr(team_name):
    """متوسط OVR من all_squads كاحتياط إذا لم يوجد صف في team_ratings."""
    key = canonical_team_for_rosters(team_name)
    sub = squads_df[squads_df['team'] == key]
    if len(sub) == 0:
        sub = squads_df[squads_df['team'] == team_name]
    if len(sub) == 0 or 'OVR' not in sub.columns:
        return None
    m = float(sub['OVR'].mean())
    if pd.isna(m):
        return None
    return round(m, 1)


def _team_rating_value(team_api_name, ea_row):
    if ea_row and pd.notna(ea_row.get('avg_ovr')):
        return round(float(ea_row['avg_ovr']), 1)
    return get_squad_mean_ovr(team_api_name)


# ==============================
# دالة التنبؤ الرئيسية
# ==============================
def predict_match(team1, team2):
    stats1 = get_team_stats(team1)
    if stats1 is None:
        stats1 = {
            'rank': get_fifa_rank_from_file(team1) or 100,
            'form': 0.5,
            'avg_scored': 1.0,
            'avg_conceded': 1.0
        }

    stats2 = get_team_stats(team2)
    if stats2 is None:
        stats2 = {
            'rank': get_fifa_rank_from_file(team2) or 100,
            'form': 0.5,
            'avg_scored': 1.0,
            'avg_conceded': 1.0
        }

    ea1 = get_ea_ratings(team1)
    ea2 = get_ea_ratings(team2)

    # Fallback ratings if not found in team_ratings.csv
    if ea1 is None: ea1 = {'avg_ovr': 70, 'avg_sho': 70, 'avg_def': 70, 'avg_pac': 70, 'avg_dri': 70}
    if ea2 is None: ea2 = {'avg_ovr': 70, 'avg_sho': 70, 'avg_def': 70, 'avg_pac': 70, 'avg_dri': 70}

    ovr_diff = (ea1['avg_ovr'] - ea2['avg_ovr'])
    sho_diff = (ea1['avg_sho'] - ea2['avg_sho'])
    def_diff = (ea1['avg_def'] - ea2['avg_def'])
    pac_diff = (ea1['avg_pac'] - ea2['avg_pac'])
    dri_diff = (ea1['avg_dri'] - ea2['avg_dri'])

    h2h = get_h2h(team1, team2)

    input_data = pd.DataFrame([{
        'rank_diff':         stats1['rank']        - stats2['rank'],
        'home_form':         stats1['form'],
        'away_form':         stats2['form'],
        'form_diff':         stats1['form']        - stats2['form'],
        'h2h':               h2h,
        'tournament_weight': 4,
        'home_avg_scored':   stats1['avg_scored'],
        'home_avg_conceded': stats1['avg_conceded'],
        'away_avg_scored':   stats2['avg_scored'],
        'away_avg_conceded': stats2['avg_conceded'],
        'avg_scored_diff':   stats1['avg_scored']  - stats2['avg_scored'],
        'avg_conceded_diff': stats1['avg_conceded']- stats2['avg_conceded'],
        'neutral':           1,
        'ovr_diff':          ovr_diff,
        'sho_diff':          sho_diff,
        'def_diff':          def_diff,
        'pac_diff':          pac_diff,
        'dri_diff':          dri_diff,
    }])[features_ea]

    # المرحلة 1 — هل تعادل؟
    draw_prob = model_draw.predict_proba(input_data)[0][1]

    # المرحلة 2 — مين يفوز؟
    win_prob = model_binary.predict_proba(input_data)[0][1]
    
    # حساب النسب النهائية (معدلة بوجود التعادل) بحيث يكون مجموعهم 1 (100%)
    # هذه هي القيم التي تظهر للمستخدم في الواجهة
    team1_win_final = win_prob * (1 - draw_prob)
    team2_win_final = (1 - win_prob) * (1 - draw_prob)
    draw_final      = draw_prob

    probs = {
        team1:   team1_win_final,
        'draw':  draw_final,
        team2:   team2_win_final,
    }
    # اختيار النتيجة ذات الاحتمالية الأعلى من بين الثلاثة
    predicted = max(probs, key=probs.get)

    return {
        'team1':      team1,
        'team2':      team2,
        'team1_win':  round(team1_win_final, 3),
        'draw':       round(draw_final, 3),
        'team2_win':  round(team2_win_final, 3),
        'predicted':  predicted,
        'team1_rank': get_fifa_rank_from_file(team1),
        'team2_rank': get_fifa_rank_from_file(team2),
        'team1_avg_ovr': _team_rating_value(team1, ea1),
        'team2_avg_ovr': _team_rating_value(team2, ea2),
        'team1_rating': _team_rating_value(team1, ea1),
        'team2_rating': _team_rating_value(team2, ea2),
        'team1_form':   get_team_form(team1),
        'team2_form':   get_team_form(team2),
    }


# ==============================
# دالة التشكيلة
# ==============================
def get_lineup(team_name):
    key = canonical_team_for_rosters(team_name)
    team = squads_df[squads_df['team'] == key]
    if len(team) == 0:
        team = squads_df[squads_df['team'] == team_name]
    if len(team) == 0:
        return [], '4-3-3', []

    # Sort team by OVR descending initially to pick the best for each role
    team = team.sort_values('OVR', ascending=False)
    
    selected_indices = set()
    lineup = []

    # Helper function to add a player to lineup and mark as selected
    def add_to_lineup(p, forced_pos=None):
        lineup.append({
            'name':     str(p['Name']),
            'position': forced_pos if forced_pos else str(p['Position']),
            'ovr':      int(p['OVR']) if pd.notna(p['OVR']) else 57,
        })
        selected_indices.add(p.name)

    # 1. Pick GK (1)
    gk_pool = team[team['Position'] == 'GK']
    if not gk_pool.empty:
        add_to_lineup(gk_pool.iloc[0])

    # 2. Pick DEF (4)
    def_pool = team[team['Position'].isin(['CB','RB','LB','RWB','LWB']) & (~team.index.isin(selected_indices))]
    for _, p in def_pool.head(4).iterrows():
        add_to_lineup(p)
    
    # 3. Pick MID (3)
    mid_pool = team[team['Position'].isin(['CM','CDM','CAM','RM','LM']) & (~team.index.isin(selected_indices))]
    for _, p in mid_pool.head(3).iterrows():
        add_to_lineup(p)
    
    # 4. Pick FWD (3)
    fwd_pool = team[team['Position'].isin(['ST','CF','RW','LW']) & (~team.index.isin(selected_indices))]
    for _, p in fwd_pool.head(3).iterrows():
        add_to_lineup(p)
    
    # Fallback to fill remaining slots up to 11 (excluding GKs to avoid multiple keepers)
    if len(lineup) < 11:
        needed = 11 - len(lineup)
        # Filter best unused outfield players
        fallbacks = team[(team['Position'] != 'GK') & (~team.index.isin(selected_indices))]
        for _, p in fallbacks.head(needed).iterrows():
            add_to_lineup(p, forced_pos='FWD')

    # Bench: All remaining players in the 26-man squad
    bench = []
    remaining = team[~team.index.isin(selected_indices)]
    for _, p in remaining.iterrows():
        bench.append({
            'name':     str(p['Name']),
            'position': str(p['Position']),
            'ovr':      int(p['OVR']) if pd.notna(p['OVR']) else 57,
        })
        
    return lineup, '4-3-3', bench


def get_full_squad(team_name):
    """كل لاعبي المنتخب من all_squads.csv (نفس بيانات teams.ipynb بعد التصدير)."""
    key = canonical_team_for_rosters(team_name)
    team = squads_df[squads_df['team'] == key]
    if len(team) == 0:
        team = squads_df[squads_df['team'] == team_name]
    if len(team) == 0:
        return []
    team = team.sort_values('OVR', ascending=False)
    players = []
    for _, p in team.iterrows():
        players.append({
            'name':     str(p['Name']),
            'position': str(p['Position']) if pd.notna(p.get('Position')) else '',
            'ovr':      int(p['OVR']) if pd.notna(p.get('OVR')) else None,
        })
    return players


# ==============================
# اختبار + التحقق من الـ features
# ==============================
if __name__ == '__main__':
    print(f"عدد الـ features: {len(features_ea)}")
    print(f"Features: {features_ea}\n")

    print(predict_match('France', 'Morocco'))
    print(predict_match('Argentina', 'Jordan'))
    print(predict_match('Germany', 'Brazil'))