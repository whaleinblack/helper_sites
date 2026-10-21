"""Atomic private JSON replacement that retains the service's read access."""
import json
import os
from pathlib import Path
import stat
import tempfile


def replace_private_json(path, value, metadata=None):
    path = Path(path)
    original = path.stat()
    uid, gid, mode = metadata or (original.st_uid, original.st_gid, stat.S_IMODE(original.st_mode))
    if mode & 0o007:
        raise ValueError('Private configuration must not be world-accessible')
    descriptor, temporary = tempfile.mkstemp(prefix='.identity-config-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as target:
            json.dump(value, target, ensure_ascii=False, indent=2)
            target.write('\n')
            target.flush()
            os.fsync(target.fileno())
            os.fchown(target.fileno(), uid, gid)
            os.fchmod(target.fileno(), mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
