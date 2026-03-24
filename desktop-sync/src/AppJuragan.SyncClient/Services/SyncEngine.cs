using AppJuragan.ShellExtension;
using Microsoft.Extensions.Logging;
using System.IO;

namespace AppJuragan.SyncClient.Services;

public enum SyncStatus { Idle, Syncing, Error, Paused }

/// <summary>
/// Core sync engine. Runs a periodic full-reconciliation loop:
///   1. Fetch remote file tree
///   2. Download new/changed remote files
///   3. Upload new/changed local files
///   4. Update shell overlay badges
/// All operations are best-effort: individual errors are logged and skipped.
/// A FileSystemWatcher also triggers an incremental sync on local changes.
/// </summary>
public class SyncEngine : IHostedService
{
    private readonly ApiClient _api;
    private readonly AuthService _auth;
    private readonly SettingsService _settings;
    private readonly SyncStateStore _state;
    private readonly ILogger<SyncEngine> _log;

    private CancellationTokenSource? _cts;
    private FileSystemWatcher? _watcher;
    private Task? _loopTask;
    private readonly SemaphoreSlim _syncLock = new(1, 1);
    private readonly SemaphoreSlim _uploadSemaphore;

    public SyncStatus Status { get; private set; } = SyncStatus.Idle;
    public event EventHandler<SyncStatus>? StatusChanged;
    public event EventHandler<string>? FileActivity;

    public SyncEngine(
        ApiClient api, AuthService auth,
        SettingsService settings, SyncStateStore state,
        ILogger<SyncEngine> log)
    {
        _api = api;
        _auth = auth;
        _settings = settings;
        _state = state;
        _log = log;
        _uploadSemaphore = new SemaphoreSlim(settings.Current.MaxConcurrentTransfers);
    }

    // ── IHostedService ────────────────────────────────────────────────────────

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_auth.IsAuthenticated) return Task.CompletedTask;

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        SetupWatcher();
        _loopTask = RunLoopAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _cts?.Cancel();
        _watcher?.Dispose();
        if (_loopTask != null)
            await _loopTask.WaitAsync(cancellationToken).ConfigureAwait(false);
        _state.Persist();
    }

    // ── Periodic loop ─────────────────────────────────────────────────────────

    private async Task RunLoopAsync(CancellationToken ct)
    {
        _log.LogInformation("Sync engine started");
        while (!ct.IsCancellationRequested)
        {
            await RunFullSyncAsync(ct);
            var interval = TimeSpan.FromSeconds(_settings.Current.SyncIntervalSeconds);
            await Task.Delay(interval, ct).ConfigureAwait(false);
        }
    }

    public async Task RunFullSyncAsync(CancellationToken ct = default)
    {
        if (!await _syncLock.WaitAsync(0, ct)) return; // already running
        SetStatus(SyncStatus.Syncing);
        try
        {
            _log.LogInformation("=== Full sync cycle starting ===");

            // 1. Fetch complete remote tree
            var remoteItems = await _api.ListAllFilesRecursiveAsync(ct);

            // 2. Build remote path lookup (relative path → FileMetadata)
            var remotePaths = BuildRemotePathMap(remoteItems);

            // 3. Download: remote → local
            await ProcessDownloadsAsync(remotePaths, ct);

            // 4. Upload: local → remote
            await ProcessUploadsAsync(remotePaths, ct);

            // 5. Update overlay badges
            RefreshOverlays(remoteItems);

            _state.Persist();
            SetStatus(SyncStatus.Idle);
            _log.LogInformation("=== Full sync cycle complete ===");
        }
        catch (OperationCanceledException) { /* shutting down */ }
        catch (Exception ex)
        {
            _log.LogError(ex, "Sync cycle failed");
            SetStatus(SyncStatus.Error);
        }
        finally
        {
            _syncLock.Release();
        }
    }

    // ── Download (remote → local) ─────────────────────────────────────────────

    private async Task ProcessDownloadsAsync(
        Dictionary<string, FileMetadata> remotePaths, CancellationToken ct)
    {
        var syncRoot = _settings.Current.LocalSyncFolder;

        foreach (var (relPath, remote) in remotePaths)
        {
            ct.ThrowIfCancellationRequested();
            var localPath = Path.Combine(syncRoot, relPath.Replace('/', Path.DirectorySeparatorChar));

            if (remote.IsFolder)
            {
                Directory.CreateDirectory(localPath);
                TrackState(remote, relPath);
                continue;
            }

            var existing = _state.GetByRemoteId(remote.Id);
            var needsDownload = existing == null               // never synced
                || !File.Exists(localPath)                     // deleted locally
                || existing.RemoteHash != (remote.Hash ?? ""); // changed on server

            if (!needsDownload) continue;

            try
            {
                _log.LogInformation("⬇ Downloading {Path}", relPath);
                FileActivity?.Invoke(this, $"Downloading: {Path.GetFileName(relPath)}");
                await _api.DownloadFileAsync(remote.Id, localPath, ct);
                var localHash = await SyncStateStore.ComputeLocalHashAsync(localPath);
                TrackState(remote, relPath, localHash);
                _log.LogInformation("✔ Downloaded {Path}", relPath);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Failed to download {Path} — skipping", relPath);
            }
        }
    }

    // ── Upload (local → remote) ────────────────────────────────────────────────

    private async Task ProcessUploadsAsync(
        Dictionary<string, FileMetadata> remotePaths, CancellationToken ct)
    {
        var syncRoot = _settings.Current.LocalSyncFolder;
        if (!Directory.Exists(syncRoot)) return;

        // Enumerate all local files
        var localFiles = Directory.EnumerateFiles(syncRoot, "*", SearchOption.AllDirectories);
        var uploadTasks = new List<Task>();

        foreach (var localPath in localFiles)
        {
            ct.ThrowIfCancellationRequested();
            var relPath = Path.GetRelativePath(syncRoot, localPath).Replace(Path.DirectorySeparatorChar, '/');

            // Already exists on remote with same content?
            if (remotePaths.TryGetValue(relPath, out var remote))
            {
                var existing = _state.GetByRemoteId(remote.Id);
                if (existing != null)
                {
                    var localHash = await SyncStateStore.ComputeLocalHashAsync(localPath);
                    if (existing.LocalHash == localHash) continue; // unchanged
                }
            }

            // Rate-limit concurrent uploads
            var capturedPath = localPath;
            var capturedRel = relPath;
            uploadTasks.Add(UploadFileAsync(capturedPath, capturedRel, remotePaths, ct));
        }

        await Task.WhenAll(uploadTasks);
    }

    private async Task UploadFileAsync(
        string localPath, string relPath,
        Dictionary<string, FileMetadata> remotePaths,
        CancellationToken ct)
    {
        await _uploadSemaphore.WaitAsync(ct);
        try
        {
            var syncRoot = _settings.Current.LocalSyncFolder;
            var info = new FileInfo(localPath);
            var mime = MimeType.FromExtension(info.Extension);

            // Resolve parent folder ID
            var parentRel = Path.GetDirectoryName(relPath)?.Replace(Path.DirectorySeparatorChar, '/');
            string? parentId = null;
            if (!string.IsNullOrEmpty(parentRel) && remotePaths.TryGetValue(parentRel, out var parentRemote))
                parentId = parentRemote.Id;

            // Init upload session
            _log.LogInformation("⬆ Uploading {Path}", relPath);
            FileActivity?.Invoke(this, $"Uploading: {Path.GetFileName(relPath)}");

            var init = await _api.InitUploadAsync(new UploadInitRequest(
                info.Name, info.Length, mime, parentId), ct);
            if (init == null) return;

            // Chunked upload
            var parts = new List<PartInfo>();
            await using var file = File.OpenRead(localPath);
            var partSize = (int)Math.Max(init.PartSize, 1 * 1024 * 1024); // min 1MB
            var buffer = new byte[partSize];
            int partNumber = 1;

            while (true)
            {
                var read = await file.ReadAsync(buffer.AsMemory(0, partSize), ct);
                if (read == 0) break;
                var etag = await _api.UploadChunkAsync(init.UploadId, partNumber, buffer[..read], ct);
                parts.Add(new PartInfo(partNumber, etag));
                partNumber++;
            }

            // Complete upload
            var result = await _api.CompleteUploadAsync(init.UploadId,
                new CompleteUploadRequest(parts, info.Name, parentId, mime), ct);

            if (result != null)
            {
                var localHash = await SyncStateStore.ComputeLocalHashAsync(localPath);
                TrackState(result, relPath, localHash);
                _log.LogInformation("✔ Uploaded {Path}", relPath);
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to upload {Path} — skipping", relPath);
        }
        finally
        {
            _uploadSemaphore.Release();
        }
    }

    // ── Shell overlay badges ───────────────────────────────────────────────────

    private void RefreshOverlays(List<FileMetadata> remoteItems)
    {
        var syncRoot = _settings.Current.LocalSyncFolder;
        var store = _state;

        foreach (var item in remoteItems)
        {
            var entry = store.GetByRemoteId(item.Id);
            if (entry == null) continue;
            var localPath = Path.Combine(syncRoot, entry.RelativePath.Replace('/', Path.DirectorySeparatorChar));

            OverlayState flags = OverlayState.None;
            if (File.Exists(localPath) || Directory.Exists(localPath))
                flags |= OverlayState.Synced;
            if (item.IsShared)
                flags |= OverlayState.Shared;
            if (item.IsFavorite)
                flags |= OverlayState.Favorite;

            ShellOverlayCache.Set(localPath, flags);
        }

        ShellHelper.NotifyShellRefresh(syncRoot);
    }

    // ── FileSystemWatcher (incremental on local changes) ──────────────────────

    private void SetupWatcher()
    {
        var syncRoot = _settings.Current.LocalSyncFolder;
        Directory.CreateDirectory(syncRoot);

        _watcher = new FileSystemWatcher(syncRoot)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite,
            EnableRaisingEvents = true
        };

        // Debounced: trigger incremental sync 2 s after last change
        var debounce = new System.Timers.Timer(2000) { AutoReset = false };
        debounce.Elapsed += (_, _) =>
        {
            if (_cts is { Token: var ct } && !ct.IsCancellationRequested)
                _ = RunFullSyncAsync(ct);
        };

        void Reset(object? s, FileSystemEventArgs _) { debounce.Stop(); debounce.Start(); }
        _watcher.Changed += Reset;
        _watcher.Created += Reset;
        _watcher.Deleted += Reset;
        _watcher.Renamed += Reset;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static Dictionary<string, FileMetadata> BuildRemotePathMap(List<FileMetadata> items)
    {
        // Build id→item lookup for path construction
        var byId = items.ToDictionary(i => i.Id);
        var result = new Dictionary<string, FileMetadata>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in items)
        {
            var path = BuildRelativePath(item, byId);
            result[path] = item;
        }
        return result;
    }

    private static string BuildRelativePath(FileMetadata item, Dictionary<string, FileMetadata> byId)
    {
        var parts = new Stack<string>();
        parts.Push(item.Filename);
        var current = item;

        while (!string.IsNullOrEmpty(current.ParentId) && byId.TryGetValue(current.ParentId, out var parent))
        {
            parts.Push(parent.Filename);
            current = parent;
        }

        return string.Join('/', parts.ToArray().Reverse());
    }

    private void TrackState(FileMetadata remote, string relPath, string localHash = "")
    {
        _state.Upsert(new SyncEntry
        {
            RemoteId = remote.Id,
            RelativePath = relPath,
            FileSize = remote.Size ?? 0,
            LocalHash = localHash,
            RemoteHash = remote.Hash ?? "",
            LastSynced = DateTimeOffset.UtcNow,
            IsFolder = remote.IsFolder,
            IsFavorite = remote.IsFavorite,
            IsShared = remote.IsShared,
        });
    }

    private void SetStatus(SyncStatus s)
    {
        Status = s;
        StatusChanged?.Invoke(this, s);
    }
}

/// <summary>Minimal IHostedService interface (not using Generic Host to keep app simple)</summary>
public interface IHostedService
{
    Task StartAsync(CancellationToken ct);
    Task StopAsync(CancellationToken ct);
}

/// <summary>Simple MIME type helper based on file extension.</summary>
public static class MimeType
{
    private static readonly Dictionary<string, string> Map = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png",
        [".gif"] = "image/gif", [".webp"] = "image/webp", [".bmp"] = "image/bmp",
        [".pdf"] = "application/pdf", [".txt"] = "text/plain", [".md"] = "text/markdown",
        [".mp4"] = "video/mp4", [".mkv"] = "video/x-matroska", [".mov"] = "video/quicktime",
        [".mp3"] = "audio/mpeg", [".flac"] = "audio/flac", [".wav"] = "audio/wav",
        [".zip"] = "application/zip", [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };

    public static string FromExtension(string ext) =>
        Map.TryGetValue(ext, out var m) ? m : "application/octet-stream";
}
