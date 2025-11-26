import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Read SQL file (from parent directory's sql folder)
with open('../sql/create_ohlcv_table.sql', 'r') as f:
    sql_content = f.read()

# Execute SQL
print("Creating table...")
try:
    result = supabase.rpc('exec_sql', {'sql': sql_content}).execute()
    print("✅ Table created successfully!")
except Exception as e:
    print(f"❌ Error creating table: {e}")
    print("\n⚠️  Please run the SQL manually in Supabase SQL Editor:")
    print("1. Go to Supabase Dashboard → SQL Editor")
    print("2. Copy and paste the contents of create_ohlcv_table.sql")
    print("3. Click 'Run'")
