import * as vscode from 'vscode';

import { SqlStatement } from '../sql/types';

export class SqlBlockCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

	public readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

	public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (document.languageId !== 'sql') {
			return [];
		}

		const statements = extractSqlStatements(document);
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

function extractSqlStatements(document: vscode.TextDocument): SqlStatement[] {
	const source = document.getText();
	const statements: SqlStatement[] = [];

	let statementStart = 0;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inLineComment = false;
	let blockCommentDepth = 0;
	let dollarTag: string | undefined;

	for (let i = 0; i < source.length; i += 1) {
		const char = source[i];
		const next = source[i + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
			}
			continue;
		}

		if (blockCommentDepth > 0) {
			if (char === '/' && next === '*') {
				blockCommentDepth += 1;
				i += 1;
				continue;
			}

			if (char === '*' && next === '/') {
				blockCommentDepth -= 1;
				i += 1;
			}
			continue;
		}

		if (dollarTag) {
			if (source.startsWith(dollarTag, i)) {
				i += dollarTag.length - 1;
				dollarTag = undefined;
			}
			continue;
		}

		if (inSingleQuote) {
			if (char === '\'') {
				if (next === '\'') {
					i += 1;
				} else {
					inSingleQuote = false;
				}
			}
			continue;
		}

		if (inDoubleQuote) {
			if (char === '"') {
				if (next === '"') {
					i += 1;
				} else {
					inDoubleQuote = false;
				}
			}
			continue;
		}

		if (char === '-' && next === '-') {
			inLineComment = true;
			i += 1;
			continue;
		}

		if (char === '/' && next === '*') {
			blockCommentDepth = 1;
			i += 1;
			continue;
		}

		if (char === '\'') {
			inSingleQuote = true;
			continue;
		}

		if (char === '"') {
			inDoubleQuote = true;
			continue;
		}

		if (char === '$') {
			const tag = readDollarTag(source, i);
			if (tag) {
				dollarTag = tag;
				i += tag.length - 1;
				continue;
			}
		}

		if (char === ';') {
			pushStatement(document, source, statementStart, i + 1, statements);
			statementStart = i + 1;
		}
	}

	pushStatement(document, source, statementStart, source.length, statements);
	return statements;
}

function pushStatement(
	document: vscode.TextDocument,
	source: string,
	start: number,
	end: number,
	statements: SqlStatement[]
): void {
	const chunk = source.slice(start, end);
	const leadingWhitespace = chunk.match(/^\s*/)?.[0].length ?? 0;
	const trailingWhitespace = chunk.match(/\s*$/)?.[0].length ?? 0;

	const contentStart = start + leadingWhitespace;
	const contentEnd = end - trailingWhitespace;
	if (contentEnd <= contentStart) {
		return;
	}

	const content = source.slice(contentStart, contentEnd);
	if (!hasExecutableSql(content)) {
		return;
	}

	const position = document.positionAt(contentStart);
	statements.push({
		range: new vscode.Range(position, position),
		content,
	});
}

function hasExecutableSql(content: string): boolean {
	// Avoid offering a lens for comment-only chunks.
	const withoutLineComments = content.replace(/--.*$/gm, '');
	const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '');
	return withoutBlockComments.replace(/[;\s]/g, '').length > 0;
}

function readDollarTag(source: string, start: number): string | undefined {
	if (source[start] !== '$') {
		return undefined;
	}

	let cursor = start + 1;
	while (cursor < source.length && source[cursor] !== '$') {
		const char = source[cursor];
		const isValid = /[A-Za-z0-9_]/.test(char);
		if (!isValid) {
			return undefined;
		}
		cursor += 1;
	}

	if (cursor >= source.length || source[cursor] !== '$') {
		return undefined;
	}

	return source.slice(start, cursor + 1);
}
