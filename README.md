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

### 3. MCP (Supabase)

To set up the Model Context Protocol (MCP) for Supabase integration:

1.  Copy the example configuration file:
    ```bash
    cp .vscode/mcp.example.json .vscode/mcp.json
    ```

2.  Open `.vscode/mcp.json` and fill in the following values:
    *   `SUPABASE_URL`: Your Supabase project URL.
    *   `SUPABASE_KEY`: Your Supabase Anon Key.
    *   `SUPABASE_ACCESS_TOKEN`: Your Supabase Personal Access Token (PAT). You can generate one [here](https://supabase.com/dashboard/account/tokens).

### Available MCP Servers

*   **supabase**: Project management (tables, etc.).
*   **next-devtools**: Next.js runtime analysis.
*   **supabase-data**: Direct database manipulation (PostgREST).
*   **github**: GitHub repository integration.

> **Note:** `.vscode/mcp.json` is gitignored to prevent accidental exposure of your secrets.
