# Deployment Guide: OmniAccess on AWS

This guide explains how to deploy the migrated OmniAccess agent to AWS.

## Prerequisites
- AWS CLI installed and configured (`aws configure`)
- Terraform installed (optional, for IaC)
- Amazon Bedrock access enabled for Nova models in your region.

## 1. Environment Configuration
Create a `.env` file based on `.env.aws.example`:
```bash
cp .env.aws.example .env
# Edit .env with your AWS credentials and preferred region
```

## 2. Option A: Manual Deployment via AWS CLI

### Create S3 Bucket
```bash
aws s3 mb s3://omniaccess-assets-$(aws sts get-caller-identity --query Account --output text)
```

### Deploy Backend to AWS Lambda
1. **Package the application**:
   ```bash
   pip install -r requirements.txt -t ./package
   cp -r backend/* ./package/
   cd package && zip -r ../deployment_package.zip . && cd ..
   ```
2. **Create the Lambda function**:
   ```bash
   aws lambda create-function --function-name OmniAccessBackend \
     --runtime python3.11 \
     --handler cloud/aws/lambda_handler.handler \
     --zip-file fileb://deployment_package.zip \
     --role arn:aws:iam::YOUR_ACCOUNT_ID:role/YOUR_LAMBDA_ROLE
   ```

## 3. Option B: Automated Deployment (Terraform)
We provide a base terraform configuration in `cloud/aws/terraform/` (to be created).

### Commands:
```bash
cd cloud/aws/terraform
terraform init
terraform apply -auto-approve
```

## 4. API Gateway Configuration
- Create a REST API in API Gateway.
- Proxy all requests to the `OmniAccessBackend` Lambda function.
- Enable CORS for your frontend domain.

## 5. Monitoring
Check CloudWatch Logs in the `/aws/lambda/OmniAccessBackend` or `OmniAccessLogs` log group to verify the agent is running correctly.
