"""Pair HTTP requests with their responses from a passive loopback pcap. Reads only.
Same frame walk as pcap_http.py; additionally decodes the reverse stream (responses) and pairs
them in order per connection. Auth header values are redacted. Used for the #210 Stop check:
/chat/executions/cancel and pending-interaction exchanges, request and reply."""
import json, re, struct, sys
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

def assemble(parts):
    blob, times = b'', []
    for seq in sorted(parts):
        ts, data = parts[seq]; blob += data; times.append((len(blob), ts))
    return blob, times

def body_after(blob, end, headers):
    body_at = end + 4
    if 'content-length' in headers:
        size = int(headers['content-length']); return blob[body_at:body_at + size], body_at + size
    if headers.get('transfer-encoding') == 'chunked':
        body = b''; p = body_at
        while True:
            nl = blob.find(b'\r\n', p)
            if nl < 0: return body, len(blob)
            n = int(blob[p:nl], 16)
            if n == 0: return body, nl + 4
            body += blob[nl + 2:nl + 2 + n]; p = nl + 2 + n + 2
    return b'', body_at

def messages(blob, times, start_re):
    rows = []; at = 0
    while True:
        m = start_re.search(blob, at)
        if not m: break
        end = blob.find(b'\r\n\r\n', m.start())
        if end < 0: break
        head = blob[m.start():end].decode('latin1')
        headers = {l.split(':', 1)[0].lower(): l.split(':', 1)[1].strip() for l in head.split('\r\n')[1:] if ':' in l}
        body, at = body_after(blob, end, headers)
        ts = next((t for size, t in times if size > m.start()), None)
        if 'x-unchain-auth' in headers: headers['x-unchain-auth'] = '<present>'
        rows.append({'at': ts, 'start_line': head.split('\r\n')[0], 'headers': headers, 'body': body.decode('utf8', 'replace')})
    return rows

REQ = re.compile(rb'(GET|POST|PUT|DELETE) (\S+) HTTP/1\.1\r\n'); RES = re.compile(rb'HTTP/1\.[01] (\d{3})[^\r\n]*\r\n')
pairs = []
for (sport, dport), parts in streams.items():
    blob, times = assemble(parts)
    reqs = messages(blob, times, REQ)
    if not reqs: continue
    rblob, rtimes = assemble(streams.get((dport, sport), {}))
    ress = messages(rblob, rtimes, RES) if rblob else []
    for i, rq in enumerate(reqs):
        method, path_ = rq['start_line'].split(' ')[0], rq['start_line'].split(' ')[1]
        rs = ress[i] if i < len(ress) else None
        pairs.append({'at': rq['at'], 'client_port': sport, 'server_port': dport, 'method': method, 'path': path_, 'request_headers': rq['headers'], 'request_body': rq['body'],
                      'response': None if rs is None else {'at': rs['at'], 'status': int(rs['start_line'].split(' ')[1]), 'headers': rs['headers'], 'body': rs['body'][:20000]}})
pairs.sort(key=lambda r: r['at'] or 0)
only = sys.argv[3:] 
if only: pairs = [p for p in pairs if any(k in p['path'] for k in only)]
json.dump(pairs, open(sys.argv[2], 'w'), indent=1)
print(len(pairs))
