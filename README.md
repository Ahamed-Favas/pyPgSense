# pyPgSense

PostgreSQL-aware SQL tooling for Python strings and SQL files in VS Code.

## Features

- Detects SQL-like strings in Python assignments and call arguments using tree-sitter and heuristics.
- Adds an "Open SQL" CodeLens on detected inline SQL to open a SQL editor side-by-side.
- Syntax highlighting for common inline SQL patterns in Python (for example `query`/`sql`/`statement` assignments and `execute`/`fetch` call arguments).
- SQL completions (keywords, tables, columns) in SQL files and inside detected Python SQL strings.
- DB-backed SQL linting for SQL editors via `PREPARE`, with diagnostics shown in Problems.
- Run selected SQL from a SQL editor and view results in a webview.
- Connection management via the pyPgSense sidebar or the command palette, stored in Secret Storage.

## Quick Start

1. Open any Python or SQL file to activate the extension.
2. Run `pyPgSense: Set PostgreSQL Connection` or open the pyPgSense view and save connection details.
3. In Python, write a SQL string and use the `Open SQL` CodeLens to open it as a SQL document.
4. Use completions and `pyPgSense: Run Selected SQL` from a SQL editor. Linting runs automatically on SQL documents.

## Commands

- `pyPgSense: Open Inline SQL` - Open detected inline SQL in a side-by-side SQL editor.
- `pyPgSense: Run Selected SQL` - Execute the current selection or entire SQL document and show results.
- `pyPgSense: Set PostgreSQL Connection` - Save or clear the connection string.
- `pyPgSense: Refresh SQL Schema Cache` - Reload tables and columns from PostgreSQL.

## Settings

- `pypgsense.postgres.connectionString`: Optional connection string used by `Run Selected SQL` and schema/linting. Prefer the command so it is stored in Secret Storage.

## How Inline SQL Is Detected

- SQL-like text is extracted from Python assignments and the first argument of function calls.
- Detection is heuristic and based on SQL keywords; it may miss or include strings in edge cases.
- For syntax highlighting inside Python, only a set of common variable names and call patterns are injected.

## Requirements

- A reachable PostgreSQL database for schema-aware completions, linting, and query execution.
- VS Code 1.109.0 or later.

## Release Notes

### 0.0.1

Initial release.
