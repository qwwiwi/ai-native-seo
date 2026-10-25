import os, pathlib, re, shutil, datetime, sys
# usage: swap-caddy-block.py [block-file] [site-marker]
#   block-file  default /tmp/caddy-blog-block.txt (copy of deploy/caddy-blog-block.txt)
#   site-marker default = the block's own first line, e.g. "blog.example.com {"
#               (white-label: no host is hard-coded here — the block names its site)
# CADDYFILE overrides the target (tests); the backup lands next to it.
cf = pathlib.Path(os.environ.get('CADDYFILE', '/etc/caddy/Caddyfile'))
text = cf.read_text()
block_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/caddy-blog-block.txt'
new_block = pathlib.Path(block_file).read_text().rstrip('\n')
marker = sys.argv[2] if len(sys.argv) > 2 else new_block.split('\n', 1)[0].strip()
if not marker.endswith('{'):
    print(f'ERROR: site marker {marker!r} must be a site line ending with "{{"'); sys.exit(1)
if not new_block.startswith(marker):
    print(f'ERROR: {block_file} does not start with {marker!r}'); sys.exit(1)
# the site block must start at a line start (not e.g. "www.blog.example.com {")
mm = re.search(r'(?m)^' + re.escape(marker), text)
if not mm:
    print(f'ERROR: site block {marker!r} not found in {cf}'); sys.exit(1)
start = mm.start()
# brace-match from first { at/after start
i = text.index('{', start)
depth = 0; end = None
for j in range(i, len(text)):
    c = text[j]
    if c == '{': depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            end = j + 1; break
if end is None:
    print('ERROR: unbalanced braces'); sys.exit(1)
ts = datetime.datetime.now().strftime('%Y%m%d%H%M%S')
shutil.copy2(cf, f'{cf}.bak.blogfix.{ts}')
result = text[:start] + new_block + text[end:]
cf.write_text(result)
print(f'OK replaced {end-start} chars; backup .bak.blogfix.{ts}')
