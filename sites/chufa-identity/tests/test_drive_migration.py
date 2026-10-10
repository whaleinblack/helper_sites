import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('migration',Path(__file__).parents[1]/'deploy/migrate-drive-owner.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class DriveMigrationTest(unittest.TestCase):
 def test_keeps_files_tokens_and_upload_bytes(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);state=root/'state';state.mkdir();(state/'uploads').mkdir()
   (state/'users.json').write_text(json.dumps({'users':{'admin':{'hash':'fixture-only'}}}))
   (state/'sessions.json').write_text(json.dumps({'sessions':[{'user':'admin'}]}))
   (state/'shares.json').write_text(json.dumps({'shares':[{'id':'unchanged-token','user':'admin','paths':['/sample'] }]}))
   (state/'uploads/job.json').write_text(json.dumps({'user':'admin','offset':4}))
   (state/'uploads/job.part').write_bytes(b'keep')
   result=module.migrate(state,root/'backup')
   self.assertEqual(result['sharesReattributed'],1)
   self.assertEqual(json.loads((state/'shares.json').read_text())['shares'][0]['id'],'unchanged-token')
   self.assertEqual(json.loads((state/'uploads/job.json').read_text()),{'user':'preview','offset':4})
   self.assertEqual((state/'uploads/job.part').read_bytes(),b'keep')
   self.assertEqual(json.loads((state/'users.json').read_text()),{'users':{}})
   self.assertIn('admin',json.loads((root/'backup/users.json').read_text())['users'])
 def test_unexpected_accounts_stop_before_writes(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);state=root/'state';state.mkdir()
   original=json.dumps({'users':{'admin':{},'someone-else':{}}});(state/'users.json').write_text(original)
   with self.assertRaises(ValueError):module.migrate(state,root/'backup')
   self.assertEqual((state/'users.json').read_text(),original)
if __name__=='__main__':unittest.main()
