# XRP Futures Backtester

## Prerequisites

*   **Node.js**: v22.13.1
*   **Yarn**: v1.22.22
*   **Python**: 3.13.3

## Setup

### 1. Web (Next.js)

Navigate to the `web` directory and set up the environment:

```bash
cd web
cp env.example .env.local
yarn install
yarn dev
```

### 2. Data (Python)

Navigate to the `data` directory and set up the environment:

```bash
cd data
cp env.example .env
python3 -m venv venv
source venv/bin/activate
pip install -r req.txt
```

### 3. Supabase Database Setup

#### 3.1 Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Fill in project details:
   - Project name: `xrp-futures-backtester` (or your preferred name)
   - Database password: Choose a strong password
   - Region: Select closest to your location
4. Click **Create new project** and wait for setup to complete

#### 3.2 Get Supabase Credentials

1. In your project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL**: `https://[project-id].supabase.co`
   - **anon public key**: Found under "Project API keys"

#### 3.3 Create Database Tables

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **New query**
3. Copy and paste the contents of `data/sql/create_ohlcv_table.sql`
4. Click **Run** to create the table

Alternatively, you can use the Supabase CLI or MCP if configured.

#### 3.4 (Optional) Load Sample Data

If you have OHLCV CSV data to import:

```bash
cd data
source venv/bin/activate

# Update environment variables
export SUPABASE_URL=your_supabase_url
export SUPABASE_ANON_KEY=your_anon_key

# Run upload script
python scripts/upload_ohlcv.py
```

### 4. MCP (Model Context Protocol)

To set up the Model Context Protocol (MCP) for Supabase integration:

1.  Copy the example configuration file:
    ```bash
    cp .vscode/mcp.example.json .vscode/mcp.json
    ```

2.  Open `.vscode/mcp.json` and fill in the following values:
    *   `SUPABASE_URL`: Your Supabase project URL (from step 3.2)
    *   `SUPABASE_KEY`: Your Supabase Anon Key (from step 3.2)
    *   `SUPABASE_ACCESS_TOKEN`: Your Supabase Personal Access Token (PAT). You can generate one [here](https://supabase.com/dashboard/account/tokens)
    *   `GITHUB_PERSONAL_ACCESS_TOKEN`: Your GitHub Personal Access Token (PAT). Required for the `github` server

3.  Update your environment files:
    
    **For web (`web/.env.local`):**
    ```bash
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
    ```
    
    **For data scripts (`data/.env`):**
    ```bash
    SUPABASE_URL=your_supabase_url
    SUPABASE_ANON_KEY=your_anon_key
    ```

### Available MCP Servers

*   **supabase**: Project management (tables, migrations, etc.)
*   **next-devtools**: Next.js runtime analysis
*   **supabase-data**: Direct database manipulation (PostgREST)
*   **github**: GitHub repository integration

> **Note:** `.vscode/mcp.json` and `.env` files are gitignored to prevent accidental exposure of your secrets.
