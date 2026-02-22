import * as vscode from 'vscode';

export type SqlStatement = {
	range: vscode.Range;
	content: string;
};

export type SqlStringPart = {
	startOffset: number;
	text: string;
};

export type SqlStringGroup = {
	content: string;
	parts: SqlStringPart[];
};

export type SqlValidationResult =
	| { kind: 'ok' }
	| { kind: 'skipped' }
	| { kind: 'error'; message: string; position?: number; code?: string };

export type SchemaRow = {
	table_schema: string;
	table_name: string;
	column_name: string;
};

export type SchemaTable = {
	schema: string;
	name: string;
	qualifiedName: string;
	columns: string[];
};

export type SchemaSnapshot = {
	tables: SchemaTable[];
	byQualified: Map<string, SchemaTable>;
	byName: Map<string, SchemaTable[]>;
	refreshedAt: number;
};

export type PgLikeError = {
	message?: string;
	position?: string;
	code?: string;
};

export type ConnectionFormValues = {
	host: string;
	port: string;
	database: string;
	user: string;
	password: string;
	sslMode: 'disable' | 'require';
};

export type ConnectionFormResult =
	| { kind: 'save'; values: ConnectionFormValues }
	| { kind: 'clear' };
