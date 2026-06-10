import pandas as pd
import os
import json
import re

# Canonical names from wordcup.js (GROUPS)
# Manually extracted for the audit script base
FRONTEND_TEAMS = [
    'Mexico', 'South Africa', 'Korea Republic', 'Czech Republic',
    'Canada', 'Qatar', 'Switzerland', 'Bosnia&Herz',
    'Brazil', 'Morocco', 'Haiti', 'Scotland',
    'United States', 'Paraguay', 'Australia', 'Turkey',
    'Germany', 'Ecuador', "Cote d'Ivoire", 'Curacao',
    'Netherlands', 'Japan', 'Tunisia', 'Sweden',
    'Belgium', 'Iran', 'Egypt', 'New Zealand',
    'Spain', 'Uruguay', 'Saudi Arabia', 'Cabo Verde',
    'France', 'Senegal', 'Norway', 'Iraq',
    'Argentina', 'Algeria', 'Austria', 'Jordan',
    'Portugal', 'Colombia', 'Uzbekistan', 'Congo DR',
    'England', 'Croatia', 'Ghana', 'Panama'
]

CSV_FILES = {
    'results_features': ('data/clean/results_features.csv', ['home_team', 'away_team']),
    'team_ratings': ('data/clean/team_ratings.csv', ['team']),
    'all_squads': ('data/clean/all_squads.csv', ['team'])
}

def audit():
    print("=== Team Name Audit Report ===\n")
    
    frontend_set = set(FRONTEND_TEAMS)
    all_csv_teams = set()
    
    report = {}

    for key, (path, columns) in CSV_FILES.items():
        if not os.path.exists(path):
            print(f"Warning: File not found: {path}")
            continue
            
        df = pd.read_csv(path)
        file_teams = set()
        for col in columns:
            if col in df.columns:
                file_teams.update(df[col].unique())
        
        missing_in_file = frontend_set - file_teams
        extra_in_file = file_teams - frontend_set
        
        report[key] = {
            'missing': sorted(list(missing_in_file)),
            'extra': sorted([str(t) for t in extra_in_file if pd.notna(t)])
        }
        all_csv_teams.update(file_teams)

    # Print results
    for key, data in report.items():
        print(f"--- File: {key} ---")
        print(f"Teams in Frontend but MISSING in CSV: {len(data['missing'])}")
        if data['missing']:
            print(f"  Example missing: {data['missing'][:5]}...")
            
        print(f"Teams in CSV but NOT in Frontend list: {len(data['extra'])}")
        if data['extra']:
            # Look for close matches
            print("  Potential Mismatches (CSV Name -> Suggested Frontend Name):")
            for extra in data['extra']:
                # Simple normalization for comparison
                norm_extra = extra.lower().replace(" ", "").replace("-", "")
                for ft in FRONTEND_TEAMS:
                    norm_ft = ft.lower().replace(" ", "").replace("-", "")
                    if norm_extra == norm_ft or norm_extra in norm_ft or norm_ft in norm_extra:
                        if extra != ft:
                            print(f"    '{extra}' -> '{ft}'?")
        print("\n")

    print("=== Summary ===")
    overall_missing = frontend_set - all_csv_teams
    print(f"Total frontend teams missing across ALL CSVs: {len(overall_missing)}")
    if overall_missing:
        print(f"Missing: {overall_missing}")

if __name__ == "__main__":
    audit()
