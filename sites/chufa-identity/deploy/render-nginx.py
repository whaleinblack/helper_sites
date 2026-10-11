"""Render reviewed auth replacements into a new directory; never edits live files."""
from pathlib import Path
import argparse
import re

def replace_auth(text, scope, expected):
    pattern=r'(?m)^(\s*)auth_basic\s+"[^"]+";\s*\n\s*auth_basic_user_file\s+[^;]+;'
    def replacement(m):
        i=m.group(1)
        return f'{i}auth_basic off;\n{i}auth_request /_chufa_identity/{scope};\n{i}error_page 401 = @chufa_signin;'
    result,count=re.subn(pattern,replacement,text)
    if count!=expected: raise ValueError(f'Unexpected {scope} auth configuration ({count})')
    return result

def render(main,photo,live,out):
    if out.exists(): raise ValueError('Output directory must be new')
    out.mkdir(parents=True,mode=0o700)
    main_text=replace_auth(main.read_text(),'status',2)
    anchor='    include /etc/nginx/snippets/helper-sites.conf;'
    if main_text.count(anchor)!=1: raise ValueError('Main include anchor changed')
    main_text=main_text.replace(anchor,'    include /etc/nginx/snippets/chufa-identity.conf;\n'+anchor)
    if main_text.count('X-Travel-Planner-Status-Viewer $remote_user;')!=2: raise ValueError('Status viewer header topology changed')
    main_text=main_text.replace('X-Travel-Planner-Status-Viewer $remote_user;','X-Travel-Planner-Status-Viewer $chufa_identity_user;')
    (out/'travel-planner-preview.conf').write_text(main_text)
    (out/'photo.conf').write_text(replace_auth(photo.read_text(),'photo-admin',1))
    (out/'chufa-live.conf').write_text(replace_auth(live.read_text(),'live-admin',1))
    common='''# Dedicated account portal and internal scoped authorization checks.
auth_request_set $chufa_identity_user $upstream_http_x_identity_user;
location = /account { return 308 /account/; }
location ^~ /account/ {
    proxy_pass http://127.0.0.1:4193;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Connection "";
    client_max_body_size 8k;
    proxy_connect_timeout 2s;
    proxy_read_timeout 15s;
}
location @chufa_signin {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    if ($request_method !~ ^(GET|HEAD)$) { return 401 '{"code":"AUTH_REQUIRED"}'; }
    if ($http_accept ~* "text/html") { return 302 /account/?next=$uri; }
    return 401 '{"code":"AUTH_REQUIRED"}';
}
'''
    for scope in ('status','photo-admin','live-admin'):
        common+='''
location = /_chufa_identity/SCOPENAME {
    internal;
    proxy_pass http://127.0.0.1:4193/internal/check?service=SCOPENAME;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Origin $http_origin;
    proxy_set_header Sec-Fetch-Site $http_sec_fetch_site;
    proxy_set_header X-Original-Method $request_method;
    include /etc/nginx/snippets/chufa-identity-auth-secret.conf;
    proxy_connect_timeout 2s;
    proxy_read_timeout 3s;
}
'''.replace('SCOPENAME',scope)
    # The existing Status login/switch-account form must remain able to create
    # or inspect a session after logout. Only these fixed authentication routes
    # are public; their backend still enforces method, Origin and rate limits.
    for action in ('session','login','logout','password'):
        common+='''
location = /status/app-api/auth/ACTION {
    auth_basic off;
    auth_request off;
    proxy_pass http://127.0.0.1:4174/dev/api/auth/ACTION;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Travel-Planner-Status-Viewer "";
    client_max_body_size 16k;
}
'''.replace('ACTION',action)
    (out/'chufa-identity.conf').write_text(common)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--main',type=Path,required=True);p.add_argument('--photo',type=Path,required=True);p.add_argument('--live',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();render(a.main,a.photo,a.live,a.output)
