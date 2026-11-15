#!/usr/bin/env python3
"""Build the Worker search index from the same HTML students see."""

import argparse
import json
import re
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
BLOCK = set("article blockquote br button dd details div dl dt figcaption figure h1 h2 h3 h4 hr li ol p section summary table td th tr ul".split())
OMIT = {"course-feedback", "report", "viewer", "video-tools"}


def clean(text):
    return " ".join(text.split())


class Slides(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pages = {}
        self.stack = []
        self.slide = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set(attrs.get("class", "").split())
        if tag == "article" and "data-case" in attrs:
            self.slide = (attrs["data-case"], attrs["data-page-in-case"])
            if self.slide in self.pages:
                raise ValueError(f"Duplicate slide: {self.slide}")
            self.pages[self.slide] = {"title": [], "chapter": [], "body": [], "lead": []}
        if self.slide is None:
            return
        parent = self.stack[-1][1] if self.stack else "body"
        field = parent
        if parent is None or OMIT & classes or tag in {"script", "style", "video"}:
            field = None
        elif tag == "h1":
            field = "title"
        elif "eyebrow" in classes:
            field = "chapter"
        elif "lead" in classes:
            field = "lead"
        if field == "body" and tag in BLOCK:
            self.handle_data(" ")
        if tag not in VOID:
            self.stack.append((tag, field))

    def handle_endtag(self, tag):
        if tag == "article":
            self.slide = None
            self.stack.clear()
        elif self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
            if tag in BLOCK:
                self.handle_data(" ")

    def handle_data(self, text):
        if self.slide is not None and self.stack:
            field = self.stack[-1][1]
            if field is not None:
                self.pages[self.slide][field].append(text)


def build():
    slides = Slides()
    slides.feed((ROOT / "public/index.html").read_text(encoding="utf-8"))
    slides.close()
    reviewed = defaultdict(list)
    for entry in json.loads((SERVER / "corpus.json").read_text(encoding="utf-8")):
        key = (entry["case"], entry["page"])
        title = clean("".join(slides.pages[key]["title"]))
        if title != entry["title"]:
            raise ValueError(f"Outdated title: {key}")
        reviewed[key].extend(entry["parts"])
    for line in (SERVER / "course-excerpts.tsv").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            key, excerpt = line.split("\t", 1)
            case, page = key.split("/")
            reviewed[case, page].append(excerpt)
    if reviewed.keys() - slides.pages.keys():
        raise ValueError("Reviewed excerpts reference a missing slide")

    rows = []
    for (case, page), fields in slides.pages.items():
        title = clean("".join(fields["title"]))
        chapter = " / ".join(clean("".join(fields["chapter"])).split(" / ")[1:-1])
        if not title or not chapter:
            raise ValueError(f"Slide {case}/{page} has no title or chapter")
        body = clean("".join(fields["body"]))
        parts = list(dict.fromkeys(reviewed[case, page]))
        lead = clean("".join(fields["lead"]))
        missing = [part for part in parts if part not in body and part not in lead]
        if missing:
            raise ValueError(f"Text not found outside report/media sections of {case}/{page}: {missing}")
        # Retain terms for retrieval, not the raw body or its original word order.
        terms = set(re.findall(r"[a-z0-9]+|[\u3400-\u9fff]+", body.casefold()))
        search = " ".join(sorted(t for t in terms if len(t) >= 2 and not t.isdecimal()))
        rows.append({"case": case, "page": page, "title": title, "chapter": chapter,
                     "parts": parts, "search": search})
    return "[\n" + ",\n".join("  " + json.dumps(row, ensure_ascii=False) for row in rows) + "\n]\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = SERVER / "course-index.json"
    generated = build()
    if args.check:
        if output.read_text(encoding="utf-8") != generated:
            raise SystemExit("Course index is stale. Run python3 scripts/build-course-index.py.")
    else:
        output.write_text(generated, encoding="utf-8")
