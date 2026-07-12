import urllib.request
import urllib.parse
import json
import urllib.error

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
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTPError: {e.code} - {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

# Generate token using backend function directly
import sys
import os
sys.path.append(r"C:\Documents\Hackathon\drm-platform\backend")
from app.middleware.auth import create_access_token

token = create_access_token({"sub": "51620b36-3021-4867-8a45-301130b68c5a"})
print("Admin token generated.")

print("Creating group as admin...")
group_data = {
    "name": "Admin Group",
    "description": ""
}
group_resp = request("POST", "/groups", group_data, token=token)
print(group_resp)
