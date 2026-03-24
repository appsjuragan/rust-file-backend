using AppJuragan.SyncClient.Services;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Windows;

namespace AppJuragan.SyncClient.ViewModels;

public partial class SyncStatusViewModel : ObservableObject
{
    private readonly SyncEngine _sync;
    private readonly SyncStateStore _state;
    private readonly SettingsService _settings;

    [ObservableProperty] private string _statusText = "Idle";
    [ObservableProperty] private int _totalSynced;
    [ObservableProperty] private int _totalShared;
    [ObservableProperty] private int _totalFavorites;

    public ObservableCollection<string> ActivityLog { get; } = new();

    public SyncStatusViewModel(SyncEngine sync, SyncStateStore state, SettingsService settings)
    {
        _sync = sync;
        _state = state;
        _settings = settings;

        Refresh();

        sync.StatusChanged += (_, s) =>
            Application.Current.Dispatcher.Invoke(() =>
            {
                StatusText = s.ToString();
                Refresh();
            });

        sync.FileActivity += (_, msg) =>
            Application.Current.Dispatcher.Invoke(() =>
            {
                ActivityLog.Insert(0, $"[{DateTime.Now:HH:mm:ss}] {msg}");
                while (ActivityLog.Count > 200) ActivityLog.RemoveAt(ActivityLog.Count - 1);
            });
    }

    private void Refresh()
    {
        var all = _state.All.Values.ToList();
        TotalSynced = all.Count(e => !e.IsFolder);
        TotalShared = all.Count(e => e.IsShared);
        TotalFavorites = all.Count(e => e.IsFavorite);
    }

    [RelayCommand]
    private async Task SyncNowAsync() => await _sync.RunFullSyncAsync();

    [RelayCommand]
    private void OpenFolder()
    {
        var folder = _settings.Current.LocalSyncFolder;
        try { Process.Start(new ProcessStartInfo("explorer.exe", folder) { UseShellExecute = true }); }
        catch { /* ignore */ }
    }
}
