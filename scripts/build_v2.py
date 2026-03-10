#!/usr/bin/env python3

import csv
import json
import math
import random
import re
import statistics
import struct
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = ROOT / "Data"
OUTPUT_DIR = ROOT / "web-v2"
DATA_FILE = OUTPUT_DIR / "data" / "analysis-v2.js"
SUMMARY_FILE = OUTPUT_DIR / "data" / "analysis-v2-summary.json"

YEAR_INFO = {
    "2019": {
        "event": "24310",
        "shape": DATA_ROOT / "Shape files" / "national-esri-fe2019.zip",
    },
    "2022": {
        "event": "27966",
        "shape": DATA_ROOT / "Shape files" / "2021-Cwlth_electoral_boundaries_ESRI.zip",
    },
    "2025": {
        "event": "31496",
        "shape": DATA_ROOT / "Shape files" / "AUS-March-2025-esri.zip",
    },
}

RADIUS_M = 6_371_008.8
LON0 = math.radians(134.0)
LAT0 = math.radians(-25.0)
SIMPLIFY_TOLERANCE_M = 220.0


@dataclass
class Feature:
    properties: Dict[str, object]
    rings: List[List[Tuple[float, float]]]


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


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
    start = header_len
    for index in range(num_records):
        record = dbf_bytes[start + index * record_len : start + (index + 1) * record_len]
        if not record or record[:1] == b"*":
            continue
        row = {}
        position = 1
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
    while offset < len(shp_bytes):
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
            struct.unpack("<2d", content[points_start + idx * 16 : points_start + (idx + 1) * 16])
            for idx in range(num_points)
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


def load_shape_features(year: str) -> List[Feature]:
    archive_path = YEAR_INFO[year]["shape"]
    with zipfile.ZipFile(archive_path) as archive:
        shp_name = next(name for name in archive.namelist() if name.endswith(".shp"))
        dbf_name = next(name for name in archive.namelist() if name.endswith(".dbf"))
        rings = parse_shapefile(archive.read(shp_name))
        attrs = parse_dbf_table(archive.read(dbf_name))
    features = []
    for row, geometry in zip(attrs, rings):
        row["year"] = year
        features.append(Feature(properties=row, rings=geometry))
    return features


def read_meta_csv(path: Path) -> List[Dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        next(reader)
        header = next(reader)
        return [dict(zip(header, row)) for row in reader if row]


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
    return x, y


def haversine_m(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    c = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    return 2.0 * RADIUS_M * math.asin(min(1.0, math.sqrt(c)))


def ring_area(points: Sequence[Tuple[float, float]]) -> float:
    total = 0.0
    for idx in range(len(points) - 1):
        x1, y1 = points[idx]
        x2, y2 = points[idx + 1]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def ring_centroid(points: Sequence[Tuple[float, float]]) -> Tuple[float, float]:
    area2 = 0.0
    cx = 0.0
    cy = 0.0
    for idx in range(len(points) - 1):
        x1, y1 = points[idx]
        x2, y2 = points[idx + 1]
        cross = x1 * y2 - x2 * y1
        area2 += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area2) < 1e-9:
        xs = [point[0] for point in points[:-1]]
        ys = [point[1] for point in points[:-1]]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (3.0 * area2), cy / (3.0 * area2)


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

    def recurse(segment):
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

    def cross(origin, a, b):
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])

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

    def from_two(a, b):
        center = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        radius = math.hypot(a[0] - center[0], a[1] - center[1])
        return center, radius

    def from_three(a, b, c):
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
            circle = from_two(point, q)
            for k in range(j):
                r = pts[k]
                if contains(circle, r):
                    continue
                triple = from_three(point, q, r)
                if triple is None:
                    circle = max([from_two(point, q), from_two(point, r), from_two(q, r)], key=lambda item: item[1])
                else:
                    circle = triple
    return circle


def percentile_rank(values: Sequence[float], value: float) -> float:
    below = sum(1 for current in values if current < value)
    equal = sum(1 for current in values if current == value)
    return (below + 0.5 * equal) / len(values) if values else 0.5


def weighted_stddev(values: Sequence[float], weights: Sequence[float]) -> float:
    if not values:
        return 0.0
    total_weight = sum(weights)
    if total_weight <= 0:
        return 0.0
    mean_value = sum(value * weight for value, weight in zip(values, weights)) / total_weight
    variance = sum(weight * (value - mean_value) ** 2 for value, weight in zip(values, weights)) / total_weight
    return math.sqrt(variance)


def effective_number_of_parties(shares: Iterable[float]) -> float:
    denom = sum(share * share for share in shares if share > 0)
    return 0.0 if denom == 0 else 1.0 / denom


def party_columns(row: Dict[str, str], suffix: str) -> Tuple[str, str]:
    alp = next(key for key in row if key.startswith("Australian Labor Party ") and key.endswith(suffix))
    coalition = next(key for key in row if key.startswith("Liberal/National Coalition ") and key.endswith(suffix))
    return alp, coalition


def build_shape_metrics(year: str) -> Dict[str, Dict[str, object]]:
    rows = {}
    for feature in load_shape_features(year):
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

        points = [point for ring in projected_rings for point in ring[:-1]]
        hull = convex_hull(points)
        hull_area = abs(ring_area(hull + [hull[0]])) if len(hull) >= 3 else total_area_m2
        _, radius = minimum_enclosing_circle(hull if hull else points)
        circle_area = math.pi * radius * radius if radius > 0 else total_area_m2
        polsby_popper = 0.0 if perimeter_m == 0 else (4.0 * math.pi * total_area_m2) / (perimeter_m * perimeter_m)
        reock = 0.0 if circle_area == 0 else total_area_m2 / circle_area
        hull_ratio = 0.0 if hull_area == 0 else total_area_m2 / hull_area

        centroid_x = 0.0
        centroid_y = 0.0
        signed_total = sum(signed_areas)
        if abs(signed_total) > 1e-9:
            for ring, area in zip(projected_rings, signed_areas):
                cx, cy = ring_centroid(ring)
                centroid_x += cx * area
                centroid_y += cy * area
            centroid = (centroid_x / signed_total, centroid_y / signed_total)
        else:
            centroid = points[0]

        simplified = []
        for ring in projected_rings:
            reduced = simplify_ring(ring, SIMPLIFY_TOLERANCE_M)
            if len(reduced) >= 4:
                simplified.append([[round(x, 1), round(y, 1)] for x, y in reduced])

        district_name = str(feature.properties["Elect_div"])
        canonical = normalize_name(district_name)
        rows[canonical] = {
            "district": district_name,
            "state_shape": feature.properties.get("State"),
            "num_ccds": feature.properties.get("Numccds"),
            "area_sqkm": round(total_area_m2 / 1_000_000.0, 3),
            "perimeter_km": round(perimeter_m / 1000.0, 3),
            "components": components,
            "polsby_popper": round(polsby_popper, 4),
            "reock": round(reock, 4),
            "convex_hull_ratio": round(hull_ratio, 4),
            "centroid": [round(centroid[0], 1), round(centroid[1], 1)],
            "rings": simplified,
        }
    return rows


def build_turnout_metrics(year: str, event: str) -> Dict[str, Dict[str, object]]:
    rows = read_meta_csv(DATA_ROOT / f"{year} data" / f"HouseTurnoutByDivisionDownload-{event}.csv")
    metrics = {}
    for row in rows:
        canonical = normalize_name(row["DivisionNm"])
        enrolment = int(row["Enrolment"])
        turnout = int(row["Turnout"])
        metrics[canonical] = {
            "division_id": row["DivisionID"],
            "district": row["DivisionNm"],
            "state": row["StateAb"],
            "enrolment": enrolment,
            "turnout": turnout,
            "turnout_pct": round(float(row["TurnoutPercentage"]), 2),
            "turnout_swing": round(float(row["TurnoutSwing"]), 2),
        }
    return metrics


def build_tpp_division_metrics(year: str, event: str) -> Dict[str, Dict[str, object]]:
    rows = read_meta_csv(DATA_ROOT / f"{year} data" / f"HouseTppByDivisionDownload-{event}.csv")
    metrics = {}
    for row in rows:
        canonical = normalize_name(row["DivisionNm"])
        alp_votes_col, coalition_votes_col = party_columns(row, "Votes")
        alp_pct_col, coalition_pct_col = party_columns(row, "Percentage")
        alp_pct = float(row[alp_pct_col])
        coalition_pct = float(row[coalition_pct_col])
        metrics[canonical] = {
            "tpp_alp_votes": int(row[alp_votes_col]),
            "tpp_coalition_votes": int(row[coalition_votes_col]),
            "tpp_alp_pct": round(alp_pct, 2),
            "tpp_coalition_pct": round(coalition_pct, 2),
            "tpp_margin_pct": round(abs(alp_pct - coalition_pct), 2),
            "tpp_swing": round(float(row["Swing"]), 2),
            "winning_party": row["PartyAb"],
            "tpp_total_votes": int(row["TotalVotes"]),
        }
    return metrics


def build_tpp_vote_type_metrics(year: str, event: str) -> Dict[str, Dict[str, object]]:
    rows = read_meta_csv(DATA_ROOT / f"{year} data" / f"HouseTppByDivisionByVoteTypeDownload-{event}.csv")
    metrics = {}
    for row in rows:
        canonical = normalize_name(row["DivisionNm"])
        ordinary_pct_col, coalition_ordinary_pct = party_columns(row, "OrdinaryPercentage")
        absent_pct_col, coalition_absent_pct = party_columns(row, "AbsentPercentage")
        provisional_pct_col, coalition_provisional_pct = party_columns(row, "ProvisionalPercentage")
        postal_pct_col, coalition_postal_pct = party_columns(row, "PostalPercentage")
        pre_poll_pct_col, coalition_pre_poll_pct = party_columns(row, "DeclarationPrePollPercentage")
        alp_fields = [ordinary_pct_col, absent_pct_col, provisional_pct_col, postal_pct_col, pre_poll_pct_col]
        coalition_fields = [
            coalition_ordinary_pct,
            coalition_absent_pct,
            coalition_provisional_pct,
            coalition_postal_pct,
            coalition_pre_poll_pct,
        ]
        alp_values = [float(row[field]) for field in alp_fields]
        coalition_values = [float(row[field]) for field in coalition_fields]
        overall_alp = sum(alp_values) / len(alp_values)
        metrics[canonical] = {
            "ordinary_alp_pct": round(float(row[ordinary_pct_col]), 2),
            "absent_alp_pct": round(float(row[absent_pct_col]), 2),
            "postal_alp_pct": round(float(row[postal_pct_col]), 2),
            "prepoll_alp_pct": round(float(row[pre_poll_pct_col]), 2),
            "vote_type_skew": round(max(abs(value - overall_alp) for value in alp_values), 2),
            "vote_type_spread": round(max(alp_values) - min(alp_values), 2),
        }
    return metrics


def build_first_pref_metrics(year: str, event: str) -> Dict[str, Dict[str, object]]:
    rows = read_meta_csv(DATA_ROOT / f"{year} data" / f"HouseFirstPrefsByCandidateByVoteTypeDownload-{event}.csv")
    by_division = defaultdict(lambda: {"party_votes": defaultdict(int), "candidate_count": 0, "total_votes": 0})
    for row in rows:
        canonical = normalize_name(row["DivisionNm"])
        party = row["PartyAb"] or f"IND-{row['Surname']}"
        votes = int(row["TotalVotes"])
        by_division[canonical]["party_votes"][party] += votes
        by_division[canonical]["candidate_count"] += 1
        by_division[canonical]["total_votes"] += votes
    metrics = {}
    for canonical, bucket in by_division.items():
        total_votes = bucket["total_votes"]
        shares = [votes / total_votes for votes in bucket["party_votes"].values() if total_votes]
        ordered = sorted(bucket["party_votes"].items(), key=lambda item: item[1], reverse=True)
        top_votes = ordered[0][1] if ordered else 0
        second_votes = ordered[1][1] if len(ordered) > 1 else 0
        metrics[canonical] = {
            "candidate_count": bucket["candidate_count"],
            "party_count": len(bucket["party_votes"]),
            "effective_parties": round(effective_number_of_parties(shares), 3),
            "top_primary_party": ordered[0][0] if ordered else None,
            "top_primary_pct": round((top_votes / total_votes) * 100.0, 2) if total_votes else 0.0,
            "primary_gap_pct": round(((top_votes - second_votes) / total_votes) * 100.0, 2) if total_votes else 0.0,
            "first_pref_total_votes": total_votes,
        }
    return metrics


def build_polling_metrics(year: str, event: str) -> Tuple[Dict[str, Dict[str, object]], List[Dict[str, object]]]:
    general_rows = read_meta_csv(DATA_ROOT / f"{year} data" / f"GeneralPollingPlacesDownload-{event}.csv")
    coords = {
        row["PollingPlaceID"]: row
        for row in general_rows
        if row["PollingPlaceID"] != "0" and row["Latitude"] and row["Longitude"]
    }

    leading_by_booth = {}
    for path in sorted((DATA_ROOT / f"{year} data").glob(f"HouseStateFirstPrefsByPollingPlaceDownload-{event}-*.csv")):
        rows = read_meta_csv(path)
        booth_buckets = defaultdict(lambda: {"district": None, "votes": defaultdict(int), "total": 0})
        for row in rows:
            polling_place_id = row["PollingPlaceID"]
            key = (row["DivisionID"], polling_place_id)
            party = row["PartyAb"] or f"IND-{row['Surname']}"
            votes = int(row["OrdinaryVotes"])
            booth_buckets[key]["district"] = row["DivisionNm"]
            booth_buckets[key]["votes"][party] += votes
            booth_buckets[key]["total"] += votes
        for key, bucket in booth_buckets.items():
            ordered = sorted(bucket["votes"].items(), key=lambda item: item[1], reverse=True)
            if not ordered:
                continue
            leading_by_booth[key] = {
                "leading_party": ordered[0][0],
                "leading_party_pct": round((ordered[0][1] / bucket["total"]) * 100.0, 2) if bucket["total"] else 0.0,
                "primary_total_votes": bucket["total"],
            }

    tpp_rows = read_meta_csv(DATA_ROOT / f"{year} data" / f"HouseTppByPollingPlaceDownload-{event}.csv")
    district_booth_values = defaultdict(list)
    district_booth_weights = defaultdict(list)
    district_totals = defaultdict(int)
    booths = []
    for row in tpp_rows:
        canonical = normalize_name(row["DivisionNm"])
        alp_votes_col, coalition_votes_col = party_columns(row, "Votes")
        alp_pct_col, coalition_pct_col = party_columns(row, "Percentage")
        alp_pct = float(row[alp_pct_col])
        total_votes = int(row["TotalVotes"])
        polling_place_id = row["PollingPlaceID"]
        district_booth_values[canonical].append(alp_pct)
        district_booth_weights[canonical].append(total_votes)
        district_totals[canonical] += total_votes
        coord_row = coords.get(polling_place_id)
        if not coord_row:
            continue
        key = (row["DivisionID"], polling_place_id)
        leading = leading_by_booth.get(key, {})
        booths.append(
            {
                "year": year,
                "district": row["DivisionNm"],
                "division_id": row["DivisionID"],
                "polling_place_id": polling_place_id,
                "name": row["PollingPlace"],
                "lat": round(float(coord_row["Latitude"]), 6),
                "lon": round(float(coord_row["Longitude"]), 6),
                "tpp_alp_pct": round(alp_pct, 2),
                "tpp_margin_pct": round(abs(float(row[alp_pct_col]) - float(row[coalition_pct_col])), 2),
                "total_votes": total_votes,
                "leading_party": leading.get("leading_party"),
                "leading_party_pct": leading.get("leading_party_pct"),
                "primary_total_votes": leading.get("primary_total_votes"),
            }
        )

    district_metrics = {}
    mapped_counts = defaultdict(int)
    for booth in booths:
        mapped_counts[normalize_name(booth["district"])] += 1
    for canonical, values in district_booth_values.items():
        weights = district_booth_weights[canonical]
        district_metrics[canonical] = {
            "booth_count": len(values),
            "mapped_booth_count": mapped_counts.get(canonical, 0),
            "booth_tpp_stddev": round(weighted_stddev(values, weights), 2),
            "booth_tpp_range": round(max(values) - min(values), 2) if values else 0.0,
            "booth_vote_total": district_totals[canonical],
        }
    return district_metrics, booths


def merge_year(year: str) -> Tuple[List[Dict[str, object]], List[Dict[str, object]]]:
    event = YEAR_INFO[year]["event"]
    shape = build_shape_metrics(year)
    turnout = build_turnout_metrics(year, event)
    tpp_div = build_tpp_division_metrics(year, event)
    tpp_vote_type = build_tpp_vote_type_metrics(year, event)
    first_pref = build_first_pref_metrics(year, event)
    polling_metrics, booths = build_polling_metrics(year, event)

    all_keys = set(shape) | set(turnout) | set(tpp_div) | set(tpp_vote_type) | set(first_pref) | set(polling_metrics)
    districts = []
    for canonical in sorted(all_keys):
        row = {}
        for source in (shape.get(canonical), turnout.get(canonical), tpp_div.get(canonical), tpp_vote_type.get(canonical), first_pref.get(canonical), polling_metrics.get(canonical)):
            if source:
                row.update(source)
        row["year"] = year
        row["district"] = row.get("district") or canonical
        row["state"] = row.get("state") or row.get("state_shape")
        row["name_key"] = canonical
        districts.append(row)
    return districts, booths


def attach_scores(rows: List[Dict[str, object]]) -> None:
    for year in sorted({row["year"] for row in rows}):
        year_rows = [row for row in rows if row["year"] == year]
        state_enrolments = defaultdict(list)
        for row in year_rows:
            if row.get("enrolment") and row.get("state"):
                state_enrolments[row["state"]].append(row["enrolment"])

        shape_values = []
        safety_values = []
        quota_values = []
        heterogeneity_values = []

        for row in year_rows:
            shape_risk = statistics.fmean(
                [
                    1.0 - percentile_rank([r["polsby_popper"] for r in year_rows], row["polsby_popper"]),
                    1.0 - percentile_rank([r["reock"] for r in year_rows], row["reock"]),
                    1.0 - percentile_rank([r["convex_hull_ratio"] for r in year_rows], row["convex_hull_ratio"]),
                    percentile_rank([r["components"] for r in year_rows], row["components"]),
                ]
            )
            row["shape_irregularity"] = round(shape_risk * 100.0, 1)
            state_mean = statistics.fmean(state_enrolments[row["state"]]) if row.get("state") in state_enrolments else row.get("enrolment", 0)
            quota_dev = 0.0 if not state_mean else abs(row["enrolment"] - state_mean) / state_mean * 100.0
            row["quota_deviation_pct"] = round(quota_dev, 2)
            row["safety_margin_pct"] = row.get("tpp_margin_pct", 0.0)
            row["booth_tpp_stddev"] = row.get("booth_tpp_stddev", 0.0)
            shape_values.append(row["shape_irregularity"])
            safety_values.append(row["safety_margin_pct"])
            quota_values.append(row["quota_deviation_pct"])
            heterogeneity_values.append(row["booth_tpp_stddev"])

        for row in year_rows:
            shape_pct = percentile_rank(shape_values, row["shape_irregularity"])
            safety_pct = percentile_rank(safety_values, row["safety_margin_pct"])
            quota_pct = percentile_rank(quota_values, row["quota_deviation_pct"])
            heterogeneity_pct = percentile_rank(heterogeneity_values, row["booth_tpp_stddev"])
            packing_signal = safety_pct * heterogeneity_pct
            risk = 0.5 * shape_pct + 0.2 * quota_pct + 0.2 * packing_signal + 0.1 * safety_pct
            row["packing_signal"] = round(packing_signal * 100.0, 1)
            row["gerrymander_index"] = round(risk * 100.0, 1)
            row["representative_score"] = round((1.0 - risk) * 100.0, 1)

        ranked = sorted(year_rows, key=lambda item: (-item["representative_score"], item["district"]))
        for idx, row in enumerate(ranked, start=1):
            row["representative_rank"] = idx


def build_summary(rows: List[Dict[str, object]]) -> Dict[str, object]:
    summary = {"years": {}, "limitations": [], "methods": []}
    summary["methods"] = [
        "Boundary compactness uses Polsby-Popper, Reock, convex-hull ratio, and contiguity/components.",
        "Electoral context uses division-level TPP, enrolment deviation from the state-year mean, and booth-level TPP dispersion.",
        "The composite gerrymander index is a heuristic screen, not a causal or legal finding.",
    ]
    summary["limitations"] = [
        "This is stronger than the v1 shape-only screen, but it is still not a full redistricting-ensemble test because the input data does not contain alternative plans or booth catchment polygons.",
        "Booth-level geographic coverage is incomplete for mobile and special teams because some TPP polling-place rows have no coordinates in the AEC polling-place file.",
        "High margin or high heterogeneity can reflect geography, incumbency, or demographic sorting rather than intentional gerrymandering.",
    ]
    for year in sorted({row["year"] for row in rows}):
        year_rows = [row for row in rows if row["year"] == year]
        summary["years"][year] = {
            "district_count": len(year_rows),
            "top_representative": [
                {
                    "district": row["district"],
                    "state": row["state"],
                    "representative_score": row["representative_score"],
                    "gerrymander_index": row["gerrymander_index"],
                }
                for row in sorted(year_rows, key=lambda item: (-item["representative_score"], item["district"]))[:10]
            ],
            "top_risk": [
                {
                    "district": row["district"],
                    "state": row["state"],
                    "representative_score": row["representative_score"],
                    "gerrymander_index": row["gerrymander_index"],
                }
                for row in sorted(year_rows, key=lambda item: (-item["gerrymander_index"], item["district"]))[:10]
            ],
            "mean_representative_score": round(statistics.fmean(row["representative_score"] for row in year_rows), 2),
        }
    return summary


def compact_district_row(row: Dict[str, object]) -> Dict[str, object]:
    keep = [
        "year",
        "district",
        "state",
        "representative_rank",
        "representative_score",
        "gerrymander_index",
        "shape_irregularity",
        "packing_signal",
        "quota_deviation_pct",
        "tpp_alp_pct",
        "tpp_margin_pct",
        "tpp_swing",
        "enrolment",
        "turnout",
        "turnout_pct",
        "booth_tpp_stddev",
        "booth_tpp_range",
        "booth_count",
        "mapped_booth_count",
        "effective_parties",
        "top_primary_party",
        "top_primary_pct",
        "primary_gap_pct",
        "vote_type_skew",
        "polsby_popper",
        "reock",
        "convex_hull_ratio",
        "components",
        "area_sqkm",
        "perimeter_km",
        "num_ccds",
        "centroid",
        "rings",
    ]
    return {key: row.get(key) for key in keep}


def build_bundle() -> Dict[str, object]:
    districts = []
    booths = []
    for year in YEAR_INFO:
        year_districts, year_booths = merge_year(year)
        districts.extend(year_districts)
        booths.extend(year_booths)
    attach_scores(districts)
    districts = sorted(districts, key=lambda row: (row["year"], row["representative_rank"]))
    summary = build_summary(districts)
    return {
        "generated_from": {
            year: {
                "shape": str(info["shape"].relative_to(ROOT)),
                "event": info["event"],
            }
            for year, info in YEAR_INFO.items()
        },
        "districts": [compact_district_row(row) for row in districts],
        "booths": booths,
        "summary": summary,
    }


def write_outputs(bundle: Dict[str, object]) -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "data").mkdir(exist_ok=True)
    DATA_FILE.write_text(f"window.AEC_V2_DATA = {json.dumps(bundle, separators=(',', ':'))};\n", encoding="utf-8")
    SUMMARY_FILE.write_text(json.dumps(bundle["summary"], indent=2), encoding="utf-8")
    fieldnames = [
        "year",
        "representative_rank",
        "district",
        "state",
        "representative_score",
        "gerrymander_index",
        "shape_irregularity",
        "packing_signal",
        "quota_deviation_pct",
        "tpp_alp_pct",
        "tpp_margin_pct",
        "tpp_swing",
        "enrolment",
        "turnout",
        "turnout_pct",
        "booth_tpp_stddev",
        "booth_tpp_range",
        "booth_count",
        "mapped_booth_count",
        "effective_parties",
        "top_primary_party",
        "top_primary_pct",
        "primary_gap_pct",
        "vote_type_skew",
        "polsby_popper",
        "reock",
        "convex_hull_ratio",
        "components",
        "area_sqkm",
        "perimeter_km",
        "num_ccds",
    ]
    for year in YEAR_INFO:
        path = OUTPUT_DIR / "data" / f"rankings-{year}.csv"
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in bundle["districts"]:
                if row["year"] == year:
                    writer.writerow({field: row.get(field) for field in fieldnames})


def main() -> None:
    bundle = build_bundle()
    write_outputs(bundle)
    for year in YEAR_INFO:
        year_rows = [row for row in bundle["districts"] if row["year"] == year]
        top = year_rows[:5]
        bottom = sorted(year_rows, key=lambda row: (-row["gerrymander_index"], row["district"]))[:5]
        print(f"{year}: {len(year_rows)} districts")
        print("  Most representative:", ", ".join(row["district"] for row in top))
        print("  Highest risk:", ", ".join(row["district"] for row in bottom))


if __name__ == "__main__":
    main()
