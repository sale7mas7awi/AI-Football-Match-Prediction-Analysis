import pandas as pd
import os

# Master Mapping: Data Name -> Canonical Frontend Name
# We want to change names in CSVs to match what the Frontend uses in GROUPS
TEAM_NAME_MAP = {
    'USA': 'United States',
    'South Korea': 'Korea Republic',
    'IR Iran': 'Iran',
    'Ivory Coast': "Cote d'Ivoire",
    'Côte d\'Ivoire': "Cote d'Ivoire",
    'DR Congo': 'Congo DR',
    'Congo': 'Congo DR',
    'Czechia': 'Czech Republic',
    'Bosnia and Herzegovina': 'Bosnia&Herz',
    'Cape Verde': 'Cabo Verde',
    'Curaçao': 'Curacao',
    'Türkiye': 'Turkey',
}

CSV_FILES = {
    'results_features': ('data/clean/results_features.csv', ['home_team', 'away_team']),
    'team_ratings': ('data/clean/team_ratings.csv', ['team']),
    'all_squads': ('data/clean/all_squads.csv', ['team'])
}

def fix():
    print("=== Fixing Team Names in CSVs ===\n")
    
    for key, (path, columns) in CSV_FILES.items():
        if not os.path.exists(path):
            print(f"Skipping missing file: {path}")
            continue
            
        print(f"Processing {path}...")
        df = pd.read_csv(path)
        changes_count = 0
        
        for col in columns:
            if col in df.columns:
                # Find values that need changing
                to_replace = df[col].isin(TEAM_NAME_MAP.keys())
                if to_replace.any():
                    # Get affected names for printing
                    affected = df.loc[to_replace, col].unique()
                    for old_name in affected:
                        new_name = TEAM_NAME_MAP[old_name]
                        print(f"  [{key}] Changing '{old_name}' -> '{new_name}'")
                    
                    df[col] = df[col].replace(TEAM_NAME_MAP)
                    changes_count += to_replace.sum()
        
        if changes_count > 0:
            df.to_csv(path, index=False)
            print(f"  Done. Applied {changes_count} row updates to {path}.\n")
        else:
            print(f"  No changes needed for {path}.\n")

if __name__ == "__main__":
    fix()
