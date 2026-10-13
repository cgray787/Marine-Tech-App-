import contextlib
import datetime
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupRecoveryTests(unittest.TestCase):
    def response(self, content=b'verified bytes'):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = content
        return response

    def test_storage_timeout_recovers_without_losing_download(self):
        with patch.object(backup.urllib.request, 'urlopen', side_effect=[TimeoutError('private URL'), self.response()]) as call:
            with patch('time.sleep'), contextlib.redirect_stdout(io.StringIO()) as log:
                self.assertEqual(backup.request('https://example.test/private', {'Authorization':'secret'}), b'verified bytes')
        self.assertEqual(call.call_count, 2)
        self.assertNotIn('private URL', log.getvalue())
        self.assertNotIn('secret', log.getvalue())

    def test_partial_response_restarts_read(self):
        response = self.response()
        response.__enter__.return_value.read.side_effect = ConnectionResetError('connection reset')
        with patch.object(backup.urllib.request, 'urlopen', side_effect=[response, self.response(b'complete')]):
            with patch('time.sleep'), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(backup.request('https://example.test', {}), b'complete')

    def test_permanent_http_failure_is_not_retried(self):
        error = urllib.error.HTTPError('https://example.test', 403, 'Forbidden', {}, None)
        with patch.object(backup.urllib.request, 'urlopen', side_effect=error) as call:
            with self.assertRaises(urllib.error.HTTPError):
                backup.request('https://example.test', {})
        self.assertEqual(call.call_count, 1)

    def test_transient_http_failure_has_bounded_attempts(self):
        error = urllib.error.HTTPError('https://example.test', 503, 'Unavailable', {}, None)
        with patch.object(backup.urllib.request, 'urlopen', side_effect=error) as call:
            with patch('time.sleep'), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(urllib.error.HTTPError):
                    backup.request('https://example.test', {})
        self.assertEqual(call.call_count, 3)

    def test_database_timeout_is_retried(self):
        with patch.object(backup.subprocess, 'run', side_effect=[subprocess.TimeoutExpired('pg_dump', 600), 'ok']) as call:
            with patch('time.sleep'), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(backup.command(['pg_dump'], timeout=600), 'ok')
        self.assertEqual(call.call_count, 2)

    def test_database_auth_failure_is_not_retried(self):
        error = subprocess.CalledProcessError(1, ['pg_dump'], stderr=b'password authentication failed')
        with patch.object(backup.subprocess, 'run', side_effect=error) as call:
            with self.assertRaises(subprocess.CalledProcessError):
                backup.command(['pg_dump'])
        self.assertEqual(call.call_count, 1)

    def test_scheduled_recovery_skips_only_fresh_verified_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'backup_root':directory, 'r2_bucket':'private'}
            status = Path(directory)/'latest-status.json'
            now = datetime.datetime.fromisoformat('2026-10-13T12:00:00-10:00')
            self.assertTrue(backup.backup_due(config, now))
            status.write_text(json.dumps({'completed_at':'2026-10-13T15:00:00+00:00','offsite_uploaded':True}))
            self.assertFalse(backup.backup_due(config, now))
            failure = Path(directory)/'last-failure.json'
            failure.write_text(json.dumps({'failed_at':'2026-10-13T16:00:00+00:00'}))
            self.assertTrue(backup.backup_due(config, now))
            failure.unlink()
            status.write_text(json.dumps({'completed_at':'2026-10-12T15:00:00+00:00','offsite_uploaded':True}))
            self.assertTrue(backup.backup_due(config, now))
            status.write_text(json.dumps({'completed_at':'2026-10-13T15:00:00+00:00','offsite_uploaded':False}))
            self.assertTrue(backup.backup_due(config, now))

    def test_before_nightly_boundary_keeps_previous_days_success(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'backup_root':directory}
            (Path(directory)/'latest-status.json').write_text(json.dumps({'completed_at':'2026-10-12T15:00:00+00:00'}))
            now = datetime.datetime.fromisoformat('2026-10-13T02:00:00-10:00')
            self.assertFalse(backup.backup_due(config, now))

    def test_linux_reads_token_file_without_macos_keychain(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory)/'token'
            token.write_text('test-token\n')
            with patch.dict(backup.os.environ, {}, clear=True), patch.object(backup.subprocess, 'run') as command:
                self.assertEqual(backup.token(token),'test-token')
                command.assert_not_called()

    def test_schedule_uses_configured_timezone_on_utc_server(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'backup_root':directory,'backup_timezone':'Pacific/Honolulu'}
            (Path(directory)/'latest-status.json').write_text(json.dumps({'completed_at':'2026-10-12T15:00:00+00:00'}))
            self.assertFalse(backup.backup_due(config, datetime.datetime.fromisoformat('2026-10-13T14:14:00+00:00')))
            self.assertTrue(backup.backup_due(config, datetime.datetime.fromisoformat('2026-10-13T14:15:00+00:00')))

    def test_private_offsite_transport_streams_and_reads_back_exact_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root/'2026-10-13T173629Z.tar.gz'; source.write_bytes(b'archive bytes')
            target = root/'verify'
            secrets = root/'monitor.json'; secrets.write_text(json.dumps({'MONITOR_ADMIN_TOKEN':'test-token'}))
            calls=[]
            def open_url(req,timeout):
                calls.append(req.get_method())
                self.assertEqual(req.get_header('Authorization'),'Bearer test-token')
                if req.get_method()=='PUT':
                    self.assertEqual(req.data.read(),source.read_bytes())
                    self.assertEqual(req.get_header('Content-length'),str(source.stat().st_size))
                    return io.BytesIO(b'{"ok":true}')
                return io.BytesIO(source.read_bytes())
            with patch.object(backup.urllib.request,'urlopen',side_effect=open_url), contextlib.redirect_stdout(io.StringIO()):
                backup.offsite_transfer({'monitor_secrets':str(secrets),'offsite_url':'https://monitor.example/backup-object'},source,target)
            self.assertEqual(calls,['PUT','GET'])
            self.assertEqual(backup.digest(source),backup.digest(target))

    def test_failed_verification_or_heartbeat_preserves_last_success(self):
        # Exercise the real archive/checksum/status path, with external services
        # replaced. A bad offsite copy must never become a successful backup.
        for failure in ('offsite-corruption', 'monitor-unavailable'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                status = root/'latest-status.json'
                previous = '{"completed_at":"2026-10-12T15:00:00+00:00","offsite_uploaded":true}'
                status.write_text(previous)
                config = {'project_ref':'test-project','backup_root':directory,
                          'r2_bucket':'private','offsite_url':'https://monitor.example/backup-object'}
                responses = [
                    {'role':'backup-role','password':'test-password'},
                    [{'database_type':'PRIMARY','db_host':'database.example'}],
                    [], [], [], [{'name':'service_role','api_key':'test-key'}],
                ]
                def dump(args, **kwargs):
                    Path(args[args.index('--file')+1]).write_bytes(b'test database archive')
                def transfer(_config, archive, verification):
                    verification.write_bytes(b'corrupt' if failure == 'offsite-corruption' else archive.read_bytes())
                with contextlib.ExitStack() as stack:
                    stack.enter_context(patch.object(backup, 'token', return_value='test-token'))
                    stack.enter_context(patch.object(backup, 'request', side_effect=[json.dumps(r).encode() for r in responses]))
                    stack.enter_context(patch.object(backup, 'command', side_effect=dump))
                    stack.enter_context(patch.object(backup.subprocess, 'run', return_value=subprocess.CompletedProcess([],0,stdout='test manifest')))
                    stack.enter_context(patch.object(backup, 'offsite_transfer', side_effect=transfer))
                    heartbeat = stack.enter_context(patch.object(backup, 'heartbeat', side_effect=TimeoutError('monitor unavailable')))
                    stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                    expected = RuntimeError if failure == 'offsite-corruption' else TimeoutError
                    with self.assertRaises(expected):
                        backup.run(config)
                self.assertEqual(status.read_text(), previous)
                self.assertEqual(list(root.glob('.verify-*')), [])
                self.assertFalse((root/'.latest-status.tmp').exists())
                self.assertEqual(len(list(root.glob('*.tar.gz'))), 1)
                if failure == 'offsite-corruption':
                    heartbeat.assert_not_called()
                else:
                    self.assertEqual(heartbeat.call_count, 1)


if __name__ == '__main__':
    unittest.main()
