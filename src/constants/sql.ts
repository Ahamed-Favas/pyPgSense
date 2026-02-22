export const SQL_START_REGEX = /\b(select|insert|update|delete|with|create|alter|drop)\b/i;
export const SQL_CONTEXT_REGEX = /\b(from|into|values|set|where|join|table|returning)\b/i;
export const PARAMETER_TYPE_ERROR_CODES = new Set(['42P18', '42P02']);
export const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
export const CONNECTION_VIEW_ID = 'pypgsense.connectionView';

export const SQL_KEYWORDS = [
	'SELECT',
	'FROM',
	'WHERE',
	'JOIN',
	'LEFT JOIN',
	'RIGHT JOIN',
	'INNER JOIN',
	'GROUP BY',
	'ORDER BY',
	'LIMIT',
	'INSERT INTO',
	'VALUES',
	'UPDATE',
	'SET',
	'DELETE',
	'RETURNING',
	'CREATE TABLE',
	'ALTER TABLE',
	'DROP TABLE',
	'WITH',
	'AS',
	'AND',
	'OR',
	'NOT',
	'IN',
	'EXISTS',
];
