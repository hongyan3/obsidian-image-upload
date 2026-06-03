import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface ImagePluginSettings {
	apiHost: string;
	apiToken: string;
	uploadTimeout: number;
}

const DEFAULT_SETTINGS: ImagePluginSettings = {
	apiHost: '',
	apiToken: '',
	uploadTimeout: 2000,
};

interface UploadResponse {
	data: {
		links: {
			url: string;
		};
	};
}

class ImagePluginSettingTab extends PluginSettingTab {
	plugin: ImagePlugin;

	constructor(app: App, plugin: ImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Image Upload Settings' });

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('Server Upload API URL')
			.addText(text =>
				text
					.setPlaceholder('https://example.com/api/v1/upload')
					.setValue(this.plugin.settings.apiHost)
					.onChange(async v => {
						this.plugin.settings.apiHost = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Token')
			.setDesc('Authorization Bearer Token')
			.addText(text =>
				text
					.setPlaceholder('1|xxxxxxxxxx')
					.setValue(this.plugin.settings.apiToken)
					.onChange(async v => {
						this.plugin.settings.apiToken = v.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Upload Timeout')
			.setDesc('Upload timeout in milliseconds (default 2000)')
			.addText(text =>
				text
					.setPlaceholder('2000')
					.setValue(String(this.plugin.settings.uploadTimeout))
					.onChange(async v => {
						const num = parseInt(v.trim(), 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.uploadTimeout = num;
							await this.plugin.saveSettings();
						}
					})
			);
	}
}

export default class ImagePlugin extends Plugin {
	settings: ImagePluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ImagePluginSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-paste', async (evt, editor, view) => {
				this.handlePaste(evt, editor);
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async handlePaste(event: ClipboardEvent, editor: Editor) {
		if (!this.settings.apiHost || !this.settings.apiToken) {
			new Notice('图床 API 地址与 Token 未配置', 5000);
			return;
		}

		if (!event.clipboardData?.files.length) return;

		const files = Array.from(event.clipboardData.files).filter(file =>
			file.type.startsWith('image/')
		);
		if (files.length === 0) return;

		event.preventDefault();

		for (const file of files) {
			let tempPath: string | null = null;

			try {
				tempPath = await this.saveTempFile(file);
				const tempMarkdown = `![${file.name}](${tempPath})`;
				editor.replaceSelection(tempMarkdown);

				new Notice(`正在上传: ${file.name}...`);

				const remoteUrl = await this.uploadToImageHosting(file);

				// Replace temp path with remote URL by text search,
				// avoiding fragile cursor-position tracking
				const content = editor.getValue();
				const idx = content.lastIndexOf(tempPath);
				if (idx !== -1) {
					const from = editor.offsetToPos(idx);
					const to = editor.offsetToPos(idx + tempPath.length);
					editor.getDoc().replaceRange(remoteUrl, from, to);
				}

				new Notice(`${file.name} 上传成功`);
			} catch (error) {
				new Notice(`上传失败: ${file.name} — ${error.message}`);
			} finally {
				if (tempPath) {
					await this.deleteTempFile(tempPath);
				}
			}
		}
	}

	private async saveTempFile(file: File): Promise<string> {
		const tempDir = 'assets/';
		const tempPath = `${tempDir}${Date.now()}_${file.name}`;

		await this.app.vault.adapter.mkdir(tempDir);

		const arrayBuffer = await file.arrayBuffer();
		await this.app.vault.adapter.writeBinary(tempPath, arrayBuffer);

		return tempPath;
	}

	private async uploadToImageHosting(file: File): Promise<string> {
		const formData = new FormData();
		formData.append('file', file, file.name);
		formData.append('strategy_id', '3');

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.settings.uploadTimeout);

		try {
			const response = await fetch(this.settings.apiHost, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.apiToken}`,
					'Accept': 'application/json',
				},
				body: formData,
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP error: ${response.status}`);
			}

			const data: UploadResponse = await response.json();
			return data.data.links.url;
		} finally {
			clearTimeout(timer);
		}
	}

	private async deleteTempFile(path: string): Promise<void> {
		if (await this.app.vault.adapter.exists(path)) {
			await this.app.vault.adapter.remove(path);
		}
	}

	unload(): void {}
}
