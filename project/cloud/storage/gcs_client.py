from __future__ import annotations

import os
from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv()


class CloudStorageClient:
    def __init__(self) -> None:
        self.bucket_name = os.getenv("CLOUD_STORAGE_BUCKET", "")
        self.enabled = bool(self.bucket_name)
        if self.enabled:
            self._s3 = boto3.client("s3", region_name=os.getenv("AWS_REGION", "us-east-1"))

    def upload_file(self, file_path: str) -> str:
        if not self.enabled:
            return f"local://{Path(file_path).name}"
        try:
            key = Path(file_path).name
            self._s3.upload_file(file_path, self.bucket_name, key)
            return f"s3://{self.bucket_name}/{key}"
        except Exception:
            return f"local://{Path(file_path).name}"
