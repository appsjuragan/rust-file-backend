using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using Microsoft.Win32.SafeHandles;

namespace AppJuragan.SyncClient.Services;

/// <summary>
/// Interaction with Windows Cloud Files API (cfapi.dll).
/// This service handles registration, connection, and placeholder management.
/// </summary>
public class CloudFilterService : IDisposable
{
    private readonly ILogger<CloudFilterService> _log;
    private long _connectionKey = 0;

    public CloudFilterService(ILogger<CloudFilterService> log)
    {
        _log = log;
    }

    public bool IsSupported => RuntimeInformation.IsOSPlatform(OSPlatform.Windows) && Environment.OSVersion.Version.Major >= 10;

    public void RegisterSyncRoot(string path, string providerName, string providerVersion)
    {
        if (!IsSupported) return;

        _log.LogInformation("Registering Sync Root at {Path}", path);

        var registration = new CF_SYNC_REGISTRATION
        {
            StructSize = (uint)Marshal.SizeOf<CF_SYNC_REGISTRATION>(),
            ProviderName = providerName,
            ProviderVersion = providerVersion,
            SyncRootIdentity = Guid.NewGuid().ToByteArray(),
            SyncRootIdentityLength = 16,
            FileIdentity = Guid.NewGuid().ToByteArray(),
            FileIdentityLength = 16
        };

        var policies = new CF_SYNC_POLICIES
        {
            StructSize = (uint)Marshal.SizeOf<CF_SYNC_POLICIES>(),
            Hydration = CF_HYDRATION_POLICY.PARTIAL,
            Population = CF_POPULATION_POLICY.PARTIAL,
            InSync = CF_INSYNC_POLICY.TRACK_MODIFICATION,
            HardLink = CF_HARDLINK_POLICY.NONE,
            PlaceholderManagement = CF_PLACEHOLDER_MANAGEMENT_POLICY.DEFAULT
        };

        int hr = CfRegisterSyncRoot(path, ref registration, ref policies, CF_REGISTER_FLAGS.NONE);
        if (hr != 0 && hr != unchecked((int)0x800700B7)) // 0x800700B7 = ERROR_ALREADY_EXISTS
        {
            _log.LogError("CfRegisterSyncRoot failed: 0x{HR:X}", hr);
            return;
        }

        Connect(path);
    }

    private void Connect(string path)
    {
        var callbacks = new CF_CALLBACK_REGISTRATION[]
        {
            new() { Type = CF_CALLBACK_TYPE.FETCH_DATA, Callback = OnFetchData },
            new() { Type = CF_CALLBACK_TYPE.CANCEL_FETCH_DATA, Callback = OnCancelFetchData },
            new() { Type = CF_CALLBACK_TYPE.END }
        };

        int hr = CfConnectSyncRoot(path, callbacks, IntPtr.Zero, CF_CONNECT_FLAGS.NONE, out _connectionKey);
        if (hr != 0) _log.LogError("CfConnectSyncRoot failed: 0x{HR:X}", hr);
        else _log.LogInformation("Connected to Sync Root. Key: {Key}", _connectionKey);
    }

    public void CreatePlaceholder(string localPath, FileMetadata metadata)
    {
        if (!IsSupported || _connectionKey == 0) return;

        string parentDir = Path.GetDirectoryName(localPath)!;
        string fileName = Path.GetFileName(localPath);

        using var parentHandle = OpenDirectory(parentDir);
        if (parentHandle.IsInvalid) return;

        var info = new CF_PLACEHOLDER_CREATE_INFO
        {
            RelativeFileName = fileName,
            FsMetadata = new CF_FS_METADATA
            {
                BasicInfo = new FILE_BASIC_INFO
                {
                    FileAttributes = (uint)FileAttributes.SparseFile,
                    CreationTime = metadata.CreatedAt.ToFileTime(),
                    LastWriteTime = metadata.CreatedAt.ToFileTime()
                },
                FileSize = metadata.Size ?? 0
            },
            FileIdentity = System.Text.Encoding.UTF8.GetBytes(metadata.Id),
            FileIdentityLength = (uint)System.Text.Encoding.UTF8.GetByteCount(metadata.Id),
            Flags = CF_PLACEHOLDER_CREATE_FLAGS.MARK_IN_SYNC
        };

        var infoArray = new CF_PLACEHOLDER_CREATE_INFO[] { info };
        int hr = CfCreatePlaceholders(parentHandle.DangerousGetHandle(), infoArray, 1, CF_CREATE_FLAGS.NONE, out _);
        if (hr != 0 && hr != unchecked((int)0x800700B7))
        {
            _log.LogWarning("CfCreatePlaceholders failed for {Name}: 0x{HR:X}", fileName, hr);
        }
    }

    private void OnFetchData(in CF_CALLBACK_INFO callbackInfo, in CF_CALLBACK_PARAMETERS callbackParameters)
    {
        _log.LogInformation("FetchData triggered for {Path}", callbackInfo.RelativePath);
        // TODO: Trigger SyncEngine to download the file and call CfExecute to provide data.
    }

    private void OnCancelFetchData(in CF_CALLBACK_INFO callbackInfo, in CF_CALLBACK_PARAMETERS callbackParameters)
    {
        _log.LogInformation("FetchData cancelled for {Path}", callbackInfo.RelativePath);
    }

    private static SafeFileHandle OpenDirectory(string path)
    {
        return CreateFile(path, 0x80, FileShare.ReadWrite | FileShare.Delete, IntPtr.Zero, FileMode.Open, 0x02000000, IntPtr.Zero);
    }

    public void Dispose()
    {
        if (_connectionKey != 0) CfDisconnectSyncRoot(_connectionKey);
    }

    // ── P/Invoke Declarations ────────────────────────────────────────────────

    [DllImport("cfapi.dll", CharSet = CharSet.Unicode)]
    private static extern int CfRegisterSyncRoot(string path, ref CF_SYNC_REGISTRATION registration, ref CF_SYNC_POLICIES policies, CF_REGISTER_FLAGS flags);

    [DllImport("cfapi.dll", CharSet = CharSet.Unicode)]
    private static extern int CfConnectSyncRoot(string path, CF_CALLBACK_REGISTRATION[] callbacks, IntPtr context, CF_CONNECT_FLAGS flags, out long connectionKey);

    [DllImport("cfapi.dll")]
    private static extern int CfDisconnectSyncRoot(long connectionKey);

    [DllImport("cfapi.dll", CharSet = CharSet.Unicode)]
    private static extern int CfCreatePlaceholders(IntPtr baseDirectoryHandle, CF_PLACEHOLDER_CREATE_INFO[] placeholderArray, uint placeholderCount, CF_CREATE_FLAGS flags, out uint processedCount);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string lpFileName, uint dwDesiredAccess, FileShare dwShareMode, IntPtr lpSecurityAttributes, FileMode dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CF_SYNC_REGISTRATION { public uint StructSize; [MarshalAs(UnmanagedType.LPWStr)] public string ProviderName; [MarshalAs(UnmanagedType.LPWStr)] public string ProviderVersion; public byte[] SyncRootIdentity; public uint SyncRootIdentityLength; public byte[] FileIdentity; public uint FileIdentityLength; public Guid ProviderId; }

    [StructLayout(LayoutKind.Sequential)]
    private struct CF_SYNC_POLICIES { public uint StructSize; public CF_HYDRATION_POLICY Hydration; public CF_POPULATION_POLICY Population; public CF_INSYNC_POLICY InSync; public CF_HARDLINK_POLICY HardLink; public CF_PLACEHOLDER_MANAGEMENT_POLICY PlaceholderManagement; }

    private enum CF_HYDRATION_POLICY : uint { PARTIAL = 0 }
    private enum CF_POPULATION_POLICY : uint { PARTIAL = 0 }
    private enum CF_INSYNC_POLICY : uint { TRACK_MODIFICATION = 1 }
    private enum CF_HARDLINK_POLICY : uint { NONE = 0 }
    private enum CF_PLACEHOLDER_MANAGEMENT_POLICY : uint { DEFAULT = 0 }
    private enum CF_REGISTER_FLAGS : uint { NONE = 0 }
    private enum CF_CONNECT_FLAGS : uint { NONE = 0 }
    private enum CF_CREATE_FLAGS : uint { NONE = 0 }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CF_PLACEHOLDER_CREATE_INFO { [MarshalAs(UnmanagedType.LPWStr)] public string RelativeFileName; public CF_FS_METADATA FsMetadata; public byte[] FileIdentity; public uint FileIdentityLength; public CF_PLACEHOLDER_CREATE_FLAGS Flags; public uint Result; public long USN; }

    [StructLayout(LayoutKind.Sequential)]
    private struct CF_FS_METADATA { public FILE_BASIC_INFO BasicInfo; public long FileSize; }

    [StructLayout(LayoutKind.Sequential)]
    private struct FILE_BASIC_INFO { public long CreationTime; public long LastAccessTime; public long LastWriteTime; public long ChangeTime; public uint FileAttributes; }

    [Flags]
    private enum CF_PLACEHOLDER_CREATE_FLAGS : uint { NONE = 0, MARK_IN_SYNC = 2 }

    [StructLayout(LayoutKind.Sequential)]
    private struct CF_CALLBACK_REGISTRATION { public CF_CALLBACK_TYPE Type; public CF_CALLBACK Callback; }

    private enum CF_CALLBACK_TYPE : uint { FETCH_DATA = 0, CANCEL_FETCH_DATA = 1, END = 0xFFFFFFFF }

    private delegate void CF_CALLBACK(in CF_CALLBACK_INFO callbackInfo, in CF_CALLBACK_PARAMETERS callbackParameters);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CF_CALLBACK_INFO { public uint StructSize; public long ConnectionKey; public IntPtr CallbackContext; public byte[] FileIdentity; public uint FileIdentityLength; [MarshalAs(UnmanagedType.LPWStr)] public string RelativePath; }

    [StructLayout(LayoutKind.Explicit)]
    private struct CF_CALLBACK_PARAMETERS { [FieldOffset(0)] public uint StructSize; }
}
