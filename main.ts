import { Editor, Notice, Plugin} from 'obsidian';

interface UploadResponse {
    data: {
        links: {
            url: string;
        };
    };
}

export default class MyPlugin extends Plugin {
	async onload() {
		this.registerEvent(
			this.app.workspace.on('editor-paste', async (evt, editor, view) => {
				this.handlePaste(evt, editor);
			})
		);
	}

	async handlePaste(event: ClipboardEvent, editor: Editor) {
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

        try {
            const response = await fetch('https://image.eskr.top/api/v1/upload', {
                method: 'POST',
                headers: {
					'Authorization': 'Bearer 1|qcjtavsRMsMvW5iHtZ50HovdDUR7c5rC1WGeOl7h',
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
