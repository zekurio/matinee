#!/usr/bin/env python3
"""Local-only simulator fixture. Never point this at a production database."""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path.home() / '.t3/scratch/matinee-ios-dev'
SERVER = ROOT / 'server'
PIN = '2cde88b68e3b23d58e26f601ccd862a644901f8f'
URL = 'http://localhost:18420'
SOCKET = ROOT / 'socket'
ENV = dict(os.environ, PGHOST=str(SOCKET), PGUSER='postgres', PGDATABASE='matinee', PYTHONDONTWRITEBYTECODE='1')


def run(*args, **kwargs):
    return subprocess.run(args, check=True, env=ENV, **kwargs)


def sql(query):
    return run('psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query,
               stdout=subprocess.PIPE, text=True).stdout.strip()


def api(path, data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(URL + '/api/v1' + path,
        data=json.dumps(data).encode() if data is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as response:
        body = response.read()
        return json.loads(body) if body else None


def token(account):
    if account not in ('ios-admin', 'ios-viewer'):
        raise SystemExit('Account must be ios-admin or ios-viewer')
    value = secrets.token_urlsafe(32)
    digest = base64.urlsafe_b64encode(hashlib.sha256(value.encode()).digest()).decode().rstrip('=')
    result = sql(f'''INSERT INTO session (token_hash,user_id,expires_at,client,device_name,platform)
        SELECT '{digest}',id,now()+interval '30 days','app','Simulator fixture CLI','ios'
        FROM "user" WHERE username='{account}' RETURNING id''')
    if 'INSERT 0 1' not in result:
        raise SystemExit('Seed the accounts first')
    return value


def start():
    ROOT.mkdir(parents=True, exist_ok=True)
    os.chmod(ROOT, 0o700)
    if not SERVER.exists():
        source = Path(__file__).resolve().parents[4]
        run('git', 'clone', '--no-hardlinks', str(source), str(SERVER))
        run('git', '-C', str(SERVER), 'checkout', '--detach', PIN)
    if not (SERVER / 'apps/server/dist/server/index.mjs').exists():
        run('pnpm', 'install', '--frozen-lockfile', cwd=SERVER)
        run('pnpm', 'build', cwd=SERVER)
    SOCKET.mkdir(exist_ok=True, mode=0o700)
    if not (ROOT / 'postgres/PG_VERSION').exists():
        run('initdb', '-D', str(ROOT / 'postgres'), '-U', 'postgres', '--auth=trust', '--no-locale', stdout=subprocess.DEVNULL)
    if subprocess.run(['pg_isready'], env=ENV, stdout=subprocess.DEVNULL).returncode:
        run('pg_ctl', '-D', str(ROOT / 'postgres'), '-l', str(ROOT / 'postgres.log'),
            '-o', f"-c listen_addresses='' -c unix_socket_directories='{SOCKET}' -c unix_socket_permissions=0700", '-w', 'start')
    exists = run('psql', '-d', 'postgres', '-XAt', '-c', "SELECT count(*) FROM pg_database WHERE datname='matinee'", stdout=subprocess.PIPE, text=True).stdout.strip()
    if exists == '0':
        run('createdb', 'matinee')
    pidfile = ROOT / 'server.pid'
    if pidfile.exists():
        try:
            os.kill(int(pidfile.read_text()), 0)
            return
        except ProcessLookupError:
            pidfile.unlink()
    env = dict(ENV, NODE_ENV='production', HOST='::1', PORT='18420', PUBLIC_URL=URL,
        DATABASE_URL=f'postgres://postgres@localhost/matinee?host={SOCKET}',
        MATINEE_DATA_DIR=str(ROOT / 'data'), MATINEE_WEB_DIST=str(SERVER / 'apps/web/dist'),
        MATINEE_HARDWARE_ACCELERATION='videotoolbox', MATINEE_DISCOVERY_ENABLED='false',
        MATINEE_WATCH_LIBRARIES='false', MATINEE_TRANSCODE_CACHE_GB='2',
        MATINEE_FFMPEG_PATH=shutil.which('ffmpeg'), MATINEE_FFPROBE_PATH=shutil.which('ffprobe'))
    # Optional private shell environment, never sourced from a checkout.
    private = ROOT / 'metadata.env'
    if private.exists():
        for line in private.read_text().splitlines():
            if line.startswith(('MATINEE_TMDB_API_KEY=', 'MATINEE_TVDB_API_KEY=', 'MATINEE_TVDB_PIN=')):
                key, value = line.split('=', 1)
                env[key] = value
    with (ROOT / 'server.log').open('ab') as log:
        process = subprocess.Popen(['node', 'dist/server/index.mjs'], cwd=SERVER / 'apps/server',
            env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    pidfile.write_text(str(process.pid))
    for _ in range(90):
        try:
            urllib.request.urlopen(URL + '/api/health', timeout=1).close()
            return
        except OSError:
            time.sleep(1)
    raise SystemExit('Server did not become healthy; see server.log')


def stop():
    pidfile = ROOT / 'server.pid'
    if pidfile.exists():
        pid = int(pidfile.read_text())
        try:
            os.kill(pid, signal.SIGTERM)
            for _ in range(30):
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(1)
            else:
                raise SystemExit('Server still stopping; refusing to remove PID file')
        except ProcessLookupError:
            pass
        pidfile.unlink()
    if (ROOT / 'postgres/postmaster.pid').exists():
        run('pg_ctl', '-D', str(ROOT / 'postgres'), '-w', 'stop')


def seed():
    sql('''INSERT INTO "user" (username,role,display_name) VALUES
        ('ios-admin','admin','iOS Admin'),('ios-viewer','user','iOS Viewer') ON CONFLICT DO NOTHING;
        INSERT INTO setting (key,value) VALUES ('setup','{"complete":true}') ON CONFLICT (key) DO UPDATE SET value=excluded.value;''')
    for name, kind, folder in [('Movies','movies','movies'), ('Restricted movies','movies','restricted'), ('Shows','shows','shows')]:
        sql(f"INSERT INTO library (name,kind) SELECT '{name}','{kind}' WHERE NOT EXISTS (SELECT 1 FROM library WHERE name='{name}');")
        sql(f"INSERT INTO library_folder (library_id,path) SELECT id,'{ROOT}/media/{folder}' FROM library WHERE name='{name}' ON CONFLICT DO NOTHING;")
    sql('''UPDATE access_group SET all_libraries=false WHERE everyone;
        INSERT INTO access_group_library (group_id,library_id)
        SELECT g.id,l.id FROM access_group g CROSS JOIN library l
        WHERE g.everyone AND l.name IN ('Movies','Shows') ON CONFLICT DO NOTHING;''')
    admin = token('ios-admin')
    for lib in api('/libraries', token=admin):
        api('/libraries/' + lib['id'] + '/scan', {}, admin)
    for _ in range(90):
        if int(sql('SELECT count(*) FROM media_item')) >= 13:
            break
        time.sleep(2)
    api('/admin/tasks/make-trickplay/run', {}, admin)
    sql('''INSERT INTO watch_progress (user_id,media_item_id,position_seconds,completed)
        SELECT u.id,m.id,CASE WHEN m.relative_path LIKE '%S01E01%' THEN 30 ELSE 420 END,
        m.relative_path LIKE '%S01E0%' FROM "user" u CROSS JOIN media_item m
        WHERE m.relative_path LIKE '%S01E01%' OR m.relative_path LIKE '%S01E02%' OR m.relative_path LIKE '%Matrix%' OR m.relative_path LIKE '%Toy Story%'
        ON CONFLICT (user_id,media_item_id) DO NOTHING;
        UPDATE watch_progress SET completed=true,position_seconds=60 WHERE media_item_id IN
        (SELECT id FROM media_item WHERE relative_path LIKE '%S01E01%' OR relative_path LIKE '%S01E02%' OR relative_path LIKE '%Toy Story%');
        INSERT INTO favorite (user_id,title_id) SELECT u.id,t.id FROM "user" u CROSS JOIN title t
        WHERE t.name='The Matrix' ON CONFLICT DO NOTHING;''')


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else ''
    # Serialize lifecycle commands, but not approval or token requests.
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    lifecycle_lock = (ROOT / 'lifecycle.lock').open('a')
    if action in ('start', 'stop', 'reseed'):
        fcntl.flock(lifecycle_lock, fcntl.LOCK_EX)
    if action == 'start':
        start()
    elif action == 'stop':
        stop()
    elif action == 'reseed':
        if sys.argv[2:] != ['--yes']:
            raise SystemExit('Destructive: reseed --yes wipes database and generated server data, retaining media and checkout')
        stop()
        shutil.rmtree(ROOT / 'postgres', ignore_errors=True)
        shutil.rmtree(ROOT / 'data', ignore_errors=True)
        run('python3', str(Path(__file__).with_name('media.py')))
        start()
        seed()
    elif action == 'verify':
        run('python3', str(Path(__file__).with_name('verify.py')))
    elif action == 'token':
        print(token(sys.argv[2] if len(sys.argv) > 2 else 'ios-admin'))
    elif action == 'approve':
        code = sys.argv[2].upper().replace('-', '')
        if len(code) != 8 or not code.isalpha():
            raise SystemExit('Expected eight-letter user code')
        code = code[:4] + '-' + code[4:]
        api('/auth/device/' + code + '/approve', {}, token(sys.argv[3] if len(sys.argv) > 3 else 'ios-admin'))
        print('Approved ' + code)
    else:
        raise SystemExit('Usage: run start|stop|reseed --yes|verify|token [ios-admin|ios-viewer]|approve CODE [account]')
