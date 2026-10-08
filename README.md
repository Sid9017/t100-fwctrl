# t100-fwctrl

独立、零第三方运行时依赖的浏览器工具。沿用 mfg_app 深色/绿色控制台风格，适配手机竖屏和桌面。当前仅实现 Web Bluetooth 设备扫描与选择，不连接 GATT、不绑定、不读写固件，也不保存认证数据。

## 本地运行

Node.js 22 或更高版本，在仓库根目录执行：

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:8766 。使用 `PORT=其他端口 npm run dev` 可改端口。

```sh
npm test
npm run build
npm run preview
```

preview 使用同一端口，启动前先停止 dev。构建仅复制 index.html 和 src 到 dist；不会部署仓库、认证文件或 Electron 依赖。

## Netlify

连接 t100-fwctrl Git 仓库，选择要部署的分支：

| 配置 | 值 |
| --- | --- |
| Base directory | 留空（仓库根目录） |
| Package directory | 留空（与 Base 相同） |
| Build command | `npm run build` |
| Publish directory | `dist`（相对于 Base） |

根目录 netlify.toml 固定 Node 22、构建入口和响应头。无需 Functions、环境密钥或后端。正式使用固定 HTTPS 域名；后续认证存储将按网站来源隔离。

## 扫描行为与兼容性

- 点击按钮直接调用 `navigator.bluetooth.requestDevice()`，由浏览器原生弹窗扫描/选择。网页只获得用户选中的设备，不能据此列出所有周边设备或 RSSI。
- 单个组合过滤条件：名称前缀 `YD-`；company `0x6000`；Manufacturer Data subtype `0x50`；product `0x01`。version 字节不限制，兼容 v1/v2。返回后再次校验 `YD-` + 12 位小写十六进制名称。
- 不降级为仅名称扫描，避免选入同名 H300。需要支持 manufacturerData filter 的现代浏览器。
- 支持桌面 Chrome / Edge 和 Android Chrome；Linux 取决于浏览器/系统配置。iOS / iPadOS 常规浏览器及 Safari、Firefox 不支持时显示明确提示。
- 需要 HTTPS；本机 localhost/127.0.0.1 可调试。手机访问电脑 HTTP 局域网地址不满足安全上下文，请使用 Netlify HTTPS 预览。浏览器还需系统蓝牙权限，设备需处于广播状态。
- 本次已选列表只存在内存中。清空列表不会撤销浏览器设备权限；撤销权限请在浏览器网站设置中操作。选择不代表连接或绑定。

## 验证

`npm test` 覆盖T100 广播过滤及其他产品排除、用户手势同步调用、重复请求/选择、取消与错误恢复、设备身份校验。实际蓝牙仍需在支持的浏览器与真实 T100 上验证：

1. 唤醒 T100，扫描后弹窗能看到设备；H300 不出现。
2. 选择后列表显示名称和浏览器设备 ID，状态保持“未连接”。
3. 再次选择同一设备不会重复；取消后可重新扫描。
4. Android 竖屏下操作按钮和设备 ID 不溢出；iPhone 显示兼容性提示。

入口：`src/main.js`；扫描逻辑：`src/bluetooth.js`；样式：`src/styles.css`。该仓库独立运行，不依赖固件仓库或桌面端源码。后续增加功能时，在本仓库逐步引入所需协议模块。

参考：[Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth)、[Netlify monorepos](https://docs.netlify.com/build/configure-builds/monorepos/)。
