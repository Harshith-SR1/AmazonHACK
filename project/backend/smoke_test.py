import requests
import json
import os

BASE_URL = "http://localhost:8000"
HEADERS = {
    "x-api-key": "dev-key",
    "x-user-id": "demo-user",
    "Content-Type": "application/json"
}

def save_res(name, data):
    with open(f"test_{name}.json", "w") as f:
        json.dump(data, f, indent=2)

def test_tool_calling():
    print("Testing tool calling...")
    payload = {"text": "Search for kittens on YouTube", "device_id": "desktop-1"}
    try:
        r = requests.post(f"{BASE_URL}/api/command", json=payload, headers=HEADERS)
        save_res("tool_calling", r.json())
    except Exception as e:
        save_res("tool_calling_error", {"error": str(e)})

if __name__ == "__main__":
    test_tool_calling()
