# AI Football Match Prediction & Analysis 

An end-to-end Artificial Intelligence platform for predicting football match outcomes and simulating the FIFA World Cup 2026 tournament using Machine Learning, historical football data, FIFA rankings, EA FC 26 player ratings, and squad analysis.

---

## Project Overview

Football match prediction is a challenging problem due to the large number of factors influencing match outcomes. This project was developed to provide a data-driven and explainable prediction platform that combines historical performance, team strength, player quality, and tournament context.

The platform allows users to:

* Predict match outcomes.
* Analyze team strengths and weaknesses.
* Compare national teams.
* View predicted lineups.
* Simulate the entire FIFA World Cup 2026 tournament.
* Explore probability-based predictions through an interactive web interface.

---

## Key Features

### Match Prediction Engine

Predicts:

* Home Win
* Draw
* Away Win

with probability distributions and confidence scores.

### Team Analysis

Provides comparisons between teams using:

* FIFA Rankings
* EA FC 26 Team Ratings
* Squad Strength
* Offensive Metrics
* Defensive Metrics
* Recent Team Form

### World Cup 2026 Simulation

Supports simulation of:

* Group Stage
* Round of 32
* Round of 16
* Quarter Finals
* Semi Finals
* Third Place Match
* Final

### Interactive Dashboard

Built with HTML, CSS, JavaScript, and Chart.js to provide an intuitive user experience.

---

## Datasets Used

### Historical International Match Results

* 49,000+ international matches
* Match outcomes
* Tournament information
* Home/Away teams
* Scores

### FIFA Ranking History

Official FIFA rankings used to measure team strength and ranking differentials.

### EA FC 26 Player Ratings

Includes:

* Overall Rating (OVR)
* Pace (PAC)
* Shooting (SHO)
* Passing (PAS)
* Dribbling (DRI)
* Defending (DEF)
* Physicality (PHY)

### Squad & Team Data

Manually curated squad information for all FIFA World Cup 2026 teams.

### Additional Sources

* Goalscorers Dataset
* Penalty Shootouts Dataset
* Historical Team Mapping Dataset

---

## Data Engineering

The project includes a complete data engineering pipeline:

* Data collection
* Data cleaning
* Missing value handling
* Team name normalization
* Dataset integration
* Feature extraction
* Model-ready dataset generation

Final training dataset:

* 8,000+ cleaned international matches
* 18 engineered predictive features

---

## Feature Engineering

Features include:

* FIFA Rank Difference
* Team Form Difference
* Head-to-Head Statistics
* Average Goals Scored
* Average Goals Conceded
* Tournament Importance
* Neutral Ground Indicator
* Team Rating Differences
* Squad Strength Metrics

---

## Machine Learning Models

Several machine learning models were evaluated during development:

* Logistic Regression
* Random Forest
* XGBoost
* Voting Ensemble

Final architecture:

### Win/Loss Prediction Model

Voting Ensemble consisting of:

* Random Forest
* XGBoost
* Logistic Regression

### Draw Detection Model

Dedicated model for handling football draw prediction.

---

## Technology Stack

### Backend

* Python
* Flask
* SQLite

### Machine Learning

* Scikit-Learn
* XGBoost
* Pandas
* NumPy

### Frontend

* HTML5
* CSS3
* JavaScript
* Chart.js

---

## Project Structure

```text
app.py
predict.py
db.py

data/
├── raw/
├── clean/

F.E/
├── HTML
├── CSS
├── JavaScript

models/
├── model.pkl
├── model_binary.pkl
├── model_draw.pkl

notebooks/
├── clean.ipynb
├── model.ipynb
├── teams.ipynb
```

## Running the Project

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Application

```bash
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

---

## Future Improvements

* Live FIFA Ranking Integration
* Real-Time Match Prediction
* Mobile Applications
* Exact Score Prediction
* Automated Squad Updates
* Multi-Language Support
* Advanced Hyperparameter Optimization
* Expanded Club Competition Support

---

## Learning Outcomes

This project provided practical experience in:

* Data Science
* Machine Learning
* Artificial Intelligence
* Data Engineering
* Backend Development
* Frontend Development
* Database Design
* System Integration
* Software Architecture

---

## Author

Saleh Nour Al-Deen

Data Science & Artificial Intelligence


Graduation Project – 2026
