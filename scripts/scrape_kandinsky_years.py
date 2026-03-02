#!/usr/bin/env python3
import argparse
import colorsys
import io
import json
import math
import re
import time
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import requests
from bs4 import BeautifulSoup
from PIL import Image

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
    )
}

BASE = "https://www.wassilykandinsky.net/"


@dataclass
class Artwork:
    id: str
    title: str
    year: Optional[str]
    source: str
    image: str


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def abs_url(url: str) -> str:
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return BASE.rstrip("/") + url
    return BASE + url


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


def fetch_html(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=45)
    resp.raise_for_status()
    return resp.text


def fetch_year_links(start_url: str) -> List[str]:
    soup = BeautifulSoup(fetch_html(start_url), "html.parser")
    links = set()
    m0 = re.search(r"year-(\d{4})\.php", start_url)
    if m0:
        links.add((int(m0.group(1)), start_url))
    for a in soup.select("a[href]"):
        href = normalize_space(a.get("href"))
        m = re.match(r"^year-(\d{4})\.php$", href)
        if m:
            links.add((int(m.group(1)), abs_url(href)))
    return [u for _y, u in sorted(links, key=lambda t: t[0])]


def parse_year_page(url: str) -> Tuple[Optional[str], List[Artwork]]:
    soup = BeautifulSoup(fetch_html(url), "html.parser")
    year = None
    h1 = soup.find("h1")
    if h1:
        m = re.search(r"(\d{4})", normalize_space(h1.get_text(" ", strip=True)))
        if m:
            year = m.group(1)

    works: List[Artwork] = []
    seen = set()
    for card in soup.select("div.containerGallery > div"):
        anchors = card.find_all("a", href=True)
        if not anchors:
            continue
        work_href = normalize_space(anchors[0].get("href", ""))
        work_url = abs_url(work_href)
        title = normalize_space(anchors[-1].get_text(" ", strip=True))
        img = card.find("img")
        img_src = normalize_space((img.get("src") if img else "") or "")
        if not img_src and img is not None:
            img_src = normalize_space(img.get("data-src", ""))
        if not img_src:
            continue
        image_url = abs_url(img_src)
        if not title:
            # fallback from alt like "Wassily Kandinsky. Title, "
            alt = normalize_space((img.get("alt") if img else "") or "")
            title = re.sub(r"^Wassily Kandinsky\.\s*", "", alt).rstrip(" ,")
        if not title:
            continue
        key = work_url + "|" + image_url
        if key in seen:
            continue
        seen.add(key)
        work_id = work_href.rsplit(".", 1)[0]
        works.append(Artwork(id=work_id, title=title, year=year, source=work_url, image=image_url))
    return year, works


def sample_evenly(items: Sequence[Artwork], take: int) -> List[Artwork]:
    if not items:
        return []
    if len(items) <= take:
        return list(items)
    if take <= 1:
        return [items[len(items) // 2]]
    chosen = []
    seen = set()
    for i in range(take):
        idx = round((i * (len(items) - 1)) / (take - 1))
        if idx in seen:
            continue
        seen.add(idx)
        chosen.append(items[idx])
    return chosen


def download_image(url: str) -> Optional[Image.Image]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=45)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start-url", default="https://www.wassilykandinsky.net/year-1924.php")
    ap.add_argument("--artist-key", default="kandinsky")
    ap.add_argument("--out", default="data/kandinsky-palettes.json")
    ap.add_argument("--per-year", type=int, default=3)
    ap.add_argument("--max-years", type=int, default=0, help="0 means all years")
    args = ap.parse_args()

    year_links = fetch_year_links(args.start_url)
    if not year_links:
        raise SystemExit("No year pages found")
    if args.max_years and args.max_years > 0:
        year_links = year_links[: args.max_years]

    selected: List[Artwork] = []
    for idx, year_url in enumerate(year_links, start=1):
        try:
            year, works = parse_year_page(year_url)
        except Exception:
            print(f"[year {idx}/{len(year_links)}] skip (page fetch failed): {year_url}", flush=True)
            continue
        picks = sample_evenly(works, args.per_year)
        selected.extend(picks)
        print(
            f"[year {idx}/{len(year_links)}] {year or '?'}: {len(works)} works, selected {len(picks)}",
            flush=True,
        )
        time.sleep(0.05)

    graphs = []
    for idx, work in enumerate(selected, start=1):
        img = download_image(work.image)
        if img is None:
            print(f"[{idx}/{len(selected)}] skip (download failed): {work.title}", flush=True)
            continue
        graph = image_to_graph(img)
        obj = {
            "id": f"{work.title} ({work.year})" if work.year else work.title,
            "title": work.title,
            "year": work.year,
            "source": work.source,
            "image": work.image,
            "sampled": graph["sampled"],
            "uniqueBins": graph["uniqueBins"],
            "points": graph["points"],
        }
        graphs.append(obj)
        print(f"[{idx}/{len(selected)}] ok: {obj['id']} -> {obj['uniqueBins']} bins", flush=True)
        time.sleep(0.04)

    payload = {
        "artist": args.artist_key,
        "sourceUrl": args.start_url,
        "perYear": args.per_year,
        "yearPages": len(year_links),
        "totalScraped": len(graphs),
        "graphs": graphs,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {args.out} with {len(graphs)} graphs", flush=True)


if __name__ == "__main__":
    main()
