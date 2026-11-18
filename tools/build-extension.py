#!/usr/bin/env python3
"""Prepara una versión de la extensión para publicarla.

  python3 tools/build-extension.py

- Genera extension/files.json con la versión y el SHA-256 de cada archivo.
  La autoactualización descarga esa lista desde GitHub Pages y verifica cada archivo antes de instalarlo.
- Regenera facebook-publisher-extension.zip para la instalación manual.

Sube la versión en extension/manifest.json antes de ejecutarlo.
"""
import hashlib
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, 'extension')
SKIP = {'files.json'}

version = json.load(open(os.path.join(EXT, 'manifest.json'), encoding='utf-8'))['version']
names = sorted(f for f in os.listdir(EXT) if os.path.isfile(os.path.join(EXT, f)) and f not in SKIP and not f.startswith('.'))
files = [{'name': n, 'sha256': hashlib.sha256(open(os.path.join(EXT, n), 'rb').read()).hexdigest()} for n in names]
with open(os.path.join(EXT, 'files.json'), 'w', encoding='utf-8') as fh:
    json.dump({'version': version, 'files': files}, fh, indent=2, ensure_ascii=False)
    fh.write('\n')

zpath = os.path.join(ROOT, 'facebook-publisher-extension.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for n in names + ['files.json']:
        z.write(os.path.join(EXT, n), 'facebook-publisher-extension/' + n)
print(f'Extensión {version}: {len(files)} archivos, files.json y {os.path.basename(zpath)} listos')
