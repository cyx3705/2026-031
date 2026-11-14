# 项目维护约定

先读 project.manifest.json、README.md 和 b-Office/访问统计模块约定.md。

网站继续沿用 Node 构建；HistorySiteStats 从 ModuleReady 模板派生，模块开发在 vulcan.dev.start 创建的工作区进行，通过 submit 构建并热装。不停宿主，不直接改运行包；finish 需人工审核后执行。

保留用户已有改动。机器连接配置与私钥不得入库。统计页面使用 Aurora 组件，跨模块接口先查 Diana 自描述。模块版本在项目清单、版本 props、模块 manifest 中一致。

根目录 Unused 是既有归档目录，只读保留，不为本次模块迁移挪动它。生成的站点页面不手改。网站样式权威源在 z-OneHistoryID。
