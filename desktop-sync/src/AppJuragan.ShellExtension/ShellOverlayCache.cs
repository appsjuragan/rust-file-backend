using System.Collections.Concurrent;

namespace AppJuragan.ShellExtension;

/// <summary>Bit-flags for the overlay state of a single path.</summary>
[Flags]
public enum OverlayState
{
    None     = 0,
    Synced   = 1 << 0,   // ✔ green checkmark
    Shared   = 1 << 1,   // 🔗 share icon
    Favorite = 1 << 2,   // ⭐ star icon
}

/// <summary>
/// In-process IPC cache: SyncEngine writes overlay states here;
/// the shell overlay COM servers (registered via IShellIconOverlayIdentifier)
/// read from here to answer IsMemberOf() queries from Explorer.
///
/// The dictionary is process-wide static so it works even when
/// Explorer loads the COM server in the same process (in-proc COM).
/// </summary>
public static class ShellOverlayCache
{
    private static readonly ConcurrentDictionary<string, OverlayState> _cache =
        new(StringComparer.OrdinalIgnoreCase);

    public static void Set(string path, OverlayState state)
    {
        if (state == OverlayState.None)
            _cache.TryRemove(path, out _);
        else
            _cache[path] = state;
    }

    public static OverlayState Get(string path) =>
        _cache.TryGetValue(path, out var s) ? s : OverlayState.None;

    public static void Clear() => _cache.Clear();
}
