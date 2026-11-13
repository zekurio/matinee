#!/usr/bin/env python3
"""Generate synthetic media, not clips from the named films."""
from pathlib import Path
import subprocess
import struct

ROOT = Path.home() / '.t3/scratch/matinee-ios-dev/media'
ROOT.mkdir(parents=True, exist_ok=True)
en = ROOT / 'en.srt'
de = ROOT / 'de.srt'
en.write_text('1\n00:00:01,000 --> 00:00:08,000\nEnglish test subtitle\n\n2\n00:00:09,000 --> 00:00:15,000\nSecond English cue\n')
de.write_text('1\n00:00:01,000 --> 00:00:08,000\nDeutscher Testuntertitel\n\n2\n00:00:09,000 --> 00:00:15,000\nZweiter deutscher Text\n')


def make(relative, codec='h264', size='640x360', duration=24, multi=False, hdr=False):
    dest = ROOT / relative
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    label = dest.stem
    # 10 fps keeps the 22 minute seeking fixture cheap but all frames have real timestamps.
    draw = f"drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='{label}':x=20:y=20:fontsize=24:fontcolor=white:box=1:boxcolor=black,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:timecode='00\\:00\\:00\\:00':r=10:x=20:y=65:fontsize=32:fontcolor=white:box=1:boxcolor=black"
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=10',
           '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000']
    if multi:
        cmd += ['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-i', str(en), '-i', str(de)]
    cmd += ['-map', '0:v', '-map', '1:a']
    if multi:
        cmd += ['-map', '2:a', '-map', '3:s', '-map', '4:s', '-metadata:s:a:1', 'language=deu',
                '-metadata:s:s:0', 'language=eng', '-metadata:s:s:1', 'language=deu',
                '-c:s', 'mov_text' if dest.suffix == '.mp4' else 'srt']
    cmd += ['-vf', draw, '-t', str(duration), '-metadata:s:a:0', 'language=eng']
    if codec == 'hevc':
        cmd += ['-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '34', '-x265-params', 'pools=2:frame-threads=2:log-level=error',
                '-pix_fmt', 'yuv420p10le' if hdr else 'yuv420p', '-c:a', 'ac3', '-ac', '6', '-b:a', '192k']
    elif codec == 'mpeg2':
        cmd += ['-c:v', 'mpeg2video', '-b:v', '500k', '-c:a', 'libopus', '-b:a', '64k']
    else:
        cmd += ['-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-crf', '35', '-pix_fmt', 'yuv420p', '-g', '20', '-c:a', 'aac', '-b:a', '64k']
    if hdr:
        cmd += ['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc']
    if dest.suffix == '.mp4':
        cmd += ['-movflags', '+faststart']
    subprocess.run(cmd + [str(dest)], check=True)


make('movies/The Matrix (1999)/The Matrix (1999).mp4', duration=1320, multi=True)
# Extras are grouped with their parent movie even without a metadata provider.
make('movies/The Matrix (1999)/Extras/The Matrix (1999) Alternate.mp4', multi=True)
make('movies/Back to the Future (1985)/Back to the Future (1985).mp4', multi=True)
make('movies/Toy Story (1995)/Toy Story (1995).mp4')
make('movies/Interstellar (2014)/Interstellar (2014).mkv', codec='hevc', multi=True)
make('restricted/Blade Runner (1982)/Blade Runner (1982).mkv', codec='hevc', size='3840x2160', duration=8)
make('restricted/Dune (2021)/Dune (2021).mkv', codec='hevc', hdr=True, duration=12)
make('restricted/Jurassic Park (1993)/Jurassic Park (1993).mkv', codec='mpeg2', multi=True)
for season in (1, 2):
    for episode in (1, 2, 3):
        make(f'shows/Breaking Bad (2008)/Season {season:02}/Breaking Bad S{season:02}E{episode:02}.mp4', duration=60)
sidecar = ROOT / 'movies/Toy Story (1995)/Toy Story (1995).en.srt'
sidecar.write_text(en.read_text())
# A synthetic PGS bitmap: a white bar at 1-8 seconds. ffmpeg cannot encode
# text into PGS, so write the small Blu-ray display set directly.
pgs = ROOT / 'fixture.sup'
def segment(kind, payload, seconds=1):
    return b'PG' + struct.pack('>IIBH', int(seconds * 90000), 0, kind, len(payload)) + payload
pcs = struct.pack('>HHBHBBBB', 640, 360, 0x10, 0, 0x80, 0, 0, 1) + struct.pack('>HBBHH', 0, 0, 0, 240, 290)
wds = bytes([1, 0]) + struct.pack('>HHHH', 240, 290, 160, 32)
palette = bytes([0, 0, 0, 16, 128, 128, 0, 1, 235, 128, 128, 255])
bitmap = (bytes([1]) * 160 + b'\x00\x00') * 32
obj = struct.pack('>HB', 0, 0) + b'\xc0' + (len(bitmap) + 4).to_bytes(3, 'big') + struct.pack('>HH', 160, 32) + bitmap
clear = struct.pack('>HHBHBBBB', 640, 360, 0x10, 1, 0, 0, 0, 0)
pgs.write_bytes(segment(0x16, pcs) + segment(0x17, wds) + segment(0x14, palette) + segment(0x15, obj) + segment(0x80, b'') + segment(0x16, clear, 8) + segment(0x80, b'', 8))
picture_movie = ROOT / 'restricted/Jurassic Park (1993)/Jurassic Park (1993).mkv'
probe = subprocess.run(['ffprobe', '-v', 'quiet', '-show_streams', str(picture_movie)], capture_output=True, text=True, check=True)
if 'hdmv_pgs_subtitle' not in probe.stdout:
    temp = picture_movie.with_name('fixture.tmp.mkv')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(picture_movie), '-i', str(pgs), '-map', '0', '-map', '1:s', '-c', 'copy', '-metadata:s:s:2', 'language=eng', str(temp)], check=True)
    temp.replace(picture_movie)
print('Media ready:', ROOT)
