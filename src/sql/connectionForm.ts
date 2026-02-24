import { ConnectionFormResult, ConnectionFormValues } from './types';

export function parseConnectionString(connectionString: string): ConnectionFormValues {
	const defaults: ConnectionFormValues = {
		host: '',
		port: '5432',
		database: '',
		user: '',
		password: '',
		sslMode: 'disable',
	};

	if (!connectionString.trim()) {
		return defaults;
	}

	try {
		const parsed = new URL(connectionString);
		if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
			return defaults;
		}

		return {
			host: parsed.hostname || defaults.host,
			port: parsed.port || defaults.port,
			database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
			user: decodeURIComponent(parsed.username),
			password: decodeURIComponent(parsed.password),
			sslMode: parsed.searchParams.get('sslmode') === 'require' ? 'require' : 'disable',
		};
	} catch {
		return defaults;
	}
}

export function validateConnectionForm(values: ConnectionFormValues): string | undefined {
	if (!values.host.trim()) {
		return 'Host is required.';
	}
	if (!values.database.trim()) {
		return 'Database is required.';
	}
	if (!values.user.trim()) {
		return 'User is required.';
	}
	if (!values.port.trim()) {
		return 'Port is required.';
	}

	const port = Number.parseInt(values.port, 10);
	if (Number.isNaN(port) || port < 1 || port > 65535) {
		return 'Port must be a number between 1 and 65535.';
	}

	return undefined;
}

export function buildConnectionString(values: ConnectionFormValues): string {
	const protocol = 'postgresql://';
	const encodedUser = encodeURIComponent(values.user.trim());
	const encodedPassword = values.password ? `:${encodeURIComponent(values.password)}` : '';
	const auth = `${encodedUser}${encodedPassword}@`;
	const host = values.host.trim();
	const port = values.port.trim();
	const database = encodeURIComponent(values.database.trim());

	const params = new URLSearchParams();
	if (values.sslMode === 'require') {
		params.set('sslmode', 'require');
	}

	const query = params.toString();
	return `${protocol}${auth}${host}:${port}/${database}${query ? `?${query}` : ''}`;
}

export function asConnectionFormResult(message: unknown): ConnectionFormResult | undefined {
	if (!message || typeof message !== 'object') {
		return undefined;
	}

	const payload = message as {
		type?: string;
		values?: {
			host?: string;
			port?: string;
			database?: string;
			user?: string;
			password?: string;
			sslMode?: string;
		};
	};

	if (payload.type === 'clear') {
		return { kind: 'clear' };
	}

	if ((payload.type !== 'save' && payload.type !== 'test') || !payload.values) {
		return undefined;
	}

	return {
		kind: payload.type === 'save' ? 'save' : 'test',
		values: {
			host: payload.values.host ?? '',
			port: payload.values.port ?? '',
			database: payload.values.database ?? '',
			user: payload.values.user ?? '',
			password: payload.values.password ?? '',
			sslMode: payload.values.sslMode === 'require' ? 'require' : 'disable',
		},
	};
}

export function renderConnectionFormHtml(initialValues: ConnectionFormValues): string {
	const initialValuesJson = JSON.stringify(initialValues)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>PostgreSQL Connection</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			padding: 16px;
		}
		h2 {
			margin-top: 0;
			margin-bottom: 12px;
		}
		form {
			display: grid;
			gap: 12px;
			max-width: 560px;
		}
		.row {
			display: grid;
			gap: 6px;
		}
		label {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		input, select {
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			padding: 8px;
			font: inherit;
		}
		.grid-2 {
			display: grid;
			grid-template-columns: 2fr 1fr;
			gap: 12px;
		}
		.actions {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: 4px;
		}
		button {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: 1px solid var(--vscode-button-border);
			border-radius: 4px;
			padding: 8px 14px;
			cursor: pointer;
		}
		button.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		button.small {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			padding: 4px 8px;
			font-size: 12px;
		}
		.hint {
			margin-top: 10px;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<h2>PostgreSQL Server Details</h2>
	<form id="connectionForm">
		<div class="grid-2">
			<div class="row">
				<label for="host">Host</label>
				<input id="host" name="host" type="text" placeholder="localhost" required />
			</div>
			<div class="row">
				<label for="port">Port</label>
				<input id="port" name="port" type="number" min="1" max="65535" placeholder="5432" required />
			</div>
		</div>
		<div class="row">
			<label for="database">Database</label>
			<input id="database" name="database" type="text" placeholder="my_db" required />
		</div>
		<div class="row">
			<label for="user">User</label>
			<input id="user" name="user" type="text" placeholder="postgres" required />
		</div>
		<div class="row">
			<label for="password">Password</label>
			<input id="password" name="password" type="password" placeholder="Optional" />
		</div>
		<div class="row">
			<label for="sslMode">SSL Mode</label>
			<select id="sslMode" name="sslMode">
				<option value="disable">disable</option>
				<option value="require">require</option>
			</select>
		</div>
		<button id="testBtn" class="small" type="button">Test Connection</button>
		<div class="actions">
			<button type="submit">Save Connection</button>
			<button id="clearBtn" class="secondary" type="button">Clear Saved</button>
		</div>
	</form>
	<div class="hint">Saved in VS Code Secret Storage as a connection string.</div>
	<script>
		const vscode = acquireVsCodeApi();
		const initialValues = ${initialValuesJson};
		const form = document.getElementById('connectionForm');
		const testBtn = document.getElementById('testBtn');
		const clearBtn = document.getElementById('clearBtn');
		const host = document.getElementById('host');
		const port = document.getElementById('port');
		const database = document.getElementById('database');
		const user = document.getElementById('user');
		const password = document.getElementById('password');
		const sslMode = document.getElementById('sslMode');

		host.value = initialValues.host || '';
		port.value = initialValues.port || '5432';
		database.value = initialValues.database || '';
		user.value = initialValues.user || '';
		password.value = initialValues.password || '';
		sslMode.value = initialValues.sslMode || 'disable';

		const collectValues = () => ({
			host: host.value,
			port: port.value,
			database: database.value,
			user: user.value,
			password: password.value,
			sslMode: sslMode.value
		});

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			vscode.postMessage({
				type: 'save',
				values: collectValues()
			});
		});

		testBtn.addEventListener('click', () => {
			vscode.postMessage({
				type: 'test',
				values: collectValues()
			});
		});

		clearBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'clear' });
		});
	</script>
</body>
</html>`;
}
