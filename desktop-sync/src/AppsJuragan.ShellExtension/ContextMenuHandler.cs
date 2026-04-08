using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace AppsJuragan.ShellExtension;

// ─── COM interface declarations ───────────────────────────────────────────────

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214e8-0000-0000-c000-000000000046")]
public interface IShellExtInit
{
    [PreserveSig]
    int Initialize(IntPtr pidlFolder, IntPtr pDataObj, IntPtr hKeyProgId);
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214e4-0000-0000-c000-000000000046")]
public interface IContextMenu
{
    [PreserveSig]
    int QueryContextMenu(IntPtr hMenu, uint indexMenu, uint idCmdFirst, uint idCmdLast, uint uFlags);

    [PreserveSig]
    int InvokeCommand(IntPtr pici);

    [PreserveSig]
    int GetCommandString(UIntPtr idCmd, uint uFlags, IntPtr pwReserved, [MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, uint cchMax);
}

// ─── Implementation ───────────────────────────────────────────────────────────

[ComVisible(true)]
[Guid("A1000001-2222-2222-2222-000000000001")]
[ClassInterface(ClassInterfaceType.None)]
public class ContextMenuHandler : IShellExtInit, IContextMenu
{
    private List<string> _selectedPaths = new();

    private const uint IDM_FREE_UP_SPACE = 0;
    private const uint IDM_ALWAYS_OFFLINE = 1;

    public int Initialize(IntPtr pidlFolder, IntPtr pDataObj, IntPtr hKeyProgId)
    {
        _selectedPaths.Clear();
        if (pDataObj == IntPtr.Zero) return 0; // S_OK

        var dataObject = (IDataObject)Marshal.GetObjectForIUnknown(pDataObj);
        var format = new FORMATETC
        {
            cfFormat = 15, // CF_HDROP
            ptd = IntPtr.Zero,
            dwAspect = DVASPECT.DVASPECT_CONTENT,
            lindex = -1,
            tymed = TYMED.TYMED_HGLOBAL
        };

        dataObject.GetData(ref format, out STGMEDIUM medium);
        try
        {
            IntPtr hDrop = medium.unionmember;
            uint count = NativeMethods.DragQueryFile(hDrop, 0xFFFFFFFF, null, 0);
            for (uint i = 0; i < count; i++)
            {
                var sb = new StringBuilder(260);
                NativeMethods.DragQueryFile(hDrop, i, sb, (uint)sb.Capacity);
                _selectedPaths.Add(sb.ToString());
            }
        }
        finally
        {
            NativeMethods.ReleaseStgMedium(ref medium);
        }

        return 0; // S_OK
    }

    public int QueryContextMenu(IntPtr hMenu, uint indexMenu, uint idCmdFirst, uint idCmdLast, uint uFlags)
    {
        // Only show if all selected items are within an AppsJuragan sync root
        // (Simplified check for demo: always show)
        
        NativeMethods.InsertMenu(hMenu, indexMenu++, 0x400 | 0x0 /* MF_BYPOSITION | MF_STRING */, new IntPtr(idCmdFirst + IDM_FREE_UP_SPACE), "Free up space");
        NativeMethods.InsertMenu(hMenu, indexMenu++, 0x400 | 0x0 /* MF_BYPOSITION | MF_STRING */, new IntPtr(idCmdFirst + IDM_ALWAYS_OFFLINE), "Always keep on this device");

        return 2; // Number of items added
    }

    public int InvokeCommand(IntPtr pici)
    {
        var ici = Marshal.PtrToStructure<CMINVOKECOMMANDINFO>(pici);
        int verb = (int)ici.lpVerb;

        foreach (var path in _selectedPaths)
        {
            try
            {
                if (verb == IDM_FREE_UP_SPACE)
                    FreeUpSpace(path);
                else if (verb == IDM_ALWAYS_OFFLINE)
                    AlwaysKeepOffline(path);
            }
            catch (Exception) { /* log or ignore */ }
        }

        return 0; // S_OK
    }

    public int GetCommandString(UIntPtr idCmd, uint uFlags, IntPtr pwReserved, StringBuilder pszName, uint cchMax)
    {
        return 0; // S_OK
    }

    private void FreeUpSpace(string path)
    {
        using var handle = NativeMethods.OpenFile(path);
        if (handle.IsInvalid) return;

        // Dehydrate placeholder (reverts to 0-byte sparse file)
        NativeMethods.CfDehydratePlaceholder(handle.DangerousGetHandle(), 0, 0, NativeMethods.CF_DEHYDRATE_FLAGS.NONE, IntPtr.Zero);
        // Unpin so it doesn't auto-hydrate back
        NativeMethods.CfSetPinState(handle.DangerousGetHandle(), NativeMethods.CF_PIN_STATE.UNPINNED, NativeMethods.CF_SET_PIN_FLAGS.NONE, IntPtr.Zero);
    }

    private void AlwaysKeepOffline(string path)
    {
        using var handle = NativeMethods.OpenFile(path);
        if (handle.IsInvalid) return;

        // Pin so it always hydrates and stays on disk
        NativeMethods.CfSetPinState(handle.DangerousGetHandle(), NativeMethods.CF_PIN_STATE.PINNED, NativeMethods.CF_SET_PIN_FLAGS.NONE, IntPtr.Zero);
        // Trigger hydration if needed (simplified: just access the file or call CfHydratePlaceholder)
    }

    // ── Native Methods ──────────────────────────────────────────────────────────

    private static class NativeMethods
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        public static extern uint DragQueryFile(IntPtr hDrop, uint iFile, StringBuilder lpszFile, uint cch);

        [DllImport("ole32.dll")]
        public static extern void ReleaseStgMedium(ref STGMEDIUM pmedium);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern bool InsertMenu(IntPtr hMenu, uint uPosition, uint uFlags, IntPtr uIDNewItem, string lpNewItem);

        [DllImport("cfapi.dll")]
        public static extern int CfDehydratePlaceholder(IntPtr fileHandle, long startingOffset, long length, CF_DEHYDRATE_FLAGS flags, IntPtr overlapped);

        [DllImport("cfapi.dll")]
        public static extern int CfSetPinState(IntPtr fileHandle, CF_PIN_STATE pinState, CF_SET_PIN_FLAGS flags, IntPtr overlapped);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        public static SafeFileHandle OpenFile(string path)
        {
            return CreateFile(path, 0xC0000000, 0x00000007, IntPtr.Zero, 3 /* OPEN_EXISTING */, 0, IntPtr.Zero);
        }

        public enum CF_DEHYDRATE_FLAGS : uint { NONE = 0 }
        public enum CF_PIN_STATE : uint { UNSPECIFIED = 0, PINNED = 1, UNPINNED = 2 }
        public enum CF_SET_PIN_FLAGS : uint { NONE = 0 }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CMINVOKECOMMANDINFO
    {
        public int cbSize;
        public int fMask;
        public IntPtr hwnd;
        public IntPtr lpVerb;
        public IntPtr lpParameters;
        public IntPtr lpDirectory;
        public int nShow;
        public int dwHotKey;
        public IntPtr hIcon;
    }
}
