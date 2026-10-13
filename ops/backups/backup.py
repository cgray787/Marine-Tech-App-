#!/usr/bin/env python3
"""Nightly private database + Storage snapshots; optional private R2 upload."""
import argparse
import base64
import datetime
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

os.umask(0o077)
STAGE = 'startup'

def stage(name):
    global STAGE
    STAGE = name
    print(json.dumps({'event':'backup-stage','stage':name,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}),flush=True)

def transient(error):
    # HTTPError subclasses URLError: check permanent HTTP failures first.
    if isinstance(error, urllib.error.HTTPError):
        return error.code in (408,429,500,502,503,504)
    if isinstance(error, urllib.error.URLError):
        return isinstance(error.reason, (OSError, TimeoutError))
    if isinstance(error, (TimeoutError, ConnectionError, http.client.IncompleteRead, subprocess.TimeoutExpired)):
        return True
    if isinstance(error, subprocess.CalledProcessError):
        detail = error.stderr or b''
        if isinstance(detail, bytes): detail = detail.decode(errors='replace')
        return any(s in detail.lower() for s in ('connection timed out','connection reset','server closed the connection unexpectedly','could not translate host name','temporary failure in name resolution','timeout expired'))
    return False

def retry(action):
    for attempt in range(1,4):
        try:return action()
        except Exception as error:
            if attempt == 3 or not transient(error):raise
            # Never log response bodies, command arguments, URLs or credentials.
            print(json.dumps({'event':'backup-retry','stage':STAGE,'attempt':attempt,'error_type':type(error).__name__}),flush=True)
            time.sleep(5 * attempt)

def command(args, **kwargs):
    return retry(lambda: subprocess.run(args, **kwargs))

def backup_due(config, now=None):
    now = now or datetime.datetime.now().astimezone()
    if config.get('backup_timezone'):now = now.astimezone(ZoneInfo(config['backup_timezone']))
    boundary = now.replace(hour=4,minute=15,second=0,microsecond=0)
    if now < boundary: boundary -= datetime.timedelta(days=1)
    try:
        latest = json.loads((Path(config['backup_root']).expanduser()/'latest-status.json').read_text())
        completed = datetime.datetime.fromisoformat(latest['completed_at'])
        failure_file = Path(config['backup_root']).expanduser()/'last-failure.json'
        if failure_file.exists():
            failure = json.loads(failure_file.read_text())
            if datetime.datetime.fromisoformat(failure['failed_at']) > completed:return True
        return not (boundary <= completed <= now and (not config.get('r2_bucket') or latest.get('offsite_uploaded') is True))
    except (OSError, ValueError, KeyError, TypeError):return True

def token(secret_file=None):
    value = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not value and secret_file:value = Path(secret_file).expanduser().read_text().strip()
    if not value:
        r = subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a','supabase','-w'],capture_output=True,text=True,check=True)
        value = r.stdout.strip()
    if value.startswith('go-keyring-base64:'):
        value = base64.b64decode(value.split(':',1)[1]).decode()
    if len(value)%2 == 0 and all(c in '0123456789abcdefABCDEF' for c in value):
        value = bytes.fromhex(value).decode()
    if value.startswith('{'):
        data = json.loads(value); value = data.get('access_token',data.get('token',''))
    if not value: raise RuntimeError('Supabase CLI login required')
    return value

def request(url, headers, body=None, timeout=60):
    req = urllib.request.Request(url,headers={**headers,'Content-Type':'application/json','User-Agent':'supabase-cli/2.99.0'},data=json.dumps(body).encode() if body is not None else None)
    def read():
        with urllib.request.urlopen(req,timeout=timeout) as r:return r.read()
    return retry(read)

def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def heartbeat(config, ok, offsite=False, checked_at=None):
    secret_file = config.get('monitor_secrets')
    if not secret_file: return
    keys = json.loads(Path(secret_file).expanduser().read_text())
    request(config['monitor_url'].rstrip('/')+'/backup-status',
            {'Authorization':'Bearer '+keys['MONITOR_ADMIN_TOKEN']},
            {'ok':ok,'offsiteUploaded':offsite,'checkedAt':checked_at or datetime.datetime.now(datetime.timezone.utc).isoformat()})

def offsite_transfer(config, archive, verification):
    """Stream through the protected R2 binding; no desktop CLI login on the VPS."""
    keys = json.loads(Path(config['monitor_secrets']).expanduser().read_text())
    url = config['offsite_url'].rstrip('/')+'/'+urllib.parse.quote(archive.name)
    headers = {'Authorization':'Bearer '+keys['MONITOR_ADMIN_TOKEN'],'User-Agent':'supabase-cli/2.99.0'}
    def upload():
        with archive.open('rb') as body:
            req = urllib.request.Request(url,data=body,method='PUT',headers={**headers,'Content-Type':'application/gzip','Content-Length':str(archive.stat().st_size)})
            with urllib.request.urlopen(req,timeout=300) as response:response.read()
    stage('offsite-upload')
    retry(upload)
    def download():
        req = urllib.request.Request(url,headers=headers)
        with urllib.request.urlopen(req,timeout=300) as response, verification.open('wb') as target:
            shutil.copyfileobj(response,target)
    stage('offsite-download-verification')
    retry(download)

def run(config):
    ref = config['project_ref']
    destination = Path(config['backup_root']).expanduser()
    destination.mkdir(parents=True,exist_ok=True,mode=0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H%M%SZ')
    folder = destination / ('.in-progress-'+stamp)
    folder.mkdir(mode=0o700)
    stage('database-auth')
    auth = {'Authorization':'Bearer '+token(config.get('supabase_token_file'))}
    def api(path, body=None):return json.loads(request('https://api.supabase.com/v1/projects/'+ref+path,auth,body))
    role = api('/cli/login-role',{'read_only':False})
    pools = api('/config/database/pooler')
    pool = next(p for p in pools if p.get('database_type')=='PRIMARY')
    # Supavisor exposes session mode on port 5432 even when config lists transaction mode.
    env = os.environ.copy()
    env.update(PGHOST=pool['db_host'],PGPORT='5432',PGDATABASE='postgres',PGUSER=role['role']+'.'+ref,PGPASSWORD=role['password'],PGSSLMODE='require',PGCONNECT_TIMEOUT='20',PGOPTIONS='-c default_transaction_read_only=on')
    binary = Path(config.get('postgres_bin','/opt/homebrew/opt/libpq/bin'))
    dump = folder/'database.dump'
    stage('database-export')
    command([str(binary/'pg_dump'),'--format=custom','--role=postgres','--no-owner','--no-acl','--lock-wait-timeout=15000','--file',str(dump)],env=env,check=True,capture_output=True,timeout=600)
    stage('database-verification')
    subprocess.run([str(binary/'pg_restore'),'--file=/dev/null',str(dump)],check=True,capture_output=True,timeout=300)
    metadata = subprocess.run([str(binary/'pg_restore'),'--list',str(dump)],check=True,capture_output=True,text=True).stdout
    (folder/'database-manifest.txt').write_text(metadata)
    stage('storage-inventory')
    def query(sql):return api('/database/query',{'query':sql,'read_only':False})
    objects = query('select bucket_id,name,metadata from storage.objects order by bucket_id,name')
    buckets = query('select id,name,public,file_size_limit,allowed_mime_types from storage.buckets')
    # Vault ciphertext cannot be restored independently of the managed key.
    vault = query('select id,name,description,decrypted_secret from vault.decrypted_secrets')
    (folder/'vault-secrets.private.json').write_text(json.dumps(vault))
    (folder/'storage-buckets.json').write_text(json.dumps(buckets))
    keys = api('/api-keys')
    service = next(k['api_key'] for k in keys if k.get('name')=='service_role')
    headers = {'apikey':service,'Authorization':'Bearer '+service}
    storage = folder/'storage';storage.mkdir()
    manifest = []
    for index, obj in enumerate(objects,1):
        stage('storage-object-'+str(index)+'-of-'+str(len(objects)))
        key = obj['bucket_id']+'/'+obj['name']
        path = storage/(hashlib.sha256(key.encode()).hexdigest()+'.bin')
        data = request('https://'+ref+'.supabase.co/storage/v1/object/authenticated/'+urllib.parse.quote(key,safe='/'),headers)
        expected = (obj.get('metadata') or {}).get('size')
        if expected is not None and len(data)!=int(expected):raise RuntimeError('Storage length verification failed')
        path.write_bytes(data)
        manifest.append({'bucket_id':obj['bucket_id'],'name':obj['name'],'file':str(path.relative_to(folder)),'bytes':len(data),'sha256':digest(path)})
    (folder/'storage-manifest.json').write_text(json.dumps(manifest,indent=2))
    summary = {'project_ref':ref,'created_at':stamp,'database_bytes':dump.stat().st_size,'database_sha256':digest(dump),'full_decode_verified':True,'storage_objects':len(manifest),'storage_bytes':sum(x['bytes'] for x in manifest),'offsite_uploaded':False}
    (folder/'summary.json').write_text(json.dumps(summary,indent=2))
    (folder/'SHA256SUMS').write_text('\n'.join(digest(p)+'  '+str(p.relative_to(folder)) for p in sorted(folder.rglob('*')) if p.is_file())+'\n')
    complete = destination/stamp
    folder.rename(complete)
    stage('archive-verification')
    archive = destination/(stamp+'.tar.gz')
    with tarfile.open(archive,'w:gz') as tar:tar.add(complete,arcname=stamp)
    with tarfile.open(archive) as tar:
        for member in tar:
            if member.isfile():
                with tar.extractfile(member) as f:
                    while f.read(1024*1024):pass
    report = {**summary,'folder':str(complete),'archive':str(archive),'archive_sha256':digest(archive)}
    bucket = config.get('r2_bucket')
    if bucket:
        object_key = 'marine-tech/'+archive.name
        verification = destination/('.verify-'+stamp+'.tar.gz')
        try:
            if config.get('offsite_url'):
                offsite_transfer(config,archive,verification)
            else:
                wrangler = config['wrangler_bin']
                args = [wrangler,'r2','object','put',bucket+'/'+object_key,'--file',str(archive),'--remote','--content-type','application/gzip']
                stage('offsite-upload')
                command(args,cwd=Path(__file__).parent,check=True,capture_output=True,timeout=600)
                stage('offsite-download-verification')
                command([wrangler,'r2','object','get',bucket+'/'+object_key,'--file',str(verification),'--remote'],cwd=Path(__file__).parent,check=True,capture_output=True,timeout=600)
            if digest(verification)!=report['archive_sha256']:raise RuntimeError('Offsite download checksum mismatch')
        finally:
            verification.unlink(missing_ok=True)
        report.update(offsite_uploaded=True,r2_object=bucket+'/'+object_key)
    report['completed_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    stage('monitor-heartbeat')
    heartbeat(config, True, report['offsite_uploaded'], report['completed_at'])
    status = destination/'.latest-status.tmp'
    status.write_text(json.dumps(report,indent=2))
    status.replace(destination/'latest-status.json')
    # Prune only this tool's completed local snapshots; never historical/manual backups.
    completed = sorted(p for p in destination.iterdir() if p.is_dir() and (p/'summary.json').exists())
    for old in completed[:-max(2,int(config.get('local_copies',7)))]:
        shutil.rmtree(old);(destination/(old.name+'.tar.gz')).unlink(missing_ok=True)
    print(json.dumps(report,indent=2))
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',default=str(Path.home()/'.config/marine-tech/backup.json'))
    parser.add_argument('--scheduled',action='store_true',help='Skip if this nightly window already has a verified backup')
    args=parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    destination = Path(config['backup_root']).expanduser()
    destination.mkdir(parents=True,exist_ok=True,mode=0o700)
    lock = (destination/'.backup.lock').open('a')
    try:fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(json.dumps({'event':'backup-skipped','reason':'already-running'}),flush=True)
        raise SystemExit(0)
    if args.scheduled and not backup_due(config):
        print(json.dumps({'event':'backup-skipped','reason':'current-nightly-window-already-verified'}),flush=True)
        raise SystemExit(0)
    try:run(config)
    except Exception as error:
        failure = {'ok':False,'stage':STAGE,'error_type':type(error).__name__,'failed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'message':'Backup failed. Local partial files retained; no success claimed.'}
        try:(destination/'last-failure.json').write_text(json.dumps(failure,indent=2))
        except OSError:pass
        try:heartbeat(config, False)
        except Exception:pass
        # Do not print subprocess/API errors, which can include credentials or signed URLs.
        print(json.dumps(failure),flush=True)
        raise SystemExit(1) from None
