import * as vscode from 'vscode';

import { SQL_KEYWORDS } from '../constants/sql';
import { getPythonSqlCompletionContext, createPythonParser } from '../sql/inlineSql';
import { SchemaSnapshot } from '../sql/types';
import { PostgresSqlService } from '../services/postgresSqlService';

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
	private readonly pythonParserPromise: ReturnType<typeof createPythonParser>;

	public constructor(
		private readonly sqlService: PostgresSqlService,
		extensionPath: string
	) {
		this.pythonParserPromise = createPythonParser(extensionPath);
	}

	public async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<vscode.CompletionItem[]> {
		const context = await this.getCompletionContext(document, position);
		if (!context) {
			return [];
		}

		const replaceRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_$]*/);
		const keywordItems = createKeywordCompletionItems(replaceRange);

		const snapshot = await this.sqlService.getSchemaSnapshot(false, false);
		if (!snapshot) {
			return keywordItems;
		}

		const qualifierMatch = /([A-Za-z_][A-Za-z0-9_$]*)\.\s*([A-Za-z_][A-Za-z0-9_$]*)?$/.exec(
			context.linePrefix
		);
		if (qualifierMatch) {
			const aliases = extractTableAliases(context.sqlText);
			const qualifier = normalizeIdentifier(qualifierMatch[1]);
			const reference = aliases.get(qualifier) ?? qualifier;
			const columns = resolveColumnsForReference(snapshot, reference);
			return createColumnCompletionItems(columns, replaceRange);
		}

		const tableContext = /\b(from|join|update|into|table)\s+[\w."$]*$/i.test(context.linePrefix);
		const tableItems = createTableCompletionItems(snapshot, replaceRange);
		if (tableContext) {
			return tableItems;
		}

		const isSelectContext = /\bselect\s+[\w\W]*$/i.test(context.linePrefix);
		if (isSelectContext) {
			const allColumns = getAllColumns(snapshot);
			return createColumnCompletionItems(allColumns, replaceRange);
		}

		return [...keywordItems, ...tableItems];
	}

	private async getCompletionContext(
		document: vscode.TextDocument,
		position: vscode.Position
	): Promise<{ sqlText: string; linePrefix: string; } | undefined> {
		if (document.languageId === 'sql') {
			return {
				sqlText: document.getText(),
				linePrefix: document.lineAt(position.line).text.slice(0, position.character),
			};
		}

		if (document.languageId !== 'python') {
			return undefined;
		}

		const parser = await this.pythonParserPromise;
		return getPythonSqlCompletionContext(document, position, parser);
	}
}


function getAllColumns(snapshot: SchemaSnapshot): string[] {
    const set = new Set<string>();
    for (const table of snapshot.tables) {
        for (const col of table.columns) {
            set.add(col);
        }
    }
    return [...set];
}


function createKeywordCompletionItems(range: vscode.Range | undefined): vscode.CompletionItem[] {
	return SQL_KEYWORDS.map((keyword) => {
		const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
		item.insertText = keyword;
		item.sortText = `0_${keyword}`;
		if (range) {
			item.range = range;
		}
		return item;
	});
}

function createTableCompletionItems(
	snapshot: SchemaSnapshot,
	range: vscode.Range | undefined
): vscode.CompletionItem[] {
	return snapshot.tables.map((table) => {
		const item = new vscode.CompletionItem(table.qualifiedName, vscode.CompletionItemKind.Class);
		item.detail = 'table/view';
		item.insertText = table.schema === 'public' ? table.name : table.qualifiedName;
		item.sortText = `1_${table.qualifiedName}`;
		if (range) {
			item.range = range;
		}
		return item;
	});
}

function createColumnCompletionItems(
	columns: string[],
	range: vscode.Range | undefined
): vscode.CompletionItem[] {
	return columns.map((column) => {
		const item = new vscode.CompletionItem(column, vscode.CompletionItemKind.Field);
		item.sortText = `0_${column}`;
		if (range) {
			item.range = range;
		}
		return item;
	});
}

function resolveColumnsForReference(snapshot: SchemaSnapshot, reference: string): string[] {
	const normalized = normalizeReference(reference);
	if (!normalized) {
		return [];
	}

	if (normalized.includes('.')) {
		const exact = snapshot.byQualified.get(normalized);
		return exact ? [...exact.columns] : [];
	}

	const tables = snapshot.byName.get(normalized) ?? [];
	const columns = new Set<string>();
	for (const table of tables) {
		for (const column of table.columns) {
			columns.add(column);
		}
	}
	return [...columns];
}

function extractTableAliases(sql: string): Map<string, string> {
	const aliases = new Map<string, string>();
	const regex =
		/\b(?:from|join)\s+((?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))?)\s+(?:as\s+)?("?[A-Za-z_][A-Za-z0-9_$]*"?)/gi;
	let match = regex.exec(sql);

	while (match) {
		const reference = normalizeReference(match[1]);
		const alias = normalizeIdentifier(match[2]);
		if (reference && alias) {
			aliases.set(alias, reference);
		}
		match = regex.exec(sql);
	}

	return aliases;
}

function normalizeReference(reference: string): string {
	return reference
		.split('.')
		.map((part) => normalizeIdentifier(part))
		.filter((part) => part.length > 0)
		.join('.');
}

function normalizeIdentifier(identifier: string): string {
	return identifier.trim().replace(/^"+|"+$/g, '').toLowerCase();
}
