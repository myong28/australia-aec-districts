# Australian AEC District Representativeness Screen

This workspace now contains two static sites:

- `web/`: v1 boundary-only screen
- `web-v2/`: stronger analytical version using boundaries, enrolment, TPP, first preferences, and polling-place data

## What the analysis measures

The available shapefiles support a geometric screening approach, not a full partisan gerrymandering audit. The generated ranking uses:

- `Polsby-Popper` compactness
- `Reock` compactness
- `Convex hull ratio`
- `Contiguity/components`

The AEC files do not include vote totals, and population fields are incomplete across years, so metrics like efficiency gap, mean-median difference, partisan bias, or simulated redistricting ensembles are not possible from these inputs alone.

V2 adds:

- enrolment and turnout by division
- TPP by division and by vote type
- first-preference structure by division
- booth-level TPP dispersion and polling-place overlays

## Build v1

```bash
python3 scripts/build_analysis.py
```

This writes:

- `web/data/analysis-data.js`
- `web/data/analysis-summary.json`
- `web/data/rankings-2019.csv`
- `web/data/rankings-2022.csv`
- `web/data/rankings-2025.csv`

## Build v2

```bash
python3 scripts/build_v2.py
```

This writes:

- `web-v2/data/analysis-v2.js`
- `web-v2/data/analysis-v2-summary.json`
- `web-v2/data/rankings-2019.csv`
- `web-v2/data/rankings-2022.csv`
- `web-v2/data/rankings-2025.csv`

## View the UIs

From this folder:

```bash
python3 -m http.server 8000
```

Then open:

- [web/index.html](/Users/myong/My%20Drive/1.%20Documents/1.%20Education/1.%20University/1.%20HKS/1.%20Classes/HKS%20Year%201%20Semester%202/Data%20Politics%20(DPI%20610)/Australia%20AEC%20Districts/web/index.html) via `http://localhost:8000/web/`
- [web-v2/index.html](/Users/myong/My%20Drive/1.%20Documents/1.%20Education/1.%20University/1.%20HKS/1.%20Classes/HKS%20Year%201%20Semester%202/Data%20Politics%20(DPI%20610)/Australia%20AEC%20Districts/web-v2/index.html) via `http://localhost:8000/web-v2/`
