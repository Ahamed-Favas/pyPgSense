type ResultHtmlInput = {
	sql: string;
	durationMs: number;
	command: string;
	rowCount: number;
	rows: Record<string, unknown>[];
};

export function renderResultHtml(input: ResultHtmlInput): string {
	const columns = input.rows.length > 0 ? Object.keys(input.rows[0]) : [];
	const rowsHtml = input.rows
		.map((row) => {
			const cells = columns
				.map((column) => `<td>${escapeHtml(formatValue(row[column]))}</td>`)
				.join('');
			return `<tr>${cells}</tr>`;
		})
		.join('');

	const tableHtml = columns.length > 0
		? `<table>
				<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
				<tbody>${rowsHtml}</tbody>
			</table>`
		: '<p>No row data returned.</p>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>SQL Results</title>
	<style>
		body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
		pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow: auto; }
		table { width: 100%; border-collapse: collapse; margin-top: 12px; }
		th, td { border: 1px solid var(--vscode-panel-border); text-align: left; padding: 8px; vertical-align: top; }
		th { background: var(--vscode-editorGroupHeader-tabsBackground); }
		.meta { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
	</style>
</head>
<body>
	<h2>SQL Results</h2>
	<div class="meta">
		<span><strong>Command:</strong> ${escapeHtml(input.command)}</span>
		<span><strong>Rows:</strong> ${input.rowCount}</span>
		<span><strong>Duration:</strong> ${input.durationMs} ms</span>
	</div>
	<h3>Query</h3>
	<pre>${escapeHtml(input.sql)}</pre>
	<h3>Data</h3>
	${tableHtml}
</body>
</html>`;
}

export function renderErrorHtml(sql: string, errorMessage: string, durationMs: number): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>SQL Error</title>
	<style>
		body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
		.error { color: var(--vscode-editorError-foreground); font-weight: 600; }
		pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow: auto; }
	</style>
</head>
<body>
	<h2>SQL Execution Error</h2>
	<p><strong>Duration:</strong> ${durationMs} ms</p>
	<p class="error">${escapeHtml(errorMessage)}</p>
	<h3>Query</h3>
	<pre>${escapeHtml(sql)}</pre>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}
