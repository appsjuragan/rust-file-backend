using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace AppJuragan.SyncClient.Services;

/// <summary>Persisted user settings stored in %LocalAppData%\AppJuragan\SyncClient\settings.json</summary>
public class AppSettings
{
    [JsonPropertyName("serverUrl")]
    public string ServerUrl { get; set; } = "http://localhost:3000";

    [JsonPropertyName("localSyncFolder")]
    public string LocalSyncFolder { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppJuragan");

    [JsonPropertyName("syncIntervalSeconds")]
    public int SyncIntervalSeconds { get; set; } = 30;

    [JsonPropertyName("runOnStartup")]
    public bool RunOnStartup { get; set; } = true;

    [JsonPropertyName("showNotifications")]
    public bool ShowNotifications { get; set; } = true;

    [JsonPropertyName("maxConcurrentTransfers")]
    public int MaxConcurrentTransfers { get; set; } = 3;
}

public class SettingsService
{
    private static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AppJuragan", "SyncClient", "settings.json");

    private readonly ILogger<SettingsService> _log;
    private AppSettings _current;

    public SettingsService(ILogger<SettingsService> log)
    {
        _log = log;
        _current = Load();
        EnsureSyncFolderExists();
    }

    public AppSettings Current => _current;

    public void Save(AppSettings settings)
    {
        _current = settings;
        Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
        File.WriteAllText(SettingsPath,
            JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        _log.LogInformation("Settings saved to {Path}", SettingsPath);
    }

    private AppSettings Load()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Could not load settings, using defaults");
        }
        return new AppSettings();
    }

    private void EnsureSyncFolderExists()
    {
        try { Directory.CreateDirectory(_current.LocalSyncFolder); }
        catch (Exception ex) { _log.LogWarning(ex, "Could not create sync folder"); }
    }
}
