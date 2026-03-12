import logging
import os
import watchtower
import boto3
from dotenv import load_dotenv

load_dotenv()

def setup_cloudwatch_logging(log_group: str = "OmniAccessLogs"):
    """Set up logging to AWS CloudWatch using Watchtower."""
    region = os.getenv("AWS_REGION", "us-east-1")
    
    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    try:
        # Check for credentials before attempting to create session
        if not os.getenv("AWS_ACCESS_KEY_ID"):
            print("Skipping CloudWatch logging: AWS_ACCESS_KEY_ID not set.")
            return

        boto3_session = boto3.Session(
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
        )
        
        # Use a client with a short timeout to avoid blocking startup
        from botocore.config import Config
        config = Config(connect_timeout=5, read_timeout=5, retries={'max_attempts': 1})
        cw_client = boto3_session.client("logs", config=config)
        
        cw_handler = watchtower.CloudWatchLogHandler(
            log_group=log_group,
            boto3_client=cw_client,
            send_interval=30,
            create_log_group=True
        )
        logger.addHandler(cw_handler)
        print(f"CloudWatch logging enabled in {region}")
    except Exception as e:
        print(f"Failed to setup CloudWatch logging: {e}")
        # Ensure we still have basic logging
        logging.basicConfig(level=logging.INFO)
