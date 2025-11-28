import os
from dotenv import load_dotenv
from supabase import create_client
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")  # Direct database connection URL

def create_signal_table():
    """Create signal table in Supabase"""
    
    # Read SQL file
    sql_file_path = '../sql/create_signal_table.sql'
    print(f"Reading SQL file: {sql_file_path}")
    
    with open(sql_file_path, 'r') as f:
        sql_content = f.read()
    
    # Try using direct database connection if available
    if SUPABASE_DB_URL:
        try:
            print("Connecting to database...")
            conn = psycopg2.connect(SUPABASE_DB_URL)
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor = conn.cursor()
            
            # Execute SQL statements
            print("Creating table...")
            cursor.execute(sql_content)
            
            cursor.close()
            conn.close()
            
            print("✅ Table created successfully!")
            return True
            
        except Exception as e:
            print(f"❌ Error creating table with direct connection: {e}")
            print("\n⚠️  Trying alternative method...")
    
    # Alternative: Use Supabase client (may require RPC function)
    print("\n⚠️  Direct database connection not available.")
    print("Please run the SQL manually in Supabase SQL Editor:")
    print("1. Go to Supabase Dashboard → SQL Editor")
    print("2. Copy and paste the contents of create_signal_table.sql")
    print("3. Click 'Run'")
    print("\nSQL content:")
    print("=" * 50)
    print(sql_content)
    print("=" * 50)
    
    return False

if __name__ == "__main__":
    create_signal_table()

