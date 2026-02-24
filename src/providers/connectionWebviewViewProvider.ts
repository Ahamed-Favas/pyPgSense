import * as vscode from 'vscode';

import { asConnectionFormResult, renderConnectionFormHtml } from '../sql/connectionForm';
import { PostgresSqlService } from '../services/postgresSqlService';

export class ConnectionWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private readonly disposables: vscode.Disposable[] = [];

	public constructor(private readonly sqlService: PostgresSqlService) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
		};

		this.disposables.push(
			webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
				const parsed = asConnectionFormResult(message);
				if (!parsed) {
					return;
				}

				if (parsed.kind === 'clear') {
					await this.sqlService.clearConnection();
					void vscode.window.showInformationMessage('PostgreSQL connection string removed.');
					await this.refresh();
					return;
				}

				if (parsed.kind === 'test') {
					await this.sqlService.testConnection(parsed.values);
					return;
				}

				const validationError = await this.sqlService.saveConnectionFromValues(parsed.values);
				if (validationError) {
					void vscode.window.showErrorMessage(validationError);
					return;
				}

				void vscode.window.showInformationMessage('PostgreSQL connection string saved.');
				await this.refresh();
			}),
			webviewView.onDidDispose(() => {
				this.view = undefined;
			})
		);

		void this.refresh();
	}

	public async refresh(): Promise<void> {
		if (!this.view) {
			return;
		}
		const initialValues = await this.sqlService.getConnectionFormValues();
		if (!this.view) {
			return;
		}
		this.view.webview.html = renderConnectionFormHtml(initialValues);
	}

	public dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables.length = 0;
	}
}
