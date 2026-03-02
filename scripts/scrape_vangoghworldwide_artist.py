#!/usr/bin/env python3
import io
import json
import math
import random
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from PIL import Image

API_BASE = "https://rest.spinque.com/4/vangoghworldwide/api/platform"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Referer": "https://vangoghworldwide.org/",
}


def rgb_to_hsv255(r: int, g: int, b: int) -> Tuple[float, float, float]:
    nr = r / 255.0
    ng = g / 255.0
    nb = b / 255.0
    mx = max(nr, ng, nb)
    mn = min(nr, ng, nb)
    delta = mx - mn

    h = 0.0
    if delta != 0:
        if mx == nr:
            h = ((ng - nb) / delta) % 6
        elif mx == ng:
            h = (nb - nr) / delta + 2
        else:
            h = (nr - ng) / delta + 4
        h *= 60.0
        if h < 0:
            h += 360.0

    s = 0.0 if mx == 0 else delta / mx
    v = mx
    return h, s, v


def hsv_to_sphere(h: float, s: float, v: float) -> Tuple[float, float, float]:
    theta = (h / 360.0) * (math.pi * 2)
    latitude = (v - 0.5) * math.pi
    y = math.sin(latitude) * 0.5
    ring_radius = math.cos(latitude) * s * 0.5
    x = math.cos(theta) * ring_radius
    z = math.sin(theta) * ring_radius
    return x, y, z


def image_to_graph(img: Image.Image, max_samples=59000, sample_step=16, hue_bins=28, sat_bins=23, val_bins=10):
    rgba = img.convert("RGBA")
    data = list(rgba.getdata())
    px_count = len(data)

    bins: Dict[Tuple[int, int, int], List[int]] = {}
    seen = 0
    i = 0
    while i < px_count and seen < max_samples:
        r, g, b, a = data[i]
        if a >= 8:
            h, s, v = rgb_to_hsv255(r, g, b)
            h_bin = min(hue_bins - 1, int((h / 360.0) * hue_bins))
            s_bin = min(sat_bins - 1, int(s * sat_bins))
            v_bin = min(val_bins - 1, int(v * val_bins))
            key = (h_bin, s_bin, v_bin)
            cur = bins.get(key)
            if cur is None:
                bins[key] = [1, r, g, b]
            else:
                cur[0] += 1
                cur[1] += r
                cur[2] += g
                cur[3] += b
            seen += 1
        i += sample_step

    points: List[Dict[str, Any]] = []
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


def get_json(url: str) -> Dict[str, Any]:
    resp = requests.get(url, headers=BROWSER_HEADERS, timeout=40)
    resp.raise_for_status()
    return resp.json()


def list_artworks(max_items: int = 1000, page_size: int = 200) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    offset = 0
    seen_ids = set()

    while len(out) < max_items:
        url = f"{API_BASE}/e/artworks/results?count={page_size}&offset={offset}"
        data = get_json(url)
        items = data.get("items") or []
        if not items:
            break

        for it in items:
            tup = it.get("tuple") or []
            if not tup:
                continue
            obj = tup[0]
            attrs = obj.get("attributes") or {}
            obj_id = attrs.get("@id") or obj.get("id")
            if not obj_id or obj_id in seen_ids:
                continue
            seen_ids.add(obj_id)
            out.append(obj)
            if len(out) >= max_items:
                break

        offset += page_size
        if len(items) < page_size:
            break
        time.sleep(0.05)

    return out


def is_painting(obj: Dict[str, Any]) -> bool:
    attrs = obj.get("attributes") or {}
    classifs = attrs.get("classified_as") or []
    labels = [str(c.get("_label", "")).lower() for c in classifs if isinstance(c, dict)]
    return any("painting" in lbl for lbl in labels)


def is_vangogh(obj: Dict[str, Any]) -> bool:
    attrs = obj.get("attributes") or {}
    produced = attrs.get("produced_by") or {}
    carriers = produced.get("carried_out_by") or []
    if not carriers:
        return False
    for c in carriers:
        label = str(c.get("_label", "")).lower()
        if "gogh" in label:
            return True
    return False


def pick_title(attrs: Dict[str, Any]) -> str:
    identified = attrs.get("identified_by") or []

    def has_pref_term(entry: Dict[str, Any]) -> bool:
        for c in entry.get("classified_as") or []:
            if str(c.get("_label", "")).lower() == "preferred terms":
                return True
        return False

    for ent in identified:
        if ent.get("type") != "Name":
            continue
        langs = [str(l.get("_label", "")).lower() for l in (ent.get("language") or [])]
        if has_pref_term(ent) and any("english" in l for l in langs):
            text = str(ent.get("content", "")).strip()
            if text:
                return text

    for ent in identified:
        if ent.get("type") == "Name" and has_pref_term(ent):
            text = str(ent.get("content", "")).strip()
            if text:
                return text

    for ent in identified:
        if ent.get("type") == "Name":
            text = str(ent.get("content", "")).strip()
            if text:
                return text

    return "Untitled"


def pick_year(attrs: Dict[str, Any]) -> Optional[str]:
    produced = attrs.get("produced_by") or {}
    spans = produced.get("timespan") or []
    if spans:
        sp = spans[0]
        b = str(sp.get("begin_of_the_begin") or "")
        e = str(sp.get("end_of_the_end") or "")
        by = b[:4] if re.match(r"^\d{4}", b) else None
        ey = e[:4] if re.match(r"^\d{4}", e) else None
        if by and ey:
            return by if by == ey else f"{by} - {ey}"
        if by:
            return by
        if ey:
            return ey

        # fallback from textual timespan label
        identified = sp.get("identified_by") or []
        for ent in identified:
            txt = str(ent.get("content", ""))
            years = re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b", txt)
            if years:
                return years[0] if len(years) == 1 else f"{years[0]} - {years[-1]}"
    return None


def to_page_url(obj_id: str) -> str:
    return "https://vangoghworldwide.org/artwork/" + requests.utils.quote(obj_id, safe="")


def iiif_image_url(rep_id: str, max_w: int = 1200) -> str:
    base = rep_id.rstrip("/")
    if base.endswith("/info.json"):
        base = base[: -len("/info.json")]
    return f"{base}/full/{max_w},/0/default.jpg"


def download_image(url: str) -> Optional[Image.Image]:
    try:
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=50)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content))
    except Exception:
        return None


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--max-items", type=int, default=1200)
    ap.add_argument("--max-paintings", type=int, default=140)
    ap.add_argument("--out", default="data/van-gogh-palettes.json")
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    random.seed(args.seed)

    raw = list_artworks(max_items=args.max_items, page_size=200)
    paintings = [o for o in raw if is_painting(o) and is_vangogh(o)]

    # deterministic spread through the full chronological-ish list from API order.
    if len(paintings) > args.max_paintings:
        step = len(paintings) / float(args.max_paintings)
        idxs = sorted({min(len(paintings) - 1, int(i * step)) for i in range(args.max_paintings)})
        paintings = [paintings[i] for i in idxs]

    graphs: List[Dict[str, Any]] = []
    for idx, obj in enumerate(paintings, start=1):
        attrs = obj.get("attributes") or {}
        title = pick_title(attrs)
        year = pick_year(attrs)
        source_id = attrs.get("@id") or obj.get("id") or ""
        source_url = to_page_url(source_id)

        reps = attrs.get("representation") or []
        rep_id = None
        for rep in reps:
            rid = rep.get("@id")
            if isinstance(rid, str) and rid.startswith("http"):
                rep_id = rid
                break
        if not rep_id:
            print(f"[{idx}/{len(paintings)}] skip no representation: {title}")
            continue

        img_url = iiif_image_url(rep_id, max_w=1200)
        img = download_image(img_url)
        if img is None:
            # fallback to lower resolution
            img_url = iiif_image_url(rep_id, max_w=800)
            img = download_image(img_url)

        if img is None:
            print(f"[{idx}/{len(paintings)}] skip download failed: {title}")
            continue

        g = image_to_graph(img)
        graph = {
            "id": f"{title} ({year})" if year else title,
            "title": title,
            "year": year,
            "source": source_url,
            "image": img_url,
            "sampled": g["sampled"],
            "uniqueBins": g["uniqueBins"],
            "points": g["points"],
        }
        graphs.append(graph)
        print(f"[{idx}/{len(paintings)}] ok: {graph['id']} -> {len(graph['points'])} bins")
        time.sleep(0.06)

    payload = {
        "artist": "vangogh",
        "totalScraped": len(graphs),
        "graphs": graphs,
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {args.out} with {len(graphs)} graphs")


if __name__ == "__main__":
    main()
