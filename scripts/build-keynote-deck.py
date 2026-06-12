#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import shutil
from pathlib import Path
from typing import Any

PROJECT = Path(__file__).resolve().parents[1]


def project_path(value: str | Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return PROJECT / path


def normalize_text(value: str) -> str:
    return ' '.join(value.replace('\u2028', ' ').replace('—', ':').split())


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def pct(value: float) -> str:
    return f'{value:.6f}%'


def copy_assets(config: dict[str, Any], slides: list[dict[str, Any]], output_dir: Path) -> None:
    images = config['images']
    mode = images.get('mode', 'reference-existing')
    if mode != 'copy':
        return

    source_dir = project_path(images['sourceDir'])
    asset_dir = output_dir / images.get('assetDir', 'assets')
    asset_dir.mkdir(parents=True, exist_ok=True)
    pattern = images.get('filenamePattern', 'slide-{number:02d}.png')
    for slide in slides:
        filename = pattern.format(number=slide['number'])
        shutil.copy2(source_dir / filename, asset_dir / filename)
        slide['image'] = f'./{asset_dir.name}/{filename}'


def collect_slides(config: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = load_json(project_path(config['source']['metadata']))
    hyperlinks_path = project_path(config['source'].get('hyperlinks', ''))
    hyperlinks = load_json(hyperlinks_path) if hyperlinks_path.exists() else {'links': []}

    links_by_slide: dict[int, list[dict[str, Any]]] = {}
    for link in hyperlinks.get('links', []):
        links_by_slide.setdefault(int(link['slide']), []).append(link)

    images = config['images']
    pattern = images.get('filenamePattern', 'slide-{number:02d}.png')
    public_base_path = images.get('publicBasePath', '').rstrip('/')
    width = int(images.get('width', 1920))
    height = int(images.get('height', 1080))

    slides = []
    for idx, meta in enumerate(metadata['slides'], start=1):
        text_items = [
            item['text'].strip()
            for item in meta.get('items', [])
            if item.get('kind') == 'text item' and item.get('text', '').strip()
        ]
        seen = set()
        transcript = []
        for value in text_items:
            normalized = normalize_text(value)
            if normalized and normalized not in seen:
                transcript.append(normalized)
                seen.add(normalized)

        title = normalize_text(meta.get('title') or f'Slide {idx}')
        body_lines = []
        meta_lines = []
        for line in transcript:
            if line == title:
                continue
            if line.startswith('S.A.I.A') or line.startswith('Block #') or 'Homepage' in line:
                meta_lines.append(line)
            else:
                body_lines.append(line)

        filename = pattern.format(number=idx)
        image = f'{public_base_path}/{filename}' if public_base_path else f'./assets/{filename}'
        slides.append({
            'number': idx,
            'title': title,
            'image': image,
            'width': width,
            'height': height,
            'bodyTranscript': body_lines,
            'metaTranscript': meta_lines,
            'links': links_by_slide.get(idx, []),
            'background': config['viewer']['background'].get('default', '#ffffff'),
        })
    return slides


def render_overlay(slide: dict[str, Any], link: dict[str, Any], link_index: int) -> str:
    css = link['cssPercent']
    href = html.escape(link['href'], quote=True)
    label = html.escape(
        f"Open linked page from slide {slide['number']}: {slide['title']} (opens in a new tab)",
        quote=True,
    )
    return (
        '          <a class="kdeck-link-overlay" '
        f'href="{href}" target="_blank" rel="noopener noreferrer" '
        f'aria-label="{label}" data-slide-link="{slide["number"]}-{link_index}" '
        f'style="--link-left: {pct(css["leftPct"])}; --link-top: {pct(css["topPct"])}; '
        f'--link-width: {pct(css["widthPct"])}; --link-height: {pct(css["heightPct"])};"></a>'
    )


def render_transcript(slide: dict[str, Any], heading_level: str = 'h2', include_heading_id: bool = True) -> str:
    title = html.escape(slide['title'])
    body = '\n'.join(f'            <p>{html.escape(line)}</p>' for line in slide['bodyTranscript'])
    meta = '\n'.join(
        f'            <p class="kdeck-transcript__meta">{html.escape(line)}</p>'
        for line in slide['metaTranscript']
    )
    heading_id = f' id="slide-{slide["number"]}-title"' if include_heading_id else ''
    parts = [f'          <{heading_level}{heading_id}>{title}</{heading_level}>']
    if body:
        parts.append(body)
    if meta:
        parts.append(meta)
    return '\n'.join(parts)


def render_slide(slide: dict[str, Any], config: dict[str, Any]) -> str:
    overlays = ''
    if config['viewer'].get('linkOverlays', True):
        overlays = '\n'.join(render_overlay(slide, link, i) for i, link in enumerate(slide['links'], start=1))
        if overlays:
            overlays = '\n' + overlays

    transcript = render_transcript(slide)
    visible_transcript = render_transcript(slide, heading_level='h3', include_heading_id=False)
    loading = 'eager' if slide['number'] == 1 else 'lazy'
    title = html.escape(slide['title'], quote=True)
    return f'''    <section class="kdeck-slide" id="slide-{slide['number']}" data-slide="{slide['number']}" aria-labelledby="slide-{slide['number']}-title" style="--slide-bg: {slide['background']};">
      <figure class="kdeck-stage">
        <div class="kdeck-image-shell">
          <img src="{slide['image']}" alt="Slide {slide['number']}: {title}" width="{slide['width']}" height="{slide['height']}" loading="{loading}">
{overlays}
        </div>
        <figcaption class="kdeck-caption kdeck-visually-hidden" aria-label="Slide {slide['number']} text">
{transcript}
        </figcaption>
      </figure>
      <details class="kdeck-transcript-toggle">
        <summary>Slide text</summary>
        <div class="kdeck-transcript-body">
{visible_transcript}
        </div>
      </details>
    </section>'''


def public_manifest(config: dict[str, Any], slides: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'version': config.get('version', 2),
        'title': config['title'],
        'subtitle': config.get('subtitle', ''),
        'slug': config['slug'],
        'slideCount': len(slides),
        'privacy': config.get('privacy', {}).get('state', 'draft-noindex'),
        'robots': config.get('privacy', {}).get('robots', 'noindex'),
        'viewer': config.get('viewer', {}),
        'images': {
            'assetScale': config.get('images', {}).get('assetScale'),
            'width': config.get('images', {}).get('width', 1920),
            'height': config.get('images', {}).get('height', 1080),
        },
        'linkCount': sum(len(slide['links']) for slide in slides),
    }


def render_html(config: dict[str, Any], slides: list[dict[str, Any]]) -> str:
    manifest = html.escape(json.dumps(public_manifest(config, slides), indent=2), quote=False)
    sections = '\n'.join(render_slide(slide, config) for slide in slides)
    robots = html.escape(config.get('privacy', {}).get('robots', 'noindex'), quote=True)
    title = html.escape(config['title'])
    description = html.escape(config.get('subtitle') or f'{config["title"]} deck')
    chrome = html.escape(config.get('viewer', {}).get('chrome', 'none'), quote=True)
    background_mode = html.escape(config.get('viewer', {}).get('background', {}).get('mode', 'deck-default'), quote=True)
    transcript_mode = html.escape(config.get('viewer', {}).get('transcript', {}).get('mode', 'phone-toggle'), quote=True)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <meta name="robots" content="{robots}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="stylesheet" href="/css/keynote-deck.css">
</head>
<body class="keynote-deck-v2" data-chrome="{chrome}" data-background-mode="{background_mode}" data-transcript-mode="{transcript_mode}">
  <a class="kdeck-skip" href="#slide-1">Skip to deck</a>
  <div class="kdeck-progress" aria-hidden="true"><span class="kdeck-progress__bar" id="deck-progress-bar"></span></div>
  <main class="kdeck" id="deck" tabindex="-1">
{sections}
  </main>
  <nav class="kdeck-controls" aria-label="Slide controls">
    <button type="button" id="prev-slide" aria-label="Previous slide">↑</button>
    <span class="kdeck-counter" id="slide-count" aria-hidden="true">1 / {len(slides)}</span>
    <button type="button" id="next-slide" aria-label="Next slide">↓</button>
  </nav>
  <p class="kdeck-visually-hidden" id="deck-announcer" aria-live="polite">Slide 1 of {len(slides)}</p>
  <script type="application/json" id="deck-manifest">
{manifest}
  </script>
  <script src="/js/keynote-deck.js" defer></script>
</body>
</html>
'''


def build(config_path: Path) -> dict[str, Any]:
    config = load_json(config_path)
    output_dir = project_path(config['outputDir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    slides = collect_slides(config)
    copy_assets(config, slides, output_dir)
    html_doc = render_html(config, slides)
    output_path = output_dir / 'index.html'
    output_path.write_text(html_doc)
    return {
        'output': str(output_path),
        'slides': len(slides),
        'links': sum(len(slide['links']) for slide in slides),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Build a static Keynote-derived web deck from a project-local config.')
    parser.add_argument('config', help='Path to the private deck config JSON')
    args = parser.parse_args()
    result = build(project_path(args.config))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
