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

# 1. Register
print("Registering...")
register_data = {
    "email": "test_group2@example.com",
    "password": "password123",
    "full_name": "Test Group User",
    "company": "Test Co"
}
reg_resp = request("POST", "/auth/signup", register_data)
print(reg_resp)

token = reg_resp['access_token']
print("Token received.")

# 3. Create Group
print("Creating group...")
group_data = {
    "name": "Test Group 123",
    "description": "A group for testing"
}
group_resp = request("POST", "/groups", group_data, token=token)
print(group_resp)

