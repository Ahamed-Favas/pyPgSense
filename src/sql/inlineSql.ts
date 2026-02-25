import * as vscode from 'vscode';
import Parser = require('tree-sitter');
import Python = require('tree-sitter-python');

import { SQL_CONTEXT_REGEX, SQL_START_REGEX } from '../constants/sql';
import { SqlStatement, SqlStringGroup, SqlStringPart } from './types';

export function createPythonParser(): Parser | undefined {
	try {
		const parser = new Parser();
		parser.setLanguage(Python as Parser.Language);
		return parser;
	} catch (error) {
		console.error('[pyPgSense] Failed to initialize tree-sitter parser:', error);
		return undefined;
	}
}

export function extractSqlStatements(document: vscode.TextDocument, parser: Parser | undefined): SqlStatement[] {
	const source = document.getText();
	const groups = extractSqlStringGroups(parser, source);
	const statements: SqlStatement[] = [];

	for (const group of groups) {
		const first = group.parts[0];
		if (!first) {
			continue;
		}
		const position = document.positionAt(first.startOffset);
		statements.push({
			range: new vscode.Range(position, position),
			content: group.content,
		});
	}

	return statements;
}

export function extractSqlStringGroups(parser: Parser | undefined, source: string): SqlStringGroup[] {
	if (!parser) {
		return [];
	}

	const tree = parser.parse(source);
	const root = tree.rootNode;
	const groups: SqlStringGroup[] = [];
	const seen = new Set<string>();
	const stack: Parser.SyntaxNode[] = [root];

	while (stack.length > 0) {
		const node = stack.pop();
		if (!node) {
			continue;
		}

		if (node.type === 'assignment' || node.type === 'annotated_assignment') {
			const right = node.childForFieldName('right');
			if (right) {
				addSqlGroupFromNode(right, source, groups, seen);
			}
		}

		if (node.type === 'call') {
			const firstArg = getFirstCallArgument(node);
			if (firstArg) {
				addSqlGroupFromNode(firstArg, source, groups, seen);
			}
		}

		for (let i = 0; i < node.childCount; i += 1) {
			const child = node.child(i);
			if (child) {
				stack.push(child);
			}
		}
	}

	return groups;
}

export function getPythonSqlCompletionContext(
	document: vscode.TextDocument,
	position: vscode.Position,
	parser: Parser | undefined
): { sqlText: string; linePrefix: string } | undefined {
	if (!parser) {
		return undefined;
	}

	const source = document.getText();
	const offset = document.offsetAt(position);
	const groups = extractSqlStringGroups(parser, source);

	for (const group of groups) {
		let prefix = '';
		for (const part of group.parts) {
			const partStart = part.startOffset;
			const partEnd = part.startOffset + part.text.length;

			if (offset >= partStart && offset <= partEnd) {
				const localOffset = offset - partStart;
				const sqlPrefix = prefix + part.text.slice(0, localOffset);
				const linePrefix = sqlPrefix.split('\n').pop() ?? '';
				return {
					sqlText: group.content,
					linePrefix,
				};
			}

			prefix += part.text;
		}
	}

	return undefined;
}

function addSqlGroupFromNode(
	node: Parser.SyntaxNode,
	source: string,
	groups: SqlStringGroup[],
	seen: Set<string>
): void {
	const parts = collectStringContentNodes(node, source);
	if (parts.length === 0) {
		return;
	}

	const content = parts.map((part) => part.text).join('\n');
	if (!looksLikeSql(content)) {
		return;
	}

	const first = parts[0];
	const key = `${first.startOffset}:${content.length}`;
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	groups.push({ parts, content });
}

function getFirstCallArgument(callNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
	const argumentsNode = callNode.childForFieldName('arguments');
	if (!argumentsNode) {
		return null;
	}

	for (let i = 0; i < argumentsNode.namedChildCount; i += 1) {
		const child = argumentsNode.namedChild(i);
		if (child) {
			return child;
		}
	}

	return null;
}

function collectStringContentNodes(node: Parser.SyntaxNode, source: string): SqlStringPart[] {
	const results: SqlStringPart[] = [];
	const stack: Parser.SyntaxNode[] = [node];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		if (current.type === 'string_content') {
			results.push({
				startOffset: current.startIndex,
				text: source.slice(current.startIndex, current.endIndex),
			});
			continue;
		}

		for (let i = 0; i < current.childCount; i += 1) {
			const child = current.child(i);
			if (child) {
				stack.push(child);
			}
		}
	}

	results.sort((a, b) => a.startOffset - b.startOffset);
	return results;
}

function looksLikeSql(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length < 10) {
		return false;
	}
	if (!SQL_START_REGEX.test(normalized)) {
		return false;
	}
	return SQL_CONTEXT_REGEX.test(normalized) || /\bselect\b[\s\S]+\bfrom\b/i.test(normalized);
}
