import urllib.request
import urllib.parse
import json

API_URL = "http://127.0.0.1:8000"

def request(method, path, data=None, token=None):
    url = API_URL + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode()), response.status
    except Exception as e:
        print(f"Error: {e}")
        return None, None

import sys
sys.path.append(r"C:\Documents\Hackathon\drm-platform\backend")
from app.middleware.auth import create_access_token

token = create_access_token({"sub": "51620b36-3021-4867-8a45-301130b68c5a"})

print("Fetching groups...")
resp, status = request("GET", "/groups", None, token=token)
print(status, resp)
