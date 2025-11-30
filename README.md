# P2P File Transfer 🚀

一个基于 WebRTC 的点对点文件传输应用，完全在浏览器中运行，无需服务器存储。

## ✨ 特性

- 🔒 **端到端加密** - 文件直接在设备间传输，不经过服务器
- 📱 **二维码分享** - 扫码即可在另一设备上接收文件
- 📊 **实时进度** - 显示传输速度和进度
- 🎨 **精美界面** - 现代化的深色主题和流畅动画
- 💾 **大文件支持** - 通过分片传输支持任意大小文件
- 🌐 **跨设备互联** - 支持不同设备、不同网络间的文件传输

## 🛠️ 技术栈

- **Next.js 14** - React 框架，支持 App Router
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **PeerJS** - WebRTC 封装库
- **QRCode** - 二维码生成

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:3000

### 构建生产版本

```bash
npm run build
npm start
```

## 📦 部署到 Vercel

这个项目设计为可以免费部署到 Vercel：

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. Vercel 会自动检测 Next.js 并进行部署
4. 部署完成后即可使用 HTTPS 访问

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/p2p-file-transfer)

## 🔧 工作原理

1. **发送方**：
   - 上传文件到浏览器内存
   - 创建一个唯一的房间 ID
   - 生成分享链接和二维码
   - 等待接收方连接

2. **接收方**：
   - 扫描二维码或访问分享链接
   - 通过 WebRTC 建立 P2P 连接
   - 直接从发送方接收文件数据
   - 下载文件到本地设备

3. **信令服务器**：
   - PeerJS 默认使用公共信令服务器
   - 仅用于交换连接信息（SDP/ICE）
   - 不存储或转发文件数据

## 🔒 安全性

- ✅ 文件数据通过 WebRTC DataChannel 直接传输
- ✅ 不经过任何服务器存储
- ✅ 支持 HTTPS 加密传输
- ✅ 房间 ID 随机生成，难以猜测
- ✅ 连接关闭后数据自动清除

## 📝 使用说明

### 发送文件

1. 在首页选择或拖拽文件
2. 等待系统生成二维码和分享链接
3. 将链接或二维码分享给接收方
4. 等待接收方连接并自动开始传输

### 接收文件

1. 扫描二维码或访问分享链接
2. 等待建立 P2P 连接
3. 文件传输完成后点击下载按钮

## 🌟 功能特点

- **拖拽上传** - 支持拖拽文件到页面
- **进度显示** - 实时显示传输进度和速度
- **状态提示** - 清晰的连接状态指示
- **响应式设计** - 适配各种设备尺寸
- **优雅动画** - 流畅的过渡效果和加载动画

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [PeerJS](https://peerjs.com/) - WebRTC 简化封装
- [Next.js](https://nextjs.org/) - React 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
