# Publishing to npm

This guide explains how to publish the `sqlanywhere-mcp-server` to the npm registry.

## 1. Prerequisites

- An [npm account](https://www.npmjs.com/signup).
- Node.js and npm installed locally.
- A functional build of the project.

## 2. Configuration Check

The `package.json` has been pre-configured with the following for optimal publishing:

- **`bin`**: Allows the server to be run via `npx sqlanywhere-mcp-server`.
- **`files`**: Whitelists only the `dist` directory to be included in the package.
- **`prepublishOnly`**: Automatically runs `npm run build` before publishing.

## 3. Publishing Workflow

### Step 1: Login to npm
Open your terminal and run:
```bash
npm login
```
Follow the prompts to authenticate via your browser.

### Step 2: Update Version
Before publishing an update, you must increment the version number. You can do this manually in `package.json` or use the `npm version` command:

- **Patch release** (bug fixes): `1.0.0` -> `1.0.1`
  ```bash
  npm version patch
  ```
- **Minor release** (new features, non-breaking): `1.0.1` -> `1.1.0`
  ```bash
  npm version minor
  ```
- **Major release** (breaking changes): `1.1.0` -> `2.0.0`
  ```bash
  npm version major
  ```

*Note: Running `npm version` will also create a git commit and tag if you are in a git repository.*

### Step 3: Dry Run (Optional)
To see exactly what will be published without actually uploading:
```bash
npm publish --dry-run
```

### Step 4: Publish
Run the following command to publish:
```bash
npm publish
```

> [!TIP]
> If you are publishing a scoped package (e.g., `@your-username/sqlanywhere-mcp-server`) for the first time, you must use:
> ```bash
> npm publish --access public
> ```

## 4. Runtime Modes and Configuration

The server supports two runtime modes: **Local stdio** and **Remote HTTP**.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SQLANYWHERE_CONN_STR` | ODBC connection string. **Required always.** | - |
| `SQLANYWHERE_AUTHORIZED_USERS` | Comma-separated list of allowed DB usernames. | `monitor, ExtensionsUser` |
| `MCP_TRANSPORT` | Transport mode: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_HOST` | Host to bind the HTTP server. | `127.0.0.1` |
| `MCP_HTTP_PORT` | Port for the HTTP server. | `3100` |
| `MCP_HTTP_PATH` | Endpoint path for MCP. | `/mcp` |
| `MCP_HTTP_BEARER_TOKEN` | Bearer token for authentication. **Required in http mode.** | - |

### Windows-Only ODBC Assumption
The SQL Anywhere ODBC driver must be installed on the Windows host where the server runs. This server uses the `odbc` package to connect to the database. Linux or macOS clients connecting via HTTP do not need the ODBC driver installed locally.

## 5. Usage Modes

### Local stdio Mode (Default)
This mode is ideal for local use. No network configuration or bearer token is required.

#### Using npx directly
```bash
export SQLANYWHERE_CONN_STR="Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;"
npx sqlanywhere-mcp-server
```

#### Adding to mcp-server-config.json
```json
{
  "mcpServers": {
    "sqlanywhere": {
      "command": "npx",
      "args": ["-y", "sqlanywhere-mcp-server"],
      "env": {
        "SQLANYWHERE_CONN_STR": "YOUR_CONNECTION_STRING_HERE"
      }
    }
  }
}
```

### Remote HTTP Mode
This mode allows the server to run as a persistent service, typically on a Windows host with the ODBC driver, while clients connect remotely.

#### Starting the Server on Windows
```powershell
$env:MCP_TRANSPORT="http"
$env:MCP_HTTP_BEARER_TOKEN="your-secure-token"
$env:SQLANYWHERE_CONN_STR="Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;"
npx sqlanywhere-mcp-server
```

#### Client Connection
Agents or clients connect via the MCP URL: `http://<windows-host>:3100/mcp`. Authentication is performed via the `Authorization: Bearer <token>` header.

#### Security Considerations
The server does not provide in-process TLS. For production use or remote access over public networks, deploy the server behind a trusted reverse proxy (like Nginx or Caddy) to handle TLS termination, or use a secure VPN/network.

## 6. Smoke Testing

The package includes four smoke test scripts for verification:

- `npm run smoke:stdio:mock`: Test stdio transport with mock database (no live DB required).
- `npm run smoke:http:mock`: Test HTTP transport with mock database (no live DB required).
- `npm run smoke:stdio:live`: Test stdio transport with a live SQL Anywhere database.
- `npm run smoke:http:live`: Test HTTP transport with a live SQL Anywhere database.

The live smoke scripts require `RUN_SQLANYWHERE_LIVE_SMOKE=1` to be set, along with a valid `SQLANYWHERE_CONN_STR`. Without this env var they exit cleanly with a skip message. Example:

```bash
RUN_SQLANYWHERE_LIVE_SMOKE=1 \
  SQLANYWHERE_CONN_STR="Driver={SQL Anywhere 17};Server=myServer;Database=myDB;Uid=dba;Pwd=sql;" \
  MCP_HTTP_BEARER_TOKEN="your-secure-token" \
  npm run smoke:http:live
```
