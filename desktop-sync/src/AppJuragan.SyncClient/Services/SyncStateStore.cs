using System.Collections.Concurrent;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace AppJuragan.SyncClient.Services;

// ─── Sync state (persisted) ───────────────────────────────────────────────────

/// <summary>
/// Local record of what we know about a file that has been sync-ed.
/// Stored as a JSON sidecar in %LocalAppData%\AppJuragan\SyncClient\sync-state.json
/// </summary>
public class SyncEntry
{
    public string RemoteId { get; set; } = "";
    public string RelativePath { get; set; } = "";
    public long FileSize { get; set; }
    public string LocalHash { get; set; } = "";  // MD5 of local file at last sync
    public string RemoteHash { get; set; } = ""; // xxhash from server (stored for comparison)
    public DateTimeOffset LastSynced { get; set; }
    public bool IsFolder { get; set; }
    public bool IsFavorite { get; set; }
    public bool IsShared { get; set; }
    public string ShareUrl { get; set; } = "";
}

public class SyncStateStore
{
    private static readonly string StatePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AppJuragan", "SyncClient", "sync-state.json");

    private readonly ILogger<SyncStateStore> _log;
    private ConcurrentDictionary<string, SyncEntry> _state = new();

    public DateTimeOffset LastSyncTime { get; set; } = DateTimeOffset.MinValue;

    public SyncStateStore(ILogger<SyncStateStore> log)
    {
        _log = log;
        Load();
    }

    public IReadOnlyDictionary<string, SyncEntry> All => _state;

    public SyncEntry? GetByRemoteId(string id) =>
        _state.TryGetValue(id, out var e) ? e : null;

    public SyncEntry? GetByRelativePath(string rel) =>
        _state.Values.FirstOrDefault(e => e.RelativePath == rel);

    public void Upsert(SyncEntry entry)
    {
        _state[entry.RemoteId] = entry;
    }

    public void Remove(string remoteId) =>
        _state.TryRemove(remoteId, out _);

    public void Persist()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
            var data = new SyncStateData
            {
                LastSyncTime = LastSyncTime,
                Entries = _state.Values.ToList()
            };
            File.WriteAllText(StatePath,
                JsonSerializer.Serialize(data,
                    new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { _log.LogWarning(ex, "Could not persist sync state"); }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(StatePath)) return;
            var data = JsonSerializer.Deserialize<SyncStateData>(File.ReadAllText(StatePath));
            if (data != null)
            {
                LastSyncTime = data.LastSyncTime;
                _state = new ConcurrentDictionary<string, SyncEntry>(
                    data.Entries.ToDictionary(e => e.RemoteId));
            }
        }
        catch (Exception ex) { _log.LogWarning(ex, "Could not load sync state, starting fresh"); }
    }

    private class SyncStateData
    {
        public DateTimeOffset LastSyncTime { get; set; }
        public List<SyncEntry> Entries { get; set; } = new();
    }

    /// <summary>Compute MD5 hash of a local file for change detection.</summary>
    public static async Task<string> ComputeLocalHashAsync(string path)
    {
        await using var stream = File.OpenRead(path);
        var hash = await MD5.HashDataAsync(stream);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
