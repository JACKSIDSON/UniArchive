/**
 * 示例插件：注册一个命令、一个菜单项与一个视图。
 * 把 hello-uniarchive/ 整个目录复制到任意 Vault 的 .uniarchive/plugins/ 下即可生效。
 */
module.exports.activate = function activate(api) {
  api.registerCommand({
    id: 'hello.sayHi',
    title: '打个招呼',
    run() {
      api.notify(`你好，${api.context.vaultName}！`);
      api.log('settings.update', 'hello-uniarchive', '执行了示例命令');
    }
  });

  api.registerCommand({
    id: 'hello.count',
    title: '统计档案数量',
    run() {
      const list = api.archives.list();
      api.notify(`当前档案库共有 ${list.length} 篇档案（最多统计 100 篇）`);
    }
  });

  api.registerMenuItem({
    id: 'hello.menu',
    label: '示例：打个招呼',
    commandId: 'hello.sayHi'
  });

  api.registerView({
    id: 'hello.view',
    title: '示例视图',
    route: '#/settings'
  });
};
