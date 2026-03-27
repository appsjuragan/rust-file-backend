using AppJuragan.SyncClient.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Win32;
using System.Windows;

namespace AppJuragan.SyncClient.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly SettingsService _settings;
    
    // We'll use an event to notify the View to close, avoiding passing Window/Owner to VM
    public event EventHandler? RequestClose;

    [ObservableProperty] private string _serverUrl;
    [ObservableProperty] private string _localFolder;
    [ObservableProperty] private int _syncInterval;
    [ObservableProperty] private SyncMode _syncMode;
    [ObservableProperty] private bool _runOnStartup;
    [ObservableProperty] private bool _showNotifications;
    [ObservableProperty] private int _maxTransfers;

    public IEnumerable<SyncMode> SyncModes => Enum.GetValues<SyncMode>();

    public SettingsViewModel(SettingsService settings)
    {
        _settings = settings;
        var s = settings.Current;
        _serverUrl = s.ServerUrl;
        _localFolder = s.LocalSyncFolder;
        _syncMode = s.SyncMode;
        _syncInterval = s.SyncIntervalSeconds;
        _runOnStartup = s.RunOnStartup;
        _showNotifications = s.ShowNotifications;
        _maxTransfers = s.MaxConcurrentTransfers;
    }

    [RelayCommand]
    private void BrowseFolder()
    {
        var dlg = new OpenFolderDialog { Title = "Select Sync Folder" };
        if (dlg.ShowDialog() == true)
            LocalFolder = dlg.FolderName;
    }

    [RelayCommand]
    private void Save()
    {
        // Refresh API client URL before saving
        var api = App.Services.GetRequiredService<ApiClient>();
        api.UpdateBaseAddress(ServerUrl);

        _settings.Save(new AppSettings
        {
            ServerUrl = ServerUrl,
            LocalSyncFolder = LocalFolder,
            SyncMode = SyncMode,
            SyncIntervalSeconds = SyncInterval,
            RunOnStartup = RunOnStartup,
            ShowNotifications = ShowNotifications,
            MaxConcurrentTransfers = MaxTransfers
        });
        ApplyStartup(RunOnStartup);
        RequestClose?.Invoke(this, EventArgs.Empty);
    }

    [RelayCommand]
    private void Cancel() => RequestClose?.Invoke(this, EventArgs.Empty);

    private static void ApplyStartup(bool enable)
    {
        const string keyPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
        const string appName = "AppJuraganSync";
        var exePath = Environment.ProcessPath ?? "";

        using var key = Registry.CurrentUser.OpenSubKey(keyPath, writable: true);
        if (enable) key?.SetValue(appName, $"\"{exePath}\"");
        else key?.DeleteValue(appName, throwOnMissingValue: false);
    }
}
