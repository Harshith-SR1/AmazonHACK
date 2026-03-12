from fastapi.testclient import TestClient

from main import app


client = TestClient(app)
HEADERS = {'x-api-key': 'dev-key', 'x-user-id': 'pytest-user'}


def test_devices_authenticated():
    response = client.get('/api/devices', headers=HEADERS)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_train_and_list_gesture():
    payload = {
        'name': 'pytest-wave',
        'mapped_task': 'open YouTube on laptop',
        'landmarks': [[0.1, 0.2, 0.3] for _ in range(21)]
    }
    r1 = client.post('/api/gesture/train', headers=HEADERS, json=payload)
    assert r1.status_code == 200
    r2 = client.get('/api/gesture/custom', headers=HEADERS)
    assert r2.status_code == 200
    assert any(item['name'] == 'pytest-wave' for item in r2.json())
