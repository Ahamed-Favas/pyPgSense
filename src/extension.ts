import * as vscode from 'vscode';

import { CONNECTION_VIEW_ID } from './constants/sql';
import { ConnectionWebviewViewProvider } from './providers/connectionWebviewViewProvider';
import { InlineSqlCodeLensProvider } from './providers/inlineSqlCodeLensProvider';
import { SqlCompletionProvider } from './providers/sqlCompletionProvider';
import { SqlLintManager } from './providers/sqlLintManager';
import { PostgresSqlService } from './services/postgresSqlService';

export function activate(context: vscode.ExtensionContext): void {

	const codeLensProvider = new InlineSqlCodeLensProvider();
	const sqlService = new PostgresSqlService(context);
	const connectionViewProvider = new ConnectionWebviewViewProvider(sqlService);
	const sqlCompletionProvider = new SqlCompletionProvider(sqlService);
	const lintManager = new SqlLintManager(sqlService);

	context.subscriptions.push(codeLensProvider, sqlService, lintManager, connectionViewProvider);

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ language: 'python' }, codeLensProvider)
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(CONNECTION_VIEW_ID, connectionViewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			[{ language: 'sql' }, { language: 'python' }],
			sqlCompletionProvider,
			'.',
			' '
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pypgsense.openInlineSql', async (content: string) => {
			const displayDocument = await vscode.workspace.openTextDocument({
				content,
				language: 'sql',
			});
			await vscode.window.showTextDocument(displayDocument, {
				preview: false,
				viewColumn: vscode.ViewColumn.Beside,
			});
			lintManager.schedule(displayDocument);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pypgsense.runSelectedSql', async () => {
			await sqlService.runFromActiveEditor();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pypgsense.setPostgresConnection', async () => {
			await sqlService.setConnectionString();
			await connectionViewProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pypgsense.refreshSqlSchemaCache', async () => {
			await sqlService.refreshSchemaCache(true);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.languageId === 'python') {
				codeLensProvider.refresh();
			}
			if (event.document.languageId === 'sql') {
				lintManager.schedule(event.document);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			if (document.languageId === 'sql') {
				lintManager.schedule(document);
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			if (document.languageId === 'sql') {
				lintManager.clear(document.uri);
			}
		})
	);

	for (const document of vscode.workspace.textDocuments) {
		if (document.languageId === 'sql') {
			lintManager.schedule(document);
		}
	}
}

export function deactivate(): void {}
