"""Export all_squads.csv → F.E/teams_lineup.json (same source as teams.ipynb pipeline)."""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "data" / "clean" / "all_squads.csv"
OUT_JSON = ROOT / "F.E (2)" / "F.E" / "teams_lineup.json"
OUT_JS = ROOT / "F.E (2)" / "F.E" / "teams_lineup_data.js"


def main():
    df = pd.read_csv(CSV_PATH)
    out = {}
    for team, g in df.groupby("team"):
        g = g.sort_values("OVR", ascending=False)
        rows = []
        for _, p in g.iterrows():
            rows.append(
                {
                    "name": str(p["Name"]),
                    "position": str(p["Position"]) if pd.notna(p.get("Position")) else "",
                    "ovr": int(p["OVR"]) if pd.notna(p.get("OVR")) else None,
                }
            )
        out[str(team)] = rows
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    # يعمل مع file:// بدون fetch (تجاوز قيود المتصفح على الملفات المحلية)
    OUT_JS.write_text(
        "/* auto-generated from all_squads.csv — run: python export_teams_lineup_json.py */\n"
        "window.TEAMS_LINEUP_DATA=" + json.dumps(out, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(out)} teams -> {OUT_JSON}")
    print(f"Wrote {len(out)} teams -> {OUT_JS}")


if __name__ == "__main__":
    main()
