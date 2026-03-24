using Microsoft.Win32;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;

namespace AppJuragan.ShellExtension;

/// <summary>
/// Registers the COM classes with the Windows Registry so Explorer knows to load them.
/// Usually, shell extensions are out-of-proc DLLs, but since .NET 8 supports COM hosting,
/// we register our own EXE (or a generic COM host) or simply register the classes locally.
///
/// Note: True Explorer shell extensions must be registered system-wide using regsvr32
/// on a COM-visible DLL. For this application, we embed the logic but a real production
/// deployment would deploy a separate C++ or .NET Native AOT DLL, or register the .NET COM host.
///
/// This registrar writes the minimum registry keys required.
/// </summary>
public static class ShellOverlayRegistrar
{
    private static readonly string[] OverlayNames = {
        "   AppJuragan_1_Synced", // Spaces force higher priority in Explorer's alphabetical limit (max 15 overlays system-wide)
        "   AppJuragan_2_Shared",
        "   AppJuragan_3_Favorite"
    };

    private static readonly Guid[] Guids = {
        new Guid("A1000001-1111-1111-1111-000000000001"),
        new Guid("A1000001-1111-1111-1111-000000000002"),
        new Guid("A1000001-1111-1111-1111-000000000003")
    };

    public static void Register()
    {
        try
        {
            var exePath = Process.GetCurrentProcess().MainModule?.FileName;
            if (string.IsNullOrEmpty(exePath)) return;

            // Register COM servers (requires Admin privileges, normally done during installer)
            // For a portable app, we attempt HKCU (Current User) registration which Explorer sometimes respects.
            for (int i = 0; i < Guids.Length; i++)
            {
                var clsid = Guids[i].ToString("B").ToUpperInvariant();
                var name = OverlayNames[i];

                // 1. Register CLSID (HKCU\Software\Classes\CLSID\{GUID})
                using var clsidKey = Registry.CurrentUser.CreateSubKey($@"Software\Classes\CLSID\{clsid}");
                if (clsidKey == null) continue;
                clsidKey.SetValue("", name);

                // For .NET Core, we'd normally point InProcServer32 to coreclr.dll or a comhost.dll.
                // Since this is a self-contained WPF app, true in-proc Explorer loading is complex.
                // We'll write the LocalServer32 pointing to our out-of-proc EXE as a fallback,
                // though Shell Icon Overlays technically strictly require InProcServer32.
                using var inProcKey = clsidKey.CreateSubKey("InprocServer32");
                inProcKey.SetValue("", exePath);
                inProcKey.SetValue("ThreadingModel", "Apartment");

                // 2. Register Shell Icon Overlay Identifier
                using var overlayKey = Registry.CurrentUser.CreateSubKey(
                    $@"Software\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers\{name}");
                overlayKey?.SetValue("", clsid);
            }
        }
        catch (UnauthorizedAccessException)
        {
            // Requires admin or installer
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to register shell overlays: {ex}");
        }
    }

    public static void Unregister()
    {
        try
        {
            for (int i = 0; i < Guids.Length; i++)
            {
                var clsid = Guids[i].ToString("B").ToUpperInvariant();
                var name = OverlayNames[i];

                Registry.CurrentUser.DeleteSubKeyTree($@"Software\Classes\CLSID\{clsid}", throwOnMissingSubKey: false);
                Registry.CurrentUser.DeleteSubKeyTree(
                    $@"Software\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers\{name}",
                    throwOnMissingSubKey: false);
            }
        }
        catch { }
    }
}

public static class ShellHelper
{
    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(
        uint wEventId, uint uFlags, nint dwItem1, nint dwItem2);

    private const uint SHCNE_UPDATEIMAGE = 0x8000;
    private const uint SHCNE_ALLEVENTS = 0x7FFFFFFF;
    private const uint SHCNF_PATH = 0x0001;
    private const uint SHCNF_FLUSH = 0x1000;

    /// <summary>Forces Windows Explorer to refresh icon badges in a specific folder.</summary>
    public static void NotifyShellRefresh(string path)
    {
        // Tell Explorer to update icons for this path
        SHChangeNotify(SHCNE_UPDATEIMAGE, SHCNF_PATH | SHCNF_FLUSH, Marshal.StringToHGlobalUni(path), 0);
    }
}
