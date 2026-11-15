#!/usr/bin/env python3
"""Run with ./run verify after seeding. Tokens stay in memory, never printed."""
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

sys.path.insert(0, str(Path(__file__).parent))
import dev


def curl(path, data=None, bearer=None, raw=False):
    cmd = ['curl', '--fail-with-body', '-sS', '--max-time', '120', '-H', 'Content-Type: application/json']
    if bearer:
        cmd += ['-H', 'Authorization: Bearer ' + bearer]
    if data is not None:
        cmd += ['-d', json.dumps(data)]
    result = subprocess.run(cmd + [dev.URL + path], capture_output=True, check=True).stdout
    return result if raw else json.loads(result) if result else None


for account in ('ios-admin', 'ios-viewer'):
    code = curl('/api/v1/auth/device', {'platform': 'ios', 'name': 'Fixture smoke test'})
    subprocess.run([str(Path(__file__).with_name('run')), 'approve', code['userCode'], account], check=True)
    time.sleep(code['interval'])
    session = curl('/api/v1/auth/device/token', {'deviceCode': code['deviceCode']})
    assert session['status'] == 'approved' and session['user']['username'] == account
    bearer = session['token']
    libs = curl('/api/v1/libraries', bearer=bearer)
    assert len(libs) == (3 if account == 'ios-admin' else 2)
    hidden_id = dev.sql("SELECT id FROM title WHERE name='Jurassic Park'")
    hidden = subprocess.run(['curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}',
        '-H', 'Authorization: Bearer ' + bearer, dev.URL + '/api/v1/titles/' + hidden_id],
        check=True, capture_output=True, text=True).stdout
    assert hidden == ('200' if account == 'ios-admin' else '404'), hidden
    for endpoint in ('continue-watching', 'next-up', 'featured'):
        rows = curl('/api/v1/home/' + endpoint, bearer=bearer)
        assert rows, endpoint
        print(account, endpoint, len(rows))
    assert curl('/api/v1/favorites', bearer=bearer)
    # Also prove that the directly created CLI token is accepted.
    assert curl('/api/v1/auth/session', bearer=dev.token(account))['user']['username'] == account

admin = dev.token('ios-admin')
item = dev.sql("SELECT id FROM media_item WHERE relative_path LIKE '%Jurassic%' LIMIT 1")
device = dict(containers=['mp4'], video=[dict(codec='h264', maxWidth=None, maxHeight=None,
    maxBitDepth=8, profiles=None, maxLevel=None, hdr=[], dolbyVisionProfiles=None)],
    audio=['aac'], streamAudio=['aac'], encodeVideo=['h264'], hls=True, selectAudio=False,
    subtitles=['webvtt'], sidecarSubtitles=['webvtt'], embeddedSubtitles=[], language='en')
play = curl('/api/v1/playback/start', dict(itemId=item, sessionId=str(uuid.uuid4()), device=device, position=0), admin)
assert play['method'] == 'transcode', play
source = play['url']
if source.startswith(dev.URL):
    source = source[len(dev.URL):]
playlist = curl(source, bearer=admin, raw=True).decode()
assert '#EXTM3U' in playlist
segments = [line for line in playlist.splitlines() if line and not line.startswith('#')]
if not segments:
    time.sleep(3)
    playlist = curl(source, bearer=admin, raw=True).decode()
    segments = [line for line in playlist.splitlines() if line and not line.startswith('#')]
assert segments, playlist
from urllib.parse import urljoin
segment = urljoin(source, segments[0])
assert len(curl(segment, bearer=admin, raw=True)) > 1000
print('Encode playlist and video segment fetched successfully')
# Check server-side source selection for the other two playback paths too.
for title, expected in [('Toy Story', 'direct'), ('Interstellar', 'remux')]:
    media_id = dev.sql(f"SELECT id FROM media_item WHERE relative_path LIKE '%{title}%' LIMIT 1")
    device['video'].append(dict(device['video'][0], codec='hevc', maxBitDepth=10))
    result = curl('/api/v1/playback/start', dict(itemId=media_id, sessionId=str(uuid.uuid4()), device=device, position=0), admin)
    assert result['method'] == expected, (title, result['method'])
    print(title, result['method'])
print('Files:', dev.sql('SELECT count(*) FROM media_item'))
