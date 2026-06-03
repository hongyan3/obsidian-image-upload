# Image Upload

粘贴图片时自动上传到图床，并用远程 URL 替换本地路径。

## 功能

- 拦截编辑器粘贴事件，检测剪贴板中的图片
- 先插入本地临时链接，上传成功后自动替换为远程 URL
- 上传超时控制，默认 30 秒
- 上传进度提示

## 设置

| 配置项 | 说明 |
|--------|------|
| API URL | 图床上传接口地址 |
| Token | Authorization Bearer Token |
| Upload Timeout | 上传超时时间（毫秒），默认 30000 |

## 安装

将 `main.js`、`manifest.json`、`styles.css` 复制到 vault 的 `.obsidian/plugins/obsidian-image-upload/` 目录下，在设置中启用插件。
