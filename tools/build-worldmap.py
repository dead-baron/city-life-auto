"""Bake the full-city world map image used by the in-game map (assets/worldmap.webp).

Renders tools/map-preview.html (the game's own chunk baker, no labels) in headless Chromium at
1/16 scale and saves it. The client draws district names, icons and markers on top, and falls back
to the radar minimap if the server runs a different seed. Needs a static server on the repo root:
    python3 -m http.server 8099 &   then   python3 tools/build-worldmap.py
"""
import asyncio, io, os
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCALE = 0.05


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'))
        pg = await b.new_page(viewport={'width': 1000, 'height': 1000})
        await pg.goto(f'http://localhost:{os.environ.get('PORT', '8099')}/tools/map-preview.html?scale={SCALE}&labels=0')
        await pg.wait_for_function('window.done === true', timeout=180000)
        await pg.evaluate("document.getElementById('info').remove()")
        png = await pg.locator('#cv').screenshot()
        await b.close()
    Image.open(io.BytesIO(png)).convert('RGB').save(os.path.join(ROOT, 'assets', 'worldmap.webp'), quality=82, method=6)
    print('assets/worldmap.webp written')

asyncio.run(main())
