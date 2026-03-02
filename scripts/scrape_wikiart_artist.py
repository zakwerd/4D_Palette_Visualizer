#!/usr/bin/env python3
import argparse
import colorsys
import io
import json
import math
import random
import re
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from PIL import Image

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
}


@dataclass
class Artwork:
    title: str
    year: Optional[str]
    page_url: str
    image_url: Optional[str] = None


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_title_year(text: str) -> Tuple[str, Optional[str]]:
    t = normalize_space(text)
    m = re.match(r"^(.*?),\s*(\d{4}(?:\s*[-–]\s*\d{2,4})?)$", t)
    if m:
        return normalize_space(m.group(1)), normalize_space(m.group(2))
    m2 = re.search(r"(\d{4}(?:\s*[-–]\s*\d{2,4})?)", t)
    if m2:
        year = normalize_space(m2.group(1))
        title = normalize_space(t[: m2.start()].rstrip(" ,.-–"))
        return (title or t), year
    return t, None


def fetch_text_list(artist_slug: str) -> List[Artwork]:
    url = f"https://www.wikiart.org/en/{artist_slug}/all-works/text-list"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    results: List[Artwork] = []
    seen = set()

    for a in soup.select("a[href^='/en/']"):
        href = a.get("href") or ""
        if href.count("/") < 3:
            continue
        if f"/en/{artist_slug}/" not in href:
            continue
        full = "https://www.wikiart.org" + href
        if full in seen:
            continue
        title, year = parse_title_year(a.get_text(" ", strip=True))
        if not title:
            continue
        seen.add(full)
        results.append(Artwork(title=title, year=year, page_url=full))

    return results


def year_from_url(url: str) -> Optional[str]:
    slug = url.rstrip("/").split("/")[-1]
    m = re.search(r"(\d{4}(?:-\d{2,4})?)$", slug)
    if not m:
        return None
    return m.group(1).replace("-", "–")


def fetch_image_url(page_url: str) -> Optional[str]:
    try:
        resp = requests.get(page_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    og = soup.find("meta", attrs={"property": "og:image"})
    if og and og.get("content"):
        return og.get("content")

    tw = soup.find("meta", attrs={"name": "twitter:image"})
    if tw and tw.get("content"):
        return tw.get("content")

    ld = soup.find("script", attrs={"type": "application/ld+json"})
    if ld and ld.string:
        try:
            data = json.loads(ld.string)
            if isinstance(data, dict) and isinstance(data.get("image"), str):
                return data["image"]
        except Exception:
            pass

    return None


def fetch_page_year(page_url: str) -> Optional[str]:
    try:
        resp = requests.get(page_url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    for script in soup.select("script[type='application/ld+json']"):
        raw = script.string or script.get_text(" ", strip=True)
        if not raw:
            continue
        m = re.search(r"\"datePublished\"\\s*:\\s*\"(\\d{4})(?:-[0-9]{2}-[0-9]{2})?\"", raw)
        if m:
            return m.group(1)

    og = soup.find("meta", attrs={"property": "og:title"})
    og_text = og.get("content") if og else ""
    if og_text:
        m = re.search(r"([0-9]{4}(?:\s*[-–]\s*[0-9]{2,4})?)", og_text)
        if m:
            return normalize_space(m.group(1))

    return None


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


def image_to_graph(img: Image.Image, max_samples=59000, sample_step=16, hue_bins=28, sat_bins=23, val_bins=10):
    rgb = img.convert("RGBA")
    data = list(rgb.getdata())
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
    return {
        "sampled": int(seen),
        "uniqueBins": int(len(points)),
        "points": points,
    }


def download_image(url: str) -> Optional[Image.Image]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=45)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artist-slug", default="paul-cezanne")
    ap.add_argument("--artist-key", default="cezanne")
    ap.add_argument("--max-works", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="data/cezanne-palettes.json")
    args = ap.parse_args()

    all_works = fetch_text_list(args.artist_slug)
    if not all_works:
        raise SystemExit("No artworks found")

    random.seed(args.seed)
    # Evenly sample through the chronology list so we cover periods.
    if len(all_works) <= args.max_works:
        selected = all_works
    else:
        step = len(all_works) / float(args.max_works)
        idxs = sorted({min(len(all_works) - 1, int(i * step)) for i in range(args.max_works)})
        selected = [all_works[i] for i in idxs]

    graphs = []
    for idx, work in enumerate(selected, start=1):
        img_url = fetch_image_url(work.page_url)
        if not img_url:
            print(f"[{idx}/{len(selected)}] skip (no image url): {work.title}")
            continue

        img = download_image(img_url)
        if img is None:
            print(f"[{idx}/{len(selected)}] skip (download failed): {work.title}")
            continue

        graph = image_to_graph(img)
        resolved_year = work.year or fetch_page_year(work.page_url) or year_from_url(work.page_url)
        graph_obj = {
            "id": f"{work.title} ({resolved_year})" if resolved_year else work.title,
            "title": work.title,
            "year": resolved_year,
            "source": work.page_url,
            "image": img_url,
            "sampled": graph["sampled"],
            "uniqueBins": graph["uniqueBins"],
            "points": graph["points"],
        }
        graphs.append(graph_obj)
        print(f"[{idx}/{len(selected)}] ok: {graph_obj['id']} -> {len(graph_obj['points'])} bins")
        time.sleep(0.12)

    payload = {
        "artist": args.artist_key,
        "totalScraped": len(graphs),
        "graphs": graphs,
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {args.out} with {len(graphs)} graphs")


if __name__ == "__main__":
    main()
