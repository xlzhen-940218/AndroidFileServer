# Android文件管理器 / Android File Manager

## 🧩 项目简介 / Project Overview

**Android文件管理器** 是一个基于网页的安卓设备文件浏览和管理工具，前端使用 HTML 编写，后端使用 Python 实现。通过 ADB（Android Debug Bridge）与安卓设备通信，支持图像、音频、视频的缩略图和预览，借助 FFmpeg 生成媒体缩略图，提供简洁直观的文件管理界面。

**Android File Manager** is a web-based file explorer and manager for Android devices. It uses HTML for the frontend and Python for the backend. The project connects to Android devices via ADB (Android Debug Bridge), provides previews for media files using FFmpeg, and offers a clean interface for managing files.

---

## 🚀 当前功能 / Features

- 📷 **菜单分类 Menu Categories**：
  - 照片 Photos
  - 音乐 Music
  - 视频 Videos
  - 文档 Documents
  - 安装包 APKs
  - 压缩包 Archives
  - 文件管理 File Manager

- 🔍 **视图切换 View Modes**：
  - 宫格视图 Grid View
  - 列表视图 List View

- 👁️ **文件预览 Preview**：
  - 图片预览 Image thumbnails
  - 视频预览 Video thumbnails
  - 音频播放 Audio playback

- 📥 **文件下载 Download Support**：
  - 支持所有文件格式 All file formats supported

- 🧭 **文件管理管理器 File Navigation**：
  - 路径导航栏 Path-based navigation

---

## 🔧 技术栈 / Tech Stack

| 前端 Frontend | 后端 Backend | 工具 Tools |
|---------------|---------------|-------------|
| HTML/CSS/JS   | Python + Flask| ADB, FFmpeg |

---

## 📌 未来计划 / Upcoming Features

- 📤 上传文件 Upload files to device  
- 🗑️ 删除文件 Delete files  
- ✏️ 重命名文件 Rename files  
- 📄 文档预览 Document preview  

---

## 📱 使用说明 / Usage

1. **连接安卓设备 Connect Android device via USB**
   ```bash
   adb devices

2. **启动后端服务 Start the backend**

   ```bash
   python app.py
   ```
3. **在浏览器访问 Open in browser**

   ```
   http://localhost:5001/
   ```

---

## 💡 开发者说明 / Developer Notes

* 项目使用 FFmpeg 生成视频和音频缩略图。
* ADB 被用于远程获取设备目录结构与文件内容。
* 未来将支持更多高级管理功能，敬请期待。

This project uses FFmpeg for thumbnail generation and ADB for device file access. More advanced features are under development.

---

## 📜 License

[MIT License](LICENSE)

```

---

如需我帮你生成 logo、搭建自动化打包脚本或添加截图预览段落，也可以继续告诉我。
```
