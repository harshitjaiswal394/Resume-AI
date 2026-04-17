import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('backend/.env')
GCP_DATABASE_URL = os.getenv("GCP_DATABASE_URL")

def run_init():
    # Read schema file
    schema_path = 'backend/scripts/gcp_schema_setup.sql'
    if not os.path.exists(schema_path):
        print(f"Error: Schema file {schema_path} not found")
        return

    with open(schema_path, 'r') as f:
        sql_script = f.read()

    # Connect and execute
    print(f"Connecting to GCP Cloud SQL...")
    engine = create_engine(GCP_DATABASE_URL)
    
    try:
        with engine.begin() as conn:
            # Split commands by semicolon
            commands = [cmd.strip() for cmd in sql_script.split(';') if cmd.strip()]
            for cmd in commands:
                # Remove leading/trailing whitespace but keep internal structure
                clean_cmd = cmd.strip()
                if not clean_cmd:
                    continue
                
                # If the command is ONLY comments, skip it. 
                # Otherwise, execute the whole block.
                lines = [l.strip() for l in clean_cmd.split('\n') if l.strip()]
                if all(l.startswith('--') for l in lines):
                    continue

                try:
                    conn.execute(text(clean_cmd))
                except Exception as ex:
                    print(f"FAILED COMMAND: {clean_cmd[:100]}...")
                    raise ex
        print("DATABASE SUCCESS: GCP Database schema initialized successfully!")
    except Exception as e:
        print(f"DATABASE ERROR: {str(e)}")

if __name__ == "__main__":
    run_init()
