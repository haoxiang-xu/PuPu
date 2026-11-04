"""Rebuild HTTP requests from a passive loopback pcap. Reads only."""
import json, re, socket, struct, sys
from collections import defaultdict

def packets(path):
    raw = open(path, 'rb').read()
    magic = struct.unpack('<I', raw[:4])[0]
    assert magic in (0xa1b2c3d4, 0xa1b23c4d), hex(magic)
    assert struct.unpack('<I', raw[20:24])[0] == 1
    at = 24
    while at < len(raw):
        sec, frac, cap, _ = struct.unpack('<IIII', raw[at:at + 16]); at += 16
        yield sec + frac / 1e6, raw[at:at + cap]; at += cap

streams = defaultdict(dict)
for ts, frame in packets(sys.argv[1]):
    if struct.unpack('!H', frame[12:14])[0] != 0x0800: continue
    ip = frame[14:]; ihl = (ip[0] & 15) * 4
    if ip[9] != 6: continue
    total = struct.unpack('!H', ip[2:4])[0]
    tcp = ip[ihl:total]
    sport, dport, seq = struct.unpack('!HHI', tcp[:8])
    off = (tcp[12] >> 4) * 4
    data = tcp[off:]
    if data: streams[(sport, dport)].setdefault(seq, (ts, bytes(data)))

rows = []
for (sport, dport), parts in streams.items():
    blob, first = b'', None; times = []
    for seq in sorted(parts):
        ts, data = parts[seq]; blob += data; times.append((len(blob), ts))
    at = 0
    while True:
        m = re.compile(rb'(GET|POST|PUT|DELETE) (\S+) HTTP/1\.1\r\n').search(blob, at)
        if not m: break
        end = blob.find(b'\r\n\r\n', m.start())
        if end < 0: break
        head = blob[m.start():end].decode('latin1')
        headers = {l.split(':', 1)[0].lower(): l.split(':', 1)[1].strip() for l in head.split('\r\n')[1:]}
        body_at = end + 4
        if 'content-length' in headers:
            size = int(headers['content-length']); body = blob[body_at:body_at + size]; at = body_at + size
        elif headers.get('transfer-encoding') == 'chunked':
            body = b''; p = body_at
            while True:
                nl = blob.find(b'\r\n', p); n = int(blob[p:nl], 16)
                if n == 0: p = nl + 4; break
                body += blob[nl + 2:nl + 2 + n]; p = nl + 2 + n + 2
            at = p
        else:
            body = b''; at = body_at
        ts = next((t for size, t in times if size > m.start()), None)
        headers.pop('x-unchain-auth', None) and headers.update({'x-unchain-auth': '<present>'})
        rows.append({'at': ts, 'src_port': sport, 'dst_port': dport, 'method': m.group(1).decode(),
            'path': m.group(2).decode(), 'headers': headers, 'body': body.decode('utf8', 'replace')})
rows.sort(key=lambda r: r['at'])
json.dump(rows, open(sys.argv[2], 'w'), indent=1)
print(len(rows))
