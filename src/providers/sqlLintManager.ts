import * as vscode from 'vscode';

import { PostgresSqlService } from '../services/postgresSqlService';

export class SqlLintManager implements vscode.Disposable {
	private readonly diagnostics = vscode.languages.createDiagnosticCollection('pypgsense.sqlLint');
	private readonly timers = new Map<string, NodeJS.Timeout>();

	public constructor(private readonly sqlService: PostgresSqlService) {}

	public schedule(document: vscode.TextDocument): void {
		if (document.languageId !== 'sql') {
			return;
		}

		const key = document.uri.toString();
		const existing = this.timers.get(key);
		if (existing) {
			clearTimeout(existing);
		}

		const version = document.version;
		const timer = setTimeout(() => {
			void this.lintDocument(document, version);
		}, 450);
		this.timers.set(key, timer);
	}

	public clear(uri: vscode.Uri): void {
		const key = uri.toString();
		const timer = this.timers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(key);
		}
		this.diagnostics.delete(uri);
	}

	public dispose(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.diagnostics.dispose();
	}

	private async lintDocument(document: vscode.TextDocument, version: number): Promise<void> {
		this.timers.delete(document.uri.toString());
		if (document.isClosed || document.version !== version) {
			return;
		}

		const sql = document.getText();
		if (!sql.trim()) {
			this.diagnostics.delete(document.uri);
			return;
		}

		const result = await this.sqlService.validateSql(sql, false);
		if (document.isClosed || document.version !== version) {
			return;
		}

		if (result.kind !== 'error') {
			this.diagnostics.delete(document.uri);
			return;
		}

		const range = toDiagnosticRange(document, result.position);
		const diagnostic = new vscode.Diagnostic(range, result.message, vscode.DiagnosticSeverity.Error);
		diagnostic.source = 'PostgreSQL';
		if (result.code) {
			diagnostic.code = result.code;
		}
		this.diagnostics.set(document.uri, [diagnostic]);
	}
}

function toDiagnosticRange(document: vscode.TextDocument, position?: number): vscode.Range {
	if (!position || Number.isNaN(position)) {
		const line = document.lineAt(0);
		return new vscode.Range(new vscode.Position(0, 0), line.range.end);
	}

	const text = document.getText();
	const offset = Math.max(0, Math.min(text.length, position - 1));
	const start = document.positionAt(offset);
	const line = document.lineAt(start.line);
	const endCharacter = Math.min(line.range.end.character, start.character + 1);
	const end = new vscode.Position(start.line, endCharacter);
	return new vscode.Range(start, end);
}
