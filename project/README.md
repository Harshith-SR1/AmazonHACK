# OmniAccess — Universal Multimodal AI UI Navigator (AWS Edition)

OmniAccess is a multimodal AI agent that understands commands, interprets gestures, and automatically navigates user interfaces using **Amazon Nova** models on AWS.

## Project Stack

- **AI Model**: Amazon Nova (Pro, Sonic, Lite) via Amazon Bedrock
- **Agent Framework**: LangChain + AWS Bedrock
- **Backend**: Python FastAPI (Deployed on AWS Lambda/ECS)
- **Frontend**: React + Vite + Capacitor
- **Infrastructure**: AWS (S3, DynamoDB, CloudWatch, API Gateway)
- **Vision**: MediaPipe Hands (Hand tracking and gesture detection)
- **Automation**: Playwright / PyAutoGUI / ADB

## Project Structure

- `frontend/` React-based UI for desktop and mobile.
- `backend/` FastAPI server handling agent orchestration and APIs.
- `agent/` Amazon Nova agent implementation using LangChain.
- `automation/` UI navigation scripts for Desktop and Mobile.
- `cloud/aws/` AWS-specific service clients (S3, DynamoDB).
- `gesture/` MediaPipe-based gesture recognition engine.
- `memory/` User memory stored in DynamoDB (cloud) or SQLite (local).

## Key Features

1. **Autonomous UI Navigation**: Uses **Nova Act** to analyze screenshots and execute actions.
2. **Gesture Interaction**: Multi-modal control using hand gestures (Scroll, Click, Navigate).
3. **Multimodal Reasoning**: Context-aware task planning with Amazon Nova Pro.
4. **Voice Synthesis**: Real-time voice interaction using **Nova 2 Sonic**.
5. **Cross-Device Context**: Seamlessly transfer tasks between Desktop and Mobile.
6. **Cloud-Native**: Fully serverless architecture designed for AWS.

## Setup

### 1) Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.aws.example .env
```

Update `.env` with your AWS credentials and region.

Run backend locally:
```bash
uvicorn main:app --reload --port 8000
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Update `frontend/.env` to point to your backend API.

## Deployment

Refer to [docs/aws_deployment.md](docs/aws_deployment.md) for instructions on deploying to AWS using the CLI or Terraform.

## API Documentation

Detailed API specs are available in [backend/docs/API.md](backend/docs/API.md).
