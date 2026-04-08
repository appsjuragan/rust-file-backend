using System.Drawing;
using System.Runtime.InteropServices;

namespace AppsJuragan.ShellExtension;

// ─── COM interface declarations ───────────────────────────────────────────────

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("0C6C4200-C589-11D0-999A-00C04FD655E1")]
public interface IShellIconOverlayIdentifier
{
    [PreserveSig]
    int IsMemberOf([MarshalAs(UnmanagedType.LPWStr)] string path, uint attributes);

    [PreserveSig]
    int GetOverlayInfo(
        [MarshalAs(UnmanagedType.LPWStr)] nint iconFileBuffer, int iconFileMax,
        out int iconIndex, out uint flags);

    [PreserveSig]
    int GetPriority(out int priority);
}

// ─── Base overlay handler ─────────────────────────────────────────────────────

public abstract class BaseOverlayHandler : IShellIconOverlayIdentifier
{
    protected abstract OverlayState Mask { get; }
    protected abstract string IconFileName { get; }

    public int IsMemberOf(string path, uint attributes)
    {
        var state = ShellOverlayCache.Get(path);
        return (state & Mask) != 0 ? 0 : 1; // S_OK=0 means IS member
    }

    public int GetOverlayInfo(nint iconFileBuffer, int iconFileMax, out int iconIndex, out uint flags)
    {
        iconIndex = 0;
        flags = 0; // ISIOI_ICONFILE

        // Write the icon path to the COM-provided buffer
        var iconPath = ExtractIcon();
        if (iconPath != null)
        {
            var bytes = System.Text.Encoding.Unicode
                .GetBytes(iconPath + '\0');
            Marshal.Copy(bytes, 0, iconFileBuffer, Math.Min(bytes.Length, iconFileMax * 2 - 2));
            flags = 1; // ISIOI_ICONFILE
        }
        return 0; // S_OK
    }

    public int GetPriority(out int priority)
    {
        // Lower number = higher priority; favor Synced > Shared > Favorite
        priority = Mask switch
        {
            OverlayState.Synced   => 10,
            OverlayState.Shared   => 20,
            OverlayState.Favorite => 30,
            _ => 50
        };
        return 0;
    }

    private string? ExtractIcon()
    {
        // Extract embedded PNG overlay to %Temp% and convert to .ico on first use
        var iconDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AppsJuragan", "SyncClient", "Overlays");
        Directory.CreateDirectory(iconDir);

        var icoPath = Path.Combine(iconDir, Path.ChangeExtension(IconFileName, ".ico"));
        if (File.Exists(icoPath)) return icoPath;

        var asm = typeof(BaseOverlayHandler).Assembly;
        var resourceName = $"AppsJuragan.ShellExtension.Overlays.{IconFileName}";
        using var stream = asm.GetManifestResourceStream(resourceName);
        if (stream == null) return null;

        // Convert PNG → ICO
        using var bmp = new Bitmap(stream);
        using var ico = Icon.FromHandle(bmp.GetHicon());
        using var icoStream = File.Create(icoPath);
        ico.Save(icoStream);

        return icoPath;
    }
}

// ─── Concrete overlay COM servers ─────────────────────────────────────────────

/// <summary>Green checkmark overlay for synced files/folders.</summary>
[ComVisible(true)]
[Guid("A1000001-1111-1111-1111-000000000001")]
[ClassInterface(ClassInterfaceType.None)]
public class SyncedOverlayHandler : BaseOverlayHandler
{
    protected override OverlayState Mask => OverlayState.Synced;
    protected override string IconFileName => "overlay_synced.png";
}

/// <summary>Blue share icon overlay for shared files/folders.</summary>
[ComVisible(true)]
[Guid("A1000001-1111-1111-1111-000000000002")]
[ClassInterface(ClassInterfaceType.None)]
public class SharedOverlayHandler : BaseOverlayHandler
{
    protected override OverlayState Mask => OverlayState.Shared;
    protected override string IconFileName => "overlay_shared.png";
}

/// <summary>Yellow star overlay for favorited files/folders.</summary>
[ComVisible(true)]
[Guid("A1000001-1111-1111-1111-000000000003")]
[ClassInterface(ClassInterfaceType.None)]
public class FavoriteOverlayHandler : BaseOverlayHandler
{
    protected override OverlayState Mask => OverlayState.Favorite;
    protected override string IconFileName => "overlay_favorite.png";
}
