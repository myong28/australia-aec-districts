#!/usr/bin/env python3

import csv
import json
import math
import random
import statistics
import struct
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence, Tuple


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "web"
DATA_FILE = OUTPUT_DIR / "data" / "analysis-data.js"
SUMMARY_FILE = OUTPUT_DIR / "data" / "analysis-summary.json"

ARCHIVES = {
    "2019": ROOT / "national-esri-fe2019.zip",
    "2022": ROOT / "2021-Cwlth_electoral_boundaries_ESRI.zip",
    "2025": ROOT / "AUS-March-2025-esri.zip",
}

MANUAL_STATES = {
    "Eden-Monaro": "NSW",
    "Hawke": "VIC",
    "McEwen": "VIC",
    "McMahon": "NSW",
    "McPherson": "QLD",
    "O'Connor": "WA",
}

RADIUS_M = 6_371_008.8
LON0 = math.radians(134.0)
LAT0 = math.radians(-25.0)
SIMPLIFY_TOLERANCE_M = 1_200.0


@dataclass
class Feature:
    properties: Dict[str, object]
    rings: List[List[Tuple[float, float]]]


def parse_dbf_table(dbf_bytes: bytes) -> List[Dict[str, object]]:
    num_records = struct.unpack("<I", dbf_bytes[4:8])[0]
    header_len = struct.unpack("<H", dbf_bytes[8:10])[0]
    record_len = struct.unpack("<H", dbf_bytes[10:12])[0]

    fields = []
    offset = 32
    while offset < header_len - 1:
        descriptor = dbf_bytes[offset : offset + 32]
        if descriptor[0] == 0x0D:
            break
        name = descriptor[:11].split(b"\x00", 1)[0].decode("ascii", "ignore")
        field_type = chr(descriptor[11])
        field_len = descriptor[16]
        decimals = descriptor[17]
        fields.append((name, field_type, field_len, decimals))
        offset += 32

    rows = []
    record_start = header_len
    for index in range(num_records):
        start = record_start + index * record_len
        record = dbf_bytes[start : start + record_len]
        if not record or record[0:1] == b"*":
            continue
        position = 1
        row = {}
        for name, field_type, field_len, decimals in fields:
            raw = record[position : position + field_len].decode("latin1").strip()
            position += field_len
            if field_type == "N":
                if raw == "":
                    value = None
                elif decimals:
                    value = float(raw)
                else:
                    value = int(raw)
            else:
                value = raw
            row[name] = value
        rows.append(row)
    return rows


def parse_shapefile(shp_bytes: bytes) -> List[List[List[Tuple[float, float]]]]:
    features = []
    offset = 100
    total = len(shp_bytes)
    while offset < total:
        record_number = struct.unpack(">I", shp_bytes[offset : offset + 4])[0]
        if record_number <= 0:
            break
        content_length_words = struct.unpack(">I", shp_bytes[offset + 4 : offset + 8])[0]
        record_end = offset + 8 + content_length_words * 2
        shape_type = struct.unpack("<I", shp_bytes[offset + 8 : offset + 12])[0]
        if shape_type == 0:
            features.append([])
            offset = record_end
            continue
        if shape_type != 15:
            raise ValueError(f"Unsupported shape type {shape_type}")
        content = shp_bytes[offset + 8 : record_end]
        num_parts = struct.unpack("<I", content[36:40])[0]
        num_points = struct.unpack("<I", content[40:44])[0]
        parts = list(struct.unpack(f"<{num_parts}I", content[44 : 44 + num_parts * 4]))
        points_start = 44 + num_parts * 4
        points = [
            struct.unpack("<2d", content[points_start + i * 16 : points_start + (i + 1) * 16])
            for i in range(num_points)
        ]
        rings = []
        for idx, part_start in enumerate(parts):
            part_end = parts[idx + 1] if idx + 1 < len(parts) else num_points
            ring = [(float(lon), float(lat)) for lon, lat in points[part_start:part_end]]
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            rings.append(ring)
        features.append(rings)
        offset = record_end
    return features


def load_year(year: str, archive_path: Path) -> List[Feature]:
    with zipfile.ZipFile(archive_path) as archive:
        shp_name = next(name for name in archive.namelist() if name.endswith(".shp"))
        dbf_name = next(name for name in archive.namelist() if name.endswith(".dbf"))
        shape_rows = parse_shapefile(archive.read(shp_name))
        attribute_rows = parse_dbf_table(archive.read(dbf_name))
    if len(shape_rows) != len(attribute_rows):
        raise ValueError(f"Feature count mismatch in {archive_path.name}")
    features = []
    for attrs, rings in zip(attribute_rows, shape_rows):
        attrs["year"] = year
        features.append(Feature(properties=attrs, rings=rings))
    return features


def laea_project(lon: float, lat: float) -> Tuple[float, float]:
    lon_r = math.radians(lon)
    lat_r = math.radians(lat)
    denom = 1.0 + math.sin(LAT0) * math.sin(lat_r) + math.cos(LAT0) * math.cos(lat_r) * math.cos(lon_r - LON0)
    if denom <= 0:
        denom = 1e-12
    k = math.sqrt(2.0 / denom)
    x = RADIUS_M * k * math.cos(lat_r) * math.sin(lon_r - LON0)
    y = RADIUS_M * k * (
        math.cos(LAT0) * math.sin(lat_r) - math.sin(LAT0) * math.cos(lat_r) * math.cos(lon_r - LON0)
    )
    return (x, y)


def haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    c = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    return 2.0 * RADIUS_M * math.asin(min(1.0, math.sqrt(c)))


def ring_area(points: Sequence[Tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def ring_centroid(points: Sequence[Tuple[float, float]]) -> Tuple[float, float]:
    area2 = 0.0
    cx = 0.0
    cy = 0.0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        cross = x1 * y2 - x2 * y1
        area2 += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area2) < 1e-9:
        xs = [p[0] for p in points[:-1]]
        ys = [p[1] for p in points[:-1]]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    return (cx / (3.0 * area2), cy / (3.0 * area2))


def simplify_ring(points: Sequence[Tuple[float, float]], tolerance_m: float) -> List[Tuple[float, float]]:
    if len(points) <= 4:
        return list(points)
    open_points = list(points[:-1])

    def perpendicular_distance(point, start, end):
        x, y = point
        x1, y1 = start
        x2, y2 = end
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x - x1, y - y1)
        return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)

    def recurse(segment: Sequence[Tuple[float, float]]) -> List[Tuple[float, float]]:
        if len(segment) <= 2:
            return [segment[0], segment[-1]]
        start = segment[0]
        end = segment[-1]
        max_distance = -1.0
        max_index = 0
        for idx in range(1, len(segment) - 1):
            distance = perpendicular_distance(segment[idx], start, end)
            if distance > max_distance:
                max_distance = distance
                max_index = idx
        if max_distance <= tolerance_m:
            return [start, end]
        left = recurse(segment[: max_index + 1])
        right = recurse(segment[max_index:])
        return left[:-1] + right

    simplified = recurse(open_points)
    if len(simplified) < 3:
        simplified = [open_points[0], open_points[len(open_points) // 2], open_points[-1]]
    simplified.append(simplified[0])
    return simplified


def convex_hull(points: Sequence[Tuple[float, float]]) -> List[Tuple[float, float]]:
    unique = sorted(set(points))
    if len(unique) <= 1:
        return unique

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def minimum_enclosing_circle(points: Sequence[Tuple[float, float]]) -> Tuple[Tuple[float, float], float]:
    pts = list(dict.fromkeys(points))
    if not pts:
        return ((0.0, 0.0), 0.0)
    if len(pts) == 1:
        return (pts[0], 0.0)
    random.Random(0).shuffle(pts)

    def circle_from_two(a, b):
        center = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        radius = math.hypot(a[0] - center[0], a[1] - center[1])
        return center, radius

    def circle_from_three(a, b, c):
        ax, ay = a
        bx, by = b
        cx, cy = c
        d = 2.0 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        if abs(d) < 1e-12:
            return None
        ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
        uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
        center = (ux, uy)
        radius = math.hypot(ax - ux, ay - uy)
        return center, radius

    def contains(circle, point):
        center, radius = circle
        return math.hypot(point[0] - center[0], point[1] - center[1]) <= radius + 1e-7

    circle = (pts[0], 0.0)
    for i, point in enumerate(pts):
        if contains(circle, point):
            continue
        circle = (point, 0.0)
        for j in range(i):
            q = pts[j]
            if contains(circle, q):
                continue
            circle = circle_from_two(point, q)
            for k in range(j):
                r = pts[k]
                if contains(circle, r):
                    continue
                triple = circle_from_three(point, q, r)
                if triple is None:
                    candidates = [circle_from_two(point, q), circle_from_two(point, r), circle_from_two(q, r)]
                    circle = max(candidates, key=lambda item: item[1])
                else:
                    circle = triple
    return circle


def percentile_rank(values: Sequence[float], value: float) -> float:
    if not values:
        return 0.5
    below = sum(1 for current in values if current < value)
    equal = sum(1 for current in values if current == value)
    return (below + 0.5 * equal) / len(values)


def compute_metrics(features: List[Feature]) -> List[Dict[str, object]]:
    rows = []
    for feature in features:
        projected_rings = [[laea_project(lon, lat) for lon, lat in ring] for ring in feature.rings if len(ring) >= 4]
        if not projected_rings:
            continue
        signed_areas = [ring_area(ring) for ring in projected_rings]
        negative_area = sum(-value for value in signed_areas if value < 0)
        positive_area = sum(value for value in signed_areas if value > 0)
        shell_sign = -1 if negative_area >= positive_area else 1
        components = sum(1 for value in signed_areas if (value < 0) == (shell_sign < 0))
        total_area_m2 = abs(sum(signed_areas))
        perimeter_m = 0.0
        for ring in feature.rings:
            for idx in range(len(ring) - 1):
                perimeter_m += haversine_m(ring[idx], ring[idx + 1])

        all_projected_points = [point for ring in projected_rings for point in ring[:-1]]
        hull = convex_hull(all_projected_points)
        hull_area = abs(ring_area(hull + [hull[0]])) if len(hull) >= 3 else total_area_m2
        _, circle_radius = minimum_enclosing_circle(hull if hull else all_projected_points)
        circle_area = math.pi * circle_radius * circle_radius if circle_radius > 0 else total_area_m2

        area_km2 = total_area_m2 / 1_000_000.0
        polsby_popper = 0.0 if perimeter_m == 0 else (4.0 * math.pi * total_area_m2) / (perimeter_m * perimeter_m)
        schwartzberg = math.sqrt(max(polsby_popper, 0.0))
        reock = 0.0 if circle_area == 0 else total_area_m2 / circle_area
        hull_ratio = 0.0 if hull_area == 0 else total_area_m2 / hull_area

        weighted_centroid_x = 0.0
        weighted_centroid_y = 0.0
        if total_area_m2 > 0:
            for ring, signed in zip(projected_rings, signed_areas):
                cx, cy = ring_centroid(ring)
                weighted_centroid_x += cx * signed
                weighted_centroid_y += cy * signed
            centroid = (weighted_centroid_x / sum(signed_areas), weighted_centroid_y / sum(signed_areas))
        else:
            centroid = all_projected_points[0]

        simplified = []
        for ring in projected_rings:
            reduced = simplify_ring(ring, SIMPLIFY_TOLERANCE_M)
            if len(reduced) >= 4:
                simplified.append([[round(x, 1), round(y, 1)] for x, y in reduced])

        population = feature.properties.get("Total_Popu")
        actual = feature.properties.get("Actual")
        projected = feature.properties.get("Projected")
        rows.append(
            {
                "year": feature.properties["year"],
                "district": feature.properties["Elect_div"],
                "state": feature.properties.get("State"),
                "elector_number": feature.properties.get("E_div_numb"),
                "num_ccds": feature.properties.get("Numccds"),
                "population_total": population if population not in (0, None) else None,
                "population_actual": actual if actual not in (0, None) else None,
                "population_projected": projected if projected not in (0, None) else None,
                "source_area_sqkm": feature.properties.get("Area_SqKm"),
                "computed_area_sqkm": round(area_km2, 3),
                "perimeter_km": round(perimeter_m / 1000.0, 3),
                "components": components,
                "polsby_popper": round(polsby_popper, 4),
                "schwartzberg": round(schwartzberg, 4),
                "reock": round(reock, 4),
                "convex_hull_ratio": round(hull_ratio, 4),
                "centroid": [round(centroid[0], 1), round(centroid[1], 1)],
                "rings": simplified,
            }
        )
    return rows


def attach_scores(rows: List[Dict[str, object]]) -> None:
    years = sorted({row["year"] for row in rows})
    for year in years:
        year_rows = [row for row in rows if row["year"] == year]
        pp_values = [row["polsby_popper"] for row in year_rows]
        reock_values = [row["reock"] for row in year_rows]
        hull_values = [row["convex_hull_ratio"] for row in year_rows]
        component_values = [row["components"] for row in year_rows]
        for row in year_rows:
            irregularity = statistics.fmean(
                [
                    1.0 - percentile_rank(pp_values, row["polsby_popper"]),
                    1.0 - percentile_rank(reock_values, row["reock"]),
                    1.0 - percentile_rank(hull_values, row["convex_hull_ratio"]),
                    percentile_rank(component_values, row["components"]),
                ]
            )
            row["gerrymander_index"] = round(irregularity * 100.0, 1)
            row["representative_score"] = round((1.0 - irregularity) * 100.0, 1)
        ranked = sorted(year_rows, key=lambda current: (-current["representative_score"], current["district"]))
        for rank, row in enumerate(ranked, start=1):
            row["representative_rank"] = rank


def overall_summary(rows: List[Dict[str, object]]) -> Dict[str, object]:
    def compact_row(row: Dict[str, object]) -> Dict[str, object]:
        keep = [
            "district",
            "state",
            "representative_score",
            "gerrymander_index",
            "representative_rank",
            "polsby_popper",
            "reock",
            "convex_hull_ratio",
            "components",
            "population_actual",
            "population_projected",
            "population_total",
        ]
        return {key: row.get(key) for key in keep}

    summary = {"years": {}, "limitations": []}
    summary["limitations"].append(
        "The AEC shapefiles do not consistently carry population or enrolment counts. The 2019 archive has zeros throughout, while 2022 and 2025 include partial Actual/Projected values and mostly empty Total_Popu."
    )
    summary["limitations"].append(
        "Without precinct-level vote totals, best-practice partisan gerrymandering metrics such as efficiency gap, mean-median, partisan bias, or ensemble simulations are not identifiable from these files alone."
    )
    summary["limitations"].append(
        "The ranking is therefore a boundary-irregularity screen based on compactness and contiguity, not proof of intentional gerrymandering."
    )
    for year in sorted({row["year"] for row in rows}):
        year_rows = [row for row in rows if row["year"] == year]
        summary["years"][year] = {
            "most_representative": [
                compact_row(row)
                for row in sorted(year_rows, key=lambda row: (-row["representative_score"], row["district"]))[:10]
            ],
            "most_irregular": [
                compact_row(row)
                for row in sorted(year_rows, key=lambda row: (-row["gerrymander_index"], row["district"]))[:10]
            ],
            "mean_representative_score": round(statistics.fmean(row["representative_score"] for row in year_rows), 2),
            "district_count": len(year_rows),
        }
    return summary


def state_lookup(rows: List[Dict[str, object]]) -> Dict[str, str]:
    lookup = {}
    for row in rows:
        if row["state"]:
            lookup[row["district"]] = row["state"]
    return lookup


def patch_missing_states(rows: List[Dict[str, object]]) -> None:
    known = state_lookup(rows)
    for row in rows:
        if not row["state"]:
            row["state"] = known.get(row["district"]) or MANUAL_STATES.get(row["district"])


def build_bundle() -> Dict[str, object]:
    all_rows = []
    for year, archive in ARCHIVES.items():
        features = load_year(year, archive)
        all_rows.extend(compute_metrics(features))
    patch_missing_states(all_rows)
    attach_scores(all_rows)
    summary = overall_summary(all_rows)
    return {"generated_from": {year: path.name for year, path in ARCHIVES.items()}, "rows": all_rows, "summary": summary}


def write_outputs(bundle: Dict[str, object]) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "data").mkdir(exist_ok=True)
    json_text = json.dumps(bundle, separators=(",", ":"))
    DATA_FILE.write_text(f"window.AEC_ANALYSIS_DATA = {json_text};\n", encoding="utf-8")
    SUMMARY_FILE.write_text(json.dumps(bundle["summary"], indent=2), encoding="utf-8")
    csv_fields = [
        "year",
        "representative_rank",
        "district",
        "state",
        "representative_score",
        "gerrymander_index",
        "polsby_popper",
        "reock",
        "convex_hull_ratio",
        "components",
        "computed_area_sqkm",
        "perimeter_km",
        "num_ccds",
        "population_actual",
        "population_projected",
        "population_total",
    ]
    for year in sorted({row["year"] for row in bundle["rows"]}):
        out_path = OUTPUT_DIR / "data" / f"rankings-{year}.csv"
        rows = sorted(
            [row for row in bundle["rows"] if row["year"] == year],
            key=lambda row: row["representative_rank"],
        )
        with out_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=csv_fields)
            writer.writeheader()
            for row in rows:
                writer.writerow({field: row.get(field) for field in csv_fields})


def main() -> None:
    bundle = build_bundle()
    write_outputs(bundle)
    for year in sorted(bundle["summary"]["years"]):
        year_summary = bundle["summary"]["years"][year]
        print(f"{year}: {year_summary['district_count']} districts, mean representative score {year_summary['mean_representative_score']}")
        print("  Most representative:", ", ".join(row["district"] for row in year_summary["most_representative"][:5]))
        print("  Most irregular:", ", ".join(row["district"] for row in year_summary["most_irregular"][:5]))


if __name__ == "__main__":
    main()
