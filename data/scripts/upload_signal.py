import pandas as pd
from supabase import create_client
import os
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def upload_signal_data():
    """Upload signal data from CSV to Supabase"""
    
    # Read CSV file
    print("Reading CSV file...")
    df = pd.read_csv('../signal/signal.csv')
    
    # Select only required columns: symbol, signal, created_at
    df = df[['symbol', 'signal', 'created_at']].copy()
    
    # Convert created_at to datetime
    df['created_at'] = pd.to_datetime(df['created_at'])
    
    # Filter out rows with empty created_at
    df = df[df['created_at'].notna()]
    
    # Ensure signal is lowercase
    df['signal'] = df['signal'].str.lower()
    
    # Filter only valid signals (buy or sell)
    df = df[df['signal'].isin(['buy', 'sell'])]
    
    # Convert DataFrame to list of dictionaries
    records = df.to_dict('records')
    
    # Convert datetime to ISO format string for Supabase
    for record in records:
        if isinstance(record['created_at'], pd.Timestamp):
            record['created_at'] = record['created_at'].isoformat()
    
    print(f"Total records to upload: {len(records)}")
    print(f"Sample record: {records[0] if records else 'No records'}")
    
    # Upload in batches (Supabase has limits on batch size)
    batch_size = 1000
    total_uploaded = 0
    
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        
        try:
            # Insert batch (upsert to handle duplicates)
            result = supabase.table('signals').upsert(
                batch,
                on_conflict='symbol,created_at'
            ).execute()
            total_uploaded += len(batch)
            print(f"Uploaded {total_uploaded}/{len(records)} records ({(total_uploaded/len(records)*100):.1f}%)")
            
        except Exception as e:
            print(f"Error uploading batch {i//batch_size + 1}: {e}")
            print(f"Batch start index: {i}")
            # Try inserting without upsert if upsert fails
            try:
                result = supabase.table('signals').insert(batch).execute()
                total_uploaded += len(batch)
                print(f"Uploaded {total_uploaded}/{len(records)} records (insert mode)")
            except Exception as e2:
                print(f"Error with insert: {e2}")
                # Continue with next batch
                continue
    
    print(f"\n✅ Upload complete! Total records uploaded: {total_uploaded}")

if __name__ == "__main__":
    upload_signal_data()

