import pandas as pd
from datetime import datetime

def format_signal_csv():
    """Format signal CSV for Supabase import"""
    
    # Read original CSV
    print("Reading original CSV file...")
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
    
    # Format created_at to ISO format with timezone (Supabase expects TIMESTAMP WITH TIME ZONE)
    # Format: YYYY-MM-DD HH:MM:SS+00:00
    df['created_at'] = df['created_at'].dt.strftime('%Y-%m-%d %H:%M:%S%z')
    
    # If timezone is not present, add +00:00
    df['created_at'] = df['created_at'].apply(
        lambda x: x if '+' in x or x.endswith('Z') else x + '+00:00'
    )
    
    # Remove timezone offset format and use standard format
    # Convert to ISO format: YYYY-MM-DD HH:MM:SS+00:00
    df['created_at'] = pd.to_datetime(df['created_at']).dt.strftime('%Y-%m-%d %H:%M:%S+00:00')
    
    # Remove duplicates based on (symbol, created_at) - keep first occurrence
    print(f"Records before removing duplicates: {len(df)}")
    df = df.drop_duplicates(subset=['symbol', 'created_at'], keep='first')
    print(f"Records after removing duplicates: {len(df)}")
    
    # Sort by created_at for better organization
    df = df.sort_values('created_at').reset_index(drop=True)
    
    # Save formatted CSV
    output_path = '../signal/signal_formatted.csv'
    df.to_csv(output_path, index=False)
    
    print(f"✅ Formatted CSV saved to: {output_path}")
    print(f"Total records: {len(df)}")
    print(f"\nSample data:")
    print(df.head(10).to_string())
    print(f"\nColumn names: {list(df.columns)}")
    print(f"\nData types:")
    print(df.dtypes)
    
    # Check for remaining duplicates
    duplicates = df.duplicated(subset=['symbol', 'created_at']).sum()
    if duplicates > 0:
        print(f"\n⚠️  Warning: {duplicates} duplicates still found!")
    else:
        print(f"\n✅ No duplicates found - ready for import!")
    
    return output_path

if __name__ == "__main__":
    format_signal_csv()

