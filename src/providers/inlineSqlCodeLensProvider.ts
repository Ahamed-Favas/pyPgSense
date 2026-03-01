import * as vscode from 'vscode';

import { createPythonParser, extractSqlStatements } from '../sql/inlineSql';

export class InlineSqlCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private readonly parserPromise: ReturnType<typeof createPythonParser>;
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

	public readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

	public constructor(extensionPath: string) {
		this.parserPromise = createPythonParser(extensionPath);
	}

	public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		if (document.languageId !== 'python') {
			return [];
		}

		const parser = await this.parserPromise;
		const statements = extractSqlStatements(document, parser);
		return statements.map((statement) => {
			return new vscode.CodeLens(statement.range, {
				title: 'Open SQL Editor',
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
