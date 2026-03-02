#!/usr/bin/env python3
import argparse
import colorsys
import io
import json
import math
import re
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from PIL import Image

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
    )
}


@dataclass
class Artwork:
    title: str
    year: Optional[str]
    page_url: str
    image_url: str


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def parse_title_year(text: str) -> Tuple[str, Optional[str]]:
    cleaned = (
        text.replace("“", '"')
        .replace("”", '"')
        .replace("’", "'")
        .replace("&#8221;", '"')
    )
    t = normalize_space(cleaned)
    m = re.match(r"^(.*?),\s*(\d{4}(?:\s*[-–]\s*\d{2,4})?)$", t)
    if m:
        return normalize_space(m.group(1)), normalize_space(m.group(2))
    m2 = re.search(r"(\d{4}(?:\s*[-–]\s*\d{2,4})?)", t)
    if m2:
        year = normalize_space(m2.group(1))
        title = normalize_space(t[: m2.start()].rstrip(" ,.-–"))
        return (title or t), year
    return t, None


def fetch_artworks(url: str) -> List[Artwork]:
    resp = requests.get(url, headers=HEADERS, timeout=45)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    image_cells = soup.select("td.imagepart a[href]")
    text_cells = soup.select("td.textpart")
    n = min(len(image_cells), len(text_cells))
    out: List[Artwork] = []
    seen = set()

    for i in range(n):
        a = image_cells[i]
        text = normalize_space(text_cells[i].get_text(" ", strip=True))
        title, year = parse_title_year(text)
        image_url = normalize_space(a.get("href", ""))
        if not title or not image_url:
            continue
        if image_url.startswith("//"):
            image_url = "https:" + image_url
        elif image_url.startswith("/"):
            image_url = "https://totallyhistory.com" + image_url
        image_url = image_url.replace("http://", "https://")
        key = (title.lower(), year or "", image_url)
        if key in seen:
            continue
        seen.add(key)
        out.append(Artwork(title=title, year=year, page_url=url, image_url=image_url))

    return out


def rgb_to_hsv255(r: int, g: int, b: int) -> Tuple[float, float, float]:
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, v


def hsv_to_sphere(h: float, s: float, v: float) -> Tuple[float, float, float]:
    theta = (h / 360.0) * math.tau
    latitude = (v - 0.5) * math.pi
    y = math.sin(latitude) * 0.5
    ring_radius = math.cos(latitude) * s * 0.5
    x = math.cos(theta) * ring_radius
    z = math.sin(theta) * ring_radius
    return x, y, z


def image_to_graph(
    img: Image.Image,
    max_samples=59000,
    sample_step=16,
    hue_bins=28,
    sat_bins=23,
    val_bins=10,
):
    rgba = img.convert("RGBA")
    data = list(rgba.getdata())
    pixel_count = len(data)
    bins = {}
    seen = 0

    i = 0
    while i < pixel_count and seen < max_samples:
        r, g, b, a = data[i]
        if a >= 8:
            h, s, v = rgb_to_hsv255(r, g, b)
            h_bin = min(hue_bins - 1, int((h / 360.0) * hue_bins))
            s_bin = min(sat_bins - 1, int(s * sat_bins))
            v_bin = min(val_bins - 1, int(v * val_bins))
            key = (h_bin, s_bin, v_bin)
            existing = bins.get(key)
            if existing is None:
                bins[key] = [1, r, g, b]
            else:
                existing[0] += 1
                existing[1] += r
                existing[2] += g
                existing[3] += b
            seen += 1
        i += sample_step

    points = []
    for (h_bin, s_bin, v_bin), (count, r_sum, g_sum, b_sum) in bins.items():
        hh = ((h_bin + 0.5) / hue_bins) * 360.0
        ss = (s_bin + 0.5) / sat_bins
        vv = (v_bin + 0.5) / val_bins
        x, y, z = hsv_to_sphere(hh, ss, vv)
        points.append(
            {
                "x": round(x, 6),
                "y": round(y, 6),
                "z": round(z, 6),
                "hue": round(hh, 3),
                "saturation": round(ss, 4),
                "brightness": round(vv, 4),
                "count": int(count),
                "r": int(round(r_sum / count)),
                "g": int(round(g_sum / count)),
                "b": int(round(b_sum / count)),
            }
        )

    points.sort(key=lambda p: p["count"], reverse=True)
    return {"sampled": int(seen), "uniqueBins": int(len(points)), "points": points}


def colorfulness_metrics(img: Image.Image, sample_step: int = 12) -> Tuple[float, float, int]:
    rgba = img.convert("RGBA")
    data = list(rgba.getdata())
    sat_sum = 0.0
    count = 0
    sat_rich = 0
    hue_bins = set()

    i = 0
    while i < len(data):
        r, g, b, a = data[i]
        if a >= 8:
            h, s, _v = rgb_to_hsv255(r, g, b)
            sat_sum += s
            count += 1
            if s >= 0.22:
                sat_rich += 1
                hue_bins.add(int((h / 360.0) * 18) % 18)
        i += sample_step

    if count == 0:
        return 0.0, 0.0, 0
    avg_sat = sat_sum / count
    rich_ratio = sat_rich / count
    return avg_sat, rich_ratio, len(hue_bins)


def is_color_rich(img: Image.Image, min_avg_sat: float, min_rich_ratio: float, min_hue_bins: int) -> bool:
    avg_sat, rich_ratio, rich_hues = colorfulness_metrics(img)
    return avg_sat >= min_avg_sat and rich_ratio >= min_rich_ratio and rich_hues >= min_hue_bins


def download_image(url: str) -> Optional[Image.Image]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=45)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--url",
        default="https://totallyhistory.com/jean-michel-basquiat-paintings/",
    )
    ap.add_argument("--artist-key", default="basquiat")
    ap.add_argument("--out", default="data/basquait-palettes.json")
    ap.add_argument("--max-works", type=int, default=180)
    ap.add_argument("--min-avg-sat", type=float, default=0.16)
    ap.add_argument("--min-rich-ratio", type=float, default=0.12)
    ap.add_argument("--min-hue-bins", type=int, default=4)
    args = ap.parse_args()

    all_works = fetch_artworks(args.url)
    if not all_works:
        raise SystemExit("No artworks found")

    selected = all_works[: args.max_works]
    graphs = []
    skipped_plain = 0

    for idx, work in enumerate(selected, start=1):
        img = download_image(work.image_url)
        if img is None:
            print(f"[{idx}/{len(selected)}] skip (download failed): {work.title}")
            continue

        if not is_color_rich(
            img,
            min_avg_sat=args.min_avg_sat,
            min_rich_ratio=args.min_rich_ratio,
            min_hue_bins=args.min_hue_bins,
        ):
            skipped_plain += 1
            print(f"[{idx}/{len(selected)}] skip (plain color profile): {work.title}")
            continue

        graph = image_to_graph(img)
        graph_obj = {
            "id": f"{work.title} ({work.year})" if work.year else work.title,
            "title": work.title,
            "year": work.year,
            "source": work.page_url,
            "image": work.image_url,
            "sampled": graph["sampled"],
            "uniqueBins": graph["uniqueBins"],
            "points": graph["points"],
        }
        graphs.append(graph_obj)
        print(f"[{idx}/{len(selected)}] ok: {graph_obj['id']} -> {graph_obj['uniqueBins']} bins")
        time.sleep(0.08)

    payload = {
        "artist": args.artist_key,
        "totalScraped": len(graphs),
        "sourceUrl": args.url,
        "excludedPlainWorks": skipped_plain,
        "graphs": graphs,
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {args.out} with {len(graphs)} graphs (excluded plain: {skipped_plain})")


if __name__ == "__main__":
    main()
