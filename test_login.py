import urllib.request
import urllib.parse
import json

API_URL = "http://127.0.0.1:8000"

def request(method, path, data=None):
    url = API_URL + path
    headers = {'Content-Type': 'application/json'}
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode()), response.status
    except Exception as e:
        print(f"Error: {e}")
        return None, None

print("Logging in...")
resp, status = request("POST", "/auth/login", {"email": "admin@example.com", "password": "admin"})
print(status, resp)
