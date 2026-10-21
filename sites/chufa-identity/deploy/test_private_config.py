import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from private_config import replace_private_json


@unittest.skipUnless(os.name == 'posix', 'Linux service ownership contract')
class PrivateConfigurationTest(unittest.TestCase):
    def test_change_and_rollback_preserve_service_owner_group_and_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            old = {'database': '/synthetic/identity.sqlite', 'clients': []}
            path.write_text(json.dumps(old), encoding='utf-8')
            path.chmod(0o640)
            original = path.stat()
            metadata = (original.st_uid, original.st_gid, stat.S_IMODE(original.st_mode))
            replace_private_json(path, {**old, 'candidate': True})
            self.assertEqual(json.loads(path.read_text())['candidate'], True)
            after = path.stat()
            self.assertEqual((after.st_uid, after.st_gid, stat.S_IMODE(after.st_mode)), metadata)
            replace_private_json(path, old, metadata)
            self.assertEqual(json.loads(path.read_text()), old)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_rejects_world_readable_config_without_modification(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.json'
            path.write_text('{}', encoding='utf-8')
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                replace_private_json(path, {'candidate': True})
            self.assertEqual(path.read_text(), '{}')


if __name__ == '__main__':
    unittest.main()
