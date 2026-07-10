import pathlib, shutil, datetime, sys
cf = pathlib.Path('/etc/caddy/Caddyfile')
text = cf.read_text()
new_block = pathlib.Path('/tmp/caddy-blog-block.txt').read_text().rstrip('\n')
marker = 'blog.edgelab.space {'
if marker not in text:
    print('ERROR: blog block not found'); sys.exit(1)
start = text.index(marker)
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
shutil.copy2(cf, f'/etc/caddy/Caddyfile.bak.blogfix.{ts}')
result = text[:start] + new_block + text[end:]
cf.write_text(result)
print(f'OK replaced {end-start} chars; backup .bak.blogfix.{ts}')
