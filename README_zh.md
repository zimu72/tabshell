# TabShell - 基于 Tabby 的实用终端增强版

> 个人基于 Tabby 改造的终端工具，解决日常多会话管理痛点，现分享出来。无虚话，纯功能。

## 📌 核心新增功能

### 🔌 会话管理（左侧面板）
* 树形结构组织会话（支持无限层级文件夹）
* 拖拽调整顺序/移动会话
* 右键菜单：
  * 新建会话（目前侧边栏仅支持SSH连接）
  * 新建文件夹
  * 编辑/复制/删除
  * 快速连接
  * 新标签页打开
* 顶部搜索框实时过滤
* 会话配置 JSON 导入/导出（本地存储）
<img width="1635" height="1180" alt="image" src="https://github.com/user-attachments/assets/3b6b0fc8-40cd-4044-9ed8-f45bcc4c923c" />

### 🖥️ 多标签页网格平铺管理

* **全局平铺视图**：
  * 左上角快捷按钮一键切换平铺/标签视图
  * 将所有打开的标签页以网格形式平铺显示
* **动态布局管理**：
     * 新增标签会自动调整标签平铺的窗口布局
     * 关闭窗格后自动重组剩余空间
* **焦点控制**：
  * 当前活动标签页蓝色高亮边框标识
* 可以结合撰写窗格实现实时多标签动态输入
<img width="1639" height="1176" alt="image" src="https://github.com/user-attachments/assets/1fad07cc-2de9-43d3-bd43-42a353e465df" />

### ✍️ 撰写窗口（底部固定区域）
* **两种输入模式**：
  * `实时输入`：字符级同步到选中会话（特殊字符自动转义）
  * `批量输入`：回车后执行（支持 `;` 或换行分隔多命令）
* **标签页接收开关**：
  * 位置：替换原标签页标题栏的无用横杠按钮
  * 状态：🔊 启用（绿色） / 🔇 禁用（灰色）
  * 作用：控制该标签页是否接收撰写窗口命令
  * 默认：新建标签页自动启用
* **批量操作按钮**：
  * ⚡ 全部启用
  * 🚫 全部禁用
  * 📌 仅当前标签
  * 🔄 反选状态
* 状态栏显示：`发送到 X/Y 个会话`
* 命令历史记录 + 自动补全 + 语法高亮
* 无活动会话/全禁用时友好提示
<img width="1630" height="1183" alt="image" src="https://github.com/user-attachments/assets/16bad750-e1bf-4712-a7c3-23719237f2c9" />

### 📤 文件传输
* 保留 Tabby 原生 SFTP 浏览器（本地+远程）
* 新增 SFTP 跳转功能：
  * 支持通过 FileZilla/TabFTP（专为tabshell定制版FileZilla客户端，实现单实例多终端管理）打开当前sftp
<img width="1668" height="1171" alt="image" src="https://github.com/user-attachments/assets/168cd2f5-639a-47c6-a32a-ec30a3162d75" />
<img width="1926" height="1173" alt="image" src="https://github.com/user-attachments/assets/b6898a23-2b86-40be-bd53-4d46761a2e6d" />

### 🔒 兼容性
* 基于 Tabby 1.0.170+ 改造
* 完整保留 Tabby 原有功能（SSH/Telnet/Serial/主题/插件等）
* 支持 Windows / Linux

## 💡 使用说明
* 首次启动自动导入原有 Tabby 配置
* 会话配置文件位置：`~/.config/tablishell/`
* 开源项目，欢迎按需修改

> 无商业用途，无数据收集，纯本地工具  
