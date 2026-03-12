import traceback

try:
    print("Importing main...")
    from main import app, on_startup
    print("Main imported successfully.")
    
    print("Running on_startup()...")
    on_startup()
    print("on_startup() completed successfully.")
except Exception as e:
    print("CRASH DETECTED!")
    traceback.print_exc()
