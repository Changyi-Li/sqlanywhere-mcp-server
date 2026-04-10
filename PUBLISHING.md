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

## 4. Usage After Publishing

Once published, users can run your MCP server directly using:

```bash
npx sqlanywhere-mcp-server
```

Or they can add it to their `mcp-server-config.json`:

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
