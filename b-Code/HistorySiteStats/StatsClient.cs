using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HistorySiteStats;

internal sealed record Connection(string Host, string User, string KeyPath)
{
    public void Validate()
    {
        if (!Regex.IsMatch(Host, @"^[a-zA-Z0-9][a-zA-Z0-9.-]*$") ||
            !Regex.IsMatch(User, @"^[a-zA-Z0-9_][a-zA-Z0-9_-]*$"))
            throw new ArgumentException("服务器或用户名格式无效。");
        if (!Path.IsPathFullyQualified(KeyPath) || !File.Exists(KeyPath))
            throw new ArgumentException("请选择本机存在的 SSH 私钥文件（绝对路径）。");
    }
}

internal interface IStatsTransport
{
    Task<string> FetchAsync(Connection connection, int days);
}

internal sealed class SshStatsTransport : IStatsTransport
{
    public async Task<string> FetchAsync(Connection connection, int days)
    {
        connection.Validate();
        StatsClient.ValidateDays(days);
        var start = new ProcessStartInfo("ssh.exe")
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
        };
        foreach (var arg in new[] { "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=yes", "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=2",
            "-i", connection.KeyPath, connection.User + "@" + connection.Host,
            "curl --fail --silent --show-error --max-time 15 'http://127.0.0.1:18731/admin/api/stats?days=" + days + "'" })
            start.ArgumentList.Add(arg);
        using var process = Process.Start(start) ?? throw new IOException("无法启动 Windows OpenSSH。");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false); }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            throw new IOException("读取统计超时，请检查 SSH 连接和上海后台服务。");
        }
        var json = await output.ConfigureAwait(false);
        var diagnostic = await error.ConfigureAwait(false);
        if (process.ExitCode != 0)
            throw new IOException("SSH 取数失败：" + diagnostic.Trim());
        return json;
    }
}

internal sealed class StatsClient(string directory, IStatsTransport transport)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string configFile = Path.Combine(directory, "connection.json");
    private JsonElement? snapshot;
    private DateTimeOffset fetched;
    private int cachedDays;
    public static void ValidateDays(int days)
    {
        if (days is not (7 or 14 or 30)) throw new ArgumentException("时间范围只支持 7、14、30 天。");
    }

    public void Configure(Connection connection)
    {
        connection.Validate();
        gate.Wait();
        try
        {
            Directory.CreateDirectory(directory);
            File.WriteAllText(configFile, JsonSerializer.Serialize(connection));
            snapshot = null;
        }
        finally { gate.Release(); }
    }

    public async Task<JsonElement> ReadAsync(int days, bool force = false)
    {
        ValidateDays(days);
        await gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (!force && snapshot.HasValue && cachedDays == days && DateTimeOffset.UtcNow - fetched < TimeSpan.FromSeconds(30))
                return snapshot.Value;
            if (!File.Exists(configFile)) throw new IOException("尚未配置服务器，请在连接设置填写 SSH 服务器、用户名和私钥路径。");
            var connection = JsonSerializer.Deserialize<Connection>(await File.ReadAllTextAsync(configFile).ConfigureAwait(false))
                ?? throw new IOException("连接配置无效，请重新保存。");
            using var doc = JsonDocument.Parse(await transport.FetchAsync(connection, days).ConfigureAwait(false));
            var root = doc.RootElement;
            if (!root.TryGetProperty("daily", out var daily) || daily.ValueKind != JsonValueKind.Array || daily.GetArrayLength() == 0 ||
                !root.TryGetProperty("totals", out _)) throw new IOException("服务器返回的统计格式无效。");
            snapshot = root.Clone(); cachedDays = days; fetched = DateTimeOffset.UtcNow;
            return snapshot.Value;
        }
        finally { gate.Release(); }
    }

    public static IReadOnlyList<Dictionary<string, string>> Rows(JsonElement data, string view)
    {
        static string Str(JsonElement e, string key) => e.GetProperty(key).ToString();
        static Dictionary<string, string> Row(params string[] values)
        {
            var row = new Dictionary<string, string>();
            for (var i = 0; i < values.Length; i += 2) row[values[i]] = values[i + 1];
            return row;
        }
        if (view == "overview")
        {
            var total = data.GetProperty("totals"); var days = data.GetProperty("daily");
            return [Row("name", "今日页面访问", "value", Str(days[days.GetArrayLength()-1], "views")),
                Row("name", "期间页面访问", "value", Str(total, "views")),
                Row("name", "期间独立 IP", "value", Str(total, "ips")),
                Row("name", "已排除机器人", "value", Str(total, "bots")),
                Row("name", "数据更新于", "value", Str(data, "updated"))];
        }
        if (view == "daily") return data.GetProperty(view).EnumerateArray().Reverse()
            .Select(x => Row("date", Str(x, "date"), "views", Str(x, "views"), "ips", Str(x, "ips"), "bots", Str(x, "bots"))).ToList();
        if (view == "recent") return data.GetProperty(view).EnumerateArray()
            .Select(x => Row("time", DateTimeOffset.Parse(Str(x, "time")).ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd HH:mm:ss"),
                "path", Str(x, "path"), "browser", Str(x, "browser"))).ToList();
        if (view is "pages" or "sources" or "browsers") return data.GetProperty(view).EnumerateArray()
            .Select(x => Row("name", x[0].ToString(), "value", x[1].ToString())).ToList();
        throw new ArgumentException("未知统计视图。");
    }
}
