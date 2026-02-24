import * as vscode from 'vscode';
import { Client, QueryResult } from 'pg';

import { PARAMETER_TYPE_ERROR_CODES, SCHEMA_CACHE_TTL_MS } from '../constants/sql';
import {
	asConnectionFormResult,
	buildConnectionString,
	parseConnectionString,
	renderConnectionFormHtml,
	validateConnectionForm,
} from '../sql/connectionForm';
import { renderErrorHtml, renderResultHtml } from '../sql/resultHtml';
import {
	ConnectionFormResult,
	ConnectionFormValues,
	PgLikeError,
	SchemaRow,
	SchemaSnapshot,
	SchemaTable,
	SqlValidationResult,
} from '../sql/types';

export class PostgresSqlService implements vscode.Disposable {
	private static readonly secretKey = 'pypgsense.postgres.connectionString';
	private panel: vscode.WebviewPanel | undefined;
	private schemaCache: SchemaSnapshot | undefined;
	private schemaRefreshInFlight: Promise<SchemaSnapshot | undefined> | undefined;
	private lastSchemaRefreshFailureAt = 0;

	public constructor(private readonly context: vscode.ExtensionContext) {}

	public async setConnectionString(): Promise<void> {
		let initial = await this.getConnectionFormValues();

		while (true) {
			const formResult = await this.showConnectionForm(initial);
			if (!formResult) {
				return;
			}

			if (formResult.kind === 'clear') {
				await this.clearConnection();
				void vscode.window.showInformationMessage('PostgreSQL connection string removed.');
				return;
			}

			const validationError = await this.saveConnectionFromValues(formResult.values);
			if (validationError) {
				initial = formResult.values;
				void vscode.window.showErrorMessage(validationError);
				continue;
			}

			void vscode.window.showInformationMessage('PostgreSQL connection string saved.');
			return;
		}
	}

	public async getConnectionFormValues(): Promise<ConnectionFormValues> {
		const existing =
			(await this.context.secrets.get(PostgresSqlService.secretKey)) ??
			vscode.workspace.getConfiguration('pypgsense').get<string>('postgres.connectionString') ??
			'';
		return parseConnectionString(existing);
	}

	public async clearConnection(): Promise<void> {
		await this.context.secrets.delete(PostgresSqlService.secretKey);
		this.schemaCache = undefined;
	}

	public async saveConnectionFromValues(values: ConnectionFormValues): Promise<string | undefined> {
		const validationError = validateConnectionForm(values);
		if (validationError) {
			return validationError;
		}

		const connectionString = buildConnectionString(values);
		await this.context.secrets.store(PostgresSqlService.secretKey, connectionString);
		this.schemaCache = undefined;
		return undefined;
	}

	public async testConnection(values: ConnectionFormValues): Promise<void> {
		const validationError = validateConnectionForm(values);
		if (validationError) {
			void vscode.window.showErrorMessage(validationError);
			return;
		}

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Testing PostgreSQL connection',
				cancellable: false,
			},
			async () => {
				const error = await runTestQuery(buildConnectionString(values));
				if (error) {
					void vscode.window.showErrorMessage(`Connection failed: ${error}`);
				} else {
					void vscode.window.showInformationMessage('Connection successful.');
				}
			}
		);
	}

	public async runFromActiveEditor(): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			void vscode.window.showWarningMessage('No active editor found.');
			return;
		}

		if (editor.document.languageId !== 'sql') {
			void vscode.window.showWarningMessage('Open a SQL editor and run the command again.');
			return;
		}

		const sql = getSelectedSql(editor);
		if (!sql.trim()) {
			void vscode.window.showWarningMessage('No SQL selected. Select SQL text or use a non-empty SQL document.');
			return;
		}

		const connectionString = await this.getConnectionString(true);
		if (!connectionString) {
			return;
		}

		const startedAt = Date.now();
		try {
			const result = await this.runQuery<Record<string, unknown>>(connectionString, sql);
			const durationMs = Date.now() - startedAt;
			this.renderSuccess(sql, result, durationMs);
		} catch (error) {
			const durationMs = Date.now() - startedAt;
			this.renderError(sql, error, durationMs);
		}
	}

	public async validateSql(sql: string, interactive: boolean): Promise<SqlValidationResult> {
		const statement = normalizeForValidation(sql);
		if (!statement) {
			return { kind: 'skipped' };
		}

		const connectionString = await this.getConnectionString(interactive);
		if (!connectionString) {
			return { kind: 'skipped' };
		}

		const statementName = `sqllens_lint_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
		const client = new Client({ connectionString });

		try {
			await client.connect();
			await client.query(`PREPARE ${statementName} AS ${statement}`);
			await client.query(`DEALLOCATE ${statementName}`);
			return { kind: 'ok' };
		} catch (error) {
			const pgError = asPgError(error);
			if (pgError.code && PARAMETER_TYPE_ERROR_CODES.has(pgError.code)) {
				return { kind: 'skipped' };
			}

			return {
				kind: 'error',
				message: pgError.message ?? String(error),
				position: parsePgPosition(pgError.position),
				code: pgError.code,
			};
		} finally {
			await safeCloseClient(client);
		}
	}

	public async getSchemaSnapshot(
		forceRefresh: boolean,
		interactive: boolean
	): Promise<SchemaSnapshot | undefined> {
		if (!forceRefresh && this.schemaCache && Date.now() - this.schemaCache.refreshedAt < SCHEMA_CACHE_TTL_MS) {
			return this.schemaCache;
		}

		if (!forceRefresh && this.schemaRefreshInFlight) {
			return this.schemaRefreshInFlight;
		}

		if (
			!forceRefresh &&
			!interactive &&
			!this.schemaCache &&
			Date.now() - this.lastSchemaRefreshFailureAt < 30_000
		) {
			return undefined;
		}

		this.schemaRefreshInFlight = this.loadSchema(forceRefresh, interactive);
		try {
			const snapshot = await this.schemaRefreshInFlight;
			return snapshot ?? this.schemaCache;
		} finally {
			this.schemaRefreshInFlight = undefined;
		}
	}

	public async refreshSchemaCache(interactive: boolean): Promise<void> {
		const snapshot = await this.getSchemaSnapshot(true, interactive);
		if (!snapshot || !interactive) {
			return;
		}
		void vscode.window.showInformationMessage(
			`SQL schema cache refreshed (${snapshot.tables.length} tables/views).`
		);
	}

	public dispose(): void {
		this.panel?.dispose();
	}

	private async loadSchema(
		forceRefresh: boolean,
		interactive: boolean
	): Promise<SchemaSnapshot | undefined> {
		const connectionString = await this.getConnectionString(interactive);
		if (!connectionString) {
			return this.schemaCache;
		}

		const schemaQuery = `
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position
`;

		try {
			const result = await this.runQuery<SchemaRow>(connectionString, schemaQuery);
			const snapshot = buildSchemaSnapshot(result.rows);
			this.schemaCache = snapshot;
			return snapshot;
		} catch (error) {
			this.lastSchemaRefreshFailureAt = Date.now();
			if (interactive || forceRefresh) {
				const message = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Failed to refresh SQL schema cache: ${message}`);
			}
			return this.schemaCache;
		}
	}

	private async getConnectionString(interactive: boolean): Promise<string | undefined> {
		const secretValue = await this.context.secrets.get(PostgresSqlService.secretKey);
		if (secretValue && secretValue.trim()) {
			return secretValue.trim();
		}

		const configValue = vscode.workspace
			.getConfiguration('pypgsense')
			.get<string>('postgres.connectionString');
		if (configValue && configValue.trim()) {
			return configValue.trim();
		}

		if (!interactive) {
			return undefined;
		}

		const choice = await vscode.window.showWarningMessage(
			'PostgreSQL connection string is not configured.',
			'Set Connection'
		);
		if (choice === 'Set Connection') {
			await this.setConnectionString();
			const updated = await this.context.secrets.get(PostgresSqlService.secretKey);
			if (updated && updated.trim()) {
				return updated.trim();
			}
		}

		return undefined;
	}

	private async runQuery<T extends Record<string, unknown>>(
		connectionString: string,
		sql: string
	): Promise<QueryResult<T>> {
		const client = new Client({ connectionString });
		try {
			await client.connect();
			return await client.query<T>(sql);
		} finally {
			await safeCloseClient(client);
		}
	}

	private renderSuccess(sql: string, result: QueryResult<Record<string, unknown>>, durationMs: number): void {
		const panel = this.ensurePanel();
		panel.webview.html = renderResultHtml({
			sql,
			durationMs,
			command: result.command,
			rowCount: result.rowCount ?? 0,
			rows: result.rows as Record<string, unknown>[],
		});
	}

	private renderError(sql: string, error: unknown, durationMs: number): void {
		const panel = this.ensurePanel();
		const message = error instanceof Error ? error.message : String(error);
		panel.webview.html = renderErrorHtml(sql, message, durationMs);
	}

	private ensurePanel(): vscode.WebviewPanel {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside, true);
			return this.panel;
		}

		this.panel = vscode.window.createWebviewPanel(
			'pypgsense.sqlResults',
			'SQL Results',
			vscode.ViewColumn.Beside,
			{
				enableFindWidget: true,
			}
		);

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});

		return this.panel;
	}

	private async showConnectionForm(
		initialValues: ConnectionFormValues
	): Promise<ConnectionFormResult | undefined> {
		const panel = vscode.window.createWebviewPanel(
			'pypgsense.postgresConnectionForm',
			'PostgreSQL Connection',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
			}
		);

		panel.webview.html = renderConnectionFormHtml(initialValues);

		return await new Promise<ConnectionFormResult | undefined>((resolve) => {
			let settled = false;

			const settle = (result: ConnectionFormResult | undefined): void => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(result);
			};

			const messageDisposable = panel.webview.onDidReceiveMessage(async (message: unknown) => {
				const parsed = asConnectionFormResult(message);
				if (!parsed) {
					return;
				}
				if (parsed.kind === 'test') {
					await this.testConnection(parsed.values);
					return;
				}
				settle(parsed);
				panel.dispose();
			});

			panel.onDidDispose(() => {
				messageDisposable.dispose();
				settle(undefined);
			});
		});
	}
}

async function runTestQuery(connectionString: string): Promise<string | undefined> {
	const timeoutMs = 15_000;
	const client = new Client({
		connectionString,
		connectionTimeoutMillis: timeoutMs,
		query_timeout: timeoutMs,
	});
	try {
		await client.connect();
		await client.query('SELECT 1');
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	} finally {
		await safeCloseClient(client);
	}
}

function normalizeForValidation(sql: string): string | undefined {
	let normalized = sql.trim();
	if (!normalized) {
		return undefined;
	}

	normalized = normalized.replace(/;\s*$/, '').trim();
	if (!normalized) {
		return undefined;
	}

	if (normalized.includes(';')) {
		return undefined;
	}

	return normalized;
}

function parsePgPosition(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function asPgError(error: unknown): PgLikeError {
	if (error && typeof error === 'object') {
		return error as PgLikeError;
	}
	return { message: String(error) };
}

async function safeCloseClient(client: Client): Promise<void> {
	try {
		await client.end();
	} catch {
		// Ignore close failures for partially-open sessions.
	}
}

function getSelectedSql(editor: vscode.TextEditor): string {
	const selection = editor.selection;
	if (!selection.isEmpty) {
		return editor.document.getText(selection);
	}
	return editor.document.getText();
}

function buildSchemaSnapshot(rows: SchemaRow[]): SchemaSnapshot {
	const byQualified = new Map<string, SchemaTable>();
	const byName = new Map<string, SchemaTable[]>();

	for (const row of rows) {
		const schema = normalizeIdentifier(row.table_schema);
		const table = normalizeIdentifier(row.table_name);
		const qualifiedName = `${schema}.${table}`;
		const column = row.column_name;

		let existing = byQualified.get(qualifiedName);
		if (!existing) {
			existing = {
				schema,
				name: table,
				qualifiedName,
				columns: [],
			};
			byQualified.set(qualifiedName, existing);

			const current = byName.get(table) ?? [];
			current.push(existing);
			byName.set(table, current);
		}

		if (!existing.columns.includes(column)) {
			existing.columns.push(column);
		}
	}

	return {
		tables: [...byQualified.values()],
		byQualified,
		byName,
		refreshedAt: Date.now(),
	};
}

function normalizeIdentifier(identifier: string): string {
	return identifier.trim().replace(/^"+|"+$/g, '').toLowerCase();
}
