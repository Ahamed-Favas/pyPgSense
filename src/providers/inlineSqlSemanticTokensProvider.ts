import * as vscode from 'vscode';

import { createPythonParser, extractSqlStringGroups } from '../sql/inlineSql';

const TOKEN_TYPES = ['keyword', 'string', 'number', 'operator', 'variable'] as const;
export const INLINE_SQL_SEMANTIC_LEGEND = new vscode.SemanticTokensLegend([...TOKEN_TYPES]);

const SQL_KEYWORDS = new Set([
	'and',
	'as',
	'by',
	'cross',
	'delete',
	'distinct',
	'exists',
	'from',
	'full',
	'group',
	'having',
	'inner',
	'insert',
	'into',
	'in',
	'is',
	'join',
	'left',
	'limit',
	'not',
	'null',
	'offset',
	'on',
	'order',
	'or',
	'outer',
	'returning',
	'right',
	'select',
	'set',
	'update',
	'values',
	'where',
]);

// Lightweight lexer for semantic coloring within extracted SQL ranges.
const SQL_TOKEN_REGEX = /\b[a-z_][a-z0-9_]*\b|'(?:''|[^'])*'|\b\d+(?:\.\d+)?\b|[=<>!~]+|[(),.*;]/gi;

type TokenTypeName = (typeof TOKEN_TYPES)[number];

export class InlineSqlSemanticTokensProvider
	implements vscode.DocumentSemanticTokensProvider, vscode.Disposable
{
	private readonly parserPromise: ReturnType<typeof createPythonParser>;

	public constructor(extensionPath: string) {
		this.parserPromise = createPythonParser(extensionPath);
	}

	public async provideDocumentSemanticTokens(
		document: vscode.TextDocument
	): Promise<vscode.SemanticTokens> {
		const builder = new vscode.SemanticTokensBuilder(INLINE_SQL_SEMANTIC_LEGEND);
		if (document.languageId !== 'python') {
			return builder.build();
		}

		const parser = await this.parserPromise;
		const groups = extractSqlStringGroups(parser, document.getText());

		for (const group of groups) {
			for (const part of group.parts) {
				for (const token of tokenizeSql(part.text)) {
					const startOffset = part.startOffset + token.start;
					pushToken(builder, document, startOffset, token.value.length, token.type);
				}
			}
		}

		return builder.build();
	}

	public dispose(): void {}
}

function tokenizeSql(text: string): { start: number; value: string; type: TokenTypeName }[] {
	const tokens: { start: number; value: string; type: TokenTypeName }[] = [];
	for (const match of text.matchAll(SQL_TOKEN_REGEX)) {
		const value = match[0];
		const start = match.index;
		if (!value || start === undefined) {
			continue;
		}

		tokens.push({
			start,
			value,
			type: classifySqlToken(value),
		});
	}

	return tokens;
}

function classifySqlToken(value: string): TokenTypeName {
	const lowered = value.toLowerCase();
	if (SQL_KEYWORDS.has(lowered)) {
		return 'keyword';
	}

	if (value.startsWith('\'')) {
		return 'string';
	}

	if (/^\d/.test(value)) {
		return 'number';
	}

	if (/^[=<>!~]+$/.test(value) || /^[(),.*;]$/.test(value)) {
		return 'operator';
	}

	return 'variable';
}

function pushToken(
	builder: vscode.SemanticTokensBuilder,
	document: vscode.TextDocument,
	startOffset: number,
	length: number,
	type: TokenTypeName
): void {
	const typeIndex = TOKEN_TYPES.indexOf(type);
	if (typeIndex < 0 || length <= 0) {
		return;
	}

	const valueStart = document.positionAt(startOffset);
	const valueEnd = document.positionAt(startOffset + length);

	if (valueStart.line === valueEnd.line) {
		builder.push(valueStart.line, valueStart.character, length, typeIndex, 0);
		return;
	}

	for (let line = valueStart.line; line <= valueEnd.line; line += 1) {
		const lineText = document.lineAt(line).text;
		const segmentStart = line === valueStart.line ? valueStart.character : 0;
		const segmentEnd = line === valueEnd.line ? valueEnd.character : lineText.length;
		const segmentLength = segmentEnd - segmentStart;
		if (segmentLength > 0) {
			builder.push(line, segmentStart, segmentLength, typeIndex, 0);
		}
	}
}
