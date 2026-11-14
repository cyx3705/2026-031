using System.Text.Json;
using HistorySiteStats;

var dir = Path.Combine(Path.GetTempPath(), "SiteStatsTests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(dir);
try
{
    var transport = new FakeTransport();
    var client = new StatsClient(dir, transport);
    await Throws(() => client.ReadAsync(14), "未配置连接必须报错");
    var key = Path.Combine(dir, "test.key"); File.WriteAllText(key, "test fixture only");
    client.Configure(new Connection("stats.example.com", "reader", key));
    var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => client.ReadAsync(14)));
    Check(transport.Count == 1, "多个表格并发取数只能产生一次 SSH 请求");
    Check(StatsClient.Rows(results[0], "overview")[0]["value"] == "5", "今日访问映射错误");
    Check(StatsClient.Rows(results[0], "daily")[0]["date"] == "2026-11-14", "日期必须倒序");
    Check(StatsClient.Rows(results[0], "recent")[0]["time"] == "2026-11-14 08:00:00", "北京时间转换错误");
    Check(StatsClient.Rows(results[0], "pages")[0]["value"] == "5", "热门页面映射错误");
    await client.ReadAsync(7); Check(transport.Count == 2, "更换范围必须重新取数");
    await client.ReadAsync(7, true); Check(transport.Count == 3, "手动刷新必须重新取数");
    await Throws(() => client.ReadAsync(999), "禁止无效天数进入远端命令");
    try { new Connection("-oProxyCommand=bad", "root", key).Validate(); throw new Exception("接受 SSH 选项注入"); } catch (ArgumentException) { }
    transport.Json = "{}";
    await Throws(() => client.ReadAsync(30), "禁止错误数据覆盖快照");
    using var page = JsonDocument.Parse(StatsPage.Describe());
    Check(page.RootElement.GetProperty("owner").GetString() == "HistorySitestats", "页面 owner 不符合 Aurora 域规则");
    using var actions = JsonDocument.Parse(StatsPage.Actions());
    Check(actions.RootElement.GetProperty("actions").GetArrayLength() == 2, "刷新与设置动作缺失");
    Check(new ModuleInfo().Version == "0.1.0", "模块版本错误");
    Console.WriteLine("PASS: 并发缓存、时间范围、强制刷新、时区、投影、连接校验、损坏响应、页面协议与版本。");
}
finally { Directory.Delete(dir, true); }
static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
static async Task Throws(Func<Task> action, string message)
{
    try { await action(); } catch (Exception e) when (e is IOException or ArgumentException) { return; }
    throw new Exception(message);
}
sealed class FakeTransport : IStatsTransport
{
    public int Count;
    public string Json = """
    {"updated":"2026-11-14T08:00:00+08:00","totals":{"views":5,"ips":2,"bots":1},
    "daily":[{"date":"2026-11-13","views":0,"ips":0,"bots":0},{"date":"2026-11-14","views":5,"ips":2,"bots":1}],
    "pages":[["/",5]],"sources":[["直接访问",5]],"browsers":[["Edge",5]],
    "recent":[{"time":"2026-11-14T00:00:00Z","path":"/","browser":"Edge"}]}
    """;
    public Task<string> FetchAsync(Connection connection, int days) { Count++; return Task.FromResult(Json); }
}
