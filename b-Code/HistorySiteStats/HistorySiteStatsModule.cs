using HistoryVulcan.Core.Commands;
using HistoryVulcan.Core.Modules;

namespace HistorySiteStats;

/// <summary>通过 SSH 读取 OneHistory 上海后台，在 Aurora 中显示访问数据。</summary>
public sealed class HistorySiteStatsModule : IModuleContextAware
{
    private const string Internal = "Aurora 页面内部协议，不向远端暴露";
    public void Attach(IModuleContext context)
    {
        var client = new StatsClient(context.Environment.DataDirectory, new SshStatsTransport());
        var days = 14;
        async Task RefreshPage()
        {
            await context.Bus.InvokeAsync("aurora.ui.refreshdata page=sitestats", "").ConfigureAwait(false);
        }
        context.RegisterCommands(r => {
            r.Register(new CommandDescriptor {
                Name = "sitestats.connection.set", Domain = "sitestats", CommandClass = "connection",
                Summary = "保存本机统计服务器连接设置", HiddenReason = "仅限本机设置 SSH 连接与私钥路径",
                Example = "sitestats.connection.set host=stats.example.com user=reader key=C:/Keys/stats.pem",
                Parameters = [
                    new ParameterSpec { Name = "host", Type = ParamType.String, Required = true, Description = "SSH 服务器域名或 IPv4 地址，例如 stats.example.com" },
                    new ParameterSpec { Name = "user", Type = ParamType.String, Required = true, Description = "SSH 登录用户名，例如 reader" },
                    new ParameterSpec { Name = "key", Type = ParamType.String, Required = true, Description = "本机 SSH 私钥绝对路径，例如 C:/Keys/stats.pem" },
                ],
                Handler = async c => {
                    try {
                        client.Configure(new(c.RequireString("host"), c.RequireString("user"), c.RequireString("key")));
                        await RefreshPage();
                        return CommandResult.Ok("连接已保存到模块数据目录，私钥未复制。");
                    } catch (Exception e) { return CommandResult.Fail(e.Message); }
                },
            });
            r.Register(new CommandDescriptor {
                Name = "sitestats.stats.refresh", Domain = "sitestats", CommandClass = "stats",
                Summary = "读取上海统计并刷新页面", Example = "sitestats.stats.refresh days=14",
                Parameters = [Days()],
                Handler = async c => {
                    try {
                        var requested = int.Parse(c.GetString("days") ?? "14");
                        c.Progress?.Report("正在通过 SSH 读取上海统计…");
                        var data = await client.ReadAsync(requested, force: true);
                        days = requested;
                        await RefreshPage();
                        return CommandResult.Ok("统计已更新（服务器数据最多缓存 30 秒）。", StatsClient.Rows(data, "overview"));
                    } catch (Exception e) { return CommandResult.Fail(e.Message); }
                },
            });
            r.Register(new CommandDescriptor {
                Name = "sitestats.stats.get", Domain = "sitestats", CommandClass = "stats", Readonly = true,
                Summary = "查询上海服务器已记录的访问统计", Example = "sitestats.stats.get days=14", Parameters = [Days()],
                Handler = async c => {
                    try { return CommandResult.Ok("上海服务器访问统计", await client.ReadAsync(int.Parse(c.GetString("days") ?? "14"))); }
                    catch (Exception e) { return CommandResult.Fail(e.Message); }
                },
            });
            foreach (var name in new[] { "describe", "actions" })
                r.Register(new CommandDescriptor {
                    Name = "sitestats.ui." + name, Domain = "sitestats", CommandClass = "ui", Readonly = true, HiddenReason = Internal,
                    Summary = name == "describe" ? "返回访问统计页面描述" : "返回访问统计动作声明",
                    Handler = CommandDescriptor.Sync(_ => { var json = name == "describe" ? StatsPage.Describe() : StatsPage.Actions(); return CommandResult.Ok(json, json); }),
                });
            r.Register(new CommandDescriptor {
                Name = "sitestats.ui.data", Domain = "sitestats", CommandClass = "ui", Readonly = true, HiddenReason = Internal,
                Summary = "读取访问统计表格行", Example = "sitestats.ui.data view=overview",
                Parameters = [new ParameterSpec { Name = "view", Type = ParamType.String, Required = true,
                    AllowedValues = ["overview", "daily", "pages", "sources", "browsers", "recent"], Description = "统计视图名称，例如 overview 返回概览" }],
                Handler = async c => {
                    try { return CommandResult.Ok("访问统计", StatsClient.Rows(await client.ReadAsync(days), c.RequireString("view"))); }
                    catch (Exception e) { return CommandResult.Fail(e.Message); }
                },
            });
        });
    }
    private static ParameterSpec Days() => new() {
        Name = "days", Type = ParamType.String, Default = "14", AllowedValues = ["7", "14", "30"],
        Description = "最近多少天，按北京时间统计，默认 14 天",
    };
}
