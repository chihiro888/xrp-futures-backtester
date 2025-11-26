import psycopg2
import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

try:
    print("Attempting to connect to the database...")
    # Use keyword arguments to avoid parsing issues with special characters in password
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT")
    )
    print("Connection successful!")
    
    # Create a cursor object
    cur = conn.cursor()
    
    # Execute a query
    cur.execute("SELECT version();")
    
    # Retrieve query results
    record = cur.fetchone()
    print("You are connected to - ", record, "\n")
    
    # Close communication with the database
    cur.close()
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f"Unable to connect to the database.\n{e}")
    sys.exit(1)
