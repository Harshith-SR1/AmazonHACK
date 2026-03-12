import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

class S3StorageClient:
    def __init__(self):
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "omniaccess-assets")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.s3_client = None
        self._init_attempted = False

    def _has_explicit_aws_credentials(self) -> bool:
        access_key = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        secret_key = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        if not access_key or not secret_key:
            return False
        if access_key.lower().startswith("your_") or secret_key.lower().startswith("your_"):
            return False
        return True

    def _get_client(self):
        if self.s3_client is not None:
            return self.s3_client
        if self._init_attempted:
            return None

        self._init_attempted = True
        if not self._has_explicit_aws_credentials():
            return None

        try:
            cfg = Config(connect_timeout=2, read_timeout=3, retries={"max_attempts": 1, "mode": "standard"})
            self.s3_client = boto3.client(
                "s3",
                region_name=self.region,
                aws_access_key_id=(os.getenv("AWS_ACCESS_KEY_ID") or "").strip(),
                aws_secret_access_key=(os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip(),
                aws_session_token=(os.getenv("AWS_SESSION_TOKEN") or "").strip() or None,
                config=cfg,
            )
        except Exception as e:
            print(f"S3 init error: {e}")
            self.s3_client = None
        return self.s3_client

    def upload_file(self, file_path: str, object_name: str | None = None) -> str | None:
        """Upload a file to an S3 bucket and return its public URL or S3 URI."""
        if object_name is None:
            object_name = os.path.basename(file_path)

        s3_client = self._get_client()
        if s3_client is None:
            return f"local://{Path(file_path).resolve()}"

        try:
            s3_client.upload_file(file_path, self.bucket_name, object_name)
            return f"s3://{self.bucket_name}/{object_name}"
        except ClientError as e:
            print(f"S3 upload error: {e}")
            return None

    def download_file(self, object_name: str, file_path: str) -> bool:
        """Download a file from an S3 bucket."""
        s3_client = self._get_client()
        if s3_client is None:
            return False
        try:
            s3_client.download_file(self.bucket_name, object_name, file_path)
            return True
        except ClientError as e:
            print(f"S3 download error: {e}")
            return False

    def list_files(self) -> list[str]:
        """List files in the S3 bucket."""
        s3_client = self._get_client()
        if s3_client is None:
            return []
        try:
            response = s3_client.list_objects_v2(Bucket=self.bucket_name)
            return [obj['Key'] for obj in response.get('Contents', [])]
        except ClientError as e:
            print(f"S3 list error: {e}")
            return []
