from fastapi.testclient import TestClient

from main import app


client = TestClient(app)
HEADERS = {'x-api-key': 'dev-key', 'x-user-id': 'pytest-user'}


def test_sign_train_and_predict():
    landmarks = [[0.3, 0.4, 0.1] for _ in range(21)]
    train_resp = client.post('/api/sign/train', headers=HEADERS, json={'label': 'hello', 'landmarks': landmarks})
    assert train_resp.status_code == 200

    predict_resp = client.post('/api/sign/predict', headers=HEADERS, json={'landmarks': landmarks})
    assert predict_resp.status_code == 200
    body = predict_resp.json()
    assert body.get('ok') is True
    assert body.get('predicted_label')
