import os
import boto3
from typing import Any, Dict, List, Optional
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

load_dotenv()

class DynamoDBClient:
    def __init__(self):
        self.table_name = os.getenv("DYNAMODB_TABLE_NAME", "OmniAccessMemory")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.dynamodb = None
        self.table = None
        self.available = False

        access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        session_token = (os.getenv("AWS_SESSION_TOKEN") or "").strip() or None

        # Local/dev fallback: no AWS credentials means this client should be disabled.
        if not access_key or not secret_key:
            return
        if access_key.lower().startswith("your_") or secret_key.lower().startswith("your_"):
            return

        try:
            cfg = Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1, "mode": "standard"})
            self.dynamodb = boto3.resource(
                "dynamodb",
                region_name=self.region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                aws_session_token=session_token,
                config=cfg,
            )
            self.table = self.dynamodb.Table(self.table_name)
            self.available = True
        except Exception as e:
            print(f"DynamoDB init error: {e}")
            self.dynamodb = None
            self.table = None
            self.available = False

    def put_item(self, user_id: str, key: str, value: Any, category: str = "preference") -> bool:
        """Store or update an item in DynamoDB."""
        if not self.available or self.table is None:
            return False
        try:
            self.table.put_item(
                Item={
                    'PK': f"USER#{user_id}",
                    'SK': f"{category.upper()}#{key}",
                    'user_id': user_id,
                    'key': key,
                    'value': value,
                    'category': category
                }
            )
            return True
        except (ClientError, BotoCoreError, Exception) as e:
            print(f"DynamoDB put error: {e}")
            return False

    def get_item(self, user_id: str, key: str, category: str = "preference") -> Optional[Dict[str, Any]]:
        """Retrieve a specific item from DynamoDB."""
        if not self.available or self.table is None:
            return None
        try:
            response = self.table.get_item(
                Key={
                    'PK': f"USER#{user_id}",
                    'SK': f"{category.upper()}#{key}"
                }
            )
            return response.get('Item')
        except (ClientError, BotoCoreError, Exception) as e:
            print(f"DynamoDB get error: {e}")
            return None

    def list_items_by_category(self, user_id: str, category: str) -> List[Dict[str, Any]]:
        """List all items for a user in a specific category."""
        if not self.available or self.table is None:
            return []
        try:
            from boto3.dynamodb.conditions import Key
            response = self.table.query(
                KeyConditionExpression=Key('PK').eq(f"USER#{user_id}") & Key('SK').begins_with(f"{category.upper()}#")
            )
            return response.get('Items', [])
        except (ClientError, BotoCoreError, Exception) as e:
            print(f"DynamoDB query error: {e}")
            return []

    def delete_item(self, user_id: str, key: str, category: str) -> bool:
        """Delete an item from DynamoDB."""
        if not self.available or self.table is None:
            return False
        try:
            self.table.delete_item(
                Key={
                    'PK': f"USER#{user_id}",
                    'SK': f"{category.upper()}#{key}"
                }
            )
            return True
        except (ClientError, BotoCoreError, Exception) as e:
            print(f"DynamoDB delete error: {e}")
            return False
