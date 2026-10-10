"""Run only after chufa-drive is stopped; preserve file data and sharing tokens."""
import argparse
import json
import os
from pathlib import Path
import shutil

def migrate(state,backup):
    state=state.resolve()
    if backup.exists(): raise ValueError('Backup must be a fresh private directory')
    users=state/'users.json'
    if users.is_symlink(): raise ValueError('Unexpected account-file symlink')
    existing=json.loads(users.read_text()).get('users',{})
    if set(existing)!={'admin'}: raise ValueError('Expected sole legacy admin account has changed')
    backup.mkdir(parents=True,mode=0o700)
    changes={users:{'users':{}},state/'sessions.json':{'sessions':[]}}
    report={'retiredLegacyAccounts':1,'sharesReattributed':0,'uploadsReattributed':0}
    shares=state/'shares.json'
    if shares.exists():
        if shares.is_symlink():raise ValueError('Unexpected share-file symlink')
        value=json.loads(shares.read_text())
        for row in value.get('shares',[]):
            if row.get('user')=='admin':row['user']='preview';report['sharesReattributed']+=1
        changes[shares]=value
    for path in (state/'uploads').glob('*.json'):
        if path.is_symlink():raise ValueError('Unexpected upload-file symlink')
        value=json.loads(path.read_text())
        if value.get('user')=='admin':
            value['user']='preview';changes[path]=value;report['uploadsReattributed']+=1
    originals={}
    for path in changes:
        if not path.resolve().is_relative_to(state) or path.is_symlink(): raise ValueError('State path escapes expected directory')
        relative=path.relative_to(state)
        if path.exists():
            saved=backup/relative;saved.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            shutil.copy2(path,saved);os.chmod(saved,0o600)
            originals[path]=path.stat()
        else:originals[path]=None
    (backup/'manifest.json').write_text(json.dumps({str(p.relative_to(state)):s is not None for p,s in originals.items()}))
    written=[]
    try:
        for path,value in changes.items():
            temporary=path.with_name(path.name+'.identity-tmp')
            if temporary.exists():raise ValueError('Unexpected temporary state file')
            temporary.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
            os.chmod(temporary,0o600)
            old=originals[path]
            if old and os.name!='nt':os.chown(temporary,old.st_uid,old.st_gid)
            os.replace(temporary,path);written.append(path)
    except BaseException:
        for path in reversed(written):
            old=originals[path]
            if old:
                shutil.copy2(backup/path.relative_to(state),path)
                if os.name!='nt':os.chown(path,old.st_uid,old.st_gid)
            else:path.unlink()
        raise
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--state',type=Path,required=True);p.add_argument('--backup',type=Path,required=True)
    a=p.parse_args();print(json.dumps(migrate(a.state,a.backup)))
