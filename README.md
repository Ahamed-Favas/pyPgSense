<p align="center">
  <img src="resources/pypgsense.png" alt="pyPgSense logo" width="120" />
</p>

# pyPgSense

<p align="center">
  <strong>PostgreSQL-aware SQL tooling for Python strings and SQL files in VS Code</strong>
</p>

<p align="center">
  <a href="./package.json"><img alt="Version" src="https://img.shields.io/badge/version-0.0.3-1f6feb" /></a>
  <a href="https://code.visualstudio.com/"><img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.109.0-007acc" /></a>
  <a href="./LICENSE.md"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2da44e" /></a>
</p>

`pyPgSense` helps you move faster when SQL lives inside Python code. It detects SQL-like strings, opens them in a dedicated SQL editor, and adds PostgreSQL-aware completion, validation, and execution workflows.

## Why pyPgSense

- Detect inline SQL in Python assignments and call arguments.
- Open detected SQL with an `Open SQL` CodeLens for focused editing.
- Get SQL syntax highlighting inside common Python SQL string patterns.
- Receive keyword, table, and column completions from your PostgreSQL schema.
- Validate SQL docs against PostgreSQL using `PREPARE` diagnostics.
- Run selected SQL and inspect results in a side-by-side webview.
- Manage connections from a dedicated sidebar view, saved securely in VS Code Secret Storage.

## Quick Start

1. Open a Python or SQL file in VS Code.
2. Configure your database with `pyPgSense: Set PostgreSQL Connection` or from the `pyPgSense` sidebar connection form.
3. In Python, place SQL in a string that pyPgSense can detect.
4. Click `Open SQL` CodeLens to open that SQL in a SQL editor.
5. Use `pyPgSense: Run Selected SQL` to execute selection/full SQL and review results.
6. SQL diagnostics run automatically for SQL documents.

## Example Workflow

### Python file

```python
query = """
SELECT id, email
FROM users
WHERE active = true
"""
```

Open the SQL via the `Open SQL` CodeLens, then use completion, linting, and run commands in the SQL editor.

## Command Reference

| Command | Purpose |
| --- | --- |
| `pyPgSense: Open Inline SQL` | Opens detected inline SQL in a side-by-side SQL editor. |
| `pyPgSense: Run SQL` | Executes selected SQL (or full document if nothing is selected). |
| `pyPgSense: Set PostgreSQL Connection` | Saves, tests, or clears PostgreSQL connection details. |
| `pyPgSense: Refresh Schema` | Reloads tables/columns used for schema-aware completions. |


## Settings

| Setting | Description |
| --- | --- |
| `pypgsense.postgres.connectionString` | Optional fallback connection string. Prefer the command/UI so credentials are saved in Secret Storage. |

## Inline SQL Detection Rules

pyPgSense currently detects SQL-like text from:

- Right-hand side of Python `assignment` and `annotated_assignment` nodes.
- First argument of Python function calls.
- Heuristic SQL checks (SQL keyword/context matching) to reduce false positives.

## Current Scope

- SQL linting and execution are applied to SQL editors, including docs opened via `Open SQL`.
- SQL syntax injection in Python includes assignments to `query`, `sql`, `statement`, `stmt`, and `raw_sql`.
- SQL syntax injection in Python includes calls like `execute(...)`, `executemany(...)`, `fetch(...)`, `fetchrow(...)`, `fetchval(...)`, `fetchone(...)`, and `fetchall(...)`.
- Editing in the opened SQL document does not write changes back into the original Python string.

## Requirements

- VS Code `^1.97.1`
- A reachable PostgreSQL database for schema-aware completion, linting, and execution

## Development

```bash
npm install
npm run compile
```

Useful scripts:

- `npm run watch` - TypeScript watch mode
- `npm run lint` - ESLint
- `npm test` - VS Code extension tests

## Project Links

- Repository: [github.com/ahamed-Favas/pyPgSense](https://github.com/ahamed-Favas/pyPgSense)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- License: [LICENSE.md](./LICENSE.md)
