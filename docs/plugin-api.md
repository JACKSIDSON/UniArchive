# 插件 API

> V1 只提供骨架：注册命令、注册菜单、注册视图、只读数据访问。
> 不开放任意文件写入，以保证 Vault 数据不变量不被破坏。

## 目录

```
.uniarchive/plugins/<plugin-id>/
├── plugin.json
└── main.js
```

## plugin.json

```json
{
  "id": "hello-uniarchive",
  "name": "示例插件",
  "version": "1.0.0",
  "description": "注册一个命令并在菜单中显示",
  "author": "you",
  "main": "main.js",
  "minAppVersion": "1.0.0"
}
```

## main.js（CommonJS）

```js
module.exports.activate = function (api) {
  api.registerCommand({
    id: 'hello.sayHi',
    title: '打个招呼',
    run() {
      api.notify('你好，UniArchive！')
      api.log('settings.update', 'hello-uniarchive', '执行了示例命令')
    }
  })

  api.registerMenuItem({
    id: 'hello.menu',
    label: '示例：打个招呼',
    commandId: 'hello.sayHi'
  })

  api.registerView({
    id: 'hello.view',
    title: '示例视图',
    route: '#/settings'
  })
}
```

也可以直接导出函数：

```js
module.exports = function (api) { /* ... */ }
```

## API

```ts
interface PluginApi {
  readonly context: { vaultRoot: string; vaultName: string }

  registerCommand(command: { id: string; title: string; run: () => void | Promise<void> }): void
  registerMenuItem(item: { id: string; label: string; commandId: string }): void
  registerView(view: { id: string; title: string; route: string }): void

  archives: {
    list(keyword?: string): ArchiveListItem[]   // 只读，最多 100 条
    get(id: string): Archive | null             // 只读
  }

  log(action: LogAction, target?: string, detail?: string): void
  notify(message: string): void
}
```

## 加载时机

- 打开档案库时自动扫描 `.uniarchive/plugins/` 并调用 `activate(api)`。
- 设置页可「重新加载插件」，或关闭「启用插件」开关。
- 插件命令会出现在应用菜单的「插件」下。

## 限制

- 插件以本地可信代码运行（不做沙箱），安装前请自行确认来源。
- V1 不提供写 API：插件不能直接创建 / 修改 / 删除档案。
- 插件抛出的异常会被捕获并写入日志，不影响主程序。
