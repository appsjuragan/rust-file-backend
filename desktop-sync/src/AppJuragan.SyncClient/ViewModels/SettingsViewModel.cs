using AppJuragan.SyncClient.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using System.Windows;

namespace AppJuragan.SyncClient.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly SettingsService _settings;
    private readonly Window _owner;

    [ObservableProperty] private string _serverUrl;
    [ObservableProperty] private string _localFolder;
    [ObservableProperty] private int _syncInterval;
    [ObservableProperty] private bool _runOnStartup;
    [ObservableProperty] private bool _showNotifications;
    [ObservableProperty] private int _maxTransfers;

    public SettingsViewModel(SettingsService settings, Window owner)
    {
        _settings = settings;
        _owner = owner;
        var s = settings.Current;
        _serverUrl = s.ServerUrl;
        _localFolder = s.LocalSyncFolder;
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
        _settings.Save(new AppSettings
        {
            ServerUrl = ServerUrl,
            LocalSyncFolder = LocalFolder,
            SyncIntervalSeconds = SyncInterval,
            RunOnStartup = RunOnStartup,
            ShowNotifications = ShowNotifications,
            MaxConcurrentTransfers = MaxTransfers
        });
        ApplyStartup(RunOnStartup);
        _owner.Close();
    }

    [RelayCommand]
    private void Cancel() => _owner.Close();

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
