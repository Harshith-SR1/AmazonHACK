from mangum import Mangum
from main import app

# This is the entry point for AWS Lambda
# Mangum wraps the FastAPI app to handle Lambda events
handler = Mangum(app, lifespan="off")

# Note: Ensure all dependencies in requirements.txt are bundled in the Lambda layer or zip.
