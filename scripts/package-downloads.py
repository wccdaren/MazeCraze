"""Refresh the full-project and offline-editor downloads using Python's standard library."""
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def package(name, folder, files):
    with zipfile.ZipFile(ROOT / name, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in sorted(files):
            path = ROOT / relative
            if not path.is_file() or path.suffix.lower() == '.zip':
                continue
            entry = zipfile.ZipInfo.from_file(path, f'{folder}/{relative}')
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(ROOT / name) as archive:
        assert archive.testzip() is None, name
        print(f'{name}: {len(archive.namelist())} files, {(ROOT / name).stat().st_size:,} bytes')


if __name__ == '__main__':
    tracked = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT,
    ).decode().split('\0')
    package('maze-craze-with-editor.zip', 'MazeCraze', set(filter(None, tracked)))
    # This smaller download is for offline authoring; integrated play needs the full package.
    package('maze-craze-map-editor.zip', 'MazeCrazeMapEditor', [
        'editor.html', 'EDITOR.md', 'SPECIFICATION.md', 'docs/editor-preview.png',
        'docs/Maze-Craze-Map-Editor-User-Guide.docx', 'docs/Maze-Craze-Map-Editor-User-Guide.pdf',
    ])
