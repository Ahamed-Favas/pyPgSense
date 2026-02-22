import * as vscode from 'vscode';

import { createPythonParser, extractSqlStatements } from '../sql/inlineSql';

export class InlineSqlCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private readonly parser = createPythonParser();
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

	public readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (document.languageId !== 'python') {
			return [];
		}

		const statements = extractSqlStatements(document, this.parser);
		return statements.map((statement) => {
			return new vscode.CodeLens(statement.range, {
				title: 'Open SQL',
				command: 'pypgsense.openInlineSql',
				arguments: [statement.content],
			});
		});
	}

	public refresh(): void {
		this.onDidChangeEmitter.fire();
	}

	public dispose(): void {
		this.onDidChangeEmitter.dispose();
	}
}
