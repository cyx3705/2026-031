using System.Text.Encodings.Web;
using System.Text.Json;

namespace HistorySiteStats;

internal static class StatsPage
{
    public const string Owner = "HistorySitestats";
    public const string PageId = "sitestats";
    private static readonly JsonSerializerOptions Options = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static object Table(string view, params (string Key, string Title)[] columns) => new
    {
        type = "table", id = "sitestats-" + view,
        dataSource = new { command = "sitestats.ui.data", args = new { view } },
        columns = columns.Select(c => new { key = c.Key, title = c.Title, width = "*" }).ToArray(),
    };
    private static object Text(string text) => new { type = "text", text, style = "caption" };
    public static string Describe() => JsonSerializer.Serialize(new
    {
        schemaVersion = 1, owner = Owner,
        pages = new[] { new {
            id = PageId, title = "访问统计", scene = Owner,
            placement = new { side = "center", visible = true, singleton = true },
            content = new { type = "stack", gap = "tight", children = new object[] {
                new { type = "panel", id = "sitestats-controls", text = "访问统计", rows = new object[] {
                    new { mode = "even", widgets = new object[] {
                        new { kind = "textbox", id = "days", label = "最近天数", mode = "select", options = new[] { "7", "14", "30" }, value = "14" },
                        new { kind = "button", text = "刷新数据", action = "sitestats.refresh" },
                    } },
                } },
                Text("仅显示上海服务器已记录的访问。首页迁至 GitHub Pages 后的新访问尚未接入此数据源；独立 IP 不等于人数。"),
                Table("overview", ("name", "概览"), ("value", "数值")),
                Text("每日访问趋势与明细（北京时间）"),
                Table("daily", ("date", "日期"), ("views", "访问量"), ("ips", "独立 IP"), ("bots", "已排除机器人")),
                Text("热门页面"), Table("pages", ("name", "页面"), ("value", "访问量")),
                Text("访问来源"), Table("sources", ("name", "来源域名"), ("value", "访问量")),
                Text("浏览器分布"), Table("browsers", ("name", "浏览器"), ("value", "访问量")),
                Text("最近访问"), Table("recent", ("time", "时间"), ("path", "页面"), ("browser", "浏览器")),
                new { type = "panel", id = "sitestats-connection", text = "连接设置（保存在本机）", rows = new object[] {
                    new { mode = "even", widgets = new object[] {
                        new { kind = "textbox", id = "host", label = "SSH 服务器" },
                        new { kind = "textbox", id = "user", label = "用户名" },
                    } },
                    new { mode = "even", widgets = new object[] {
                        new { kind = "textbox", id = "key", label = "私钥文件路径", flex = true },
                        new { kind = "button", text = "保存连接", action = "sitestats.configure" },
                    } },
                } },
            } },
        } },
    }, Options);

    public static string Actions() => JsonSerializer.Serialize(new
    {
        schemaVersion = 1, owner = Owner, actions = new object[] {
            new { id = "sitestats.refresh", title = "刷新数据", command = "sitestats.stats.refresh", args = new { days = "{days}" } },
            new { id = "sitestats.configure", title = "保存连接", command = "sitestats.connection.set", args = new { host = "{host}", user = "{user}", key = "{key}" } },
        },
    }, Options);
}
