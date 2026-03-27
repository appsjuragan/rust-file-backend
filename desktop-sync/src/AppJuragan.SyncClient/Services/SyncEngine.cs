using AppJuragan.ShellExtension;
using Microsoft.Extensions.Logging;
using System.IO;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System;

namespace AppJuragan.SyncClient.Services;

public enum SyncStatus { Idle, Syncing, Error, Paused }

/// <summary>
/// Core sync engine. Runs a periodic full-reconciliation loop:
///   1. Fetch remote file tree
///   2. Reconcile both-way deletions
///   3. Download new/changed remote files
///   4. Upload new/changed local files
///   5. Update shell overlay badges
/// All operations are best-effort: individual errors are logged and skipped.
/// A FileSystemWatcher also triggers an incremental sync on local changes.
/// </summary>
public class SyncEngine : IHostedService
{
    private readonly ApiClient _api;
    private readonly AuthService _auth;
    private readonly SettingsService _settings;
    private readonly SyncStateStore _state;
    private readonly CloudFilterService _cloudFilter;
    private readonly ILogger<SyncEngine> _log;

    private CancellationTokenSource? _cts;
    private FileSystemWatcher? _watcher;
    private Task? _loopTask;
    private readonly SemaphoreSlim _syncLock = new(1, 1);
    private readonly SemaphoreSlim _uploadSemaphore;
    private readonly ConcurrentDictionary<string, byte> _engineWrites = new(StringComparer.OrdinalIgnoreCase);

    private void MarkEngineWrite(string path)
    {
        _engineWrites[path] = 1;
        Task.Delay(2000).ContinueWith(t => _engineWrites.TryRemove(path, out _));
    }

    public SyncStatus Status { get; private set; } = SyncStatus.Idle;
    public event EventHandler<SyncStatus>? StatusChanged;
    public event EventHandler<string>? FileActivity;

    public SyncEngine(
        ApiClient api, AuthService auth,
        SettingsService settings, SyncStateStore state,
        CloudFilterService cloudFilter,
        ILogger<SyncEngine> log)
    {
        _api = api;
        _auth = auth;
        _settings = settings;
        _state = state;
        _cloudFilter = cloudFilter;
        _log = log;
        _uploadSemaphore = new SemaphoreSlim(settings.Current.MaxConcurrentTransfers);
    }

    // ── IHostedService ────────────────────────────────────────────────────────

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_auth.IsAuthenticated) return Task.CompletedTask;

        if (_settings.Current.SyncMode == SyncMode.Streaming)
        {
            _cloudFilter.RegisterSyncRoot(_settings.Current.LocalSyncFolder, "AppJuragan", "1.0");
        }

        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        SetupWatcher();
        _loopTask = RunLoopAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _cts?.Cancel();
        _watcher?.Dispose();
        
        // Wait at most 3 seconds for the loop to finish, otherwise just move on
        // (the process is shutting down anyway)
        if (_loopTask != null)
        {
            var timeoutTask = Task.Delay(3000, cancellationToken);
            var completedTask = await Task.WhenAny(_loopTask, timeoutTask).ConfigureAwait(false);
            if (completedTask == timeoutTask)
            {
                _log.LogWarning("Sync engine stop timed out after 3s. Forcing exit.");
            }
        }
        
        _state.Persist();
    }

    // ── Periodic loop ─────────────────────────────────────────────────────────

    private async Task RunLoopAsync(CancellationToken ct)
    {
        _log.LogInformation("Sync engine started");
        while (!ct.IsCancellationRequested)
        {
            if (_state.LastSyncTime == DateTimeOffset.MinValue)
            {
                await RunFullSyncAsync(ct);
            }
            else
            {
                await RunDeltaSyncAsync(ct);
            }

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
            _api.UpdateBaseAddress(_settings.Current.ServerUrl);

            var startTime = DateTimeOffset.UtcNow;
            var remoteItems = (await _api.ListAllFilesRecursiveAsync(ct))
                .Where(i => !i.IsSystem).ToList();
            
            var remotePaths = BuildRemotePathMap(remoteItems);
            var syncRoot = _settings.Current.LocalSyncFolder;
            bool localDirEmpty = !Directory.Exists(syncRoot) || !Directory.EnumerateFileSystemEntries(syncRoot).Any();
            
            if (!localDirEmpty || !remoteItems.Any())
            {
                await ReconcileDeletionsAsync(remotePaths, ct);
            }

            await ProcessDownloadsAsync(remotePaths, ct);
            await ProcessUploadsAsync(remotePaths, ct);

            RefreshOverlays(remoteItems);

            _state.LastSyncTime = startTime;
            _state.Persist();
            SetStatus(SyncStatus.Idle);
            _log.LogInformation("=== Full sync cycle complete ===");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            _log.LogError(ex, "Full sync failed");
            SetStatus(SyncStatus.Error);
        }
        finally
        {
            _syncLock.Release();
        }
    }

    public async Task RunDeltaSyncAsync(CancellationToken ct = default)
    {
        if (!await _syncLock.WaitAsync(0, ct)) return;
        SetStatus(SyncStatus.Syncing);
        try
        {
            _log.LogInformation("=== Delta sync cycle starting (since {Time}) ===", _state.LastSyncTime);
            _api.UpdateBaseAddress(_settings.Current.ServerUrl);

            var startTime = DateTimeOffset.UtcNow;
            var changes = await _api.GetDeltaAsync(_state.LastSyncTime, ct);
            
            if (changes.Count == 0) {
                _log.LogInformation("No changes detected since last sync.");
            } else {
                _log.LogInformation("Processing {Count} changes from delta API", changes.Count);
                
                // For delta sync, we process each change individually.
                // We need to build paths for them, which may require fetching parent info if not in state.
                foreach (var remote in changes)
                {
                    await ProcessDeltaItemAsync(remote, ct);
                }
            }

            // Still do local → remote check for new local files
            // (In a real app, FileSystemWatcher handles this better, but we do a sweep)
            // For now, full local sweep is expensive, but let's keep it minimal
            // await ProcessUploadsAsync(new Dictionary<string, FileMetadata>(), ct);

            _state.LastSyncTime = startTime;
            _state.Persist();
            SetStatus(SyncStatus.Idle);
            _log.LogInformation("=== Delta sync cycle complete ===");
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Delta sync failed");
            SetStatus(SyncStatus.Error);
        }
        finally
        {
            _syncLock.Release();
        }
    }

    private async Task ProcessDeltaItemAsync(FileMetadata remote, CancellationToken ct)
    {
        var syncRoot = _settings.Current.LocalSyncFolder;
        
        // Handle Deletion
        if (remote.DeletedAt.HasValue)
        {
            var entry = _state.GetByRemoteId(remote.Id);
            if (entry != null)
            {
                var fullLocalPath = Path.Combine(syncRoot, entry.RelativePath.Replace('/', Path.DirectorySeparatorChar));
                _log.LogInformation("🗑 Delta: Deleting {Path}", entry.RelativePath);
                try {
                    MarkEngineWrite(fullLocalPath);
                    if (entry.IsFolder && Directory.Exists(fullLocalPath)) Directory.Delete(fullLocalPath, true);
                    else if (!entry.IsFolder && File.Exists(fullLocalPath)) File.Delete(fullLocalPath);
                    _state.Remove(remote.Id);
                } catch (Exception ex) { _log.LogWarning(ex, "Failed to apply delta deletion"); }
            }
            return;
        }

        // Build path resolution
        string relPath;
        var existingEntry = _state.GetByRemoteId(remote.Id);
        if (existingEntry != null) {
            relPath = existingEntry.RelativePath;
        } else {
            // New file. Attempt to build path.
            if (string.IsNullOrEmpty(remote.ParentId) || remote.ParentId == "root") {
                relPath = remote.Filename;
            } else {
                // Check if we know the parent
                var parentEntry = _state.GetByRemoteId(remote.ParentId);
                if (parentEntry != null) {
                    relPath = $"{parentEntry.RelativePath}/{remote.Filename}";
                } else {
                    // Fetch from API
                    try {
                        var pathDatas = await _api.GetFolderPathAsync(remote.ParentId, ct);
                        // pathDatas is a list from root to immediate parent.
                        var pNames = pathDatas.Select(p => p.Filename).ToList();
                        pNames.Add(remote.Filename);
                        relPath = string.Join('/', pNames);
                    } catch (Exception ex) {
                        _log.LogWarning(ex, "Failed to resolve path for {Id}, placing in root", remote.Id);
                        relPath = remote.Filename; // Fallback
                    }
                }
            }
        }

        var localPath = Path.Combine(syncRoot, relPath.Replace('/', Path.DirectorySeparatorChar));

        if (remote.IsFolder)
        {
            MarkEngineWrite(localPath);
            if (!Directory.Exists(localPath)) Directory.CreateDirectory(localPath);
            TrackState(remote, relPath);
            return;
        }

        bool needsDownload = false;
        if (existingEntry == null) {
            needsDownload = true;
        } else if (string.IsNullOrEmpty(existingEntry.RemoteHash)) {
            // We uploaded this recently, update hash and skip download
            existingEntry.RemoteHash = remote.Hash ?? "";
            _state.Upsert(existingEntry);
            needsDownload = false;
        } else {
            needsDownload = existingEntry.RemoteHash != (remote.Hash ?? "");
        }

        if (needsDownload)
        {
            try {
                MarkEngineWrite(localPath);
                if (_settings.Current.SyncMode == SyncMode.Streaming) {
                    _cloudFilter.CreatePlaceholder(localPath, remote);
                } else {
                    await _api.DownloadFileAsync(remote.Id, localPath, ct);
                }
                
                var h = (_settings.Current.SyncMode == SyncMode.Mirroring && File.Exists(localPath))
                    ? await SyncStateStore.ComputeLocalHashAsync(localPath)
                    : "";
                TrackState(remote, relPath, h);
            } catch (Exception ex) {
                _log.LogWarning(ex, "Failed to process delta item {Path}", relPath);
            }
        }
    }

    // ── Download (remote → local) ─────────────────────────────────────────────

    private async Task ProcessDownloadsAsync(
        Dictionary<string, FileMetadata> remotePaths, CancellationToken ct)
    {
        var syncRoot = _settings.Current.LocalSyncFolder;
        _log.LogInformation("Processing downloads: {Count} remote items, syncRoot={Root}", remotePaths.Count, syncRoot);

        foreach (var (relPath, remote) in remotePaths)
        {
            ct.ThrowIfCancellationRequested();
            var localPath = Path.Combine(syncRoot, relPath.Replace('/', Path.DirectorySeparatorChar));

            if (remote.IsFolder)
            {
                if (!Directory.Exists(localPath)) {
                    _log.LogDebug("📁 Creating folder: {Path}", relPath);
                    MarkEngineWrite(localPath);
                    Directory.CreateDirectory(localPath);
                }
                TrackState(remote, relPath);
                continue;
            }

            var existing = _state.GetByRemoteId(remote.Id);
            var fileExists = File.Exists(localPath);

            bool needsDownload;
            if (existing == null)
            {
                if (!fileExists)
                {
                    // New cloud file we've never seen — always download.
                    needsDownload = true;
                }
                else
                {
                    // File exists locally but we have no sync record (after state clear or
                    // first run). Compare sizes: if they differ the cloud version is different.
                    // Cloud-first: download to bring local up to date.
                    var localSize = new FileInfo(localPath).Length;
                    needsDownload = (remote.Size ?? 0) != localSize;
                    if (!needsDownload)
                    {
                        // Sizes match — assume same content. Record state so future cloud
                        // edits (hash change) are visible next cycle.
                        var h = await SyncStateStore.ComputeLocalHashAsync(localPath);
                        TrackState(remote, relPath, h);
                    }
                }
            }
            else if (!fileExists)
            {
                // File deleted locally — ReconcileDeletionsAsync handles it.
                needsDownload = false;
            }
            else if (string.IsNullOrEmpty(existing.RemoteHash))
            {
                // We uploaded this file this session; the server's xxHash3 was not known yet.
                // Now that the server listing includes the file, record the real RemoteHash so
                // the NEXT cycle can detect genuine cloud edits without downloading right now.
                _state.Upsert(new SyncEntry
                {
                    RemoteId    = existing.RemoteId,
                    RelativePath = existing.RelativePath,
                    FileSize    = remote.Size ?? 0,
                    LocalHash   = existing.LocalHash,
                    RemoteHash  = remote.Hash ?? "",   // populate real xxHash3 from listing
                    LastSynced  = DateTimeOffset.UtcNow,
                    IsFolder    = existing.IsFolder,
                    IsFavorite  = remote.IsFavorite,
                    IsShared    = remote.IsShared,
                    ShareUrl    = existing.ShareUrl
                });
                needsDownload = false;
            }
            else
            {
                // Normal case: re-download only if the server's hash changed.
                needsDownload = existing.RemoteHash != (remote.Hash ?? "");
            }

            if (!needsDownload) continue;


            try
            {
                MarkEngineWrite(localPath);
                if (_settings.Current.SyncMode == SyncMode.Streaming)
                {
                    _log.LogInformation("☁ Creating placeholder for {Path}", relPath);
                    _cloudFilter.CreatePlaceholder(localPath, remote);
                }
                else
                {
                    _log.LogInformation("⬇ Downloading {Path}", relPath);
                    FileActivity?.Invoke(this, $"Downloading: {Path.GetFileName(relPath)}");
                    await _api.DownloadFileAsync(remote.Id, localPath, ct);
                    _log.LogInformation("✔ Downloaded {Path} ({Size} bytes)", relPath, new FileInfo(localPath).Length);
                }
                
                var localHash = _settings.Current.SyncMode == SyncMode.Mirroring 
                    ? await SyncStateStore.ComputeLocalHashAsync(localPath) 
                    : ""; // placeholders have no local hash yet
                TrackState(remote, relPath, localHash);
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
        var localFiles = Directory.EnumerateFiles(syncRoot, "*", SearchOption.AllDirectories).ToList();
        var uploadTasks = new List<Task>();

        foreach (var localPath in localFiles)
        {
            ct.ThrowIfCancellationRequested();
            var relPath = Path.GetRelativePath(syncRoot, localPath).Replace(Path.DirectorySeparatorChar, '/');

            if (remotePaths.TryGetValue(relPath, out var remote))
            {
                // File exists on remote. Use our local state to decide if it changed.
                // NOTE: We do NOT compare against remote.Hash because the server uses xxHash3
                //       while we compute MD5 locally — they will never match.
                var existing = _state.GetByRemoteId(remote.Id);
                if (existing != null)
                {
                    var localHash = await SyncStateStore.ComputeLocalHashAsync(localPath);
                    if (existing.LocalHash == localHash)
                        continue; // unchanged since last sync — skip
                    // Hash differs → file edited locally, fall through to upload (replace)
                }
                else
                {
                    // No state entry yet. This file exists on remote but we have no record
                    // of syncing it (e.g. just downloaded this cycle). Record it and skip
                    // to avoid creating a duplicate.
                    var localHash = await SyncStateStore.ComputeLocalHashAsync(localPath);
                    TrackState(remote, relPath, localHash);
                    continue;
                }
            }

            var capturedPath = localPath;
            var capturedRel = relPath;
            uploadTasks.Add(UploadFileAsync(capturedPath, capturedRel, remotePaths, ct));
        }

        await Task.WhenAll(uploadTasks);
    }

    private async Task ReconcileDeletionsAsync(Dictionary<string, FileMetadata> remotePaths, CancellationToken ct)
    {
        var syncRoot = _settings.Current.LocalSyncFolder;
        var stateEntries = _state.All.Values.ToList();

        foreach (var entry in stateEntries)
        {
            ct.ThrowIfCancellationRequested();
            var localPath = Path.Combine(syncRoot, entry.RelativePath.Replace('/', Path.DirectorySeparatorChar));
            bool diskExists = entry.IsFolder ? Directory.Exists(localPath) : File.Exists(localPath);

            // Case 1: Remote Deletion (State has it, Server doesn't)
            if (!remotePaths.ContainsKey(entry.RelativePath))
            {
                _log.LogInformation("🗑 Remote deletion detected: {Path}. Deleting locally...", entry.RelativePath);
                try {
                    MarkEngineWrite(localPath);
                    if (entry.IsFolder && Directory.Exists(localPath)) Directory.Delete(localPath, true);
                    else if (!entry.IsFolder && File.Exists(localPath)) File.Delete(localPath);
                    _state.Remove(entry.RemoteId);
                } catch (Exception ex) { _log.LogWarning(ex, "Failed to apply remote deletion locally"); }
                continue;
            }

            // Case 2: Local Deletion (State has it, Server has it, Disk doesn't)
            if (!diskExists)
            {
                _log.LogInformation("🗑 Local deletion detected: {Path}. Deleting from cloud...", entry.RelativePath);
                try {
                    FileActivity?.Invoke(this, $"Deleting from cloud: {Path.GetFileName(entry.RelativePath)}");
                    await _api.DeleteItemAsync(entry.RemoteId, ct);
                    _state.Remove(entry.RemoteId);
                    remotePaths.Remove(entry.RelativePath); // Prevent re-download in this cycle
                } catch (Exception ex) { _log.LogWarning(ex, "Failed to sync local deletion to cloud"); }
            }
        }
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

            var init = await _api.InitUploadAsync(new UploadInitRequest
            {
                Filename = info.Name,
                Size = info.Length,
                MimeType = mime
            }, ct);
            if (init == null) return;

            // Chunked upload
            await using var file = File.OpenRead(localPath);
            var partSize = (int)Math.Max(init.PartSize, 1 * 1024 * 1024); // min 1MB
            var buffer = new byte[partSize];
            int partNumber = 1;
            // Send file content
            while (true)
            {
                var read = await file.ReadAsync(buffer.AsMemory(0, partSize), ct);
                if (read == 0) break;
                await _api.UploadChunkAsync(init.UploadId, partNumber, buffer[..read], ct);
                partNumber++;
            }

            var localHash = await SyncStateStore.ComputeLocalHashAsync(localPath);

            // Complete upload.
            // Do NOT send our local MD5 as the hash — the server uses xxHash3 for storage
            // deduplication. Sending a mismatched hash corrupts the server's hash record.
            // Let the server compute and store its own hash.
            var result = await _api.CompleteUploadAsync(init.UploadId,
                new CompleteUploadRequest
                {
                    ParentId = parentId,
                    Hash = null   // server computes xxHash3; we track only our MD5 locally
                }, ct);

            if (result != null)
            {
                // Store local MD5 in LocalHash for future change detection.
                // Leave RemoteHash empty — we don't know the server's xxHash3 value here.
                // ProcessDownloadsAsync will populate it on the next cycle when the server
                // returns the completed file in its listing.
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

        // Debounced: trigger incremental sync 2 s after last change.
        // Files generated by the engine itself are ignored by checking _engineWrites.
        var debounce = new System.Timers.Timer(2000) { AutoReset = false };
        debounce.Elapsed += (_, _) =>
        {
            if (_cts is { Token: var ct } && !ct.IsCancellationRequested)
                _ = RunFullSyncAsync(ct);
        };

        void Reset(object? s, FileSystemEventArgs e)
        {
            if (_engineWrites.ContainsKey(e.FullPath)) return;
            debounce.Stop();
            debounce.Start();
        }
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

        return string.Join('/', parts.ToArray());
    }

    private void TrackState(FileMetadata remote, string relPath, string localHash = "")
    {
        _state.Upsert(new SyncEntry
        {
            RemoteId = remote.Id,
            RelativePath = relPath,
            FileSize = remote.Size ?? 0,
            LocalHash = localHash,
            // Store the server's hash as-is (xxHash3). NEVER fall back to localHash
            // (MD5) — mixing algorithms causes a permanent mismatch that triggers
            // re-downloads every cycle. Empty string signals "we uploaded this; wait
            // for the next listing cycle to populate the real server hash."
            RemoteHash = remote.Hash ?? "",
            LastSynced = DateTimeOffset.UtcNow,
            IsFolder = remote.IsFolder,
            IsFavorite = remote.IsFavorite,
            IsShared = remote.IsShared,
            ShareUrl = !string.IsNullOrEmpty(remote.ShareToken) 
                ? $"{_api.BaseUrl.Replace("/api/v1/", "/s/").Replace("/api/", "/s/")}{remote.ShareToken}" 
                : ""
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
