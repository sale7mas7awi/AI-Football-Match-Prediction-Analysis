from flask import Flask, request, jsonify
from flask_cors import CORS
from predict import predict_match, get_lineup, get_full_squad, get_team_ratings
from db import (register_user, login_user, get_user_from_token,
                logout_user, save_prediction, get_prediction_stats,
                save_last_match, get_last_match, get_all_stats,
                get_user_predictions)

app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def home():
    return jsonify({"message": "World Cup 2026 API شغال ✅"})

def get_current_user():
    auth = request.headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()
    return get_user_from_token(token)

@app.route('/api/register', methods=['POST'])
def api_register():
    d = request.get_json()
    try:
        register_user(d['username'], d['password'])
        return jsonify({'success': True})
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/login', methods=['POST'])
def api_login():
    d = request.get_json()
    try:
        token = login_user(d['username'], d['password'])
        return jsonify({'token': token})
    except ValueError as e:
        return jsonify({'error': str(e)}), 401

@app.route('/api/logout', methods=['POST'])
def api_logout():
    auth = request.headers.get('Authorization', '')
    token = auth.replace('Bearer ', '').strip()
    logout_user(token)
    return jsonify({'success': True})

@app.route('/api/me', methods=['GET'])
def api_me():
    user = get_current_user()
    if not user: return jsonify({'error': 'غير مصرح به'}), 401
    return jsonify(user)

@app.route('/api/my_predictions', methods=['GET'])
def api_my_predictions():
    user = get_current_user()
    if not user:
        return jsonify({"error": "غير مصرح به"}), 401
    preds = get_user_predictions(user['id'])
    return jsonify(preds)

@app.route('/api/prediction_stats', methods=['GET'])
def api_prediction_stats():
    user = get_current_user()
    if not user: return jsonify({'error': 'غير مصرح به'}), 401
    return jsonify(get_prediction_stats(user['id']))

@app.route('/api/stats', methods=['GET'])
def api_stats():
    stats = get_all_stats()
    return jsonify(stats)

@app.route('/api/squad', methods=['GET'])
def api_squad():
    """تشكيلة كاملة للمنتخب من all_squads.csv (?team= أو ?id= اسم العمود في CSV)."""
    team = request.args.get('team') or request.args.get('id')
    if not team:
        return jsonify({"error": "أرسل team أو id في الاستعلام"}), 400
    players = get_full_squad(team)
    return jsonify({"team": team, "players": players, "count": len(players)})




@app.route('/api/save_last_match', methods=['POST'])
def api_save_last_match():
    user = get_current_user()
    if not user: return jsonify({'error': 'غير مصرح به'}), 401
    d = request.get_json()
    save_last_match(
        user['id'],
        d.get('match_id'),
        d.get('standings'),
        d.get('processed'),
        d.get('predictions')
    )
    return jsonify({'success': True})

@app.route('/api/last_match', methods=['GET'])
def api_last_match():
    user = get_current_user()
    if not user: return jsonify({'error': 'غير مصرح به'}), 401
    data = get_last_match(user['id'])
    return jsonify(data or {'match_id': None})


@app.route('/api/team_ratings', methods=['GET'])
def api_team_ratings():
    team1 = request.args.get('team1')
    team2 = request.args.get('team2')
    if not team1 or not team2:
        return jsonify({"error": "أرسل team1 و team2"}), 400
    r1 = get_team_ratings(team1)
    r2 = get_team_ratings(team2)
    if not r1 or not r2:
        return jsonify({"error": "لم يُعثر على بيانات"}), 404
    return jsonify({"team1": {"name": team1, **r1},
                    "team2": {"name": team2, **r2}})


@app.route('/api/predict', methods=['POST'])
def api_predict():
    data = request.get_json()
    team1 = data.get('team1')
    team2 = data.get('team2')

    print(f">>> طلب توقع: team1='{team1}', team2='{team2}'")  # ← جديد

    if not team1 or not team2:
        return jsonify({"error": "لازم تبعت team1 و team2"}), 400

    raw = predict_match(team1, team2)

    if "error" in raw:
        print(f">>> خطأ: {raw}")  # ← جديد
        return jsonify(raw), 404

    win_pct  = round(raw.get('team1_win', 0) * 100)
    draw_pct = round(raw.get('draw', 0) * 100)
    loss_pct = round(raw.get('team2_win', 0) * 100)

    winner = raw.get('predicted')
    if winner == 'draw':
        winner = 'تعادل'

    # Note: user prediction saving is now done at the end
    confidence = max(win_pct, draw_pct, loss_pct)
    if confidence >= 60:
        conf_label = "عالية"
    elif confidence >= 45:
        conf_label = "متوسطة"
    else:
        conf_label = "منخفضة"

    lineup1_data = get_lineup(team1)
    lineup2_data = get_lineup(team2)

    response = {
        "winner": winner,
        "win":    win_pct,
        "draw":   draw_pct,
        "loss":   loss_pct,
        "confidenceLabel": conf_label,
        "confidenceValue": confidence,
        "team1_rank": raw.get('team1_rank'),
        "team2_rank": raw.get('team2_rank'),
        "team1_avg_ovr": raw.get('team1_avg_ovr'),
        "team2_avg_ovr": raw.get('team2_avg_ovr'),
        "team1_rating": raw.get('team1_rating'),
        "team2_rating": raw.get('team2_rating'),
        "team1_form":   raw.get('team1_form'),
        "team2_form":   raw.get('team2_form'),
        "explanation": "التوقع مبني على آخر 10 مباريات، تصنيف FIFA، والمواجهات المباشرة.",
        "analysis": [
            {"i": "📊", "text": f"نسبة فوز {team1}: {win_pct}%"},
            {"i": "🤝", "text": f"نسبة التعادل: {draw_pct}%"},
            {"i": "📉", "text": f"نسبة فوز {team2}: {loss_pct}%"},
        ],
        "lineup1": lineup1_data[0],
        "lineup2": lineup2_data[0],
        "bench1":  lineup1_data[2],
        "bench2":  lineup2_data[2],
        "formation1": lineup1_data[1],
        "formation2": lineup2_data[1]
    }
    user = get_current_user()
    if user:
        user_pick = data.get('user_pick')
        if user_pick:
            save_prediction(user['id'], team1, team2, user_pick, winner)

    return jsonify(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)