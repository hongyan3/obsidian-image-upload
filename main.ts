import { App, Editor, Notice, Plugin, PluginSettingTab, Setting} from 'obsidian';

interface ImagePluginSettings {
	apiHost: string;
	apiToken: string;
}

const DEFAULT_SETTINGS: ImagePluginSettings = {
	apiHost: '',
	apiToken: '',
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
	}
}

export default class ImagePlugin extends Plugin {
	settings: ImagePluginSettings

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
			new Notice('图床 API 地址与 Token未配置', 5000);
			// 可选：直接打开设置页
			// (this.app as any).setting.openTabById('my-plugin');
			return;
		}

		if (!event.clipboardData?.files.length) return;
		const files = Array.from(event.clipboardData.files).filter(file =>
			file.type.startsWith('image/')
		);
		if (files.length === 0) return;
		for (const file of files) {
			try {
				event.preventDefault()

				// 记录插入前的位置
				const startPos = editor.getCursor();

				// 保存到本地临时文件
				const tempPath = await this.saveTempFile(file);
				const tempMarkdown = `![${file.name}](${tempPath})`;
				
				// 插入本地图片
				editor.replaceSelection(tempMarkdown);

				// 记录插入后的位置
				const endPos = editor.getCursor();
				
				// 异步上传到图床
				const remoteUrl = await this.uploadToImageHosting(file);
				
				// 替换为远程链接
				const finalMarkdown = `![${file.name}](${remoteUrl})`;
				editor.getDoc().replaceRange(finalMarkdown, startPos, endPos)
				
				// 删除临时文件
				await this.deleteTempFile(tempPath);
			} catch (error) {
				new Notice(`Image upload filed: ${error.message}`);
			}
		}
	}

	private async saveTempFile(file: File): Promise<string> {
        const tempDir = `assets/`;
        const tempPath = `${tempDir}${Date.now()}_${file.name}`;
        
        // 确保目录存在
        await this.app.vault.adapter.mkdir(tempDir);
        
        // 写入文件
        const arrayBuffer = await file.arrayBuffer();
        await this.app.vault.adapter.writeBinary(tempPath, arrayBuffer);
        
        return tempPath;
    }

	private async uploadToImageHosting(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file, file.name);
		formData.append('strategy_id', '3')

        try {
            const response = await fetch(this.settings.apiHost, {
                method: 'POST',
                headers: {
					'Authorization': `Bearer ${this.settings.apiToken}`,
					'Accept': 'application/json'
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data: UploadResponse = await response.json();
            return data.data.links.url;
        } catch (error) {
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

	private async deleteTempFile(path: string): Promise<void> {
        if (await this.app.vault.adapter.exists(path)) {
            await this.app.vault.adapter.remove(path);
        }
    }

	unload(): void {}
}
