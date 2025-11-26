import pandas as pd
from supabase import create_client
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def upload_ohlcv_data():
    """Upload OHLCV data from CSV to Supabase"""
    
    # Read CSV file (from parent directory's output folder)
    print("Reading CSV file...")
    df = pd.read_csv('../output/xrpusdt_1m_ohlcv_2025.csv')
    
    # Rename columns to match database schema (snake_case)
    df.columns = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time']
    
    # Convert DataFrame to list of dictionaries
    records = df.to_dict('records')
    
    print(f"Total records to upload: {len(records)}")
    
    # Upload in batches (Supabase has limits on batch size)
    batch_size = 1000
    total_uploaded = 0
    
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        
        try:
            # Insert batch
            result = supabase.table('xrpusdt_1m_ohlcv').upsert(batch).execute()
            total_uploaded += len(batch)
            print(f"Uploaded {total_uploaded}/{len(records)} records ({(total_uploaded/len(records)*100):.1f}%)")
            
        except Exception as e:
            print(f"Error uploading batch {i//batch_size + 1}: {e}")
            # Continue with next batch
            continue
    
    print(f"\n✅ Upload complete! Total records uploaded: {total_uploaded}")

if __name__ == "__main__":
    upload_ohlcv_data()
