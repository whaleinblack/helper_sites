import datetime
import os
from pathlib import Path
import shutil
import sqlite3

root=Path('/srv/chufa-identity')
target=root/'backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target.mkdir(parents=True,mode=0o700)
source=sqlite3.connect('file:/srv/chufa-identity/shared/identity.sqlite?mode=ro',uri=True)
dest=sqlite3.connect(target/'identity.sqlite')
source.backup(dest)
if dest.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or dest.execute('PRAGMA foreign_key_check').fetchone():
    raise RuntimeError('Identity backup integrity failure')
source.close();dest.close()
os.chmod(target/'identity.sqlite',0o600)
shutil.copyfile(root/'private/config.json',target/'config.json')
os.chmod(target/'config.json',0o600)
print('Identity backup verified')
