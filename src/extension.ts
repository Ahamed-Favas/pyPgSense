import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // This logs once when a Python file is opened (or whatever triggers your activation)
    console.log('SQLens: SQL injection grammar for Python is now active.');

    // Usually, you don't need code here for TextMate grammars.
    // In the future, you could add SQL formatting or "Execute SQL" commands here!
}

export function deactivate() {}